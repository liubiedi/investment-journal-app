// marketSignals.js — live market data for signal monitoring and AI context injection.
//
// Two sources:
//   Yahoo Finance /v8/finance/chart  — free, no key, price history + current price
//   Finnhub.io                       — free API key, earnings / analyst / news
//
// Results are cached for 2 hours in the market_signals_cache table.

import * as SecureStore from "expo-secure-store";
import {
  getCachedMarketSignals, saveMarketSignalsCache,
} from "./db";

const YF_BASE = "https://query1.finance.yahoo.com";
const YF_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
const FINNHUB_BASE = "https://finnhub.io/api/v1";

// ═══════════════════════════════════════════════════════════════
// Finnhub API key management (mirrors DeepSeek key pattern)
// ═══════════════════════════════════════════════════════════════

const FINNHUB_KEY_STORE = "finnhub_api_key";

export async function getFinnhubKey() {
  try { return await SecureStore.getItemAsync(FINNHUB_KEY_STORE); }
  catch { return null; }
}

export async function setFinnhubKey(key) {
  await SecureStore.setItemAsync(FINNHUB_KEY_STORE, key);
}

export async function clearFinnhubKey() {
  await SecureStore.deleteItemAsync(FINNHUB_KEY_STORE);
}

// ═══════════════════════════════════════════════════════════════
// Yahoo Finance — price history
// ═══════════════════════════════════════════════════════════════

