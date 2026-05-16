// api.js — DeepSeek API (OpenAI-compatible) + Yahoo Finance (free, fast)
//
// Token economy principles:
//   1. DeepSeek auto-caches request prefixes server-side (no client cache_control)
//   2. deepseek-chat for structured extraction; deepseek-v4-pro for nuanced mentor advice
//   3. Context trimming — only send what's relevant for the call
//   4. Yahoo Finance directly, not through any LLM web_search
//
// API key is passed in from the caller (stored in SecureStore at app level).

import * as SecureStore from "expo-secure-store";
import { MASTER_STYLES, MASTER_MEETING_ROLES, getMaster } from "./constants";
import { monthLabel } from "./utils";
import { memoryManager, ContextDepth } from "./memory/MemoryManager";
import { getDNA } from "./memory/HotCache";
import { getCachedSnapshot, setCachedSnapshot } from "./db";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

// Current models (as of Apr 2026).
// deepseek-v4-flash is the cheap/fast tier — good for parsing.
// deepseek-v4-pro is the flagship — used for mentor reasoning.
const MODELS = {
  fast: "deepseek-v4-flash",
  smart: "deepseek-v4-pro",
};

// ========== API key management ==========
const API_KEY_STORE = "deepseek_api_key";

export async function getApiKey() {
  try { return await SecureStore.getItemAsync(API_KEY_STORE); }
  catch { return null; }
}

export async function setApiKey(key) {
  await SecureStore.setItemAsync(API_KEY_STORE, key);
}

export async function clearApiKey() {
  await SecureStore.deleteItemAsync(API_KEY_STORE);
}

// ========== Core LLM call (DeepSeek, OpenAI-compatible) ==========
// `system` is a plain string; it gets prepended as a system message.
function buildBody({ system, messages, model, max_tokens, stream }) {
  const msgs = system ? [{ role: "system", content: system }, ...messages] : messages;
  const body = { model, max_tokens, messages: msgs };
  if (stream) body.stream = true;
  return body;
}

async function callLLM({ system, messages, model = MODELS.smart, max_tokens = 1024 }) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("NO_API_KEY");

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildBody({ system, messages, model, max_tokens })),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error(`DeepSeek: empty choices. Response: ${JSON.stringify(data).slice(0, 300)}`);
  if (choice.finish_reason === "length") throw new Error(`DeepSeek: output truncated (max_tokens=${max_tokens} too low)`);
  return choice.message?.content || "";
}

// Streaming variant — calls onChunk(text) for each delta, returns full text.
async function callLLMStream({ system, messages, model = MODELS.smart, max_tokens = 1024, onChunk }) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("NO_API_KEY");

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildBody({ system, messages, model, max_tokens, stream: true })),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${txt.slice(0, 200)}`);
  }

  function parseSSELines(text) {
    let full = "";
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const evt = JSON.parse(json);
        const chunk = evt.choices?.[0]?.delta?.content;
        if (chunk) { full += chunk; onChunk?.(chunk); }
      } catch { /* skip malformed lines */ }
    }
    return full;
  }

  // React Native's fetch does not expose res.body as a ReadableStream.
  // Fall back to res.text() which still returns the complete SSE payload.
  if (!res.body || typeof res.body.getReader !== "function") {
    const text = await res.text();
    return parseSSELines(text);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const evt = JSON.parse(json);
        const chunk = evt.choices?.[0]?.delta?.content;
        if (chunk) { full += chunk; onChunk?.(chunk); }
      } catch { /* skip malformed lines */ }
    }
  }
  return full;
}

// ========== Profile context builder ==========
// Only include what matters for the specific call — saves ingress tokens.
export function buildProfileContext({
  philosophy, rules, weeklyNotes, monthlyReviews, trades, holdings, prices,
  // tunables:
  maxTrades = 15, maxWeekly = 8, maxMonthly = 4,
}) {
  const weeklyB = Object.entries(weeklyNotes || {})
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, maxWeekly)
    .map(([k, v]) => `  ${k}: ${v}`).join("\n");

  const monthlyB = Object.entries(monthlyReviews || {})
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, maxMonthly)
    .map(([k, bs]) => `  ${k}:\n${bs.map(b => `    • ${b}`).join("\n")}`).join("\n\n");

  const tradesB = (trades || []).slice(0, maxTrades).map((t) => {
    const d = new Date(t.date).toISOString().slice(0, 10);
    return `  ${d} | ${t.action.toUpperCase().padEnd(5)} | ${t.stock} | ${t.emotion} | ${t.reason}`;
  }).join("\n");

  let holdingsBlock = "  (none)";
  if (holdings && holdings.length > 0) {
    const priceMap = prices?.data || {};
    const staleness = prices?.lastUpdated
      ? ` (prices as of ${new Date(prices.lastUpdated).toLocaleString()})`
      : " (no live prices)";
    holdingsBlock = holdings.map((h) => {
      const p = priceMap[h.symbol];
      const cost = h.shares * h.costBasis;
      const reasonLine = h.buyReason ? `\n    reason: ${h.buyReason}` : "";
      if (p) {
        const mv = h.shares * p.price;
        const pnl = mv - cost;
        const pct = cost > 0 ? (pnl / cost) * 100 : 0;
        const dailyPct = p.changePercent;
        return `  ${h.symbol}${h.displayName && h.displayName !== h.symbol ? ` (${h.displayName})` : ""} | ${h.shares}@${h.costBasis}${h.currency || ""} | now ${p.price}${p.currency} (day ${dailyPct >= 0 ? "+" : ""}${dailyPct?.toFixed?.(2) ?? "?"}%) | P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)${reasonLine}`;
      }
      return `  ${h.symbol} | ${h.shares}@${h.costBasis}${h.currency || ""} | (no live price)${reasonLine}`;
    }).join("\n") + "\n" + staleness;
  }

  return `<philosophy>${philosophy || "(not defined)"}</philosophy>

<rules>
${(rules || []).map((r, i) => `  ${i + 1}. ${r}`).join("\n") || "  (none)"}
</rules>

