// signalMonitor.js — background signal evaluation and outcome tracking.
//
// Registered as an expo-background-task with a 12-hour (half-daily) floor —
// these are not day-trading signals. The primary trigger is the foreground
// resume check via App.js AppState listener; this task is a backstop.

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";

import { fetchLivePrices, getApiKey } from "./api";
import { fetchFinnhubEarnings, getFinnhubKey, fetchPriceHistory } from "./marketSignals";
import {
  getMonitoredMemos, saveSignalEvent, getRecentSignalEvent,
  getUnacknowledgedSignals, acknowledgeSignal,
  saveSignalOutcome, updateSignalOutcome,
  getPendingForwardReturns, newId,
  getResearchMemo, updateResearchMemoFields,
} from "./db";
import { kvGet } from "./db";

export const SIGNAL_MONITOR_TASK = "signal-monitor-task";

// ═══════════════════════════════════════════════════════════════
// Condition evaluation
// ═══════════════════════════════════════════════════════════════

export function evaluateConditions(memo, currentPrice, latestEarnings) {
  const effectiveBuyPrice = memo.buyTriggerPriceOverride ?? memo.buyTriggerPrice;
  const effectiveSellPrice = memo.sellTrimPriceOverride ?? memo.sellTrimPrice;

  // Buy side
  let buyOk = false, buyPriceDist = null;
  if (memo.buyTriggerConfirmed === 1 && effectiveBuyPrice) {
    buyPriceDist = ((currentPrice - effectiveBuyPrice) / effectiveBuyPrice) * 100;
    const priceOk = Math.abs(buyPriceDist) <= 5;
    const earningsOk = !memo.minEarningsSurprisePct ||
      (latestEarnings &&
       latestEarnings.period !== memo.lastCheckedEarningsPeriod &&
       latestEarnings.surprisePct >= memo.minEarningsSurprisePct);
    buyOk = priceOk && earningsOk;
  }

  // Sell side
  let sellOk = false, sellPriceDist = null;
  if (memo.sellTrimConfirmed === 1 && effectiveSellPrice) {
    sellPriceDist = ((currentPrice - effectiveSellPrice) / effectiveSellPrice) * 100;
    sellOk = Math.abs(sellPriceDist) <= 5;
  }

  return {
    buyOk, buyPriceDist,
    sellOk, sellPriceDist,
    earningsSurprise: latestEarnings?.surprisePct ?? null,
    earningsPeriod: latestEarnings?.period ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Notification helpers
// ═══════════════════════════════════════════════════════════════

async function isNotificationsEnabled() {
  const enabled = await kvGet("signal_notifications_enabled", null);
  if (enabled === null) return true; // default on
  return !!enabled && enabled !== 0;
}

export async function scheduleSignalNotification(title, body, memoId) {
  if (!(await isNotificationsEnabled())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { memoId }, sound: true },
      trigger: null,
    });
  } catch { /* non-fatal if permissions not granted */ }
}

function buildNotificationBody(memo, direction, result) {
  const effectivePrice = direction === "buy"
    ? (memo.buyTriggerPriceOverride ?? memo.buyTriggerPrice)
    : (memo.sellTrimPriceOverride ?? memo.sellTrimPrice);
  const distStr = result.buyPriceDist != null
    ? ` (差 ${result.buyPriceDist >= 0 ? "+" : ""}${result.buyPriceDist.toFixed(1)}%)`
    : "";
  let body = direction === "buy"
    ? `价格 $${effectivePrice?.toFixed(2) ?? "?"}${distStr} 进入买入区间`
    : `价格 $${effectivePrice?.toFixed(2) ?? "?"}${distStr} 触及减仓目标`;
  if (direction === "buy" && result.earningsSurprise != null && memo.minEarningsSurprisePct) {
    body += `\n财报超预期 ${result.earningsSurprise >= 0 ? "+" : ""}${result.earningsSurprise.toFixed(1)}%（门槛 ≥${memo.minEarningsSurprisePct}%）✓`;
  }
  const prose = direction === "buy" ? memo.buyTrigger : memo.sellTrimTrigger;
  if (!prose) {
    // prose comes from the trading_strategy — need to look it up from version
    // Fall back to a generic message if not available here
  }
  return body;
}

// ═══════════════════════════════════════════════════════════════
// Forward return auto-computation
// ═══════════════════════════════════════════════════════════════

