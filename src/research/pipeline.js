// Research memo generation pipeline. Three LLM calls fan out in parallel —
// Headline (flash), Deep (pro), Rules (flash, depends on Headline) — each
// writing its slice to the placeholder version row as it lands. The memo
// screen subscribes to progress events and re-renders sections as they fill.

import {
  fetchResearchSnapshot,
  assembleResearchContext,
  generateResearchHeadline,
  generateResearchDeepAnalysis,
  checkResearchRules,
  buildResearchSources,
  fmtNumber,
} from "../api";
import {
  fetchMarketSignals,
  buildSignalsBlock,
  computeTriggerBacktest,
} from "../marketSignals";
import * as db from "../db";
import {
  updateResearchVersionFields,
  updateResearchMemoFields,
  insertResearchRuleChecks,
  updateResearchMemoTriggers,
  updateTriggerBacktest,
  newId,
} from "../db";
import { memoryManager } from "../memory/MemoryManager";
import { DEFAULT_RULES } from "../constants";
import { todayIso, addMonths } from "../utils";

// Stage names and phases as exported constants so callers (and subscribers)
// don't sprinkle string literals across the codebase.
export const StageName = Object.freeze({
  SNAPSHOT: "snapshot",
  HEADLINE: "headline",
  DEEP: "deep",
  RULES: "rules",
  FINALIZE: "finalize",
});

export const StagePhase = Object.freeze({
  IDLE: "idle",
  PENDING: "pending",
  RUNNING: "running",
  CHUNK: "chunk",
  DONE: "done",
  ERROR: "error",
  STALLED: "stalled",
});

const _subscribers = new Map();
const _activeJobs = new Map();

export function subscribeResearchProgress(memoId, listener) {
  if (!_subscribers.has(memoId)) _subscribers.set(memoId, new Set());
  _subscribers.get(memoId).add(listener);
  return () => {
    _subscribers.get(memoId)?.delete(listener);
    if (_subscribers.get(memoId)?.size === 0) _subscribers.delete(memoId);
  };
}

export function getResearchJobStatus(memoId) {
  return _activeJobs.get(memoId) || null;
}

function _emit(memoId, event) {
  const subs = _subscribers.get(memoId);
  if (!subs) return;
  for (const fn of subs) {
    try { fn(event); } catch { /* swallow listener errors */ }
  }
}

function _setStage(memoId, stage, phase) {
  const job = _activeJobs.get(memoId);
  if (job) job.stages[stage] = phase;
}

// ── Pipeline entry point ──────────────────────────────────────────────────────

