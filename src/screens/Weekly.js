// Weekly notes screen with voice input
import React, { useState, useEffect } from "react";
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { weekKey, weekRange } from "../utils";
import { colors, fonts } from "../theme";
import { useApp } from "../context";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  PaperInput, FilledButton, Masthead,
} from "../components";

export default function WeeklyScreen() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const currentWeek = weekKey(new Date().toISOString());
  const [activeWeek, setActiveWeek] = useState(currentWeek);
  const [draft, setDraft] = useState(app.weeklyNotes[currentWeek] || "");

  useEffect(() => { setDraft(app.weeklyNotes[activeWeek] || ""); }, [activeWeek, app.weeklyNotes]);

  const sortedWeeks = Object.keys(app.weeklyNotes).sort().reverse();
  const unchanged = draft === (app.weeklyNotes[activeWeek] || "");

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

        <FilledButton
          onPress={() => app.saveWeekly(activeWeek, draft)}
          disabled={unchanged}
          style={{ marginTop: 12 }}
        >
          {app.weeklyNotes[activeWeek] ? "更新本周记录" : "写入本周"}
        </FilledButton>
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
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
