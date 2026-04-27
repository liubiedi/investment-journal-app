// Monthly review screen: bullets (with voice) + mentor commentary by master
import React, { useState, useEffect, useMemo } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sparkles, Plus, Quote } from "lucide-react-native";

import { colors, fonts } from "../theme";
import { useApp } from "../context";
import { monthKey, monthLabel } from "../utils";
import { ACTIONS, getMaster } from "../constants";
import { generateMonthlyCommentary } from "../api";
import * as db from "../db";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  PaperInput, FilledButton, Masthead, MasterChips, VoiceMic, HR,
} from "../components";

export default function MonthlyScreen() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const current = monthKey(new Date().toISOString());
  const [activeMonth, setActiveMonth] = useState(current);

  const allMonths = useMemo(() => {
    const set = new Set([current, ...Object.keys(app.monthlyReviews)]);
    app.trades.forEach((t) => set.add(monthKey(t.date)));
    return [...set].sort().reverse();
  }, [app.monthlyReviews, app.trades, current]);

  const monthTrades = app.trades.filter((t) => monthKey(t.date) === activeMonth);
  const bullets = app.monthlyReviews[activeMonth] || ["", "", "", ""];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead kicker="MONTHLY" title="æœˆè¯„" subtitle="4-5 æ¡è¦ç‚¹ï¼Œå‡ç»“ä¸€ä¸ªæœˆçš„æ€è€ƒ" />

      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {allMonths.map((m) => {
            const active = m === activeMonth;
            return (
              <Pressable key={m} onPress={() => setActiveMonth(m)}
                style={({ pressed }) => ({
                  paddingHorizontal: 14, paddingVertical: 8,
                  borderWidth: 1, borderColor: active ? colors.ink : colors.divider,
                  backgroundColor: active ? colors.ink : "transparent",
                  opacity: pressed ? 0.7 : 1,
                })}>
                <TMono style={{ fontSize: 11, color: active ? colors.bg : colors.inkSoft }}>
                  {monthLabel(m)}
                </TMono>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <MonthlyEditor
        key={activeMonth}
        month={activeMonth}
        initial={bullets}
        trades={monthTrades}
        onSave={(b) => app.saveMonthly(activeMonth, b)}
        hasReview={!!app.monthlyReviews[activeMonth]}
        profile={app.profile}
        defaultMaster={app.defaultMaster}
      />
    </ScrollView>
  );
}

function MonthlyEditor({ month, initial, trades, onSave, hasReview, profile, defaultMaster }) {
  const [draft, setDraft] = useState(
    initial.concat(Array(Math.max(0, 4 - initial.length)).fill("")).slice(0, 5)
  );

  const actionStats = useMemo(() => {
    const s = {};
    trades.forEach((t) => { s[t.action] = (s[t.action] || 0) + 1; });
    return s;
  }, [trades]);

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={{ paddingVertical: 20, borderTopWidth: 1, borderTopColor: colors.divider }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
          <TSerifBold style={{ fontSize: 20 }}>{monthLabel(month)}</TSerifBold>
          <Kicker>{trades.length} TRADES</Kicker>
        </View>
        {trades.length > 0 ? (
          <View style={{ flexDirection: "row", gap: 16 }}>
            {ACTIONS.map((a) => (
              <View key={a.id}>
                <TSerifBold style={{ color: a.color, fontSize: 22, lineHeight: 24 }}>
                  {actionStats[a.id] || 0}
                </TSerifBold>
                <Kicker style={{ marginTop: 2 }}>{a.zh}</Kicker>
              </View>
            ))}
          </View>
        ) : (
          <TSerifItalic style={{ fontSize: 13 }}>æœ¬æœˆæ— äº¤æ˜“è®°å½•</TSerifItalic>
        )}
      </View>

      {trades.length > 0 && <MonthlyMentor month={month} trades={trades} profile={profile} defaultMaster={defaultMaster} />}

      <View style={{ paddingTop: 24 }}>
        <Kicker style={{ marginBottom: 12 }}>REVIEW BULLETS Â· å¤ç›˜è¦ç‚¹</Kicker>
        {draft.map((b, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
            <TSerifBold style={{ color: colors.accent, fontSize: 20, marginTop: 6, width: 12 }}>â€¢</TSerifBold>
            <PaperInput
              multiline
              value={b}
              onChangeText={(v) => { const next = [...draft]; next[i] = v; setDraft(next); }}
              placeholder={["æœ€æˆåŠŸçš„ä¸€ç¬”å†³ç­–ï¼Ÿ", "æœ€æƒ³é‡æ¥çš„ä¸€ç¬”ï¼Ÿ", "è¿™ä¸ªæœˆå­¦åˆ°äº†ä»€ä¹ˆï¼Ÿ", "ä¸‹æœˆè¦æ”¹ä»€ä¹ˆï¼Ÿ", "å…¶ä»–è§‚å¯Ÿâ€¦"][i]}
              style={{ flex: 1, minHeight: 60, fontSize: 15 }}
            />
            <View style={{ marginTop: 4 }}>
              <VoiceMic currentText={b} onChange={(v) => {
                const next = [...draft]; next[i] = v; setDraft(next);
              }} />
            </View>
          </View>
        ))}
        {draft.length < 5 && (
          <Pressable onPress={() => setDraft([...draft, ""])}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Plus size={11} color={colors.inkMuted} />
            <TMono style={{ fontSize: 11 }}>ADD BULLET ({draft.length}/5)</TMono>
          </Pressable>
        )}

        <FilledButton onPress={() => onSave(draft.filter((b) => b.trim()))} style={{ marginTop: 24 }}>
          {hasReview ? "æ›´æ–°æœˆè¯„" : "å½’æ¡£æœˆè¯„"}
        </FilledButton>
      </View>
    </View>
  );
}

function MonthlyMentor({ month, trades, profile, defaultMaster }) {
  const [active, setActive] = useState(defaultMaster);
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState("");

  // Load any cached commentary for this month from DB
  useEffect(() => {
    (async () => {
      const loaded = {};
      for (const m of ["default", "lynch", "buffett", "munger", "dalio", "marks", "graham"]) {
        const text = await db.getMonthlyMentor(month, m);
        if (text) loaded[m] = text;
      }
      setCache(loaded);
    })();
  }, [month]);

  const request = async (masterId) => {
    setActive(masterId);
    if (cache[masterId]) return;
    setLoading(masterId); setError("");
    try {
      const text = await generateMonthlyCommentary(month, trades, masterId, profile);
      setCache((prev) => ({ ...prev, [masterId]: text }));
      await db.setMonthlyMentor(month, masterId, text);
    } catch (e) {
      setError(e.message === "NO_API_KEY" ? "è¯·å…ˆåœ¨è®¾ç½®ä¸­é…ç½® API key" : "ç”Ÿæˆå¤±è´¥");
    } finally {
      setLoading(null);
    }
  };

  const current = cache[active];
  const isLoading = loading === active;

  return (
    <View style={{ paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.divider }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Quote size={12} color={colors.accent} />
        <Kicker>MONTHLY VIEW Â· å¯¼å¸ˆæœˆåº¦ç‚¹è¯„</Kicker>
      </View>
      <TSerifItalic style={{ fontSize: 12, marginBottom: 12 }}>
        ä»Žä¸åŒè§†è§’ï¼Œå›žçœ‹è¿™ä¸ªæœˆçš„å…¨éƒ¨äº¤æ˜“ã€‚
      </TSerifItalic>

      <MasterChips active={active} onSelect={request} />

      <View style={{ marginTop: 12, padding: 12, minHeight: 60, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.dividerSoft }}>
        {isLoading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={colors.inkFaint} />
            <TSerifItalic style={{ fontSize: 12 }}>{getMaster(active).zh}æ­£åœ¨å¤ç›˜æœ¬æœˆâ€¦</TSerifItalic>
          </View>
        ) : current ? (
          <TSerif style={{ fontSize: 13, lineHeight: 22 }}>{current}</TSerif>
        ) : (
          <Pressable onPress={() => request(active)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Sparkles size={12} color={colors.accent} />
            <TSerifBold style={{ fontSize: 13 }}>è¯· {getMaster(active).zh} ç‚¹è¯„æœ¬æœˆ</TSerifBold>
          </Pressable>
        )}
        {error && <TMono style={{ color: colors.bad, fontSize: 11, marginTop: 8 }}>{error}</TMono>}
      </View>
    </View>
  );
}