// Caller must pre-persist the placeholder memo + version via
// saveResearchMemoWithVersion (status: "generating") and navigate to the
// memo screen so skeletons render immediately. Returns once all stages have
// settled — but callers usually fire-and-forget and rely on progress events.
export async function startResearchGeneration({
  memoId, versionId, ticker, currentPrice, userThesis, manualNotes,
  holdingContext, profile, rules,
  onMemoComplete,
}) {
  _activeJobs.set(memoId, {
    stages: { headline: StagePhase.PENDING, deep: StagePhase.PENDING, rules: StagePhase.PENDING },
    startedAt: Date.now(),
  });

  const sym = ticker.trim().toUpperCase();

  _emit(memoId, { stage: StageName.SNAPSHOT, phase: StagePhase.RUNNING });
  const [snapshot, marketSignals, preAssembledCtx] = await Promise.all([
    fetchResearchSnapshot(sym).catch(() => null),
    fetchMarketSignals(sym).catch(() => null),
    assembleResearchContext({ ticker: sym, thesis: userThesis, profile }),
  ]);
  const signalsBlock = marketSignals
    ? buildSignalsBlock({ ticker: sym, snap: snapshot, ...marketSignals })
    : null;
  _emit(memoId, { stage: StageName.SNAPSHOT, phase: StagePhase.DONE, data: { snapshot } });

  // ctx is identical across the headline and deep calls; build once.
  const ctx = { memoId, versionId, sym, currentPrice, snapshot, userThesis,
                manualNotes, holdingContext, profile, preAssembledCtx, signalsBlock };

  const headlinePromise = _runStage({
    ctx,
    name: StageName.HEADLINE,
    failMessage: "Headline generation failed",
    call: () => generateResearchHeadline({
      ticker: sym, currentPrice, snapshot, userThesis, manualNotes,
      holdingContext, profile, preAssembledCtx, signalsBlock,
      onChunk: (chunk) => _emit(memoId, { stage: StageName.HEADLINE, phase: StagePhase.CHUNK, chunk }),
    }),
    persist: async (headline) => {
      await updateResearchVersionFields(versionId, {
        thesis: headline.thesis_summary || null,
        businessSnapshot: headline.business_snapshot || null,
      });
      await updateResearchMemoFields(memoId, {
        status: headline.status || null,
        confidence: headline.confidence || null,
      });
    },
  });

  const deepPromise = _runStage({
    ctx,
    name: StageName.DEEP,
    failMessage: "Deep analysis failed",
    call: () => generateResearchDeepAnalysis({
      ticker: sym, currentPrice, snapshot, userThesis, manualNotes,
      holdingContext, profile, preAssembledCtx, signalsBlock,
      onChunk: (chunk) => _emit(memoId, { stage: StageName.DEEP, phase: StagePhase.CHUNK, chunk }),
    }),
    persist: async (deep) => {
      // Checklist lives in valuation.checklist (not businessSnapshot) so a deep
      // write can't be clobbered by a later headline write to businessSnapshot.
      // The viewer's ChecklistSection already falls back to valuation.checklist.
      const valuationWithChecklist = deep.valuation
        ? { ...deep.valuation, checklist: deep.deep_research_checklist || [] }
        : (deep.deep_research_checklist ? { checklist: deep.deep_research_checklist } : null);
      await updateResearchVersionFields(versionId, {
        valuation: valuationWithChecklist,
        positionSizing: deep.position_sizing || null,
        tradingStrategy: deep.trading_strategy || null,
      });
      if (deep.trading_strategy?.review_date) {
        await updateResearchMemoFields(memoId, { nextReviewDate: deep.trading_strategy.review_date });
      }
    },
  });

  const rulesPromise = headlinePromise.then(
    (headline) => _runRulesCheck({ memoId, versionId, headline, rules }),
    () => { /* headline failed — rules check is meaningless, skip silently */ }
  );

  const results = await Promise.allSettled([headlinePromise, deepPromise, rulesPromise]);
  const headlineResult = results[0].status === "fulfilled" ? results[0].value : null;
  const deepResult = results[1].status === "fulfilled" ? results[1].value : null;

  // FINALIZE.DONE must fire even if _finalize itself throws, otherwise the
  // memo screen never gets the cleanup signal and its loading indicator
  // sticks at "Updating memo…" forever.
  try {
    await _finalize({ memoId, versionId, sym, snapshot, headline: headlineResult, deep: deepResult, signalsBlock });
  } catch (e) {
    if (__DEV__) console.warn(`[pipeline] _finalize failed for ${memoId}:`, e?.message);
  } finally {
    _activeJobs.delete(memoId);
    _emit(memoId, { stage: StageName.FINALIZE, phase: StagePhase.DONE });
    onMemoComplete?.();
  }
}

// Generic stage runner: sets stage state, emits start/done/error events,
// invokes the LLM call, persists the result.
async function _runStage({ ctx, name, call, persist, failMessage }) {
  const { memoId } = ctx;
  _setStage(memoId, name, StagePhase.RUNNING);
  _emit(memoId, { stage: name, phase: StagePhase.RUNNING });
  try {
    const data = await call();
    await persist(data);
    _setStage(memoId, name, StagePhase.DONE);
    _emit(memoId, { stage: name, phase: StagePhase.DONE, data });
    return data;
  } catch (e) {
    _setStage(memoId, name, StagePhase.ERROR);
    _emit(memoId, { stage: name, phase: StagePhase.ERROR, error: e.message || failMessage });
    throw e;
  }
}

