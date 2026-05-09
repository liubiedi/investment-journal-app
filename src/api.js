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
    throw new Error(`DeepSeek ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
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
  if (master.id === "default") {
    return `You are a seasoned investment mentor who has followed this investor's journey for years. You know their philosophy, rules, trading history, and emotional patterns intimately. Speak with the warmth of a trusted advisor — direct but kind, insightful without lecturing, willing to challenge when needed.

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

  // Strip markdown fences and normalize quotes (Chinese curly quotes -> straight)
  const clean = raw
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .trim();

  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1) throw new Error("No JSON in response");

  const parsed = JSON.parse(clean.slice(s, e + 1));
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
// `profile` should be a SLIMMED-DOWN version (recent trades only, no deep history).
// `onChunk` is optional — if provided, streams text progressively.
export async function generateEntryFeedback(entry, entryType, masterId, profile, onChunk) {
  // Aggressively trim profile context — entry feedback only needs recent signal.
  const system = buildSystem(masterId, { ...profile, maxTrades: 5, maxWeekly: 2, maxMonthly: 1 });
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
  if (onChunk) return await callLLMStream({ ...opts, onChunk });
  return await callLLM(opts);
}

// Monthly commentary for a given master over a month's trades.
export async function generateMonthlyCommentary(month, monthTrades, masterId, profile) {
  // The month's trades are passed in the user message; the system context is trimmed.
  const system = buildSystem(masterId, { ...profile, maxTrades: 5, maxWeekly: 2, maxMonthly: 1 });
  const tradesList = monthTrades
    .map((t) => `- ${new Date(t.date).toISOString().slice(0, 10)} | ${t.action.toUpperCase()} | ${t.stock} | emotion: ${t.emotion} | ${t.reason}`)
    .join("\n");
  const user = `Look at the investor's trades for ${monthLabel(month)}:

${tradesList}

Give your analysis of this month's trading activity. Look for patterns, emotional triggers, rule violations, or consistencies with their philosophy. Point out what was wise and what deserves scrutiny. Be specific — reference individual trades by ticker. 3-4 short paragraphs. Match their language.`;

  return await callLLM({
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 900,
  });
}

// Mentor chat — system prompt + recent history only.
export async function chatMessage(history, newUserMessage, profile, masterId = "default") {
  const system = buildSystem(masterId, { ...profile, maxTrades: 5, maxWeekly: 2, maxMonthly: 1 });
  // Trim history to last 10 turns (5 exchanges) to keep messages small;
  // DeepSeek auto-caches the system prefix server-side.
  const trimmed = history.slice(-10);
  const messages = [...trimmed, { role: "user", content: newUserMessage }];
  return await callLLM({ system, messages, max_tokens: 2200 });
}

// ============================================================
// Strategy Report — comprehensive AI analysis of the full journal
// ============================================================
//
// This is the most expensive call in the app (~$0.03-0.08 per run).
// Uses a generous output budget to allow a full structured report.
// Context is NOT cached (rare, one-off call) — pass the FULL profile.

export async function generateStrategyReport(profile) {
  // Use the full profile: all trades, all weekly/monthly notes
  const ctx = buildProfileContext({
    ...profile,
    maxTrades: 100,   // expand from default 15
    maxWeekly: 52,    // last year of weekly notes
    maxMonthly: 24,   // last two years of monthly reviews
  });

  const system = `You are an elite investment analyst and behavioral finance expert. You have been given a complete record of an individual investor's journal: their stated philosophy, trading rules, actual trades with reasoning and emotion, weekly observations, monthly reflections, and current holdings.

Your task is to write a comprehensive, honest "Investment Strategy Profile" — what this investor ACTUALLY does, not just what they say they do. The gap between their stated rules and their actual behavior is often the most important finding.

Format the output as a structured Markdown document with the sections described below. Write in the SAME LANGUAGE as most of the journal entries (Chinese if they journal in Chinese, English if English, or mixed). Be specific: cite actual tickers, dates, patterns. This is not a generic report — it must be built exclusively from the evidence in this journal.

Be direct. Do not sugarcoat. If they consistently trade on emotion despite saying they won't, say so. If there are genuine strengths, name them. The goal is a document the investor can pin to their desk and actually learn from.`;

  const user = `Here is the complete investment journal:

<investor_profile>
${ctx}
</investor_profile>

Write the Investment Strategy Profile as a Markdown document with these exact sections:

# Investment Strategy Profile
*Generated: [today's date]*

## 1. Core Philosophy (Stated vs. Actual)
Compare their stated one-sentence philosophy against what the trade log reveals. Do they walk the talk?

## 2. Actual Investment Style
Based on trades, what style does this investor actually practice? (Value / Growth / Momentum / Trend-following / Opportunistic / Mixed?) What holding periods do they tend toward? How concentrated?

## 3. Decision-Making Patterns
What triggers buy decisions? What triggers sells? Are these consistent? Any recurring themes in reasoning?

## 4. Emotional Profile
What emotion tags appear most often? Do trades made under anxiety/fear perform differently (based on notes/reflections)? Does emotion predict regret (mentioned in monthly reviews)?

## 5. Rules Compliance Audit
For each stated rule, assess: followed consistently / sometimes broken / frequently violated. For violations, cite examples from trade log.

## 6. Strengths (Evidence-Based)
2-3 genuine strengths backed by specific trades or reflections.

## 7. Blind Spots & Recurring Mistakes
2-3 patterns that appear in monthly reviews or trade regrets. Be specific.

## 8. Holdings Analysis
Look at the current portfolio. Is it consistent with stated philosophy and rules? Any obvious concentration, style drift, or position that seems out of character?

## 9. Recommended Focus Areas (Next 6 Months)
3 specific, actionable improvements. Ground them in the patterns above — not generic advice.

## 10. One-Sentence Strategy Summary
A single sentence describing this investor's true strategy, written as though for an external observer.

---
*This report was generated from ${profile.trades?.length || 0} trades, ${Object.keys(profile.weeklyNotes || {}).length} weekly notes, and ${Object.keys(profile.monthlyReviews || {}).length} monthly reviews.*`;

  return await callLLM({
    messages: [{ role: "user", content: user }],
    system,
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
- 2-3 paragraphs maximum, 3-4 sentences each. Shorter is better.
- Lead with your sharpest insight — do not bury the lede.
- Every sentence must earn its place. Cut hedging, cut padding.
- Every point must be grounded in "${topic}" specifically.
- Your response MUST have two parts in order:
  PART 1 — Analysis (required first): 2-3 short, punchy paragraphs on "${topic}".
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

  const profileText = `<investor_profile>\n${buildProfileContext({ ...profile, maxTrades: 10, maxWeekly: 4, maxMonthly: 2 })}\n</investor_profile>`;
  return `${personaText}\n\n${profileText}`;
}

// Single master's panel response. priorResponses = all prior round responses visible to this master.
export async function mentorPanelResponse(topic, masterId, profile, priorResponses = [], additionalQuestion = "") {
  const system = buildPanelSystem(masterId, profile, priorResponses, topic, additionalQuestion);

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
    max_tokens: 600,
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
  return result;
}

// ============================================================
// Yahoo Finance (free, no key, no CORS — works in native app)
// ============================================================

const YF_BASE = "https://query1.finance.yahoo.com";

async function fetchYahooOne(symbol) {
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  const res = await fetch(url, {
    // Yahoo occasionally returns 401 without a UA; set one to be safe.
    headers: { "User-Agent": "Mozilla/5.0 (compatible; InvestmentJournal/1.0)" },
  });
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
