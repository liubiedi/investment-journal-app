// Validates that the new headline + deep research prompts return well-formed
// JSON from the live DeepSeek API. Run before shipping prompt changes.
//
// Usage:
//   DEEPSEEK_API_KEY=sk-... node scripts/test-research-prompts.mjs
//   DEEPSEEK_API_KEY=sk-... node scripts/test-research-prompts.mjs --ticker NVDA
//
// What it checks:
//   • Both calls return ≥1 SSE chunk (streaming works)
//   • Parsed JSON has every required top-level field
//   • Required nested objects exist with non-empty values
//   • Reports actual wall-clock latency per call
//
// The prompts below are copied verbatim from src/api.js — if you change those,
// update this script too. The intent is fast, isolated validation that doesn't
// require booting React Native.

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const MODELS = { fast: "deepseek-v4-flash", smart: "deepseek-v4-pro" };

const args = process.argv.slice(2);
const tickerArg = args.indexOf("--ticker");
const TICKER = tickerArg >= 0 ? args[tickerArg + 1] : "AAPL";

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("ERROR: DEEPSEEK_API_KEY env var is required.");
  console.error("Run: DEEPSEEK_API_KEY=sk-... node scripts/test-research-prompts.mjs");
  process.exit(2);
}

// ────────────────────────────────────────────────────────────────────────────
// Shared utilities (mirrors src/api.js exports)
// ────────────────────────────────────────────────────────────────────────────

function parseLooseJson(raw, { label = "JSON", shape = "object", fallback } = {}) {
  const clean = raw
    .replace(/```json\s*/gi, "").replace(/```/g, "")
    .replace(/“/g, '"').replace(/”/g, '"')
    .trim();
  const [open, close] = shape === "array" ? ["[", "]"] : ["{", "}"];
  const s = clean.indexOf(open), e = clean.lastIndexOf(close);
  if (s === -1 || e === -1) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${label}: no JSON in response. Got: "${raw.slice(0, 200)}"`);
  }
  try { return JSON.parse(clean.slice(s, e + 1)); }
  catch (err) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${label}: malformed JSON. ${err.message}`);
  }
}

async function callLLMStream({ system, messages, model, max_tokens }) {
  const body = { model, max_tokens, stream: true, messages: [
    ...(system ? [{ role: "system", content: system }] : []),
    ...messages,
  ]};
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "", buf = "", chunks = 0;
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
        if (chunk) { full += chunk; chunks += 1; }
      } catch { /* skip */ }
    }
  }
  return { text: full, chunks };
}

// ────────────────────────────────────────────────────────────────────────────
// Sample context (mirrors what _buildResearchContextBlocks produces)
// ────────────────────────────────────────────────────────────────────────────

const SAMPLE_CONTEXT = `<ticker>${TICKER}</ticker>
<current_price>198.45</current_price>

<snapshot>
  ticker: ${TICKER}
  sector: Technology | industry: Consumer Electronics
  employees: 164,000
  business_summary: Designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories. Services segment includes Advertising, AppleCare, Cloud Services, Digital Content, and Payment Services.
  market_cap: 3.1B
  52w_range: 168.20 – 234.50
  beta: 1.24
  dividend_yield: 0.5%
  trailing_pe: 32.1
  forward_pe: 28.4
  peg_ratio: 2.10
  price_to_book: 48.5
  profit_margins: 25.3%
  roe: 165.0% | roa: 28.4%
  free_cash_flow: 99.5B
  debt_to_equity: 1.4
  current_ratio: 0.95
  revenue_growth_yoy: 6.2% | earnings_growth_yoy: 8.5%
  eps_estimate_next_q: 1.85
  next_earnings_date: 2026-07-25
  latest_filing: 10-Q on 2026-05-01
  data_freshness: fresh as of 2026-05-15T10:30:00Z
</snapshot>

<user_thesis>Long-term hold; iPhone 16 cycle + services margin expansion + India growth.</user_thesis>
<manual_notes>(none)</manual_notes>

<holding>not currently held</holding>

<investor_context>
<philosophy>Patient, fundamentals-first. Avoid market timing. Concentrate on quality compounders.</philosophy>
<rules>
  1. Never exceed 8% portfolio weight per single position.
  2. Sell if forward P/E exceeds 35.
  3. Take profits when position doubles.
</rules>
<current_holdings>
  (none)
</current_holdings>
<recent_trades>
  (none)
</recent_trades>
</investor_context>`;

// ────────────────────────────────────────────────────────────────────────────
// HEADLINE prompt (copied verbatim from src/api.js)
// ────────────────────────────────────────────────────────────────────────────

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

const HEADLINE_USER = `Generate the HEADLINE section of a research memo for:

${SAMPLE_CONTEXT}

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

// ────────────────────────────────────────────────────────────────────────────
// DEEP prompt (copied verbatim from src/api.js)
// ────────────────────────────────────────────────────────────────────────────

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

const DEEP_USER = `Generate the DEEP ANALYSIS sections of a research memo for:

${SAMPLE_CONTEXT}