async function _runRulesCheck({ memoId, versionId, headline, rules }) {
  if (!rules || rules.length === 0) {
    _setStage(memoId, StageName.RULES, StagePhase.DONE);
    _emit(memoId, { stage: StageName.RULES, phase: StagePhase.DONE, data: [] });
    return [];
  }
  _setStage(memoId, StageName.RULES, StagePhase.RUNNING);
  _emit(memoId, { stage: StageName.RULES, phase: StagePhase.RUNNING });

  try {
    // checkResearchRules tolerates a partial memoSummary; position_sizing isn't
    // available yet at this point (deep call may still be in flight).
    const memoSummary = {
      status: headline.status,
      confidence: headline.confidence,
      max_risk_summary: headline.max_risk_summary,
      thesis_summary: headline.thesis_summary,
      position_sizing: {},
    };
    const checks = await checkResearchRules(memoSummary, rules);
    const dbChecks = (checks || []).map((rc) => ({
      id: newId("rrc"),
      versionId,
      ruleText: rc.rule_text || "",
      result: rc.result || "n/a",
      notes: rc.notes || "",
      overrideReason: null,
    }));
    if (dbChecks.length > 0) {
      await insertResearchRuleChecks(dbChecks);
    }
    _setStage(memoId, StageName.RULES, StagePhase.DONE);
    _emit(memoId, { stage: StageName.RULES, phase: StagePhase.DONE, data: dbChecks });
    return dbChecks;
  } catch (e) {
    _setStage(memoId, StageName.RULES, StagePhase.ERROR);
    _emit(memoId, { stage: StageName.RULES, phase: StagePhase.ERROR, error: e.message || "Rules check failed" });
    return [];
  }
}

async function _finalize({ memoId, versionId, sym, snapshot, headline, deep, signalsBlock }) {
  // Write the sources array + disclaimer flags + generatedAt now that we know
  // which sources actually contributed.
  const merged = {
    ...(headline || {}),
    valuation: deep?.valuation,
    position_sizing: deep?.position_sizing,
    trading_strategy: deep?.trading_strategy,
  };

  // Fall back to "watch" if headline failed so the memo doesn't stay frozen
  // at status="generating". Surface why via the missing_data flag.
  const missingData = deep?.disclaimer_flags?.missing_data || [];
  if (!headline) {
    missingData.push("headline_generation_failed");
    await updateResearchMemoFields(memoId, { status: "watch", confidence: "low" });
  }

  await updateResearchVersionFields(versionId, {
    disclaimerFlags: {
      data_tier: "Yahoo Finance + user input",
      stale: !!snapshot?.stale,
      missing_data: missingData,
      confidence_basis: headline?.confidence_basis || null,
      snapshot_fetched_at: snapshot?.fetchedAt || null,
      partial: !headline || !deep,
    },
    sources: buildResearchSources(merged, snapshot),
    generatedAt: new Date().toISOString(),
  });

  // Extract machine-readable trigger fields from trading_strategy
  const ts = deep?.trading_strategy || {};
  if (ts.buy_trigger_price != null || ts.sell_trim_price != null) {
    await updateResearchMemoTriggers(memoId, {
      buyTriggerPrice: ts.buy_trigger_price ?? null,
      buyTriggerAnchors: Array.isArray(ts.buy_trigger_anchors) ? ts.buy_trigger_anchors : [],
      buyTriggerConfidence: ts.buy_trigger_confidence ?? null,
      minEarningsSurprisePct: ts.min_earnings_surprise_pct ?? null,
      sellTrimPrice: ts.sell_trim_price ?? null,
      sellTriggerAnchors: Array.isArray(ts.sell_trigger_anchors) ? ts.sell_trigger_anchors : [],
      sellTriggerConfidence: ts.sell_trigger_confidence ?? null,
    }).catch(() => {});
  }
  if (ts.buy_trigger_price) {
    computeTriggerBacktest(sym, ts.buy_trigger_price)
      .then(bt => updateTriggerBacktest(memoId, bt))
      .catch(() => {});
  }

  // DeepSeek v4's training cutoff predates the current market, so we capture
  // the just-fetched live Yahoo Finance data here. The mentor pulls 2 most-
  // recent memos per ticker (~1200 chars total), prefix-cached.
  if (headline) {
    memoryManager.recordInsight({
      type: "research_memo",
      scope: sym,
      content: _buildMemoInsightContent({ sym, headline, deep, snapshot }),
      structured: {
        status: headline.status,
        confidence: headline.confidence,
        max_risk_summary: headline.max_risk_summary,
        thesis_summary: headline.thesis_summary,
        business_snapshot: headline.business_snapshot || null,
        valuation: deep?.valuation ? {
          current_price: deep.valuation.current_price,
          fair_value_band: deep.valuation.fair_value_band,
          scenarios: deep.valuation.scenarios,
          multiples: deep.valuation.multiples,
          assumptions: deep.valuation.assumptions,
        } : null,
        position_sizing: deep?.position_sizing || null,
        trading_strategy: deep?.trading_strategy || null,
        snapshot: snapshot ? {
          sector: snapshot.sector,
          industry: snapshot.industry,
          market_cap: snapshot.marketCap,
          fifty_two_week_high: snapshot.fiftyTwoWeekHigh,
          fifty_two_week_low: snapshot.fiftyTwoWeekLow,
          beta: snapshot.beta,
          trailing_pe: snapshot.trailingPE,
          forward_pe: snapshot.forwardPE,
          profit_margins: snapshot.profitMargins,
          revenue_growth: snapshot.revenueGrowth,
          earnings_growth: snapshot.earningsGrowth,
          free_cashflow: snapshot.freeCashflow,
          debt_to_equity: snapshot.debtToEquity,
          dividend_yield: snapshot.dividendYield,
          next_earnings_date: snapshot.nextEarningsDate,
          latest_filing_type: snapshot.latestFilingType,
          latest_filing_date: snapshot.latestFilingDate,
          stale: snapshot.stale,
          fetched_at: snapshot.fetchedAt,
        } : null,
        next_review_date: deep?.trading_strategy?.review_date || null,
        version_id: versionId,
      },
      modelId: "deepseek-v4-pro",
    }).catch(() => {});
  }
}