<current_holdings>
${holdingsBlock}
</current_holdings>

<weekly_notes_recent>
${weeklyB || "  (none)"}
</weekly_notes_recent>

<monthly_reviews_recent>
${monthlyB || "  (none)"}
</monthly_reviews_recent>

<recent_trades>
${tradesB || "  (none)"}
</recent_trades>`;
}

// ========== Persona builder ==========
function buildMasterPersona(masterId) {
  const master = getMaster(masterId);
  const hasDNA = !!getDNA();

  if (master.id === "default") {
    const depthClause = hasDNA
      ? "You have an intimate, distilled understanding of this investor's behavioral patterns, emotional triggers, and blind spots — built from their complete journal history. You don't give generic advice. When you see a pattern repeating, name it. When their current question echoes a past mistake, say so directly."
      : "You have been following this investor's journey. You know their philosophy, rules, trading history, and emotional patterns.";

    return `You are a seasoned investment mentor. ${depthClause}

- Match the user's language (Chinese/English/mixed).
- Ground advice in their ACTUAL track record; reference specific trades, rules, reflections by name.
- Notice patterns they might not see.
- When they consider something that violates their own rules, point it out plainly.
- Ask probing questions when it helps them think.
- Keep responses focused — usually 2-4 short paragraphs.
- Never start with "As your mentor". Just speak naturally.
- Don't be sycophantic. Be the mentor they need.`;
  }

  return `${MASTER_STYLES[master.id]}

Stay in character as ${master.name}. Speak in their voice, using their frameworks. Keep responses to 2-3 short paragraphs. Match the user's language exactly (Chinese/English/mixed). Do NOT start with "As ${master.name}..." — just speak naturally. Use the investor's actual record to make your advice specific, not generic.`;
}

// ========== System prompt builder ==========
// DeepSeek auto-caches request prefixes server-side, so we just concatenate
// the persona and profile into a single system string. Putting the persona
// first keeps the cacheable prefix stable across requests for a given master.
function buildSystem(masterId, profile) {
  const persona = buildMasterPersona(masterId);
  const profileText = `<investor_profile>
${buildProfileContext(profile)}
</investor_profile>`;
  return `${persona}\n\n${profileText}`;
}

// ========== Use cases ==========

// Parse a freeform trade description into structured fields (deepseek-v4-flash — fast + cheap).
export async function parseTradeText(text) {
  const SCHEMA = [
    '  "action": "buy" | "sell" | "hold" | "watch" | "buy_option" | "sell_option",',
    '  "stock": string (ticker/name; "?" if unclear),',
    '  "reason": string (clean 1-2 sentence summary in SAME language as input, under 200 chars, faithful to user\'s reasoning),',
    '  "emotion": "calm" | "confident" | "neutral" | "anxious" | "fearful" | "excited" | "greedy" | "optimistic" | "hesitant" | "regretful"',
  ].join('\n');

  const prompt =
    'Parse this trade description into JSON. Return ONLY the JSON object — no markdown fences, no explanation.\n\n' +
    'Description: """' + text + '"""\n\n' +
    'Schema:\n{\n' + SCHEMA + '\n}\n\n' +
    'Use "buy_option" / "sell_option" when the description mentions options, calls, puts, or derivatives.\n' +
    'Infer emotion from tone (excited/greedy for euphoric; optimistic for hopeful; hesitant for uncertain; regretful for second-guessing). Match input language exactly.';

  const raw = await callLLM({
    messages: [{ role: "user", content: prompt }],
    model: MODELS.fast,
    max_tokens: 512,
  });

  const parsed = parseLooseJson(raw, { label: "parseTradeText" });
  const VALID_ACTIONS = ["buy", "sell", "hold", "watch", "buy_option", "sell_option"];
  const VALID_EMOTIONS = ["calm", "confident", "neutral", "anxious", "fearful", "excited", "greedy", "optimistic", "hesitant", "regretful"];
  return {
    action: VALID_ACTIONS.includes(parsed.action) ? parsed.action : "buy",
    stock: parsed.stock || "?",
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "",
    emotion: VALID_EMOTIONS.includes(parsed.emotion) ? parsed.emotion : "neutral",
  };
}

// Generate mentor feedback for a single trade or thought.
// Uses MINIMAL context (DNA + rules) — fast and cheap.
// Post-generation: asynchronously records a mentor_insight for this ticker.
export async function generateEntryFeedback(entry, entryType, masterId, profile, onChunk) {
  const ticker = entryType === "trade" ? entry.stock : null;
  const query = entryType === "trade" ? entry.reason : entry.content;

  const ctx = await memoryManager.assemble({
    ticker,
    query,
    depth: ContextDepth.MINIMAL,
    feature: "feedback",
    holdings: profile.holdings,
    prices: profile.prices,
  });
  const system = buildMasterPersona(masterId) + "\n\n<investor_profile>\n" + ctx.blocks + "\n</investor_profile>";
  let desc;
  if (entryType === "trade") {
    desc = `The investor just logged this trade:
- Action: ${entry.action.toUpperCase()}
- Stock: ${entry.stock}
- Date: ${new Date(entry.date).toISOString().slice(0, 10)}
- Reasoning: ${entry.reason}
- Emotional state: ${entry.emotion}`;
  } else {
    desc = `The investor just recorded this thought/dilemma (not yet a trade):

"${entry.content}"

They are working through this. They may be torn, uncertain, or simply thinking out loud.`;
  }
  const user = `${desc}

Give your immediate, specific reaction. Reference their history, rules, or philosophy where relevant. Be direct. 2-3 short paragraphs. Match their language.`;

  const opts = { system, messages: [{ role: "user", content: user }], max_tokens: 1800 };

  const recordResult = (text) => {
    if (ticker && text) {
      memoryManager.recordInsight({
        type: "mentor_insight",
        scope: ticker,
        content: text.slice(0, 500),
        structured: { entryDate: entry.date, action: entry.action, emotion: entry.emotion },
        modelId: MODELS.smart,
      }).catch(() => {});
    }
  };

  if (onChunk) {
    let full = "";
    const result = await callLLMStream({ ...opts, onChunk: (chunk) => { full += chunk; onChunk(chunk); } });
    recordResult(full);
    return result;
  }
  const result = await callLLM(opts);
  recordResult(result);
  return result;
}

