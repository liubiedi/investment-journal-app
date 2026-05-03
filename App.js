// App.js — root entry with navigation, font loading, global state
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from "@expo-google-fonts/fraunces";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from "@expo-google-fonts/jetbrains-mono";
import {
  Anchor, FileText, Briefcase, RotateCcw, MessageCircle,
} from "lucide-react-native";

import { AppCtx, useApp } from "./src/context";
import { colors, fonts } from "./src/theme";
import { DEFAULT_RULES } from "./src/constants";
import * as db from "./src/db";
import { getApiKey } from "./src/api";

import HomeScreen from "./src/screens/Home";
import LogScreen from "./src/screens/Log";
import HoldingsScreen from "./src/screens/Holdings";
import ReviewScreen from "./src/screens/Review";
import MentorScreen from "./src/screens/Mentor";
import SettingsScreen from "./src/screens/Settings";

SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  const [bootstrapped, setBootstrapped] = useState(false);

  // Core state, all mirrored to SQLite
  const [philosophy, setPhilosophy] = useState("");
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [defaultMaster, setDefaultMaster] = useState("default");
  const [trades, setTrades] = useState([]);
  const [thoughts, setThoughts] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [weeklyNotes, setWeeklyNotes] = useState({});
  const [monthlyReviews, setMonthlyReviews] = useState({});
  const [prices, setPrices] = useState({ data: {}, lastUpdated: null });
  const [apiKeyPresent, setApiKeyPresent] = useState(false);

  // Bootstrap: load everything from SQLite
  useEffect(() => {
    (async () => {
      try {
        await db.getDb(); // triggers schema init
        const [p, r, dm, tr, th, hd, wn, mr, pc, key] = await Promise.all([
          db.kvGet("philosophy", ""),
          db.kvGet("rules", DEFAULT_RULES),
          db.kvGet("defaultMaster", "default"),
          db.listTrades(),
          db.listThoughts(),
          db.listHoldings(),
          db.listWeeklyNotes(),
          db.listMonthlyReviews(),
          db.getPricesCache(),
          getApiKey(),
        ]);
        setPhilosophy(p); setRules(r); setDefaultMaster(dm);
        setTrades(tr); setThoughts(th); setHoldings(hd);
        setWeeklyNotes(wn); setMonthlyReviews(mr);
        setPrices(pc); setApiKeyPresent(!!key);
      } catch (err) {
        console.warn("Bootstrap error:", err);
      } finally {
        setBootstrapped(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    })();
  }, []);

  // ---- action handlers ----
  const savePhilosophy = useCallback(async (v) => {
    setPhilosophy(v); await db.kvSet("philosophy", v);
  }, []);
  const saveRules = useCallback(async (v) => {
    setRules(v); await db.kvSet("rules", v);
  }, []);
  const saveDefaultMaster = useCallback(async (v) => {
    setDefaultMaster(v); await db.kvSet("defaultMaster", v);
  }, []);
  const saveWeekly = useCallback(async (key, text) => {
    await db.saveWeeklyNote(key, text);
    setWeeklyNotes((prev) => {
      const next = { ...prev };
      if (!text || !text.trim()) delete next[key];
      else next[key] = text;
      return next;
    });
  }, []);
  const saveMonthly = useCallback(async (key, bullets) => {
    await db.saveMonthlyReview(key, bullets);
    setMonthlyReviews((prev) => ({ ...prev, [key]: bullets }));
  }, []);

  // ---- trades ----
  const addTrade = useCallback(async (t) => {
    const created = await db.addTrade(t);
    setTrades((prev) => [created, ...prev]);
    return created;
  }, []);
  const deleteTradeById = useCallback(async (id) => {
    await db.deleteTrade(id);
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const updateTradeById = useCallback(async (id, fields) => {
    await db.updateTrade(id, fields);
    setTrades((prev) => prev.map((t) => t.id === id ? { ...t, ...fields } : t));
  }, []);
  const updateTradeFeedback = useCallback(async (id, feedbackArr) => {
    await db.updateTradeFeedback(id, feedbackArr);
    setTrades((prev) => prev.map((t) => t.id === id ? { ...t, feedback: feedbackArr } : t));
  }, []);

  // ---- thoughts ----
  const addThought = useCallback(async (content, rawInput, emotion) => {
    const created = await db.addThought(content, rawInput, emotion);
    setThoughts((prev) => [created, ...prev]);
    return created;
  }, []);
  const deleteThoughtById = useCallback(async (id) => {
    await db.deleteThought(id);
    setThoughts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const updateThoughtById = useCallback(async (id, content, emotion) => {
    await db.updateThought(id, content, emotion);
    setThoughts((prev) => prev.map((t) => t.id === id ? { ...t, content, ...(emotion !== undefined ? { emotion } : {}) } : t));
  }, []);
  const updateThoughtFeedback = useCallback(async (id, feedbackArr) => {
    await db.updateThoughtFeedback(id, feedbackArr);
    setThoughts((prev) => prev.map((t) => t.id === id ? { ...t, feedback: feedbackArr } : t));
  }, []);

  // ---- holdings ----
  const addHolding = useCallback(async (h) => {
    const created = await db.addHolding(h);
    setHoldings((prev) => [...prev, created]);
    return created;
  }, []);
  const updateHoldingById = useCallback(async (id, updates) => {
    await db.updateHolding(id, updates);
    setHoldings((prev) => prev.map((h) => h.id === id ? { ...h, ...updates } : h));
  }, []);
  const deleteHoldingById = useCallback(async (id) => {
    await db.deleteHolding(id);
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // ---- prices ----
  const savePricesData = useCallback(async (map) => {
    await db.savePrices(map);
    setPrices((prev) => ({
      data: { ...prev.data, ...map },
      lastUpdated: Date.now(),
    }));
  }, []);

  // Reload all state from DB after a backup import
  const reloadAll = useCallback(async () => {
    const [p, r, dm, tr, th, hd, wn, mr, pc] = await Promise.all([
      db.kvGet("philosophy", ""),
      db.kvGet("rules", DEFAULT_RULES),
      db.kvGet("defaultMaster", "default"),
      db.listTrades(),
      db.listThoughts(),
      db.listHoldings(),
      db.listWeeklyNotes(),
      db.listMonthlyReviews(),
      db.getPricesCache(),
    ]);
    setPhilosophy(p); setRules(r); setDefaultMaster(dm);
    setTrades(tr); setThoughts(th); setHoldings(hd);
    setWeeklyNotes(wn); setMonthlyReviews(mr); setPrices(pc);
  }, []);

  const profile = useMemo(() => ({
    philosophy, rules, weeklyNotes, monthlyReviews, trades, thoughts, holdings, prices,
  }), [philosophy, rules, weeklyNotes, monthlyReviews, trades, thoughts, holdings, prices]);

  const ctx = {
    // state
    philosophy, rules, defaultMaster,
    trades, thoughts, holdings,
    weeklyNotes, monthlyReviews, prices,
    apiKeyPresent, setApiKeyPresent,
    profile,
    // handlers
    savePhilosophy, saveRules, saveDefaultMaster,
    saveWeekly, saveMonthly,
    addTrade, deleteTradeById, updateTradeById, updateTradeFeedback,
    addThought, deleteThoughtById, updateThoughtById, updateThoughtFeedback,
    addHolding, updateHoldingById, deleteHoldingById,
    savePricesData,
    reloadAll,
  };

  if (!fontsLoaded || !bootstrapped) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.inkFaint} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppInner ctx={ctx} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppInner({ ctx }) {
  const insets = useSafeAreaInsets();
  return (
    <AppCtx.Provider value={ctx}>
      <StatusBar style="dark" />
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.bg,
              borderTopColor: colors.divider,
              borderTopWidth: 1,
              height: 64 + insets.bottom,
              paddingTop: 6,
              paddingBottom: 8 + insets.bottom,
            },
            tabBarActiveTintColor: colors.ink,
            tabBarInactiveTintColor: colors.inkFaint,
            tabBarLabelStyle: {
              fontSize: 9,
              fontFamily: fonts.mono,
              letterSpacing: 0.5,
              marginTop: 2,
            },
          }}
        >
          <Tab.Screen
            name="home" options={{ tabBarLabel: "心法", tabBarIcon: ({ color }) => <Anchor size={17} color={color} /> }}
          >
            {() => <HomeScreen />}
          </Tab.Screen>
          <Tab.Screen
            name="log" options={{ tabBarLabel: "记录", tabBarIcon: ({ color }) => <FileText size={17} color={color} /> }}
          >
            {() => <LogScreen />}
          </Tab.Screen>
          <Tab.Screen
            name="holdings" options={{ tabBarLabel: "持仓", tabBarIcon: ({ color }) => <Briefcase size={17} color={color} /> }}
          >
            {() => <HoldingsScreen />}
          </Tab.Screen>
          <Tab.Screen
            name="review" options={{ tabBarLabel: "复盘", tabBarIcon: ({ color }) => <RotateCcw size={17} color={color} /> }}
          >
            {() => <ReviewScreen />}
          </Tab.Screen>
          <Tab.Screen
            name="mentor" options={{ tabBarLabel: "问道", tabBarIcon: ({ color }) => <MessageCircle size={17} color={color} /> }}
          >
            {() => <MentorScreen />}
          </Tab.Screen>
          <Tab.Screen
            name="settings"
            options={{ tabBarButton: () => null }}
          >
            {() => <SettingsScreen />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </AppCtx.Provider>
  );
}

const navTheme = {
  dark: false,
  colors: {
    primary: colors.ink,
    background: colors.bg,
    card: colors.bg,
    text: colors.ink,
    border: colors.divider,
    notification: colors.accent,
  },
};

export { useApp };
