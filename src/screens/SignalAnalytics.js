// SignalAnalytics — 4-tab signal outcome dashboard
import React, { useState, useEffect, useCallback } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, BarChart2 } from "lucide-react-native";

import { colors, fonts } from "../theme";
import {
  TSerif, TSerifBold, TSerifItalic, TMono,
} from "../components";
import {
  getAllSignalOutcomes, getAnalyticsStats,
} from "../db";

const TABS = ["总览", "信号列表", "标的分析", "策略校准"];

const fmt = (pct) => pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—";

export default function SignalAnalyticsScreen() {
  const nav = useNavigation();
  const [tab, setTab] = useState(0);
  const [outcomes, setOutcomes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [oc, st] = await Promise.all([
      getAllSignalOutcomes().catch(() => []),
      getAnalyticsStats().catch(() => null),
    ]);
    setOutcomes(oc);
    setStats(st);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <ChevronLeft size={22} color={colors.ink} />
        </Pressable>
        <TSerifBold style={{ fontSize: 20, flex: 1 }}>信号复盘</TSerifBold>
      </View>

      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.divider, paddingHorizontal: 8 }}>
        {TABS.map((t, i) => (
          <Pressable
            key={i}
            onPress={() => setTab(i)}
            style={{
              paddingVertical: 10, paddingHorizontal: 14,
              borderBottomWidth: 2,
              borderBottomColor: tab === i ? colors.ink : "transparent",
            }}
          >
            <TMono style={{ fontSize: 11, color: tab === i ? colors.ink : colors.inkFaint }}>{t}</TMono>
          </Pressable>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {loading ? (
          <TSerifItalic style={{ fontSize: 13, color: colors.inkFaint, marginTop: 32, textAlign: "center" }}>加载中…</TSerifItalic>
        ) : (
          <>
            {tab === 0 && <OverviewTab stats={stats} outcomes={outcomes} />}
            {tab === 1 && <SignalListTab outcomes={outcomes} nav={nav} />}
            {tab === 2 && <ByTickerTab outcomes={outcomes} />}
            {tab === 3 && <CalibrationTab outcomes={outcomes} stats={stats} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, color }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgCard, borderRadius: 8, padding: 12, gap: 2 }}>
      <TMono style={{ fontSize: 9, color: colors.inkFaint }}>{label}</TMono>
      <TSerifBold style={{ fontSize: 22, color: color || colors.ink }}>{value}</TSerifBold>
      {sub ? <TMono style={{ fontSize: 9, color: colors.inkFaint }}>{sub}</TMono> : null}
    </View>
  );
}

function OverviewTab({ stats, outcomes }) {
  if (!stats || stats.total === 0) {
    return (
      <View style={{ alignItems: "center", marginTop: 48 }}>
        <BarChart2 size={32} color={colors.inkFaint} />
        <TSerifItalic style={{ fontSize: 13, color: colors.inkFaint, marginTop: 12, textAlign: "center" }}>
          暂无信号记录{"\n"}确认触发价后，当价格条件满足时将自动记录
        </TSerifItalic>
      </View>
    );
  }

  const winRate = stats.winRate != null ? Math.round(stats.winRate) : null;

  const best = outcomes
    .filter(o => o.forward_3m_pct != null && o.action_taken === "acted")
    .sort((a, b) => b.forward_3m_pct - a.forward_3m_pct)[0];
  const worst = outcomes
    .filter(o => o.forward_3m_pct != null && o.action_taken === "acted")
    .sort((a, b) => a.forward_3m_pct - b.forward_3m_pct)[0];
  const recent = outcomes.sort((a, b) => (b.fired_at || 0) - (a.fired_at || 0))[0];

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatBox label="总信号数" value={stats.total} />
        <StatBox label="已行动" value={`${stats.acted} (${Math.round((stats.acted / stats.total) * 100)}%)`} color={colors.good} />
        <StatBox label="跳过" value={stats.skipped} />
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {winRate != null && <StatBox label="胜率" value={`${winRate}%`} sub={`${stats.wins}/${stats.acted}`} color={winRate >= 60 ? colors.good : colors.bad} />}
        {stats.avgReturn3m != null && <StatBox label="3个月均回报" value={fmt(stats.avgReturn3m)} color={stats.avgReturn3m >= 0 ? colors.good : colors.bad} />}
      </View>

      {recent && (
        <View style={{ backgroundColor: "#f7f3ea", borderRadius: 8, padding: 12 }}>
          <TMono style={{ fontSize: 10, color: colors.inkFaint, marginBottom: 4 }}>最近信号</TMono>
          <TSerif style={{ fontSize: 13 }}>
            {recent.ticker}  {recent.direction === "buy" ? "📈买入" : "📉减仓"}
            {"  "}{recent.action_taken ? (recent.action_taken === "acted" ? "已行动" : "已跳过") : "待记录"}
            {recent.forward_3m_pct != null ? `  ${fmt(recent.forward_3m_pct)} (3个月)` : ""}
          </TSerif>
        </View>
      )}

      {best && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: "#e8f5ee", borderRadius: 8, padding: 12 }}>
            <TMono style={{ fontSize: 9, color: "#4a7a5a" }}>🏆 最佳</TMono>
            <TSerifBold style={{ fontSize: 13, color: colors.good, marginTop: 2 }}>
              {best.ticker}  {fmt(best.forward_3m_pct)}
            </TSerifBold>
            <TMono style={{ fontSize: 9, color: colors.inkFaint }}>{best.fired_at ? new Date(best.fired_at).toISOString().slice(0, 10) : ""}</TMono>
          </View>
          {worst && worst.forward_3m_pct < 0 && (
            <View style={{ flex: 1, backgroundColor: "#fdf0f0", borderRadius: 8, padding: 12 }}>
              <TMono style={{ fontSize: 9, color: "#a03434" }}>⚠ 最差</TMono>
              <TSerifBold style={{ fontSize: 13, color: colors.bad, marginTop: 2 }}>
                {worst.ticker}  {fmt(worst.forward_3m_pct)}
              </TSerifBold>
              <TMono style={{ fontSize: 9, color: colors.inkFaint }}>{worst.fired_at ? new Date(worst.fired_at).toISOString().slice(0, 10) : ""}</TMono>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Signal List Tab ───────────────────────────────────────────────────────────

function SignalListTab({ outcomes }) {
  const sorted = [...outcomes].sort((a, b) => (b.fired_at || 0) - (a.fired_at || 0));

  if (sorted.length === 0) {
    return <TSerifItalic style={{ fontSize: 13, color: colors.inkFaint, marginTop: 32, textAlign: "center" }}>暂无记录</TSerifItalic>;
  }

  return (
    <View style={{ gap: 8 }}>
      {sorted.map((o, i) => {
        const date = o.fired_at ? new Date(o.fired_at).toISOString().slice(0, 10) : "?";
        const acted = o.action_taken === "acted";
        const skipped = o.action_taken === "skipped";
        const pending = !o.action_taken;
        const returnColor = o.forward_3m_pct != null
          ? (o.forward_3m_pct >= 0 ? colors.good : colors.bad)
          : colors.inkFaint;
        const borderColor = acted ? colors.good : skipped ? "#8b6f47" : colors.inkFaint;

        return (
          <View key={i} style={{ borderRadius: 8, borderLeftWidth: 3, borderLeftColor: borderColor, backgroundColor: "#f7f3ea", padding: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TMono style={{ fontSize: 12, color: colors.ink }}>{o.ticker}</TMono>
                <TMono style={{ fontSize: 10, color: colors.inkFaint }}>
                  {o.direction === "buy" ? "📈买入" : "📉减仓"}
                </TMono>
              </View>
              <TMono style={{ fontSize: 10, color: colors.inkFaint }}>{date}</TMono>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <TMono style={{ fontSize: 10, color: colors.inkFaint }}>
                触发@${o.event_trigger_price?.toFixed(2) ?? "?"}
                {acted && o.entry_price ? `  →买入$${o.entry_price.toFixed(2)}` : ""}
                {skipped ? "  →跳过" : ""}
                {pending ? "  →待记录" : ""}
              </TMono>
              {o.forward_3m_pct != null && (
                <TMono style={{ fontSize: 10, color: returnColor }}>{fmt(o.forward_3m_pct)} 3m</TMono>
              )}
            </View>
            {o.ai_debrief && (
              <TSerifItalic style={{ fontSize: 11, lineHeight: 17, color: colors.inkFaint, marginTop: 6 }} numberOfLines={2}>
                {o.ai_debrief}
              </TSerifItalic>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── By Ticker Tab ─────────────────────────────────────────────────────────────

function ByTickerTab({ outcomes }) {
  const byTicker = {};
  for (const o of outcomes) {
    if (!byTicker[o.ticker]) byTicker[o.ticker] = [];
    byTicker[o.ticker].push(o);
  }

  const tickers = Object.keys(byTicker).sort();

  if (tickers.length === 0) {
    return <TSerifItalic style={{ fontSize: 13, color: colors.inkFaint, marginTop: 32, textAlign: "center" }}>暂无记录</TSerifItalic>;
  }

  return (
    <View style={{ gap: 12 }}>
      {tickers.map(ticker => {
        const rows = byTicker[ticker];
        const acted = rows.filter(o => o.action_taken === "acted");
        const withReturns = acted.filter(o => o.forward_3m_pct != null);
        const wins = withReturns.filter(o => o.forward_3m_pct >= 0).length;
        const avgReturn = withReturns.length > 0
          ? withReturns.reduce((s, o) => s + o.forward_3m_pct, 0) / withReturns.length
          : null;
        const winRate = withReturns.length > 0 ? Math.round((wins / withReturns.length) * 100) : null;

        return (
          <View key={ticker} style={{ backgroundColor: "#f7f3ea", borderRadius: 8, padding: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <TSerifBold style={{ fontSize: 16 }}>{ticker}</TSerifBold>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {winRate != null && (
                  <TMono style={{ fontSize: 11, color: winRate >= 60 ? colors.good : colors.bad }}>
                    胜率 {winRate}%
                  </TMono>
                )}
                {avgReturn != null && (
                  <TMono style={{ fontSize: 11, color: avgReturn >= 0 ? colors.good : colors.bad }}>
                    均值 {fmt(avgReturn)}
                  </TMono>
                )}
              </View>
            </View>
            <TMono style={{ fontSize: 10, color: colors.inkFaint }}>
              {rows.length}次信号  ·  {acted.length}次行动
              {rows.length - acted.length > 0 ? `  ·  ${rows.length - acted.length}次跳过` : ""}
            </TMono>
          </View>
        );
      })}
    </View>
  );
}

// ── Calibration Tab ───────────────────────────────────────────────────────────

function CalibrationTab({ outcomes, stats }) {
  const acted = outcomes.filter(o => o.action_taken === "acted" && o.forward_3m_pct != null);
  const skipped = outcomes.filter(o => o.action_taken === "skipped" && o.forward_3m_pct != null);
  const missedOpportunities = skipped.filter(o => o.forward_3m_pct > 0);

  const avg = (arr, key) => arr.length > 0 ? arr.reduce((s, o) => s + (o[key] ?? 0), 0) / arr.length : null;

  const avgDrawdown = avg(acted.filter(o => o.max_drawdown_3m != null), "max_drawdown_3m");
  const avgMissed = missedOpportunities.length > 0
    ? missedOpportunities.reduce((s, o) => s + o.forward_3m_pct, 0) / missedOpportunities.length
    : null;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ backgroundColor: "#f7f3ea", borderRadius: 8, padding: 14 }}>
        <TMono style={{ fontSize: 11, color: colors.inkFaint, marginBottom: 8 }}>入场分析</TMono>
        {acted.length === 0 ? (
          <TSerifItalic style={{ fontSize: 12, color: colors.inkFaint }}>需要至少1次行动且3个月已过</TSerifItalic>
        ) : (
          <>
            {stats?.avgReturn3m != null && (
              <View style={{ marginBottom: 8 }}>
                <TMono style={{ fontSize: 10, color: colors.inkFaint }}>3个月平均回报</TMono>
                <TSerifBold style={{ fontSize: 18, color: stats.avgReturn3m >= 0 ? colors.good : colors.bad }}>
                  {fmt(stats.avgReturn3m)}
                </TSerifBold>
              </View>
            )}
            {avgDrawdown != null && (
              <View>
                <TMono style={{ fontSize: 10, color: colors.inkFaint }}>入场后平均最大回撤 (3个月内)</TMono>
                <TSerifBold style={{ fontSize: 16, color: colors.bad }}>{fmt(avgDrawdown)}</TSerifBold>
              </View>
            )}
          </>
        )}
      </View>

      <View style={{ backgroundColor: "#fdf8f0", borderRadius: 8, padding: 14 }}>
        <TMono style={{ fontSize: 11, color: "#8b6f47", marginBottom: 8 }}>跳过分析</TMono>
        {skipped.length === 0 ? (
          <TSerifItalic style={{ fontSize: 12, color: colors.inkFaint }}>暂无已跳过的信号</TSerifItalic>
        ) : (
          <>
            <TSerif style={{ fontSize: 13, marginBottom: 6 }}>
              已跳过 {skipped.length} 次信号，其中 {missedOpportunities.length} 次事后证明是机会
            </TSerif>
            {avgMissed != null && (
              <TMono style={{ fontSize: 11, color: "#8b6f47" }}>
                ⚠ 平均错过 {fmt(avgMissed)} (3个月)
              </TMono>
            )}
          </>
        )}
      </View>

      {acted.length >= 3 && (
        <View style={{ backgroundColor: "#f7f3ea", borderRadius: 8, padding: 14 }}>
          <TMono style={{ fontSize: 11, color: colors.inkFaint, marginBottom: 8 }}>触发价校准</TMono>
          <TSerif style={{ fontSize: 13, lineHeight: 20 }}>
            {stats?.winRate >= 70
              ? `触发价历史表现良好 (胜率 ${Math.round(stats.winRate)}%)，当前设定合理。`
              : stats?.winRate != null
                ? `胜率 ${Math.round(stats.winRate)}% 低于目标。建议复盘触发价设定是否过于激进。`
                : "积累更多数据后将提供校准建议。"
            }
          </TSerif>
        </View>
      )}
    </View>
  );
}