function _buildMemoInsightContent({ sym, headline, deep, snapshot }) {
  const lines = [];
  const status = headline.status?.toUpperCase() || "?";
  const conf = headline.confidence?.toUpperCase() || "?";
  lines.push(`[${status} · ${conf}] ${headline.thesis_summary || ""}`);

  // Live market data — the key thing DeepSeek v4 doesn't know on its own.
  if (snapshot) {
    const fmt = (v) => fmtNumber(v, 0, "?");
    const pct = (v) => v != null ? `${(v * 100).toFixed(1)}%` : "?";
    const freshness = snapshot.stale ? "cached" : "live";
    const asOf = snapshot.fetchedAt?.slice(0, 10) || "?";
    const parts = [
      `mcap ${fmt(snapshot.marketCap)}`,
      `52w ${fmt(snapshot.fiftyTwoWeekLow)}-${fmt(snapshot.fiftyTwoWeekHigh)}`,
      `fwd P/E ${snapshot.forwardPE?.toFixed(1) ?? "?"}`,
      `margin ${pct(snapshot.profitMargins)}`,
      `rev growth ${pct(snapshot.revenueGrowth)}`,
      `FCF ${fmt(snapshot.freeCashflow)}`,
      `D/E ${snapshot.debtToEquity?.toFixed(1) ?? "?"}`,
    ];
    lines.push(`  Market (${freshness} ${asOf}): ${parts.join(", ")}.`);
    if (snapshot.nextEarningsDate) lines.push(`  Next earnings: ${snapshot.nextEarningsDate}.`);
    if (snapshot.latestFilingType && snapshot.latestFilingDate) {
      lines.push(`  Latest filing: ${snapshot.latestFilingType} on ${snapshot.latestFilingDate}.`);
    }
  }

  if (headline.business_snapshot?.summary) {
    lines.push(`  业务: ${headline.business_snapshot.summary}`);
  }
  if (headline.business_snapshot?.market_debates) {
    lines.push(`  市场分歧: ${headline.business_snapshot.market_debates}`);
  }

  if (deep?.valuation) {
    const v = deep.valuation;
    const sc = v.scenarios || {};
    const cp = v.current_price ?? "?";
    const bull = sc.bull?.fair_value ?? "?";
    const base = sc.base?.fair_value ?? "?";
    const bear = sc.bear?.fair_value ?? "?";
    lines.push(`  估值: 当前 ${cp}; 牛/基/熊 ${bull}/${base}/${bear}.`);
  }

  if (deep?.position_sizing) {
    const p = deep.position_sizing;
    const sizing = [`max ${p.max_pct ?? "?"}%`, `首仓 ${p.first_tranche_pct ?? "?"}%`].join(", ");
    lines.push(`  仓位: ${sizing}.`);
    if (p.invalidation_condition) lines.push(`  逻辑失效: ${p.invalidation_condition}`);
    if (p.trim_condition) lines.push(`  减仓条件: ${p.trim_condition}`);
  }

  if (deep?.trading_strategy?.watch_items?.length) {
    lines.push(`  Watch: ${deep.trading_strategy.watch_items.slice(0, 3).join("; ")}`);
  }
  if (deep?.trading_strategy?.buy_trigger) {
    lines.push(`  买入触发: ${deep.trading_strategy.buy_trigger}`);
  }
  if (deep?.trading_strategy?.review_date) {
    lines.push(`  复盘日期: ${deep.trading_strategy.review_date}`);
  }

  return lines.join("\n");
}