// Returns { closes: number[], dates: string[], current: number }
// range: '1mo' | '3mo' | '1y' — '1y' needed for backtest
export async function fetchPriceHistory(ticker, range = "1mo") {
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(ticker.toUpperCase())}?interval=1d&range=${range}`;
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) throw new Error(`YF chart ${res.status} for ${ticker}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${ticker}`);

  const timestamps = result.timestamp || [];
  const rawCloses = result.indicators?.quote?.[0]?.close || [];
  const closes = [];
  const dates = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (rawCloses[i] != null) {
      closes.push(rawCloses[i]);
      dates.push(new Date(timestamps[i] * 1000).toISOString().slice(0, 10));
    }
  }
  const current = result.meta?.regularMarketPrice ?? closes[closes.length - 1] ?? null;
  return { closes, dates, current };
}

export function computeMomentum(closes) {
  if (!closes || closes.length < 2) return { return5d: null, return1mo: null, volatility1mo: null };
  const last = closes[closes.length - 1];
  const prev5 = closes[Math.max(0, closes.length - 6)];
  const prev1mo = closes[Math.max(0, closes.length - 22)];
  const return5d = prev5 ? ((last - prev5) / prev5) * 100 : null;
  const return1mo = prev1mo ? ((last - prev1mo) / prev1mo) * 100 : null;
  // Average |daily pct change| as volatility proxy
  let totalAbsRet = 0, count = 0;
  for (let i = Math.max(1, closes.length - 22); i < closes.length; i++) {
    if (closes[i - 1]) { totalAbsRet += Math.abs((closes[i] - closes[i - 1]) / closes[i - 1]) * 100; count++; }
  }
  const volatility1mo = count > 0 ? totalAbsRet / count : null;
  return { return5d, return1mo, volatility1mo };
}

// ═══════════════════════════════════════════════════════════════
// Finnhub — earnings, analyst, news, next earnings date
// ═══════════════════════════════════════════════════════════════

async function finnhubGet(path, key) {
  const url = `${FINNHUB_BASE}${path}&token=${key}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Finnhub ${res.status} ${path}`);
  return res.json();
}

// Returns { period, actual, estimate, surprisePct } for most-recent quarter, or null
export async function fetchFinnhubEarnings(ticker, key) {
  const data = await finnhubGet(`/stock/earnings?symbol=${encodeURIComponent(ticker)}&limit=2`, key);
  const q = Array.isArray(data) ? data[0] : null;
  if (!q || q.actual == null) return null;
  const surprisePct = q.estimate ? ((q.actual - q.estimate) / Math.abs(q.estimate)) * 100 : null;
  return { period: q.period, actual: q.actual, estimate: q.estimate, surprisePct };
}

// Returns ISO date string for next earnings date, or null
export async function fetchNextEarningsDate(ticker, key) {
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const data = await finnhubGet(
    `/calendar/earnings?from=${today}&to=${future}&symbol=${encodeURIComponent(ticker)}`, key
  );
  const items = data?.earningsCalendar || [];
  return items.length > 0 ? items[0].date : null;
}

// Returns most recent: { period, strongBuy, buy, hold, sell, strongSell, meanPt } or null
export async function fetchFinnhubAnalyst(ticker, key) {
  const [rec, pt] = await Promise.allSettled([
    finnhubGet(`/stock/recommendation?symbol=${encodeURIComponent(ticker)}`, key),
    finnhubGet(`/stock/price-target?symbol=${encodeURIComponent(ticker)}`, key),
  ]);
  const latest = rec.status === "fulfilled" && Array.isArray(rec.value) ? rec.value[0] : null;
  const meanPt = pt.status === "fulfilled" ? pt.value?.targetMean ?? null : null;
  if (!latest) return null;
  return {
    period: latest.period,
    strongBuy: latest.strongBuy ?? 0,
    buy: latest.buy ?? 0,
    hold: latest.hold ?? 0,
    sell: latest.sell ?? 0,
    strongSell: latest.strongSell ?? 0,
    meanPt,
  };
}

// Returns top 3: [{ headline, datetime, source }]
export async function fetchFinnhubNews(ticker, key, daysBack = 14) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
  const data = await finnhubGet(
    `/company-news?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}`, key
  );
  if (!Array.isArray(data)) return [];
  return data.slice(0, 3).map(n => ({
    headline: n.headline,
    datetime: n.datetime,
    source: n.source,
  }));
}

// ═══════════════════════════════════════════════════════════════
// Main entry: fetchMarketSignals(ticker) — cached, parallel
// ═══════════════════════════════════════════════════════════════

// Returns full signals object or reduced version (price only if no Finnhub key).
// Returns null if even price history fails.
export async function fetchMarketSignals(ticker) {
  const sym = ticker.toUpperCase();

  // Cache check (2h TTL)
  const cached = await getCachedMarketSignals(sym);
  if (cached) return cached;

  let priceData = null;
  try {
    priceData = await fetchPriceHistory(sym, "1mo");
  } catch {
    return null; // price history is the minimum requirement
  }

  const momentum = computeMomentum(priceData.closes);
  const result = { momentum, current: priceData.current };

  const key = await getFinnhubKey();
  if (key) {
    const [earnings, nextEarningsDate, analyst, news] = await Promise.allSettled([
      fetchFinnhubEarnings(sym, key),
      fetchNextEarningsDate(sym, key),
      fetchFinnhubAnalyst(sym, key),
      fetchFinnhubNews(sym, key),
    ]);
    result.earnings = earnings.status === "fulfilled" ? earnings.value : null;
    result.nextEarningsDate = nextEarningsDate.status === "fulfilled" ? nextEarningsDate.value : null;
    result.analyst = analyst.status === "fulfilled" ? analyst.value : null;
    result.news = news.status === "fulfilled" ? news.value : [];
  }

  await saveMarketSignalsCache(sym, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Build the <market_signals> XML block for AI context injection
// ═══════════════════════════════════════════════════════════════

export function buildSignalsBlock({ ticker, snap, momentum, current, earnings, nextEarningsDate, analyst, news }) {
  if (!current && !momentum) return null;
  const today = new Date().toISOString().slice(0, 10);
  const fmt = (n, d = 1) => n != null ? n.toFixed(d) : "N/A";
  const lines = [`<market_signals ticker="${ticker}" as_of="${today}">`];

  // Price action
  const cur = current ?? "N/A";
  const r5 = momentum?.return5d != null ? `${momentum.return5d >= 0 ? "+" : ""}${fmt(momentum.return5d)}%` : "N/A";
  const r1m = momentum?.return1mo != null ? `${momentum.return1mo >= 0 ? "+" : ""}${fmt(momentum.return1mo)}%` : "N/A";
  const vol = momentum?.volatility1mo != null ? `${fmt(momentum.volatility1mo)}%/day` : "N/A";
  lines.push(`  PRICE ACTION:`);
  lines.push(`  • Current: $${cur} | 5d: ${r5} | 1m: ${r1m} | daily_vol: ${vol}`);

  if (snap?.fiftyTwoWeekLow != null && snap?.fiftyTwoWeekHigh != null) {
    const lo = snap.fiftyTwoWeekLow, hi = snap.fiftyTwoWeekHigh;
    const pos = current && hi > lo ? Math.round(((current - lo) / (hi - lo)) * 100) : null;
    lines.push(`  • 52w range: $${fmt(lo, 2)} – $${fmt(hi, 2)}${pos != null ? ` | position: ${pos}% of range` : ""}`);
  }

  // Earnings
  if (earnings) {
    const beat = earnings.surprisePct != null ? (earnings.surprisePct >= 0 ? "BEAT" : "MISS") : "?";
    const supStr = earnings.surprisePct != null ? ` ${earnings.surprisePct >= 0 ? "+" : ""}${fmt(earnings.surprisePct)}%` : "";
    lines.push(`\n  EARNINGS (last reported):`);
    lines.push(`  • ${earnings.period}: ${beat}${supStr} (actual $${fmt(earnings.actual, 2)} vs est $${fmt(earnings.estimate, 2)})`);
    if (nextEarningsDate) {
      const daysAway = Math.round((new Date(nextEarningsDate) - Date.now()) / 86400000);
      lines.push(`  • Next earnings: ${nextEarningsDate} (${daysAway} days)`);
    }
  }

  // Analyst
  if (analyst) {
    const total = (analyst.strongBuy ?? 0) + (analyst.buy ?? 0) + (analyst.hold ?? 0) + (analyst.sell ?? 0) + (analyst.strongSell ?? 0);
    const ptLine = analyst.meanPt && current
      ? ` | Mean PT: $${fmt(analyst.meanPt, 0)} (+${fmt(((analyst.meanPt - current) / current) * 100, 1)}% upside)`
      : analyst.meanPt ? ` | Mean PT: $${fmt(analyst.meanPt, 0)}` : "";
    lines.push(`\n  ANALYST (${analyst.period || "latest"}):`);
    lines.push(`  • ${analyst.strongBuy} strongBuy | ${analyst.buy} buy | ${analyst.hold} hold | ${analyst.sell + analyst.strongSell} sell (of ${total})`);
    if (ptLine) lines.push(`  ${ptLine.trim()}`);
  }

  // News
  if (news && news.length > 0) {
    lines.push(`\n  NEWS (14d):`);
    for (const n of news.slice(0, 3)) {
      const dt = n.datetime ? new Date(n.datetime * 1000).toISOString().slice(0, 10) : "?";
      lines.push(`  • [${dt}] ${n.headline?.slice(0, 120) ?? ""}${n.source ? ` (${n.source})` : ""}`);
    }
  }

  lines.push(`</market_signals>`);
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// Trigger backtest — did this price level get hit in the past 12 months?
// ═══════════════════════════════════════════════════════════════

// Returns { hitCount, avgForward3m (pct|null), hitDates }
// A "hit" = price crossed within 2% of triggerPrice from above (buy signal).
export async function computeTriggerBacktest(ticker, triggerPrice) {
  if (!triggerPrice || triggerPrice <= 0) return { hitCount: 0, avgForward3m: null, hitDates: [] };
  let data;
  try {
    data = await fetchPriceHistory(ticker, "2y");
  } catch {
    return { hitCount: 0, avgForward3m: null, hitDates: [] };
  }
  const { closes, dates } = data;
  if (closes.length < 5) return { hitCount: 0, avgForward3m: null, hitDates: [] };

  const threshold = 0.03; // within 3% of trigger = "hit"
  const hitDates = [];
  const forwardReturns = [];
  let lastHitIdx = -10;

  for (let i = 1; i < closes.length; i++) {
    // Avoid double-counting consecutive days near trigger
    if (i - lastHitIdx < 5) continue;
    const dist = (closes[i] - triggerPrice) / triggerPrice;
    if (Math.abs(dist) <= threshold) {
      hitDates.push(dates[i]);
      lastHitIdx = i;
      // Try to compute 3-month (≈63 trading day) forward return
      const fwdIdx = i + 63;
      if (fwdIdx < closes.length && closes[i] > 0) {
        forwardReturns.push(((closes[fwdIdx] - closes[i]) / closes[i]) * 100);
      }
    }
  }

  const avgForward3m = forwardReturns.length > 0
    ? forwardReturns.reduce((a, b) => a + b, 0) / forwardReturns.length
    : null;

  return { hitCount: hitDates.length, avgForward3m, hitDates };
}
