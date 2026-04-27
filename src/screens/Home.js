// Home screen â€” philosophy, rules, default mentor, stats
import React, { useState, useEffect } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MessageCircle, ChevronRight, Sparkles, X, Edit2, Plus, Trash2 } from "lucide-react-native";

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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead
        kicker={`VOL. ${new Date().getFullYear()}`}
        title={"The Investor's\nLedger"}
        subtitle="ç§äººæŠ•èµ„æ—¥å¿— Â· Personal Journal"
        right={<Kicker style={{ fontSize: 9, letterSpacing: 3 }}>{fmtDate(new Date().toISOString())}</Kicker>}
      />

      {!app.apiKeyPresent && (
        <View style={{ marginHorizontal: 20, marginTop: 16, padding: 14, backgroundColor: colors.ink }}>
          <Kicker color={colors.accent}>API KEY æœªé…ç½®</Kicker>
          <TSerif style={{ color: colors.bg, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
            AI å¯¼å¸ˆåŠŸèƒ½éœ€è¦ Anthropic API keyã€‚å‰å¾€"è®¾ç½®"tab é…ç½®ã€‚
          </TSerif>
          <Pressable onPress={() => nav.navigate("settings")}
            style={{ marginTop: 10, paddingVertical: 8, backgroundColor: colors.accent, alignItems: "center" }}>
            <TSerifBold style={{ color: colors.ink, fontSize: 13 }}>å‰å¾€è®¾ç½®</TSerifBold>
          </Pressable>
        </View>
      )}

      {showReviewBanner && (
        <View style={{ marginHorizontal: 20, marginTop: 20, padding: 14, backgroundColor: colors.ink }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Sparkles size={12} color={colors.accent} />
                <Kicker color={colors.accent} style={{ fontSize: 9, letterSpacing: 2.5 }}>æœˆæœ«å°†è‡³</Kicker>
              </View>
              <TSerif style={{ color: colors.bg, fontSize: 18 }}>è¯¥å†™æœˆè¯„äº†</TSerif>
              <TMono style={{ color: colors.bg, opacity: 0.7, fontSize: 12, marginTop: 4 }}>
                æœ¬æœˆå·²æœ‰ {currentMonthTrades.length} ç¬”äº¤æ˜“å¾…å¤ç›˜
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
            <TSerifBold style={{ color: colors.ink, fontSize: 13 }}>å¼€å§‹å†™æœˆè¯„</TSerifBold>
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
            <TSerifBold style={{ fontSize: 15 }}>ä¸ŽæŠ•èµ„å¯¼å¸ˆå¯¹è¯</TSerifBold>
            <TMono style={{ fontSize: 11, marginTop: 2 }}>ä¸€ä½ç†ŸçŸ¥ä½ å…¨éƒ¨æ—¥å¿—çš„ AI mentor</TMono>
          </View>
          <ChevronRight size={16} color={colors.inkFaint} />
        </Pressable>
      </View>

      <Section label="My Investment Philosophy" sub="æ¯å¹´åªæ”¹ä¸€æ¬¡" pin>
        <PhilosophyEditor value={app.philosophy} onSave={app.savePhilosophy} />
      </Section>

      <Section label="My Rules" sub="æœ€å¤š 5 æ¡">
        <RulesEditor rules={app.rules} onSave={app.saveRules} />
      </Section>

      <Section label="Default Mentor" sub="é»˜è®¤ç‚¹è¯„è§†è§’">
        <TSerifItalic style={{ fontSize: 12, marginBottom: 12 }}>
          æ–°æ¡ç›®éœ€è¦ç‚¹è¯„æ—¶ï¼Œé»˜è®¤è¯·å“ªä¸€ä½ï¼Ÿ
        </TSerifItalic>
        <MasterChips active={app.defaultMaster} onSelect={app.saveDefaultMaster} />
      </Section>

      <Section label="At a Glance" sub="æ•°æ®ä¸€è§ˆ">
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Stat value={app.holdings.length} label="æŒä»“" />
          <Stat value={app.trades.length} label="äº¤æ˜“" />
          <Stat value={app.thoughts.length} label="å¿ƒå¿µ" />
          <Stat value={Object.keys(app.weeklyNotes).length} label="å‘¨è®°" />
          <Stat value={Object.keys(app.monthlyReviews).length} label="æœˆè¯„" />
        </View>
      </Section>
    </ScrollView>
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
          <TSerifItalic style={{ fontSize: 15 }}>ç‚¹å‡»æ­¤å¤„å†™ä¸‹ä½ çš„æŠ•èµ„ä¿¡æ¡ï¼ˆä¸€å¥è¯ï¼‰â€¦</TSerifItalic>
        )}
      </Pressable>
    );
  }

  return (
    <View>
      <PaperInput
        multiline autoFocus
        value={draft} onChangeText={setDraft}
        placeholder="ä¾‹ï¼šä»¥åˆç†ä»·æ ¼è´­ä¹°ä¼˜ç§€ä¼ä¸šï¼Œå¹¶é•¿æœŸæŒæœ‰ã€‚"
        style={{ fontStyle: "italic", fontSize: 17, minHeight: 80 }}
      />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <OutlineButton onPress={() => { setDraft(value); setEditing(false); }}>å–æ¶ˆ</OutlineButton>
        <FilledButton onPress={() => { onSave(draft); setEditing(false); }} style={{ flex: 1 }}>
          ä¿å­˜ä¿¡æ¡
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
        <OutlineButton onPress={() => { setDraft(rules); setEditing(false); }}>å–æ¶ˆ</OutlineButton>
        <FilledButton onPress={() => { onSave(draft.filter((r) => r.trim())); setEditing(false); }} style={{ flex: 1 }}>
          ä¿å­˜è§„åˆ™
        </FilledButton>
      </View>
    </View>
  );
}