export async function computePendingForwardReturns() {
  const pending = await getPendingForwardReturns();
  if (pending.length === 0) return;

  // Fetch all unique ticker histories in parallel to avoid redundant network calls
  const uniqueTickers = [...new Set(
    pending.map(o => (o.event_ticker || o.ticker)?.toUpperCase()).filter(Boolean)
  )];
  const priceDataMap = {};
  await Promise.allSettled(
    uniqueTickers.map(async ticker => {
      try {
        priceDataMap[ticker] = await fetchPriceHistory(ticker, "2y");
      } catch { /* skip ticker */ }
    })
  );

  for (const outcome of pending) {
    const ticker = (outcome.event_ticker || outcome.ticker)?.toUpperCase();
    if (!ticker || !outcome.entry_date) continue;
    const priceData = priceDataMap[ticker];
    if (!priceData) continue;
    const { closes, dates } = priceData;
    const entryIdx = dates.findIndex(d => d >= outcome.entry_date);
    if (entryIdx < 0 || !closes[entryIdx]) continue;
    const entryPrice = outcome.entry_price ?? closes[entryIdx];

    const updates = {};
    const daysElapsed = Math.round((Date.now() - new Date(outcome.entry_date).getTime()) / 86400000);

    if (daysElapsed >= 30 && outcome.forward_1m_pct == null) {
      const idx = entryIdx + 22;
      if (idx < closes.length && closes[idx]) {
        updates.forward1mPct = ((closes[idx] - entryPrice) / entryPrice) * 100;
      }
    }
    if (daysElapsed >= 90 && outcome.forward_3m_pct == null) {
      const idx = entryIdx + 63;
      if (idx < closes.length && closes[idx]) {
        updates.forward3mPct = ((closes[idx] - entryPrice) / entryPrice) * 100;
      }
    }
    if (daysElapsed >= 180 && outcome.forward_6m_pct == null) {
      const idx = entryIdx + 126;
      if (idx < closes.length && closes[idx]) {
        updates.forward6mPct = ((closes[idx] - entryPrice) / entryPrice) * 100;
      }
    }

    // Max drawdown in first 90 trading days
    if (daysElapsed >= 90 && outcome.max_drawdown_3m == null) {
      let maxDD = 0;
      for (let i = entryIdx + 1; i < Math.min(entryIdx + 64, closes.length); i++) {
        const dd = (closes[i] - entryPrice) / entryPrice * 100;
        if (dd < maxDD) maxDD = dd;
      }
      updates.maxDrawdown3m = maxDD;
    }

    if (Object.keys(updates).length > 0) {
      updates.forwardComputedAt = Date.now();
      await updateSignalOutcome(outcome.id, updates).catch(() => {});
    }

    // Trigger AI debrief at 3-month mark
    if (daysElapsed >= 90 && outcome.ai_debrief == null && outcome.forward_3m_pct != null) {
      generateSignalDebrief(outcome).catch(() => {});
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// AI post-signal debrief (generated at 3-month mark)
// ═══════════════════════════════════════════════════════════════

export async function generateSignalDebrief(outcome) {
  const apiKey = await getApiKey();
  if (!apiKey) return;
  // Minimal debrief generation — uses the fast model
  const { callLLM: _, callFlash } = await import("./api");
  const forward = outcome.forward_3m_pct != null
    ? `${outcome.forward_3m_pct >= 0 ? "+" : ""}${outcome.forward_3m_pct.toFixed(1)}%`
    : "数据待更新";
  const prompt = `你是一位买方分析师，正在进行一次入场信号的3个月复盘。

交易信息:
- 标的: ${outcome.ticker || outcome.event_ticker}
- 方向: ${outcome.direction === "buy" ? "买入" : "减仓"}
- 入场价: $${outcome.entry_price?.toFixed(2) ?? "?"}
- 入场日期: ${outcome.entry_date ?? "?"}
- 3个月收益: ${forward}
- 最大回撤(90天): ${outcome.max_drawdown_3m != null ? outcome.max_drawdown_3m.toFixed(1) + "%" : "N/A"}

请用简体中文写一个简短的3段复盘（共150-200字）：
1. 入场结果: 量化表现，诚实评价
2. 触发信号回顾: 当时的触发条件是否合理？价格区间是否准确？
3. 下一步建议: 是否需要调整触发价格或策略？

不要奉承。如果亏损，请直接分析原因。`;

  try {
    const text = await callFlash(prompt);
    await updateSignalOutcome(outcome.id, { aiDebrief: text });
    await scheduleSignalNotification(
      `${outcome.ticker || outcome.event_ticker} 信号3个月复盘已生成`,
      `入场${outcome.entry_date} → 3个月 ${forward}`,
      outcome.memo_id ?? null
    );
    await updateSignalOutcome(outcome.id, { debriefNotified: 1 });
  } catch (e) {
    if (__DEV__) console.warn("[signalMonitor] generateSignalDebrief failed:", e);
  }
}

// ═══════════════════════════════════════════════════════════════
// Main check — evaluates all monitored memos against live prices
// ═══════════════════════════════════════════════════════════════

export async function checkAllSignals() {
  // Run forward return computation first (no new API calls needed for most)
  await computePendingForwardReturns().catch(e => {
    if (__DEV__) console.warn("[signalMonitor] computePendingForwardReturns failed:", e);
  });

  const memos = await getMonitoredMemos();
  if (memos.length === 0) return [];

  const tickers = [...new Set(memos.map(m => m.ticker.toUpperCase()))];
  const priceMap = await fetchLivePrices(tickers).catch(() => ({}));

  const fhKey = await getFinnhubKey().catch(() => null);

  // Pre-fetch earnings for unique tickers that need it (avoids redundant Finnhub calls)
  const earningsNeededTickers = fhKey
    ? [...new Set(memos.filter(m => m.minEarningsSurprisePct).map(m => m.ticker.toUpperCase()))]
    : [];
  const earningsMap = {};
  await Promise.allSettled(
    earningsNeededTickers.map(async sym => {
      earningsMap[sym] = await fetchFinnhubEarnings(sym, fhKey).catch(() => null);
    })
  );

  const fired = [];

  for (const memo of memos) {
    const sym = memo.ticker.toUpperCase();
    const currentPrice = priceMap[sym]?.price;
    if (!currentPrice) continue;

    const latestEarnings = earningsMap[sym] ?? null;

    // Check buy direction
    if (memo.buyTriggerConfirmed === 1 && memo.buyTriggerPrice) {
      const result = evaluateConditions(memo, currentPrice, latestEarnings);
      if (result.buyOk) {
        const dupe = await getRecentSignalEvent(sym, "buy", 24 * 60 * 60 * 1000);
        if (!dupe) {
          const id = newId("sig");
          const event = {
            id, ticker: sym, direction: "buy",
            triggerPrice: memo.buyTriggerPriceOverride ?? memo.buyTriggerPrice,
            earningsSurprise: result.earningsSurprise,
            firedPrice: currentPrice,
            memoId: memo.id,
            firedAt: Date.now(),
            conditionsDetail: result,
          };
          await saveSignalEvent(event);
          // Create a pending outcome record
          await saveSignalOutcome({
            id: newId("sout"),
            signalEventId: id,
            ticker: sym,
            direction: "buy",
            actionTaken: null,
          });
          const body = buildNotificationBody(memo, "buy", result);
          await scheduleSignalNotification(`📈 买入条件满足: ${sym}`, body, memo.id);
          fired.push({ ...event, memoId: memo.id });
        }
      }
    }

    // Check sell direction
    if (memo.sellTrimConfirmed === 1 && memo.sellTrimPrice) {
      const result = evaluateConditions(memo, currentPrice, null);
      if (result.sellOk) {
        const dupe = await getRecentSignalEvent(sym, "sell", 24 * 60 * 60 * 1000);
        if (!dupe) {
          const id = newId("sig");
          const event = {
            id, ticker: sym, direction: "sell",
            triggerPrice: memo.sellTrimPriceOverride ?? memo.sellTrimPrice,
            earningsSurprise: null,
            firedPrice: currentPrice,
            memoId: memo.id,
            firedAt: Date.now(),
            conditionsDetail: result,
          };
          await saveSignalEvent(event);
          await saveSignalOutcome({
            id: newId("sout"),
            signalEventId: id,
            ticker: sym,
            direction: "sell",
            actionTaken: null,
          });
          const body = buildNotificationBody(memo, "sell", result);
          await scheduleSignalNotification(`📉 减仓条件满足: ${sym}`, body, memo.id);
          fired.push({ ...event, memoId: memo.id });
        }
      }
    }
  }

  return fired;
}

// ═══════════════════════════════════════════════════════════════
// Background task registration
// ═══════════════════════════════════════════════════════════════

export function registerSignalMonitorTask() {
  TaskManager.defineTask(SIGNAL_MONITOR_TASK, async () => {
    try {
      await checkAllSignals();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  BackgroundTask.registerTaskAsync(SIGNAL_MONITOR_TASK, {
    minimumInterval: 12 * 60 * 60, // 12 hours (half-daily) — these are
    // not day-trading signals. minimumInterval is only a floor/hint; iOS
    // throttles background runs heavily regardless. The AppState "active"
    // check in App.js (runs checkAllSignals on every app foreground) is the
    // primary trigger; this background task is just a backstop for moves
    // that happen while the app is closed.
  }).catch(() => {});
}
