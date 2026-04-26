// App.js — root entry with navigation, font loading, global state
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
  Compass, BookOpen, Sparkles, FileText, Briefcase, MessageCircle, Settings as SettingsIcon,
} from "lucide-react-native";

import { colors, fonts } from "./src/theme";
import { DEFAULT_RULES } from "./src/constants";
import * as db from "./src/db";
import { getApiKey } from "./src/api";

import HomeScreen from "./src/screens/Home";
import WeeklyScreen from "./src/screens/Weekly";
import MonthlyScreen from "./src/screens/Monthly";
import LogScreen from "./src/screens/Log";
import HoldingsScreen from "./src/screens/Holdings";
import MentorScreen from "./src/screens/Mentor";
import SettingsScreen from "./src/screens/Settings";

SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();

// ---------- App context (simple — pass state down as screen props) ----------
export const AppCtx = React.createContext(null);

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
  const updateTradeFeedback = useCallback(async (id, feedbackArr) => {
    await db.updateTradeFeedback(id, feedbackArr);
    setTrades((prev) => prev.map((t) => t.id === id ? { ...t, feedback: feedbackArr } : t));
  }, []);

  // ---- thoughts ----
  const addThought = useCallback(async (content, rawInput) => {
    const created = await db.addThought(content, rawInput);
    setThoughts((prev) => [created, ...prev]);
    return created;
  }, []);
  const deleteThoughtById = useCallback(async (id) => {
    await db.deleteThought(id);
    setThoughts((prev) => prev.filter((t) => t.id !== id));
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

  const profile = useMemo(() => ({
    philosophy, rules, weeklyNotes, monthlyReviews, trades, holdings, prices,
  }), [philosophy, rules, weeklyNotes, monthlyReviews, trades, holdings, prices]);

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
    addTrade, deleteTradeById, updateTradeFeedback,
    addThought, deleteThoughtById, updateThoughtFeedback,
    addHolding, updateHoldingById, deleteHoldingById,
    savePricesData,
  };

  if (!fontsLoaded || !bootstrapped) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.inkFaint} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
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
                height: 64,
                paddingTop: 6,
                paddingBottom: 8,
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
              name="home" options={{ tabBarLabel: "主页", tabBarIcon: ({ color }) => <Compass size={17} color={color} /> }}
            >
              {() => <HomeScreen />}
            </Tab.Screen>
            <Tab.Screen
              name="weekly" options={{ tabBarLabel: "周记", tabBarIcon: ({ color }) => <BookOpen size={17} color={color} /> }}
            >
              {() => <WeeklyScreen />}
            </Tab.Screen>
            <Tab.Screen
              name="monthly" options={{ tabBarLabel: "月评", tabBarIcon: ({ color }) => <Sparkles size={17} color={color} /> }}
            >
              {() => <MonthlyScreen />}
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
              name="mentor" options={{ tabBarLabel: "导师", tabBarIcon: ({ color }) => <MessageCircle size={17} color={color} /> }}
            >
              {() => <MentorScreen />}
            </Tab.Screen>
            <Tab.Screen
              name="settings" options={{ tabBarLabel: "设置", tabBarIcon: ({ color }) => <SettingsIcon size={17} color={color} /> }}
            >
              {() => <SettingsScreen />}
            </Tab.Screen>
          </Tab.Navigator>
        </NavigationContainer>
      </AppCtx.Provider>
    </SafeAreaProvider>
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

export const useApp = () => {
  const c = React.useContext(AppCtx);
  if (!c) throw new Error("useApp must be inside AppCtx.Provider");
  return c;
};
