// App.js — root entry with navigation, font loading, global state
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, ActivityIndicator, Modal, TouchableOpacity, Pressable, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

export const navigationRef = createNavigationContainerRef();
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
const EmptyScreen = () => null;

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
  const [moreOpen, setMoreOpen] = useState(false);

  const navigateTo = useCallback((screen) => {
    setMoreOpen(false);
    setTimeout(() => {
      if (navigationRef.isReady()) navigationRef.navigate(screen);
    }, 150);
  }, []);

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

  const tabScreenOptions = {
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
  };

  return (
    <SafeAreaProvider>
      <AppCtx.Provider value={ctx}>
        <StatusBar style="dark" />
        <NavigationContainer ref={navigationRef} theme={navTheme}>
          <Tab.Navigator screenOptions={tabScreenOptions}>
            <Tab.Screen
              name="home" options={{ tabBarLabel: "主页", tabBarIcon: ({ color }) => <Compass size={20} color={color} /> }}
            >
              {() => <HomeScreen />}
            </Tab.Screen>
            <Tab.Screen
              name="weekly" options={{ tabBarLabel: "周记", tabBarIcon: ({ color }) => <BookOpen size={20} color={color} /> }}
            >
              {() => <WeeklyScreen />}
            </Tab.Screen>
            <Tab.Screen
              name="monthly" options={{ tabBarLabel: "月评", tabBarIcon: ({ color }) => <Sparkles size={20} color={color} /> }}
            >
              {() => <MonthlyScreen />}
            </Tab.Screen>
            <Tab.Screen
              name="log" options={{ tabBarLabel: "记录", tabBarIcon: ({ color }) => <FileText size={20} color={color} /> }}
            >
              {() => <LogScreen />}
            </Tab.Screen>

            {/* Hidden tabs — accessible via navigationRef.navigate() */}
            <Tab.Screen
              name="holdings"
              options={{ tabBarButton: () => null }}
            >
              {() => <HoldingsScreen />}
            </Tab.Screen>
            <Tab.Screen
              name="mentor"
              options={{ tabBarButton: () => null }}
            >
              {() => <MentorScreen />}
            </Tab.Screen>
            <Tab.Screen
              name="settings"
              options={{ tabBarButton: () => null }}
            >
              {() => <SettingsScreen />}
            </Tab.Screen>

            {/* More tab — intercepts press to open drawer */}
            <Tab.Screen
              name="more"
              component={EmptyScreen}
              options={{
                tabBarLabel: "更多",
                tabBarIcon: ({ color }) => (
                  <View style={{ flexDirection: "row", gap: 3, alignItems: "center" }}>
                    {[0,1,2].map(i => (
                      <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
                    ))}
                  </View>
                ),
              }}
              listeners={{
                tabPress: (e) => {
                  e.preventDefault();
                  setMoreOpen(true);
                },
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>

        {/* More drawer */}
        <Modal
          transparent
          visible={moreOpen}
          animationType="slide"
          onRequestClose={() => setMoreOpen(false)}
        >
          <Pressable style={drawerStyles.overlay} onPress={() => setMoreOpen(false)}>
            <Pressable style={drawerStyles.sheet} onPress={() => {}}>
              <View style={drawerStyles.handle} />
              <Text style={drawerStyles.title}>更多</Text>
              <View style={drawerStyles.grid}>
                <TouchableOpacity style={drawerStyles.item} onPress={() => navigateTo("holdings")}>
                  <View style={drawerStyles.iconWrap}><Briefcase size={22} color={colors.inkSoft} /></View>
                  <Text style={drawerStyles.label}>持仓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={drawerStyles.item} onPress={() => navigateTo("mentor")}>
                  <View style={drawerStyles.iconWrap}><MessageCircle size={22} color={colors.inkSoft} /></View>
                  <Text style={drawerStyles.label}>导师</Text>
                </TouchableOpacity>
                <TouchableOpacity style={drawerStyles.item} onPress={() => navigateTo("settings")}>
                  <View style={drawerStyles.iconWrap}><SettingsIcon size={22} color={colors.inkSoft} /></View>
                  <Text style={drawerStyles.label}>设置</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </AppCtx.Provider>
    </SafeAreaProvider>
  );
}

const drawerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.inkFaint,
    textTransform: "uppercase",
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  item: {
    alignItems: "center",
    gap: 8,
    minWidth: 72,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkSoft,
    letterSpacing: 0.5,
  },
});

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
