// api.js — DeepSeek API + Yahoo Finance (free, fast)
//
// Token economy principles:
//   1. deepseek-chat for all calls — cost-effective flagship model
//   2. Context trimming — only send what's relevant for the call
//   3. Yahoo Finance directly, no LLM web_search
//
// API key is passed in from the caller (stored in SecureStore at app level).

import * as SecureStore from "expo-secure-store";
import { MASTER_STYLES, getMaster } from "./constants";
import { monthLabel } from "./utils";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// deepseek-v4-flash for fast/cheap parsing; deepseek-v4-pro for mentor advice.
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

// ========== Core DeepSeek call ==========
async function callClaude({ system, messages, model = MODELS.smart, max_tokens = 1024 }) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("NO_API_KEY");

  const msgs = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;
  const body = { model, max_tokens, messages: msgs };

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
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
      if (p) {
        const mv = h.shares * p.price;
        const pnl = mv - cost;
        const pct = cost > 0 ? (pnl / cost) * 100 : 0;
        const dailyPct = p.changePercent;
        const reasonLine = h.buyReason ? `\n    reason: ${h.buyReason}` : "";
        return `  ${h.symbol}${h.displayName && h.displayName !== h.symbol ? ` (${h.displayName})` : ""} | ${h.shares}@${h.costBasis}${h.currency || ""} | now ${p.price}${p.currency} (day ${dailyPct >= 0 ? "+" : ""}${dailyPct?.toFixed?.(2) ?? "?"}%) | P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)${reasonLine}`;
      }
      const reasonLine = h.buyReason ? `\n    reason: ${h.buyReason}` : "";
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
// DeepSeek handles KV caching automatically server-side.
function buildCachedSystem(masterId, profile) {
  const persona = buildMasterPersona(masterId);
  const profileText = `<investor_profile>\n${buildProfileContext(profile)}\n</investor_profile>`;
  return `${persona}\n\n${profileText}`;
}

// ========== Use cases ==========

// Parse a freeform trade description into structured fields (Haiku — fast + cheap).
export async function parseTradeText(text) {
  const prompt = `Parse this trade description into JSON. Return ONLY the JSON object — no markdown fences, no explanation.

Description: """${text}"""

Schema:
{
  "action": "buy" | "sell" | "hold" | "watch",
  "stock": string (ticker/name; "?" if unclear),
  "reason": string (clean 1-2 sentence summary in SAME language as input, under 200 chars, faithful to user's reasoning),
  "emotion": "calm" | "confident" | "neutral" | "anxious" | "fearful"
}

Infer emotion from tone. Match input language exactly.`;

  const raw = await callClaude({
    messages: [{ role: "user", content: prompt }],
    model: MODELS.fast,
    max_tokens: 512,
  });
  const clean = raw.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1) throw new Error("No JSON in response");
  return JSON.parse(clean.slice(s, e + 1));
}

// Generate mentor feedback for a single trade or thought.
export async function generateEntryFeedback(entry, entryType, masterId, profile) {
  const system = buildCachedSystem(masterId, { ...profile, maxTrades: 5, maxWeekly: 2, maxMonthly: 1 });
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

  return await callClaude({
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 700,
  });
}

// Monthly commentary for a given master over a month's trades.
export async function generateMonthlyCommentary(month, monthTrades, masterId, profile) {
  const system = buildCachedSystem(masterId, { ...profile, maxTrades: 5, maxWeekly: 2, maxMonthly: 1 });
  const tradesList = monthTrades
    .map((t) => `- ${new Date(t.date).toISOString().slice(0, 10)} | ${t.action.toUpperCase()} | ${t.stock} | emotion: ${t.emotion} | ${t.reason}`)
    .join("\n");
  const user = `Look at the investor's trades for ${monthLabel(month)}:

${tradesList}

Give your analysis of this month's trading activity. Look for patterns, emotional triggers, rule violations, or consistencies with their philosophy. Point out what was wise and what deserves scrutiny. Be specific — reference individual trades by ticker. 3-4 short paragraphs. Match their language.`;

  return await callClaude({
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 900,
  });
}

// Mentor chat — minimal profile context to stay within free tier token limits.
export async function chatMessage(history, newUserMessage, profile, masterId = "default") {
  const system = buildCachedSystem(masterId, { ...profile, maxTrades: 5, maxWeekly: 2, maxMonthly: 1 });
  const trimmed = history.slice(-6); // last 3 exchanges
  const messages = [...trimmed, { role: "user", content: newUserMessage }];
  return await callClaude({ system, messages, max_tokens: 600 });
}

// ============================================================
// Strategy Report — comprehensive AI analysis of the full journal
// ============================================================
//
// This is the most expensive call in the app (~$0.03-0.08 per run).
// Uses max_tokens 3000 to allow a full structured report.
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

  return await callClaude({
    messages: [{ role: "user", content: user }],
    system,
    max_tokens: 3000,
  });
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
