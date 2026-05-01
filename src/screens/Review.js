// Review.js — 复盘: weekly notes + monthly deep review merged into one screen
import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TMono } from "../components";
import { colors } from "../theme";
import WeeklyScreen from "./Weekly";
import MonthlyScreen from "./Monthly";

export default function ReviewScreen() {
  const [tab, setTab] = useState("weekly");
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingTop: 12, gap: 4, backgroundColor: colors.bg }}>
        <SubTab label="周记 Weekly" active={tab === "weekly"} onPress={() => setTab("weekly")} />
        <SubTab label="月评 Monthly" active={tab === "monthly"} onPress={() => setTab("monthly")} />
      </View>
      {tab === "weekly" ? <WeeklyScreen /> : <MonthlyScreen />}
    </SafeAreaView>
  );
}

function SubTab({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1, paddingVertical: 8, alignItems: "center",
        backgroundColor: active ? colors.ink : "transparent",
        borderWidth: 1, borderColor: active ? colors.ink : colors.divider,
      }}
    >
      <TMono style={{ fontSize: 11, color: active ? colors.bg : colors.inkMuted, fontWeight: active ? "600" : "400" }}>
        {label}
      </TMono>
    </Pressable>
  );
}
