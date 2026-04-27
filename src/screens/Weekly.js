// Weekly notes screen with voice input
import React, { useState, useEffect } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { weekKey, weekRange } from "../utils";
import { colors, fonts } from "../theme";
import { useApp } from "../context";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  PaperInput, FilledButton, Masthead, VoiceMic,
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead kicker="WEEKLY" title="å‘¨è®°" subtitle="ä¸€å‘¨ä¸€è¡Œï¼Œåªå†™æœ€é‡è¦çš„ä¸€ä»¶äº‹" />

      <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <View>
            <Kicker color={colors.accent}>THIS WEEK Â· æœ¬å‘¨</Kicker>
            <TSerifBold style={{ fontSize: 17, marginTop: 2 }}>{activeWeek}</TSerifBold>
            <TMono style={{ fontSize: 11, marginTop: 2 }}>{weekRange(activeWeek)}</TMono>
          </View>
          <VoiceMic currentText={draft} onChange={setDraft} />
        </View>

        <PaperInput
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder="è¿™å‘¨å¸‚åœºè®©æˆ‘çœ‹åˆ°äº†ä»€ä¹ˆï¼Ÿæˆ‘åšäº†ä»€ä¹ˆï¼Ÿä¸€å¥è¯æ€»ç»“ã€‚ï¼ˆä¹Ÿå¯ç‚¹å³ä¸Šè§’è¯­éŸ³è¾“å…¥ï¼‰"
          style={{ minHeight: 110, fontSize: 15 }}
        />

        <FilledButton
          onPress={() => app.saveWeekly(activeWeek, draft)}
          disabled={unchanged}
          style={{ marginTop: 12 }}
        >
          {app.weeklyNotes[activeWeek] ? "æ›´æ–°æœ¬å‘¨è®°å½•" : "å†™å…¥æœ¬å‘¨"}
        </FilledButton>
      </View>

      {sortedWeeks.length > 0 && (
        <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
          <Kicker style={{ marginBottom: 12 }}>ARCHIVE Â· è¿‡å¾€</Kicker>
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
  );
}
