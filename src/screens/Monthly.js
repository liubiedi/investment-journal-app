// Monthly review screen: bullets (with voice) + mentor commentary by master
import React, { useState, useEffect, useMemo } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Sparkles, Plus, Quote, Users, RefreshCw } from "lucide-react-native";

import { colors, fonts } from "../theme";
import { useApp } from "../context";
import { monthKey, monthLabel } from "../utils";
import { ACTIONS, getMaster } from "../constants";
import { generateMonthlyCommentary } from "../api";
import * as db from "../db";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  PaperInput, FilledButton, Masthead, MasterChips, MasterPickerModal,
} from "../components";

export default function MonthlyScreen() {
  const app = useApp();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const current = monthKey(new Date().toISOString());
  const [activeMonth, setActiveMonth] = useState(current);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingBullets, setPendingBullets] = useState([]);

  const allMonths = useMemo(() => {
    const set = new Set([current, ...Object.keys(app.monthlyReviews)]);
    app.trades.forEach((t) => set.add(monthKey(t.date)));
    return [...set].sort().reverse();
  }, [app.monthlyReviews, app.trades, current]);

  const monthTrades = app.trades.filter((t) => monthKey(t.date) === activeMonth);
  const bullets = app.monthlyReviews[activeMonth] || ["", "", "", ""];

  const doAskMentor = async (month, draftBullets, masterId) => {
    const nonEmpty = draftBullets.filter((b) => b.trim());
    const lines = [
      `月评 ${monthLabel(month)}：`,
      ...nonEmpty.map((b) => `• ${b}`),
      "",
      "请帮我从这个月的复盘总结出发，给我一些深度分析和建议。",
    ];
    await db.appendChat("user", lines.join("\n"), masterId);
    nav.navigate("mentor", { autoMaster: masterId, autoReplyTs: Date.now() });
  };

  const startAskMentor = (draftBullets) => {
    setPendingBullets(draftBullets);
    setPickerVisible(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead kicker="MONTHLY" title="月评" subtitle="4-5 条要点，凝结一个月的思考" />

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
        onAskMentor={startAskMentor}
      />
    </ScrollView>

    <MasterPickerModal
      visible={pickerVisible}
      onClose={() => setPickerVisible(false)}
      subtitle="以哪位大师的视角解读本月复盘？"
      onSelect={async (masterId) => {
        setPickerVisible(false);
        await doAskMentor(activeMonth, pendingBullets, masterId);
      }}
    />
    </KeyboardAvoidingView>
  );
}

function MonthlyEditor({ month, initial, trades, onSave, hasReview, profile, defaultMaster, onAskMentor }) {
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
          <TSerifItalic style={{ fontSize: 13 }}>本月无交易记录</TSerifItalic>
        )}
      </View>

      {trades.length > 0 && <MonthlyMentor month={month} trades={trades} profile={profile} defaultMaster={defaultMaster} />}

      <View style={{ paddingTop: 24 }}>
        <Kicker style={{ marginBottom: 12 }}>REVIEW BULLETS · 复盘要点</Kicker>
        {draft.map((b, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
            <TSerifBold style={{ color: colors.accent, fontSize: 20, marginTop: 6, width: 12 }}>•</TSerifBold>
            <PaperInput
              multiline
              value={b}
              onChangeText={(v) => { const next = [...draft]; next[i] = v; setDraft(next); }}
              placeholder={["最成功的一笔决策？", "最想重来的一笔？", "这个月学到了什么？", "下月要改什么？", "其他观察…"][i]}
              style={{ flex: 1, minHeight: 60, fontSize: 15 }}
            />
          </View>
        ))}
        {draft.length < 5 && (
          <Pressable onPress={() => setDraft([...draft, ""])}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Plus size={11} color={colors.inkMuted} />
            <TMono style={{ fontSize: 11 }}>ADD BULLET ({draft.length}/5)</TMono>
          </Pressable>
        )}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
          <FilledButton onPress={() => onSave(draft.filter((b) => b.trim()))} style={{ flex: 1 }}>
            {hasReview ? "更新月评" : "归档月评"}
          </FilledButton>

          {draft.some((b) => b.trim()) && (
            <Pressable
              onPress={() => onAskMentor(draft)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 5,
                paddingHorizontal: 14, paddingVertical: 10,
                borderWidth: 1, borderColor: colors.divider,
              }}
            >
              <Users size={12} color={colors.inkMuted} />
              <TMono style={{ fontSize: 11, color: colors.inkMuted }}>导师</TMono>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function MonthlyMentor({ month, trades, profile, defaultMaster }) {
  const [active, setActive] = useState(defaultMaster);
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const loaded = {};
      for (const m of ["default", "lynch", "buffett", "munger", "dalio", "marks", "graham"]) {
        const text = await db.getMonthlyMentor(month, m);
        // Skip entries that look truncated (ends abruptly without sentence-ending punctuation)
        if (text && /[。！？.!?"]$/.test(text.trimEnd())) loaded[m] = text;
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
      setError(e.message === "NO_API_KEY" ? "请先在设置中配置 API key" : "生成失败");
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
        <Kicker>MONTHLY VIEW · 导师月度点评</Kicker>
      </View>
      <TSerifItalic style={{ fontSize: 12, marginBottom: 12 }}>
        从不同视角，回看这个月的全部交易。
      </TSerifItalic>

      <MasterChips active={active} onSelect={request} />

      <View style={{ marginTop: 12, padding: 12, minHeight: 60, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.dividerSoft }}>
        {isLoading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={colors.inkFaint} />
            <TSerifItalic style={{ fontSize: 12 }}>{getMaster(active).zh}正在复盘本月…</TSerifItalic>
          </View>
        ) : current ? (
          <View>
            <TSerif style={{ fontSize: 13, lineHeight: 22 }}>{current}</TSerif>
            <Pressable
              onPress={() => { setCache((prev) => { const next = { ...prev }; delete next[active]; return next; }); request(active); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, alignSelf: "flex-end" }}
            >
              <RefreshCw size={10} color={colors.inkFaint} />
              <TMono style={{ fontSize: 10, color: colors.inkFaint }}>重新生成</TMono>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => request(active)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Sparkles size={12} color={colors.accent} />
            <TSerifBold style={{ fontSize: 13 }}>请 {getMaster(active).zh} 点评本月</TSerifBold>
          </Pressable>
        )}
        {error && <TMono style={{ color: colors.bad, fontSize: 11, marginTop: 8 }}>{error}</TMono>}
      </View>
    </View>
  );
}