Where numbers come from the Yahoo Finance snapshot, note "Source: Yahoo Finance (live, 2026-05-15)".

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
    "stale": false
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
    "stale": false,
    "missing_data": []
  }
}`;

// ────────────────────────────────────────────────────────────────────────────
// Validators
// ────────────────────────────────────────────────────────────────────────────

const VALID_STATUS = new Set(["buy_setup", "watch", "reduce_risk", "avoid"]);
const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

function validateHeadline(obj) {
  const issues = [];
  if (!VALID_STATUS.has(obj.status)) issues.push(`status: ${JSON.stringify(obj.status)} not in ${[...VALID_STATUS]}`);
  if (!VALID_CONFIDENCE.has(obj.confidence)) issues.push(`confidence: ${JSON.stringify(obj.confidence)} not in ${[...VALID_CONFIDENCE]}`);
  for (const k of ["confidence_basis", "max_risk_summary", "thesis_summary"]) {
    if (!obj[k] || typeof obj[k] !== "string") issues.push(`${k}: missing or non-string`);
  }
  if (!obj.business_snapshot || typeof obj.business_snapshot !== "object") {
    issues.push("business_snapshot: missing or not an object");
  } else {
    for (const k of ["summary", "revenue_drivers", "competitive_edge", "market_debates"]) {
      if (!obj.business_snapshot[k]) issues.push(`business_snapshot.${k}: missing`);
    }
  }
  return issues;
}

function validateDeep(obj) {
  const issues = [];
  for (const k of ["valuation", "position_sizing", "trading_strategy", "deep_research_checklist", "disclaimer_flags"]) {
    if (obj[k] == null) issues.push(`${k}: missing`);
  }
  if (obj.valuation) {
    const sc = obj.valuation.scenarios;
    if (!sc?.bull?.fair_value || !sc?.base?.fair_value || !sc?.bear?.fair_value) {
      issues.push("valuation.scenarios: missing bull/base/bear.fair_value");
    }
  }
  if (obj.position_sizing) {
    for (const k of ["max_pct", "first_tranche_pct", "invalidation_condition"]) {
      if (obj.position_sizing[k] === undefined || obj.position_sizing[k] === "") {
        issues.push(`position_sizing.${k}: missing or empty`);
      }
    }
  }
  if (obj.trading_strategy) {
    if (!obj.trading_strategy.review_date || !/^\d{4}-\d{2}-\d{2}$/.test(obj.trading_strategy.review_date)) {
      issues.push(`trading_strategy.review_date: missing or not YYYY-MM-DD (${obj.trading_strategy.review_date})`);
    }
  }
  if (!Array.isArray(obj.deep_research_checklist)) {
    issues.push("deep_research_checklist: not an array");
  }
  return issues;
}

// ────────────────────────────────────────────────────────────────────────────
// Run
// ────────────────────────────────────────────────────────────────────────────

async function runStage(label, system, user, model, max_tokens, validate) {
  console.log(`\n=== ${label} (${model}) ===`);
  const t0 = Date.now();
  let result;
  try {
    result = await callLLMStream({ system, messages: [{ role: "user", content: user }], model, max_tokens });
  } catch (e) {
    console.log(`  ✗ FETCH/STREAM FAILED: ${e.message}`);
    return { ok: false };
  }
  const elapsed = Date.now() - t0;
  console.log(`  ✓ Streamed ${result.chunks} chunks, ${result.text.length} chars in ${(elapsed / 1000).toFixed(1)}s`);

  let parsed;
  try {
    parsed = parseLooseJson(result.text, { label });
  } catch (e) {
    console.log(`  ✗ PARSE FAILED: ${e.message}`);
    console.log(`    Raw output (first 500 chars):\n    ${result.text.slice(0, 500).replace(/\n/g, "\n    ")}`);
    return { ok: false };
  }
  console.log(`  ✓ Parsed: top-level keys = ${Object.keys(parsed).join(", ")}`);

  const issues = validate(parsed);
  if (issues.length === 0) {
    console.log(`  ✓ Schema valid`);
    return { ok: true, parsed, elapsed };
  }
  console.log(`  ✗ ${issues.length} schema issue(s):`);
  for (const i of issues) console.log(`    - ${i}`);
  return { ok: false, parsed, elapsed, issues };
}

async function main() {
  console.log(`DeepSeek research-prompt validation — ticker: ${TICKER}`);

  const t0 = Date.now();
  const [headlineRes, deepRes] = await Promise.all([
    runStage("HEADLINE", HEADLINE_SYSTEM, HEADLINE_USER, MODELS.fast, 1500, validateHeadline),
    runStage("DEEP", DEEP_SYSTEM, DEEP_USER, MODELS.smart, 4500, validateDeep),
  ]);
  const total = Date.now() - t0;

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Wall clock (parallel): ${(total / 1000).toFixed(1)}s`);
  console.log(`  Headline: ${headlineRes.ok ? "PASS" : "FAIL"}${headlineRes.elapsed ? ` (${(headlineRes.elapsed / 1000).toFixed(1)}s)` : ""}`);
  console.log(`  Deep:     ${deepRes.ok ? "PASS" : "FAIL"}${deepRes.elapsed ? ` (${(deepRes.elapsed / 1000).toFixed(1)}s)` : ""}`);

  if (headlineRes.ok && deepRes.ok) {
    console.log(`\n  Sample output (headline):`);
    console.log(`    status = ${headlineRes.parsed.status}, confidence = ${headlineRes.parsed.confidence}`);
    console.log(`    thesis = ${headlineRes.parsed.thesis_summary?.slice(0, 100)}...`);
    console.log(`\n  Sample output (deep):`);
    const sc = deepRes.parsed.valuation?.scenarios;
    console.log(`    valuation bull/base/bear = ${sc?.bull?.fair_value}/${sc?.base?.fair_value}/${sc?.bear?.fair_value}`);
    console.log(`    position max_pct = ${deepRes.parsed.position_sizing?.max_pct}%`);
    console.log(`    review_date = ${deepRes.parsed.trading_strategy?.review_date}`);
    process.exit(0);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(2);
});
