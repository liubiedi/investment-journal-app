// Home screen — philosophy, rules, default mentor, stats
import React, { useState, useEffect } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MessageCircle, ChevronRight, Sparkles, X, Edit2, Plus, Trash2, Settings as SettingsIcon } from "lucide-react-native";

import { useApp } from "../context";
import { colors, fonts } from "../theme";
import { monthKey, isLastWeekOfMonth, fmtDate } from "../utils";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  Section, Stat, PaperInput, FilledButton, OutlineButton, MasterChips,
  Masthead,
} from "../components";

export default function HomeScreen() {
  const app = useApp();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const current = monthKey(new Date().toISOString());
  const currentMonthTrades = app.trades.filter((t) => monthKey(t.date) === current);
  const hasCurrentReview = !!app.monthlyReviews[current];
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const showReviewBanner = isLastWeekOfMonth() && currentMonthTrades.length > 0 && !hasCurrentReview && !reviewDismissed;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead
        kicker={`VOL. ${new Date().getFullYear()}`}
        title={"The Investor's\nLedger"}
        subtitle="私人投资日志 · Personal Journal"
        right={
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <Pressable onPress={() => nav.navigate("settings")} hitSlop={12}>
              <SettingsIcon size={18} color={colors.inkFaint} />
            </Pressable>
            <Kicker style={{ fontSize: 9, letterSpacing: 3 }}>{fmtDate(new Date().toISOString())}</Kicker>
          </View>
        }
      />

      {!app.apiKeyPresent && (
        <View style={{ marginHorizontal: 20, marginTop: 16, padding: 14, backgroundColor: colors.ink }}>
          <Kicker color={colors.accent}>API KEY 未配置</Kicker>
          <TSerif style={{ color: colors.bg, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
            AI 导师功能需要 DeepSeek API key。点击右上角齿轮图标配置。
          </TSerif>
          <Pressable onPress={() => nav.navigate("settings")}
            style={{ marginTop: 10, paddingVertical: 8, backgroundColor: colors.accent, alignItems: "center" }}>
            <TSerifBold style={{ color: colors.ink, fontSize: 13 }}>前往设置</TSerifBold>
          </Pressable>
        </View>
      )}

      {showReviewBanner && (
        <View style={{ marginHorizontal: 20, marginTop: 20, padding: 14, backgroundColor: colors.ink }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Sparkles size={12} color={colors.accent} />
                <Kicker color={colors.accent} style={{ fontSize: 9, letterSpacing: 2.5 }}>月末将至</Kicker>
              </View>
              <TSerif style={{ color: colors.bg, fontSize: 18 }}>该写月评了</TSerif>
              <TMono style={{ color: colors.bg, opacity: 0.7, fontSize: 12, marginTop: 4 }}>
                本月已有 {currentMonthTrades.length} 笔交易待复盘
              </TMono>
            </View>
            <Pressable onPress={() => setReviewDismissed(true)} hitSlop={10}>
              <X size={14} color={colors.bg} />
            </Pressable>
          </View>
          <Pressable onPress={() => nav.navigate("monthly")}
            style={{
              marginTop: 12, paddingVertical: 10,
              backgroundColor: colors.accent,
              alignItems: "center",
              flexDirection: "row", justifyContent: "center", gap: 6,
            }}>
            <TSerifBold style={{ color: colors.ink, fontSize: 13 }}>开始写月评</TSerifBold>
            <ChevronRight size={14} color={colors.ink} />
          </Pressable>
        </View>
      )}

      {/* Mentor shortcut */}
      <View style={{ marginHorizontal: 20, marginTop: 20 }}>
        <Pressable onPress={() => nav.navigate("mentor")}
          style={({ pressed }) => ({
            backgroundColor: colors.bgElev, borderWidth: 1, borderColor: colors.divider,
            padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
            opacity: pressed ? 0.85 : 1,
          })}>
          <View style={{ width: 40, height: 40, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
            <MessageCircle size={16} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <TSerifBold style={{ fontSize: 15 }}>与投资导师对话</TSerifBold>
            <TMono style={{ fontSize: 11, marginTop: 2 }}>一位熟知你全部日志的 AI mentor</TMono>
          </View>
          <ChevronRight size={16} color={colors.inkFaint} />
        </Pressable>
      </View>

      <Section label="My Investment Philosophy" sub="每年只改一次" pin>
        <PhilosophyEditor value={app.philosophy} onSave={app.savePhilosophy} />
      </Section>

      <Section label="My Rules" sub="最多 5 条">
        <RulesEditor rules={app.rules} onSave={app.saveRules} />
      </Section>

      <Section label="Default Mentor" sub="默认点评视角">
        <TSerifItalic style={{ fontSize: 12, marginBottom: 12 }}>
          新条目需要点评时，默认请哪一位？
        </TSerifItalic>
        <MasterChips active={app.defaultMaster} onSelect={app.saveDefaultMaster} />
      </Section>

      <Section label="At a Glance" sub="数据一览">
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Stat value={app.holdings.length} label="持仓" />
          <Stat value={app.trades.length} label="交易" />
          <Stat value={app.thoughts.length} label="心念" />
          <Stat value={Object.keys(app.weeklyNotes).length} label="周记" />
          <Stat value={Object.keys(app.monthlyReviews).length} label="月评" />
        </View>
      </Section>
    </ScrollView>
    </SafeAreaView>
  );
}

function PhilosophyEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);

  if (!editing) {
    return (
      <Pressable onPress={() => setEditing(true)}>
        {value ? (
          <View style={{ paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: colors.accent }}>
            <TSerifItalic style={{ fontSize: 17, color: colors.ink, lineHeight: 26 }}>"{value}"</TSerifItalic>
          </View>
        ) : (
          <TSerifItalic style={{ fontSize: 15 }}>点击此处写下你的投资信条（一句话）…</TSerifItalic>
        )}
      </Pressable>
    );
  }

  return (
    <View>
      <PaperInput
        multiline autoFocus
        value={draft} onChangeText={setDraft}
        placeholder="例：以合理价格购买优秀企业，并长期持有。"
        style={{ fontStyle: "italic", fontSize: 17, minHeight: 80 }}
      />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <OutlineButton onPress={() => { setDraft(value); setEditing(false); }}>取消</OutlineButton>
        <FilledButton onPress={() => { onSave(draft); setEditing(false); }} style={{ flex: 1 }}>
          保存信条
        </FilledButton>
      </View>
    </View>
  );
}

function RulesEditor({ rules, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rules);
  useEffect(() => { setDraft(rules); }, [rules]);

  if (!editing) {
    return (
      <View>
        {rules.map((r, i) => (
          <View key={i} style={{
            flexDirection: "row", alignItems: "flex-start",
            paddingVertical: 10, gap: 12,
            borderBottomWidth: i < rules.length - 1 ? 1 : 0,
            borderBottomColor: colors.dividerSoft,
          }}>
            <TMono style={{ color: colors.accent, minWidth: 22, fontSize: 12 }}>0{i + 1}</TMono>
            <TSerif style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{r}</TSerif>
          </View>
        ))}
        <Pressable onPress={() => setEditing(true)} style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Edit2 size={11} color={colors.inkMuted} />
          <TMono style={{ fontSize: 11 }}>EDIT RULES</TMono>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {draft.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <TMono style={{ color: colors.accent, minWidth: 22, fontSize: 12 }}>0{i + 1}</TMono>
          <PaperInput
            value={r}
            onChangeText={(v) => { const next = [...draft]; next[i] = v; setDraft(next); }}
            style={{ flex: 1, fontSize: 15 }}
          />
          <Pressable onPress={() => setDraft(draft.filter((_, idx) => idx !== i))} hitSlop={10}>
            <X size={14} color={colors.inkFaint} />
          </Pressable>
        </View>
      ))}
      {draft.length < 5 && (
        <Pressable onPress={() => setDraft([...draft, ""])}
          style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Plus size={11} color={colors.inkMuted} />
          <TMono style={{ fontSize: 11 }}>ADD RULE ({draft.length}/5)</TMono>
        </Pressable>
      )}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        <OutlineButton onPress={() => { setDraft(rules); setEditing(false); }}>取消</OutlineButton>
        <FilledButton onPress={() => { onSave(draft.filter((r) => r.trim())); setEditing(false); }} style={{ flex: 1 }}>
          保存规则
        </FilledButton>
      </View>
    </View>
  );
}