// Build a placeholder memo + version pair (status "generating") for immediate
// DB insertion before the pipeline starts. Headline lands first and flips
// status to its real value.
export function buildPlaceholder({ memoId, versionId, ticker, companyName, holdingId, versionNum = 1 }) {
  const today = todayIso();
  const memo = {
    id: memoId,
    ticker: ticker.toUpperCase(),
    companyName: companyName || null,
    currentVersionId: versionId,
    status: "generating",
    confidence: null,
    createdAt: today,
    lastReviewedAt: today,
    nextReviewDate: addMonths(today, 3),
    holdingId: holdingId || null,
  };
  const version = {
    id: versionId,
    memoId,
    versionNum,
    thesis: null,
    businessSnapshot: null,
    valuation: null,
    positionSizing: null,
    tradingStrategy: null,
    disclaimerFlags: { generating: true },
    sources: [],
    modelId: "deepseek-v4-pro",
    generatedAt: new Date().toISOString(),
    createdAt: today,
  };
  return { memo, version };
}

// Sweep DB for memos stuck at status="generating" with no active in-process
// job and resume them. Used by:
//   • App.js boot — recover memos orphaned by a previous app crash/force-quit
//   • expo-background-task periodic invocations — finish work iOS interrupted
//
// Loads profile + rules from DB directly (no React context), filters out
// memos that are too fresh (give the foreground attempt time to finish), and
// caps the per-invocation batch so a single call can't exceed the OS's
// background time budget.
export async function resumeOrphanedMemos({
  maxBatch = 2,
  minAgeMs = 2 * 60 * 1000,
} = {}) {
  const memos = await db.listResearchMemos();
  const candidates = memos.filter((m) => {
    if (m.status !== "generating") return false;
    if (_activeJobs.has(m.id)) return false;
    const createdMs = m.created_at ? new Date(m.created_at).getTime() : 0;
    return Date.now() - createdMs >= minAgeMs;
  });
  if (candidates.length === 0) return { resumed: 0, total: 0 };

  // Loading profile is non-trivial — only pay the cost if we actually have
  // work to do.
  const [philosophy, rules, trades, thoughts, holdings, weeklyNotes, monthlyReviews, prices] = await Promise.all([
    db.kvGet("philosophy", ""),
    db.kvGet("rules", DEFAULT_RULES),
    db.listTrades(),
    db.listThoughts(),
    db.listHoldings(),
    db.listWeeklyNotes(),
    db.listMonthlyReviews(),
    db.getPricesCache(),
  ]);
  const profile = { philosophy, rules, weeklyNotes, monthlyReviews, trades, thoughts, holdings, prices };

  let resumed = 0;
  for (const memo of candidates.slice(0, maxBatch)) {
    const sym = memo.ticker.toUpperCase();
    const holdingCtx = memo.holding_id ? holdings.find((h) => h.id === memo.holding_id) : null;
    const currentPrice = prices?.data?.[sym]?.price ?? null;
    const version = memo.current_version_id ? await db.getResearchVersion(memo.current_version_id) : null;
    try {
      await startResearchGeneration({
        memoId: memo.id,
        versionId: memo.current_version_id,
        ticker: sym,
        currentPrice,
        userThesis: version?.thesis || "",
        manualNotes: "",
        holdingContext: holdingCtx,
        profile,
        rules,
      });
      resumed += 1;
    } catch {
      // Stage-level errors are already persisted to the memo (status="watch"
      // fallback via _finalize). Continue to the next candidate.
    }
  }
  return { resumed, total: candidates.length };
}