// Monthly commentary for a given master over a month's trades.
export async function generateMonthlyCommentary(month, monthTrades, masterId, profile) {
  const tickers = [...new Set((monthTrades || []).map(t => t.stock).filter(Boolean))].join(" ");
  const ctx = await memoryManager.assemble({
    ticker: null,
    query: tickers,
    depth: ContextDepth.STANDARD,
    feature: "commentary",
    holdings: profile.holdings,
    prices: profile.prices,
  });
  const system = buildMasterPersona(masterId) + "\n\n<investor_profile>\n" + ctx.blocks + "\n</investor_profile>";
  const tradesList = monthTrades
    .map((t) => `- ${new Date(t.date).toISOString().slice(0, 10)} | ${t.action.toUpperCase()} | ${t.stock} | emotion: ${t.emotion} | ${t.reason}`)
    .join("\n");
  const user = `Look at the investor's trades for ${monthLabel(month)}:

${tradesList}

Give your analysis of this month's trading activity. Look for patterns, emotional triggers, rule violations, or consistencies with their philosophy. Point out what was wise and what deserves scrutiny. Be specific — reference individual trades by ticker. 3-4 short paragraphs, 150-250 words total. Always finish every sentence completely. Match their language.`;

  return await callLLM({
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 1500,
  });
}

// Mentor chat — system prompt + recent history + memory-assembled context.
export async function chatMessage(history, newUserMessage, profile, masterId = "default") {
  // Detect ticker mention for targeted FTS5 retrieval
  const tickerMatch = newUserMessage.match(/\b([A-Z]{2,5})\b/);
  const ticker = tickerMatch ? tickerMatch[1] : null;

  const ctx = await memoryManager.assemble({
    ticker,
    query: newUserMessage,
    depth: ContextDepth.STANDARD,
    feature: "mentor",
    holdings: profile.holdings,
    prices: profile.prices,
  });
  const system = buildMasterPersona(masterId) + "\n\n<investor_profile>\n" + ctx.blocks + "\n</investor_profile>";
  const trimmed = history.slice(-10);
  const messages = [...trimmed, { role: "user", content: newUserMessage }];
  return await callLLM({ system, messages, max_tokens: 2200 });
}

// ============================================================
// Strategy Report — two-phase comprehensive analysis
// ============================================================
//
// Phase A (flash, ~$0.001): plans which memory areas to focus on.
// Phase B (pro, streaming): generates the full report with DEEP context.
// onPhase: optional callback for UI progress ("planning" | "assembling" | "generating")
// onChunk: optional streaming callback

const STRATEGY_SYSTEM = `You are an elite investment analyst and behavioral finance expert. You have been given a complete record of an individual investor's journal: their stated philosophy, trading rules, actual trades with reasoning and emotion, weekly observations, monthly reflections, current holdings, and AI-distilled behavioral insights.

Your task is to write a comprehensive, honest "Investment Strategy Profile" — what this investor ACTUALLY does, not just what they say they do. The gap between their stated rules and their actual behavior is often the most important finding.

Format the output as a structured Markdown document. Write in the SAME LANGUAGE as most of the journal entries. Be specific: cite actual tickers, dates, patterns. This is not a generic report — it must be built exclusively from the evidence in this journal.

Be direct. Do not sugarcoat. The goal is a document the investor can pin to their desk and actually learn from.`;

function buildStrategyUserPrompt(contextBlocks, profile) {
  return `Here is the complete investment journal with distilled behavioral insights:

<investor_profile>
${contextBlocks}
</investor_profile>

Write the Investment Strategy Profile as a Markdown document with these exact sections:

# Investment Strategy Profile
*Generated: ${new Date().toISOString().slice(0, 10)}*

## 1. Core Philosophy (Stated vs. Actual)
## 2. Actual Investment Style
## 3. Decision-Making Patterns
## 4. Emotional Profile
## 5. Rules Compliance Audit
## 6. Strengths (Evidence-Based)
## 7. Blind Spots & Recurring Mistakes
## 8. Holdings Analysis
## 9. Recommended Focus Areas (Next 6 Months)
## 10. One-Sentence Strategy Summary

---
*Generated from ${profile.trades?.length || 0} trades, ${Object.keys(profile.weeklyNotes || {}).length} weekly notes, ${Object.keys(profile.monthlyReviews || {}).length} monthly reviews.*`;
}

export async function generateStrategyReport(profile, onPhase, onChunk) {
  // Phase A: planning — flash model identifies what to focus on
  onPhase?.("planning");
  const minCtx = await memoryManager.assemble({
    ticker: null,
    query: "",
    depth: ContextDepth.MINIMAL,
    feature: "strategy",
    holdings: profile.holdings,
    prices: profile.prices,
  });

  let plan = {};
  try {
    const planPrompt = `Analyze this investor profile and identify the 3 most important patterns to investigate deeply, plus keywords that will surface relevant journal entries.

${minCtx.blocks}

Trade count: ${profile.trades?.length || 0}

Reply ONLY with JSON:
{
  "relevantKeywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
  "focusAreas": ["area1", "area2", "area3"]
}`;
    const planRaw = await callLLM({
      system: "Reply with valid JSON only, no markdown.",
      messages: [{ role: "user", content: planPrompt }],
      model: MODELS.fast,
      max_tokens: 300,
    });
    plan = parseLooseJson(planRaw, { label: "strategy planning", fallback: {} });
  } catch { /* use empty plan — DEEP context still assembles */ }

  // Phase B: assemble rich context using Phase A's guidance
  onPhase?.("assembling");
  const enrichedQuery = [
    ...(plan.relevantKeywords || []),
    ...(plan.focusAreas || []),
  ].join(" ");

  const fullCtx = await memoryManager.assemble({
    ticker: null,
    query: enrichedQuery,
    depth: ContextDepth.DEEP,
    feature: "strategy",
    holdings: profile.holdings,
    prices: profile.prices,
  });

  // Phase B: generate full report (pro, streaming)
  onPhase?.("generating");
  const userPrompt = buildStrategyUserPrompt(fullCtx.blocks, profile);

  if (onChunk) {
    return await callLLMStream({
      system: STRATEGY_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      model: MODELS.smart,
      max_tokens: 6000,
      onChunk,
    });
  }
  return await callLLM({
    system: STRATEGY_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    model: MODELS.smart,
    max_tokens: 6000,
  });
}

