// MemoryManager — the single entry point for all AI context operations.
//
// Three responsibilities:
//   assemble()       — build the context block for an AI call (all 4 tiers)
//   recordInsight()  — store an insight generated during an AI call (grows the brain)
//   triggerDNA()     — distill InvestorDNA if expired or missing
//
// Context depths:
//   MINIMAL  (800 tokens)  — Tier 1 only: foundation + DNA
//   STANDARD (1500 tokens) — Tier 1 + FTS5 top-5 + ticker mentor insights
//   DEEP     (2800 tokens) — Tier 1 + FTS5 top-10 + all Tier 3 for ticker

import { getHotCache, getDNA } from "./HotCache";
import { episodicRetriever } from "./retrieval/EpisodicMemoryRetriever";
import { InvestorDNA } from "./entities/InvestorDNA";
import * as db from "../db";
import { setDNA } from "./HotCache";

export const ContextDepth = {
  MINIMAL: "minimal",
  STANDARD: "standard",
  DEEP: "deep",
};

const TOKEN_BUDGETS = {
  minimal: 800,
  standard: 1500,
  deep: 2800,
};

// Rough token estimator (1 token ≈ 4 chars for mixed EN/ZH)
function estimateTokens(text) {
  if (!text) return 0;
  const s = typeof text === "string" ? text : JSON.stringify(text);
  return Math.ceil(s.length / 4);
}

function buildFoundationBlock(philosophy, rules) {
  const rulesText = (rules || []).map((r, i) => `  ${i + 1}. ${r}`).join("\n") || "  (none)";
  return `<philosophy>${philosophy || "(not defined)"}</philosophy>\n\n<rules>\n${rulesText}\n</rules>`;
}

function buildHoldingsBlock(holdings, prices) {
  if (!holdings || holdings.length === 0) return null;
  const priceMap = prices?.data || {};
  const lines = holdings.map(h => {
    const p = priceMap[h.symbol];
    if (p) {
      const cost = h.shares * h.costBasis;
      const mv = h.shares * p.price;
      const pnl = mv - cost;
      const pct = cost > 0 ? (pnl / cost * 100).toFixed(1) : "?";
      return `  ${h.symbol} | ${h.shares}@${h.costBasis} | now ${p.price} (${p.changePercent >= 0 ? "+" : ""}${p.changePercent?.toFixed(2)}%) | P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (${pct}%)`;
    }
    return `  ${h.symbol} | ${h.shares}@${h.costBasis} | (no live price)`;
  }).join("\n");
  return `<current_holdings>\n${lines}\n</current_holdings>`;
}

function buildEpisodicBlock(items) {
  if (!items || items.length === 0) return null;
  const lines = items.map(item => {
    const date = item.date?.slice(0, 10) || "?";
    if (item.type === "trade") {
      return `  [${date}] ${item.action?.toUpperCase()} ${item.stock} | ${item.emotion} | ${item.reason?.slice(0, 100)}`;
    }
    if (item.type === "thought") {
      return `  [${date}] thought: ${item.content?.slice(0, 100)}`;
    }
    if (item.type === "weekly") {
      return `  [${item.week}] weekly: ${item.text?.slice(0, 80)}`;
    }
    if (item.type === "research") {
      return `  [${date}] research memo: ${item.ticker} ${item.status ? `(${item.status})` : ""} — ${item.thesis?.slice(0, 100)}`;
    }
    return null;
  }).filter(Boolean).join("\n");
  return `<relevant_history>\n${lines}\n</relevant_history>`;
}

function buildInsightsBlock(insights) {
  if (!insights || insights.length === 0) return null;
  const lines = insights.map(i => `  • ${i.content?.slice(0, 120)}`).join("\n");
  return `<prior_mentor_insights>\n${lines}\n</prior_mentor_insights>`;
}

