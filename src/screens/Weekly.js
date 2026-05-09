// Weekly notes screen with voice input
import React, { useState, useEffect } from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Users } from "lucide-react-native";
import { weekKey, weekRange } from "../utils";
import { colors } from "../theme";
import { useApp } from "../context";
import {
  TSerif, TSerifBold, TMono, Kicker,
  PaperInput, FilledButton, Masthead, MasterPickerModal,
} from "../components";
import * as db from "../db";

export default function WeeklyScreen() {
  const app = useApp();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const currentWeek = weekKey(new Date().toISOString());
  const [activeWeek, setActiveWeek] = useState(currentWeek);
  const [draft, setDraft] = useState(app.weeklyNotes[currentWeek] || "");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingText, setPendingText] = useState({ text: "", week: "" });

  useEffect(() => { setDraft(app.weeklyNotes[activeWeek] || ""); }, [activeWeek, app.weeklyNotes]);

  const sortedWeeks = Object.keys(app.weeklyNotes).sort().reverse();
  const unchanged = draft === (app.weeklyNotes[activeWeek] || "");

  const doAskMentor = async (text, week, masterId) => {
    const lines = [
      `本周记录（${week}）：`,
      text,
      "",
      "请帮我从这周的思考出发，给我一些投资上的洞见和建议。",
    ];
    await db.appendChat("user", lines.join("\n"), masterId);
    nav.navigate("mentor", { autoMaster: masterId, autoReplyTs: Date.now() });
  };

  const startAskMentor = (text, week) => {
    setPendingText({ text, week });
    setPickerVisible(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead kicker="WEEKLY" title="周记" subtitle="一周一行，只写最重要的一件事" />

      <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
        <View style={{ marginBottom: 10 }}>
          <Kicker color={colors.accent}>THIS WEEK · 本周</Kicker>
          <TSerifBold style={{ fontSize: 17, marginTop: 2 }}>{activeWeek}</TSerifBold>
          <TMono style={{ fontSize: 11, marginTop: 2 }}>{weekRange(activeWeek)}</TMono>
        </View>

        <PaperInput
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder="这周市场让我看到了什么？我做了什么？一句话总结。"
          style={{ minHeight: 110, fontSize: 15 }}
        />

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <FilledButton
            onPress={() => app.saveWeekly(activeWeek, draft)}
            disabled={unchanged}
            style={{ flex: 1 }}
          >
            {app.weeklyNotes[activeWeek] ? "更新本周记录" : "写入本周"}
          </FilledButton>

          {!!draft.trim() && (
            <Pressable
              onPress={() => startAskMentor(draft, activeWeek)}
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

      {sortedWeeks.length > 0 && (
        <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
          <Kicker style={{ marginBottom: 12 }}>ARCHIVE · 过往</Kicker>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.divider }}>
            {sortedWeeks.map((wk) => (
              <Pressable key={wk} onPress={() => setActiveWeek(wk)}
                style={{
                  paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.dividerSoft,
                }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <TMono style={{ fontSize: 10, minWidth: 70 }}>{wk}</TMono>
                  <TSerif style={{ flex: 1, fontSize: 14, lineHeight: 22 }}>
                    {app.weeklyNotes[wk] || ""}
                  </TSerif>
                  {!!app.weeklyNotes[wk] && (
                    <Pressable
                      onPress={() => startAskMentor(app.weeklyNotes[wk], wk)}
                      hitSlop={10}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 8 }}
                    >
                      <Users size={10} color={colors.inkFaint} />
                      <TMono style={{ fontSize: 9, color: colors.inkFaint }}>导师</TMono>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>

    <MasterPickerModal
      visible={pickerVisible}
      onClose={() => setPickerVisible(false)}
      subtitle="以哪位大师的视角解读本周思考？"
      onSelect={async (masterId) => {
        setPickerVisible(false);
        const { text, week } = pendingText;
        await doAskMentor(text, week, masterId);
      }}
    />
    </KeyboardAvoidingView>
  );
}