// ============================================================
// Roundtable panel — multi-master investment committee
// ============================================================

function parseVerdict(text) {
  const match = text.match(
    /VERDICT:\s*(BULL|BEAR|NEUTRAL)\s*[·•\-]\s*Conviction\s*(HIGH|MED|LOW)\s*[·•\-]\s*(.+)/i
  );
  if (!match) return null;
  return {
    stance: match[1].toUpperCase(),
    conviction: match[2].toUpperCase(),
    thesis: match[3].trim().replace(/\n[\s\S]*$/, ""),
  };
}

function detectLang(text) {
  return /[一-鿿]/.test(text) ? "Chinese" : "English";
}

function buildPanelSystem(masterId, profile, priorResponses, topic, additionalQuestion = "") {
  const master = getMaster(masterId);
  const roleInfo = MASTER_MEETING_ROLES[masterId];
  const baseStyle = MASTER_STYLES[masterId];

  // Detect language from investor's own text so ALL masters reply consistently.
  // additionalQuestion takes precedence when present (it's the most recent user input).
  const lang = detectLang(additionalQuestion || topic);

  // Topic is injected into system prompt (not just user message) so the model
  // has the constraint present throughout, preventing drift to general philosophy.
  let personaText = `${baseStyle}

TODAY'S SINGLE AGENDA ITEM: "${topic}"

You are attending an investment committee meeting as ${master.name}. This is a fast-paced committee — every speaker gets 2-3 short paragraphs, no more. Lead with your strongest point. Be direct and persuasive, not comprehensive. Your ENTIRE response must be anchored to this specific topic: "${topic}". Do NOT drift into general philosophy. LANGUAGE: Reply in ${lang} — do NOT mix languages or switch mid-response. Do NOT start with "As ${master.name}..." — just speak naturally.

Your meeting role: ${roleInfo.instruction} Apply this lens directly and specifically to "${topic}".

HARD RULES:
- Total response body: 120-180 words maximum. Count mentally before writing.
- 2-3 paragraphs, 2-4 sentences each. No more.
- Lead with your sharpest, most contrarian insight — do not bury the lede.
- One strong argument beats three weak ones. Pick your best point and drive it home.
- Cut every sentence that does not add new information. No restating, no hedging, no throat-clearing.
- Every point must be anchored to "${topic}" specifically — no free-floating philosophy.
- Your response MUST have two parts in order:
  PART 1 — Analysis (required first): 2-3 tight paragraphs on "${topic}", 120-180 words total.
  PART 2 — Verdict (required last): End with EXACTLY this line and nothing after it:
VERDICT: [BULL|BEAR|NEUTRAL] · Conviction [HIGH|MED|LOW] · [your thesis in 15 words or fewer]`;

  if (priorResponses.length > 0) {
    const priorBlock = priorResponses.map(r => {
      const m = getMaster(r.masterId);
      const role = MASTER_MEETING_ROLES[r.masterId]?.roleZh || "";
      // Truncate to keep context bounded; full text already seen in UI
      const snippet = r.text.length > 800 ? r.text.slice(0, 800) + "…" : r.text;
      return `${m.name}（${role}）：${snippet}`;
    }).join("\n\n---\n\n");
    personaText += `\n\nPrior committee views on "${topic}" — address, challenge, or build on them, staying focused on the topic:\n\n${priorBlock}`;
  }

  // profileContext is now injected by the caller via async MemoryManager.assemble()
  return personaText;
}

// Single master's panel response. priorResponses = all prior round responses visible to this master.
export async function mentorPanelResponse(topic, masterId, profile, priorResponses = [], additionalQuestion = "") {
  // Extract ticker from topic for targeted memory retrieval
  const tickerMatch = topic.match(/\b([A-Z]{2,5})\b/);
  const ticker = tickerMatch ? tickerMatch[1] : null;

  const ctx = await memoryManager.assemble({
    ticker,
    query: topic,
    depth: ContextDepth.STANDARD,
    feature: "roundtable",
    holdings: profile.holdings,
    prices: profile.prices,
  });

  const panelPersona = buildPanelSystem(masterId, profile, priorResponses, topic, additionalQuestion);
  const system = panelPersona + "\n\n<investor_profile>\n" + ctx.blocks + "\n</investor_profile>";

  let userMessage = `Investment topic: "${topic}"`;
  if (additionalQuestion) {
    userMessage += `\n\nFollow-up from the investor: ${additionalQuestion}`;
  }
  if (priorResponses.length > 0) {
    userMessage += `\n\nGive your analysis of "${topic}" from your role's perspective, directly engaging with the prior views above. Keep every point anchored to this specific investment.`;
  } else {
    userMessage += `\n\nGive your independent analysis of "${topic}" from your specific role's perspective. Ground every point in this specific investment — no general philosophy detached from the topic.`;
  }

  const raw = await callLLM({
    system,
    messages: [{ role: "user", content: userMessage }],
    max_tokens: 1200,
  });

  const verdict = parseVerdict(raw);
  const text = raw.replace(/VERDICT:.*$/m, "").trim();

  // If the model only output the VERDICT line (no body), treat as a failed call
  // rather than silently rendering a blank card.
  if (!text) throw new Error("回复内容为空，请重试");

  return { text, verdict };
}