export class MemoryManager {
  /**
   * Assemble a context block for an AI call.
   *
   * @param {string|null}  ticker   - Stock ticker (null for general chats)
   * @param {string}       query    - Free-text query for FTS5 retrieval
   * @param {ContextDepth} depth    - How much context to include
   * @param {string}       feature  - "mentor" | "feedback" | "commentary" | "roundtable" | "strategy"
   * @param {Array}        holdings - Current holdings array (from React state)
   * @param {object}       prices   - Prices object { data, lastUpdated }
   * @returns {Promise<{blocks: string, estimatedTokens: number, provenance: Array, droppedSections: Array, metadata: object}>}
   */
  async assemble({ ticker, query = "", depth = ContextDepth.STANDARD, feature, holdings, prices }) {
    const budget = TOKEN_BUDGETS[depth] || TOKEN_BUDGETS.standard;
    const cache = getHotCache();
    const dna = getDNA();
    const sections = [];

    // ── Tier 1: HotCache (always, priority 0) ────────────────────────────
    const foundationText = buildFoundationBlock(cache.philosophy, cache.rules);
    sections.push({
      key: "foundation",
      priority: 0,
      tokens: estimateTokens(foundationText),
      text: foundationText,
    });

    if (dna) {
      const dnaText = new InvestorDNA(dna).toPromptBlock();
      sections.push({
        key: "investorDNA",
        priority: 1,
        tokens: estimateTokens(dnaText),
        text: dnaText,
      });
    }

    // Holdings (skip for roundtable — panel prompts already include them via buildPanelSystem)
    if (holdings && holdings.length > 0 && feature !== "roundtable") {
      const holdText = buildHoldingsBlock(holdings, prices);
      if (holdText) {
        sections.push({
          key: "holdings",
          priority: 2,
          tokens: estimateTokens(holdText),
          text: holdText,
        });
      }
    }

    if (depth === ContextDepth.MINIMAL) {
      return this._finalize(sections, budget, ticker, depth, feature);
    }

    // ── Tier 2: Episodic FTS5 retrieval ──────────────────────────────────
    const topK = depth === ContextDepth.DEEP ? 10 : 5;
    try {
      const items = await episodicRetriever.retrieve(ticker, query, { limit: topK, daysBack: 90 });
      if (items.length > 0) {
        const episodicText = buildEpisodicBlock(items);
        if (episodicText) {
          sections.push({
            key: "episodicMemory",
            priority: 3,
            tokens: estimateTokens(episodicText),
            text: episodicText,
          });
        }
      }
    } catch { /* FTS5 failure is non-fatal — continue without episodic context */ }

    // Recent mentor insights for this ticker
    if (ticker) {
      try {
        const insights = await db.getRecentInsights(ticker, 3);
        if (insights.length > 0) {
          const insightText = buildInsightsBlock(insights);
          if (insightText) {
            sections.push({
              key: "mentorInsights",
              priority: 4,
              tokens: estimateTokens(insightText),
              text: insightText,
            });
          }
        }
      } catch { /* non-fatal */ }
    }

    // Research memos for this ticker (STANDARD + DEEP)
    //
    // The pipeline's _finalize records ~600-char rich content including live
    // Yahoo Finance numbers (mcap, P/E, growth, FCF, next earnings, latest
    // filing) — critical because DeepSeek v4's training cutoff predates the
    // current market. Surface that content in full, plus a few structured
    // fields (review date, version id) for traceability.
    if (ticker) {
      try {
        const researchRows = await db.getRecentResearchMemos(ticker.toUpperCase(), 2);
        if (researchRows.length > 0) {
          const lines = researchRows.map(r => {
            let sd = {};
            try { if (r.structured_data) sd = JSON.parse(r.structured_data); } catch { /* malformed — skip structured fields */ }
            const distilledAt = r.distilled_at ? new Date(r.distilled_at).toISOString().slice(0, 10) : "?";
            const meta = `  (memo ${distilledAt}${sd.next_review_date ? `, review ${sd.next_review_date}` : ""})`;
            // r.content is already structured multi-line text built by the
            // pipeline. Pass it through verbatim — no slicing.
            return `${r.content || ""}\n${meta}`;
          }).join("\n\n");
          sections.push({
            key: "researchMemos",
            priority: 4.5,
            tokens: estimateTokens(lines),
            text: `<research_memos>\n${lines}\n</research_memos>`,
          });
        }
      } catch { /* non-fatal */ }
    }

    if (depth === ContextDepth.STANDARD) {
      return this._finalize(sections, budget, ticker, depth, feature);
    }

    // ── Tier 3: Semantic memory ───────────────────────────────────────────
    if (ticker) {
      try {
        const thesis = await db.getSemanticMemory("stock_thesis", ticker.toUpperCase());
        if (thesis) {
          sections.push({
            key: "stockThesis",
            priority: 5,
            tokens: estimateTokens(thesis.content),
            text: `=== PRIOR THESIS: ${ticker} ===\n${thesis.content}`,
          });
        }
      } catch { /* non-fatal */ }
    }

    try {
      const dreamSessions = await db.listSemanticMemory("dream_session");
      const recentDream = dreamSessions[0]; // most recent
      if (recentDream) {
        sections.push({
          key: "dreamInsights",
          priority: 6,
          tokens: estimateTokens(recentDream.content),
          text: `=== RECENT BEHAVIORAL INSIGHTS (dream session) ===\n${recentDream.content}`,
        });
      }
    } catch { /* non-fatal */ }

    return this._finalize(sections, budget, ticker, depth, feature);
  }