// Generate structured meeting minutes from a complete session.
export async function generateMeetingMinutes(session, profile) {
  const today = new Date().toISOString().slice(0, 10);

  // Truncate each response to 600 chars to keep the transcript within API
  // context limits. Full responses are already visible in the UI.
  const SNIPPET_LEN = 600;
  let transcript = "";
  for (const round of session.rounds) {
    transcript += `\n\n=== Round ${round.roundNum} (${round.type === "parallel" ? "独立发言" : "顺序辩论"}) ===\n`;
    if (round.userInput) transcript += `Investor input: ${round.userInput}\n\n`;
    for (const resp of round.responses) {
      const m = getMaster(resp.masterId);
      const roleZh = MASTER_MEETING_ROLES[resp.masterId]?.roleZh || "";
      const v = resp.verdict ? ` [${resp.verdict.stance} · ${resp.verdict.conviction}]` : "";
      const snippet = resp.text.length > SNIPPET_LEN
        ? resp.text.slice(0, SNIPPET_LEN) + "…"
        : resp.text;
      transcript += `--- ${m.name}（${roleZh}）${v} ---\n${snippet}\n\n`;
    }
  }

  const memberNames = session.selectedMasters.map(id => {
    const m = getMaster(id);
    return `${m.name}（${MASTER_MEETING_ROLES[id]?.roleZh}）`;
  }).join("、");

  const system = `You are a neutral investment committee secretary producing meeting minutes. Write in the SAME LANGUAGE as the discussion (Chinese if most content is Chinese). Be factual, concise, and structured.`;

  const user = `Full transcript of an investment committee roundtable:

Topic: ${session.topic}
Date: ${today}
Committee: ${memberNames}

TRANSCRIPT:
${transcript}

Produce meeting minutes in this EXACT Markdown format:

# 投资委员会纪要
**议题：** ${session.topic}
**日期：** ${today}

## 委员会投票
| 宗师 | 立场 | 信念度 | 核心理由（≤15字）|
|------|------|--------|----------------|
[One row per member from their VERDICT lines]

**多数立场：[BULL/BEAR/NEUTRAL]（X/${session.selectedMasters.length}）**

## 共识观点
- [2-3 bullets where most agree]

## 核心分歧
- [2-3 named disagreements, e.g. "Munger vs Lynch: ..."]

## 最大风险（委员会排序）
1. [Most cited risk]
2. [Second risk]
3. [Third risk]

## 行动建议
- [ ] [Specific actionable item]
- [ ] [Second item]

## 一句话结论
[Single sentence summarizing the committee's overall view]`;

  const result = await callLLM({
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 2000,
  });
  if (!result) throw new Error("收到空回复，请重试");

  // Record per-ticker stock thesis from the minutes (non-blocking)
  const tickerMatch = session.topic?.match(/\b([A-Z]{2,5})\b/);
  if (tickerMatch) {
    memoryManager.recordInsight({
      type: "stock_thesis",
      scope: tickerMatch[1],
      content: result.slice(0, 700),
      structured: { topic: session.topic, date: today, masters: session.selectedMasters },
      modelId: "committee-minutes",
    }).catch(() => {});
  }

  return result;
}

// Lightweight flash helper — used by DreamJob and InvestorDNA.distill()
// to avoid circular imports (they inject this function rather than importing callLLM directly).
export async function callFlash(userPrompt) {
  return await callLLM({
    system: "You are a concise analyst. Reply only as instructed.",
    messages: [{ role: "user", content: userPrompt }],
    model: MODELS.fast,
    max_tokens: 600,
  });
}

// ============================================================
// Yahoo Finance (free, no key, no CORS — works in native app)
// ============================================================

const YF_BASE = "https://query1.finance.yahoo.com";
const YF_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

async function fetchYahooOne(symbol) {
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${symbol}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);
  const meta = result.meta;

  const price = meta.regularMarketPrice ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const changePercent = price && prevClose ? ((price - prevClose) / prevClose) * 100 : null;

  const tsSec = meta.regularMarketTime;
  const asOf = tsSec
    ? new Date(tsSec * 1000).toLocaleString()
    : null;

  return {
    price,
    currency: meta.currency || null,
    changePercent,
    resolvedTicker: meta.symbol || symbol,
    asOf,
  };
}

// Fetch prices for a list of symbols in parallel.
// Returns a map { symbol -> priceData }. Failed ones are omitted.
export async function fetchLivePrices(symbols) {
  if (!symbols || symbols.length === 0) return {};
  const unique = [...new Set(symbols)];
  const results = await Promise.allSettled(unique.map(fetchYahooOne));
  const out = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.price != null) {
      out[unique[i]] = r.value;
    }
  });
  return out;
}

// Optional: symbol search for resolving Chinese names etc.
export async function yahooSearch(query) {
  const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.quotes || []).map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname,
      exch: q.exchange,
      type: q.quoteType,
    }));
  } catch {
    return [];
  }
}

// ============================================================
// Research module — Yahoo Finance snapshot + LLM memo generation
// ============================================================

const YF_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

// Yahoo Finance crumb auth — required by quoteSummary for non-US tickers (e.g. 0700.HK).
// Touch fc.yahoo.com first so the native HTTP stack picks up the consent cookie, then
// retrieve the crumb. Both are scoped to the process lifetime; a 401 mid-session
// invalidates the cached crumb so the next call re-fetches.
let _yfCrumb = null;
let _yfCrumbPromise = null;

// Call this early (e.g. when the composer opens) to overlap crumb acquisition with user input.
export function preWarmYFCrumb() { getYFCrumb().catch(() => {}); }

async function getYFCrumb() {
  if (_yfCrumb) return _yfCrumb;
  if (_yfCrumbPromise) return _yfCrumbPromise;
  _yfCrumbPromise = (async () => {
    try {
      await fetch("https://fc.yahoo.com", { headers: YF_HEADERS }).catch(() => {});
      const res = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
        headers: YF_HEADERS,
      });
      if (!res.ok) throw new Error(`YF crumb ${res.status}`);
      const crumb = (await res.text()).trim();
      _yfCrumb = crumb;
      return crumb;
    } finally {
      _yfCrumbPromise = null;
    }
  })();
  return _yfCrumbPromise;
}

// Fetch fundamental snapshot from Yahoo Finance quoteSummary (24h cached).
// Returns null on failure — callers should degrade gracefully.
export async function fetchResearchSnapshot(ticker) {
  const cached = await getCachedSnapshot(ticker);
  if (cached) return { ...cached, stale: true };

  const modules = [
    "assetProfile", "summaryDetail", "defaultKeyStatistics",
    "financialData", "earningsTrend", "calendarEvents", "secFilings",
  ].join(",");

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const host = YF_HOSTS[attempt % 2];
    try {
      const crumb = await getYFCrumb().catch(() => null);
      const crumbParam = crumb ? `&crumb=${encodeURIComponent(crumb)}` : "";
      const url = `${host}/v10/finance/quoteSummary/${encodeURIComponent(ticker.toUpperCase())}?modules=${modules}${crumbParam}`;
      const res = await fetch(url, { headers: YF_HEADERS });
      if (res.status === 401) {
        // Crumb expired — invalidate and retry with a fresh one
        _yfCrumb = null;
        _yfCrumbPromise = null;
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (!result) throw new Error("empty result");

      const snap = _parseQuoteSummary(result, ticker);
      await setCachedSnapshot(ticker, snap);
      return { ...snap, stale: false };
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
    }
  }
  console.warn("fetchResearchSnapshot failed for", ticker, lastErr?.message);
  return null;
}

// Exported so callers can run this in parallel with fetchResearchSnapshot.
export async function assembleResearchContext({ ticker, thesis, profile }) {
  return memoryManager.assemble({
    ticker,
    query: thesis || ticker,
    depth: ContextDepth.STANDARD,
    feature: "research",
    holdings: profile?.holdings,
    prices: profile?.prices,
  });
}

function _parseQuoteSummary(r, ticker) {
  const profile = r.assetProfile || {};
  const detail = r.summaryDetail || {};
  const stats = r.defaultKeyStatistics || {};
  const fin = r.financialData || {};
  const trend = r.earningsTrend?.trend || [];
  const cal = r.calendarEvents || {};
  const filings = r.secFilings?.filings || [];

  const v = (obj) => (typeof obj?.raw === "number" ? obj.raw : obj?.raw ?? null);

  const currentQTrend = trend.find(t => t.period === "0q") || {};
  const nextYearTrend = trend.find(t => t.period === "+1y") || {};

  const latestFiling = filings[0] || {};

  return {
    ticker: ticker.toUpperCase(),
    businessSummary: profile.longBusinessSummary || null,
    sector: profile.sector || null,
    industry: profile.industry || null,
    employees: profile.fullTimeEmployees || null,
    website: profile.website || null,
    marketCap: v(detail.marketCap),
    fiftyTwoWeekHigh: v(detail.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: v(detail.fiftyTwoWeekLow),
    beta: v(detail.beta),
    dividendYield: v(detail.dividendYield),
    trailingPE: v(stats.trailingPE),
    forwardPE: v(stats.forwardPE),
    pegRatio: v(stats.pegRatio),
    priceToBook: v(stats.priceToBook),
    enterpriseValue: v(stats.enterpriseValue),
    profitMargins: v(stats.profitMargins),
    roe: v(stats.returnOnEquity),
    roa: v(stats.returnOnAssets),
    freeCashflow: v(fin.freeCashflow),
    totalCash: v(fin.totalCash),
    totalDebt: v(fin.totalDebt),
    debtToEquity: v(fin.debtToEquity),
    currentRatio: v(fin.currentRatio),
    revenueGrowth: v(fin.revenueGrowth),
    earningsGrowth: v(fin.earningsGrowth),
    epsEstimateNextQ: v(currentQTrend.earningsEstimate?.avg),
    revenueEstimateNextYear: v(nextYearTrend.revenueEstimate?.avg),
    nextEarningsDate: cal.earnings?.earningsDate?.[0]?.fmt || null,
    latestFilingDate: latestFiling.date || null,
    latestFilingType: latestFiling.type || null,
    latestFilingUrl: latestFiling.edgarUrl || null,
    fetchedAt: new Date().toISOString(),
  };
}

// Format a number with B/M suffix for compact display.
// Exported because the research pipeline also uses this in mentor memo summaries.
export function fmtNumber(n, decimals = 2, missing = "N/A") {
  if (n == null) return missing;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  return n.toFixed(decimals);
}

function _buildSnapshotBlock(snap) {
  if (!snap) return "<snapshot>unavailable — user-entered data only</snapshot>";
  const pct = (n) => n != null ? (n * 100).toFixed(1) + "%" : "N/A";
  return `<snapshot>
  ticker: ${snap.ticker}
  sector: ${snap.sector || "N/A"} | industry: ${snap.industry || "N/A"}
  employees: ${snap.employees ? snap.employees.toLocaleString() : "N/A"}
  business_summary: ${(snap.businessSummary || "").slice(0, 500)}
  market_cap: ${fmtNumber(snap.marketCap)}
  52w_range: ${fmtNumber(snap.fiftyTwoWeekLow, 2)} – ${fmtNumber(snap.fiftyTwoWeekHigh, 2)}
  beta: ${snap.beta?.toFixed(2) ?? "N/A"}
  dividend_yield: ${pct(snap.dividendYield)}
  trailing_pe: ${snap.trailingPE?.toFixed(1) ?? "N/A"}
  forward_pe: ${snap.forwardPE?.toFixed(1) ?? "N/A"}
  peg_ratio: ${snap.pegRatio?.toFixed(2) ?? "N/A"}
  price_to_book: ${snap.priceToBook?.toFixed(2) ?? "N/A"}
  profit_margins: ${pct(snap.profitMargins)}
  roe: ${pct(snap.roe)} | roa: ${pct(snap.roa)}
  free_cash_flow: ${fmtNumber(snap.freeCashflow)}
  debt_to_equity: ${snap.debtToEquity?.toFixed(1) ?? "N/A"}
  current_ratio: ${snap.currentRatio?.toFixed(2) ?? "N/A"}
  revenue_growth_yoy: ${pct(snap.revenueGrowth)} | earnings_growth_yoy: ${pct(snap.earningsGrowth)}
  eps_estimate_next_q: ${snap.epsEstimateNextQ?.toFixed(2) ?? "N/A"}
  next_earnings_date: ${snap.nextEarningsDate || "N/A"}
  latest_filing: ${snap.latestFilingType || "N/A"} on ${snap.latestFilingDate || "N/A"}
  data_freshness: ${snap.stale ? "cached" : "fresh"} as of ${snap.fetchedAt}
</snapshot>`;
}

// LLM responses sometimes contain markdown fences or Chinese curly quotes —
// strip them, then carve out the outermost {...} or [...] and parse.
// shape: "object" (default) or "array". `fallback`: returned on parse failure
// instead of throwing; pass undefined to throw with the given label.
export function parseLooseJson(raw, { label = "JSON", shape = "object", fallback } = {}) {
  const clean = raw
    .replace(/```json\s*/gi, "").replace(/```/g, "")
    .replace(/"/g, '"').replace(/"/g, '"')
    .trim();
  const [open, close] = shape === "array" ? ["[", "]"] : ["{", "}"];
  const s = clean.indexOf(open), e = clean.lastIndexOf(close);
  if (s === -1 || e === -1) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${label}: no JSON in response. Got: "${raw.slice(0, 200)}"`);
  }
  try {
    return JSON.parse(clean.slice(s, e + 1));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${label}: malformed JSON. ${err.message}`);
  }
}