  _finalize(sections, budget, ticker, depth, feature) {
    sections.sort((a, b) => a.priority - b.priority);
    let used = 0;
    const included = [];
    const dropped = [];

    for (const s of sections) {
      if (used + s.tokens <= budget) {
        included.push(s);
        used += s.tokens;
      } else {
        dropped.push(s.key);
      }
    }

    const blocks = included.map(s => s.text).join("\n\n");
    return {
      blocks,
      estimatedTokens: used,
      droppedSections: dropped,
      provenance: included.map(s => s.key),
      metadata: {
        depth,
        ticker,
        feature,
        hasDNA: included.some(s => s.key === "investorDNA"),
        hasEpisodic: included.some(s => s.key === "episodicMemory"),
        hasSemantic: included.some(s => s.key === "stockThesis" || s.key === "dreamInsights"),
      },
    };
  }

  /**
   * Store an insight discovered during an AI generation.
   * Always async and non-blocking — call with .catch(() => {}).
   *
   * @param {string} type     - semantic_memory type (e.g. "mentor_insight", "stock_thesis")
   * @param {string|null} scope - ticker or null for global
   * @param {string} content  - text content to store
   * @param {object} structured - optional structured data
   * @param {string} modelId  - which model generated this
   */
  async recordInsight({ type, scope, content, structured, modelId }) {
    if (!content || content.trim().length < 20) return;
    const normalized = scope ? scope.toUpperCase() : null;
    await db.appendSemanticMemory(type, normalized, {
      content: content.slice(0, 600),
      structured,
      modelId: modelId || "unknown",
    });
  }

  /**
   * Distill InvestorDNA if it's expired or missing.
   * callFlash: async (userPrompt) => string
   */
  async triggerDNA({ trades, weeklyNotes, monthlyReviews, callFlash }) {
    const existing = getDNA();
    if (existing && !new InvestorDNA(existing).isExpired()) return;
    if (!trades || trades.length < 5) return;

    const cache = getHotCache();
    try {
      const freshDNA = await InvestorDNA.distill({
        trades,
        weeklyNotes,
        monthlyReviews,
        philosophy: cache.philosophy,
        rules: cache.rules,
        callFlash,
      });
      if (!freshDNA) return;
      setDNA(freshDNA);
      await db.setSemanticMemory("investor_dna", null, {
        content: freshDNA.toPromptBlock(),
        structured: freshDNA,
        sourceEntries: freshDNA.sourceEntries,
        modelId: freshDNA.modelId,
      });
    } catch { /* silent — DNA is optional */ }
  }
}

export const memoryManager = new MemoryManager();