function _buildResearchContextBlocks({ ticker, snapshot, userThesis, manualNotes, holdingContext, currentPrice, profileCtxBlocks }) {
  const snapshotBlock = _buildSnapshotBlock(snapshot);
  const holdingBlock = holdingContext
    ? `<holding>
  shares: ${holdingContext.shares} @ ${holdingContext.costBasis} ${holdingContext.currency || ""}
  current_value: ${currentPrice ? (holdingContext.shares * currentPrice).toFixed(0) : "N/A"}
  buy_reason: ${holdingContext.buyReason || "(not recorded)"}
  buy_date: ${holdingContext.buyDate || "N/A"}
</holding>`
    : "<holding>not currently held</holding>";

  return `<ticker>${ticker.toUpperCase()}</ticker>
<current_price>${currentPrice ?? "N/A"}</current_price>

${snapshotBlock}

<user_thesis>${userThesis || "(not provided)"}</user_thesis>
<manual_notes>${manualNotes || "(none)"}</manual_notes>

${holdingBlock}

<investor_context>
${profileCtxBlocks}
</investor_context>`;
}

// ── HEADLINE call (deepseek-v4-flash, ~5-8s) ─────────────────────────────────
// Returns the small, decision-critical subset of the memo:
// status, confidence, confidence_basis, thesis_summary, max_risk_summary, business_snapshot.
// Streamed so UI can show "model is working" feedback.
const HEADLINE_SYSTEM = `You are a buy-side equity analyst writing the HEADLINE section of a research memo for a private investor. You handle the verdict + business summary only — the deep valuation work runs in a separate model.

All text fields in the JSON output must be written in Simplified Chinese (简体中文). JSON keys and enum values (status, confidence, evidence_quality, etc.) stay in English exactly as specified.

Rules:
- Use conditional language: "若……则值得关注", "当……时信号改善". Never "立即买入" / "Buy now".
- Status labels are conditional setups, not commands.
- Confidence reflects evidence quality, not probability of profit.
- Every factual claim should be traceable to the Yahoo Finance snapshot or user input.
- Every string field: max 2 sentences, max 120 characters. Be terse.
- Do not repeat information across fields.

Output strictly valid JSON matching the schema. No markdown.`;

export async function generateResearchHeadline({
  ticker, currentPrice, snapshot, userThesis, manualNotes,
  holdingContext, profile, preAssembledCtx = null, onChunk,
}) {
  const profileCtx = preAssembledCtx ?? await memoryManager.assemble({
    ticker, query: userThesis || ticker, depth: ContextDepth.STANDARD,
    feature: "research", holdings: profile?.holdings, prices: profile?.prices,
  });

  const ctxBlocks = _buildResearchContextBlocks({
    ticker, snapshot, userThesis, manualNotes, holdingContext, currentPrice,
    profileCtxBlocks: profileCtx.blocks,
  });

  const user = `Generate the HEADLINE section of a research memo for:

${ctxBlocks}

Return JSON with this exact schema (no other keys):
{
  "status": "buy_setup" | "watch" | "reduce_risk" | "avoid",
  "confidence": "high" | "medium" | "low",
  "confidence_basis": "one sentence explaining what drives the confidence level",
  "max_risk_summary": "brief string, what could go wrong",
  "thesis_summary": "2-3 sentences, conditional language only",
  "business_snapshot": {
    "summary": "what the company does, 1-2 sentences",
    "revenue_drivers": "what drives top-line growth",
    "competitive_edge": "the moat or differentiator",
    "market_debates": "the bull/bear debate the market is having"
  }
}`;

  const raw = await callLLMStream({
    system: HEADLINE_SYSTEM,
    messages: [{ role: "user", content: user }],
    model: MODELS.fast,
    max_tokens: 1500,
    onChunk,
  });
  return parseLooseJson(raw, { label: "Research headline" });
}

// ── DEEP call (deepseek-v4-pro, ~25-40s, streamed) ───────────────────────────
// Returns the analytically heavy sections: valuation scenarios, position sizing,
// trading strategy, deep research checklist. Runs in parallel with the headline.
const DEEP_SYSTEM = `You are a rigorous buy-side equity analyst writing the DEEP ANALYSIS sections of a research memo for a private investor: valuation scenarios, position sizing, trading strategy, and the deep research checklist.

All text fields in the JSON output must be written in Simplified Chinese (简体中文). JSON keys and enum values stay in English exactly as specified.

Rules:
- Use conditional language. Never imperative phrases.
- All valuation figures must be presented as ranges (bull/base/bear), never a single target price.
- Every factual claim must reference its data source (Yahoo Finance snapshot, user input, or AI inference).
- If data is missing, say so explicitly rather than fabricating.
- Every string field: max 2 sentences, max 120 characters. Be terse.
- deep_research_checklist: max 4 items. peer_set: max 3 tickers. watch_items: max 3 items. assumptions: max 3 items.
- Do not repeat information across fields.

Output strictly valid JSON matching the schema. No markdown.`;

export async function generateResearchDeepAnalysis({
  ticker, currentPrice, snapshot, userThesis, manualNotes,
  holdingContext, profile, preAssembledCtx = null, onChunk,
}) {
  const profileCtx = preAssembledCtx ?? await memoryManager.assemble({
    ticker, query: userThesis || ticker, depth: ContextDepth.STANDARD,
    feature: "research", holdings: profile?.holdings, prices: profile?.prices,
  });

  const ctxBlocks = _buildResearchContextBlocks({
    ticker, snapshot, userThesis, manualNotes, holdingContext, currentPrice,
    profileCtxBlocks: profileCtx.blocks,
  });

  const dataFreshness = snapshot?.stale ? "cached" : "live";
  const fetchedAt = snapshot?.fetchedAt?.slice(0, 10) || "N/A";

  const user = `Generate the DEEP ANALYSIS sections of a research memo for:

${ctxBlocks}

Where numbers come from the Yahoo Finance snapshot, note "Source: Yahoo Finance (${dataFreshness}, ${fetchedAt})".

Return JSON with this exact schema (no other keys):
{
  "valuation": {
    "current_price": 0,
    "multiples": { "trailing_pe": null, "forward_pe": null, "ev_ebitda": null, "price_to_book": null, "fcf_yield": null },
    "peer_set": [],
    "scenarios": {
      "bull": { "fair_value": 0, "assumptions": "" },
      "base": { "fair_value": 0, "assumptions": "" },
      "bear": { "fair_value": 0, "assumptions": "" }
    },
    "fair_value_band": { "low": 0, "high": 0 },
    "assumptions": [],
    "data_source": "",
    "stale": ${snapshot?.stale ? "true" : "false"}
  },
  "position_sizing": {
    "current_pct": 0,
    "max_pct": 0,
    "first_tranche_pct": 0,
    "add_condition": "",
    "trim_condition": "",
    "invalidation_condition": ""
  },
  "trading_strategy": {
    "watch_items": [],
    "buy_trigger": "",
    "sell_trim_trigger": "",
    "review_date": "YYYY-MM-DD",
    "batch_plan": ""
  },
  "deep_research_checklist": [
    { "item": "", "finding": "", "evidence_quality": "primary_filing|vendor_api|ai_inference|user_entered", "source": "" }
  ],
  "disclaimer_flags": {
    "data_tier": "Yahoo Finance + user input",
    "stale": ${snapshot?.stale ? "true" : "false"},
    "missing_data": []
  }
}`;

  const raw = await callLLMStream({
    system: DEEP_SYSTEM,
    messages: [{ role: "user", content: user }],
    model: MODELS.smart,
    max_tokens: 4500,
    onChunk,
  });
  return parseLooseJson(raw, { label: "Research deep analysis" });
}

// Evaluate a memo's conclusions against the investor's rules (cheap flash model).
// Returns array matching rules_conflict_check schema.
export async function checkResearchRules(memoSummary, rules) {
  if (!rules || rules.length === 0) return [];

  const prompt = `You are evaluating whether a stock research memo complies with an investor's personal investment rules.

Memo summary:
- Status: ${memoSummary.status}
- Confidence: ${memoSummary.confidence}
- Max risk: ${memoSummary.max_risk_summary}
- Thesis: ${memoSummary.thesis_summary}
- Position sizing: current ${memoSummary.position_sizing?.current_pct ?? 0}%, proposed max ${memoSummary.position_sizing?.max_pct ?? 0}%
- Invalidation: ${memoSummary.position_sizing?.invalidation_condition}

Investor rules:
${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

For each rule, output one JSON object with:
- rule_text: exact rule text
- result: "pass" | "fail" | "n/a" (use n/a when the rule is not applicable to this memo)
- notes: one sentence explaining the evaluation

Return a JSON array only. No markdown, no explanation.`;

  const raw = await callLLM({
    messages: [{ role: "user", content: prompt }],
    model: MODELS.fast,
    max_tokens: 800,
  });

  return parseLooseJson(raw, { label: "checkResearchRules", shape: "array", fallback: [] });
}

// Build the sources array for a research version (shared by Research.js and ResearchMemo.js).
export function buildResearchSources(memoData, snapshot) {
  const sources = [];
  if (snapshot) {
    sources.push({
      provider: "Yahoo Finance",
      tier: snapshot.stale ? "Yahoo Finance (cached)" : "Yahoo Finance (live)",
      description: `Fundamentals snapshot for ${snapshot.ticker}`,
      fetchedAt: snapshot.fetchedAt,
    });
    if (snapshot.latestFilingUrl) {
      sources.push({
        provider: "SEC EDGAR",
        tier: "SEC Filing",
        description: `${snapshot.latestFilingType || "Filing"} — ${snapshot.latestFilingDate || ""}`,
        url: snapshot.latestFilingUrl,
        fetchedAt: snapshot.fetchedAt,
      });
    }
  }
  sources.push({
    provider: "User",
    tier: "User Input",
    description: "Thesis and manual notes entered by investor",
    fetchedAt: new Date().toISOString(),
  });
  sources.push({
    provider: "DeepSeek v4 Pro",
    tier: "AI Inference",
    description: "Analysis and synthesis generated by AI",
    fetchedAt: new Date().toISOString(),
  });
  return sources;
}
