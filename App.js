// App.js — root entry with navigation, font loading, global state
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AppState, View, Text, ActivityIndicator, ScrollView } from "react-native";
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
import { getApiKey, callFlash } from "./src/api";
import { initHotCache, updateHotCache, setDNA, getDNA, getHotCache } from "./src/memory/HotCache";
import { memoryManager } from "./src/memory/MemoryManager";
import { dreamJob } from "./src/memory/background/DreamJob";

import HomeScreen from "./src/screens/Home";
import LogScreen from "./src/screens/Log";
import HoldingsScreen from "./src/screens/Holdings";
import ReviewScreen from "./src/screens/Review";
import MentorScreen from "./src/screens/Mentor";
import SettingsScreen from "./src/screens/Settings";

// Prevent splash from auto-hiding — must be called as early as possible.
// Wrapped in try/catch because in some edge cases (e.g. module loaded before
// the native bridge is fully ready under New Architecture) the call can throw
// synchronously before the returned Promise is even constructed.
try {
  SplashScreen.preventAutoHideAsync().catch(() => {});
} catch {}

const Tab = createBottomTabNavigator();

// ─── Root error boundary ──────────────────────────────────────────────────────
// Wraps the ENTIRE application tree including the loading state.
// This is the outermost boundary — it catches errors thrown by AppContent's
// own hooks (useFonts, useState, useEffect), which the inner AppErrorBoundary
// cannot catch because it lives *inside* those hooks as a child.
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[RootErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#f5f1e8", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#1a1611", marginBottom: 8 }}>
            启动错误
          </Text>
          <Text style={{ fontSize: 13, color: "#6b5a3f", textAlign: "center", marginBottom: 16, lineHeight: 20 }}>
            {String(this.state.error?.message || this.state.error)}
          </Text>
          <ScrollView style={{ maxHeight: 200, width: "100%" }}>
            <Text style={{ fontSize: 10, color: "#8b6f47", fontFamily: "monospace" }}>
              {this.state.error?.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Inner error boundary ─────────────────────────────────────────────────────
// Second-level boundary for the fully-mounted navigation tree.
// Catches rendering errors thrown by individual screens after bootstrap.
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[AppErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#f5f1e8", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#1a1611", marginBottom: 8 }}>
            页面错误
          </Text>
          <Text style={{ fontSize: 13, color: "#6b5a3f", textAlign: "center", marginBottom: 16, lineHeight: 20 }}>
            {String(this.state.error?.message || this.state.error)}
          </Text>
          <ScrollView style={{ maxHeight: 200, width: "100%" }}>
            <Text style={{ fontSize: 10, color: "#8b6f47", fontFamily: "monospace" }}>
              {this.state.error?.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

// Runs DNA distillation + dream consolidation when enough data is available.
// Module-level so it doesn't cause re-renders and can be called from AppState listener.
async function _runMemoryJobs(trades, weeklyNotes, monthlyReviews, apiKey) {
  if (!apiKey || !trades || trades.length < 5) return;

  // DNA distillation — only if expired
  await memoryManager.triggerDNA({
    trades,
    weeklyNotes,
    monthlyReviews,
    callFlash,
  });

  // Dream job — only if enough new entries accumulated
  const shouldDream = await dreamJob.shouldRun();
  if (shouldDream) {
    const { philosophy, rules } = getHotCache();
    await dreamJob.run({
      philosophy,
      rules,
      trades,
      weeklyNotes,
      monthlyReviews,
      callFlash,
    });
  }
}

// ─── AppContent ───────────────────────────────────────────────────────────────
// All hooks and state live here, inside RootErrorBoundary.
// Previously this was App() itself — moving it one level down means
// RootErrorBoundary (its parent) can now catch any hook-level errors.
function AppContent() {
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

  // Bootstrap — split into fast path (renders Home) + lazy path (loads everything else).
  useEffect(() => {
    (async () => {
      try {
        await db.getDb(); // schema init: creates FTS5 tables, triggers, semantic_memory

        // ── Fast path: only kv + API key + cached DNA ──────────────────────
        const [p, r, dm, key, dnaRow] = await Promise.all([
          db.kvGet("philosophy", ""),
          db.kvGet("rules", DEFAULT_RULES),
          db.kvGet("defaultMaster", "default"),
          getApiKey(),
          db.getSemanticMemory("investor_dna"),
        ]);

        setPhilosophy(p); setRules(r); setDefaultMaster(dm);
        setApiKeyPresent(!!key);

        // Populate HotCache for sync reads throughout the session
        initHotCache({ philosophy: p, rules: r, defaultMaster: dm });
        if (dnaRow?.structured_data) {
          try { setDNA(JSON.parse(dnaRow.structured_data)); } catch {}
        }
      } catch (err) {
        console.warn("Bootstrap fast-path error:", err);
      } finally {
        setBootstrapped(true); // Home screen renders here (~100ms)
        try { await SplashScreen.hideAsync(); } catch {}
      }

      // ── Lazy path: load remaining data after UI is visible ────────────────
      try {
        const [tr, th, hd, wn, mr, pc] = await Promise.all([
          db.listTrades(),
          db.listThoughts(),
          db.listHoldings(),
          db.listWeeklyNotes(),
          db.listMonthlyReviews(),
          db.getPricesCache(),
        ]);
        setTrades(tr); setThoughts(th); setHoldings(hd);
        setWeeklyNotes(wn); setMonthlyReviews(mr); setPrices(pc);

        // Backfill FTS5 for pre-existing entries (no-op if already done)
        db.backfillFts().catch(() => {});

        const key = await getApiKey();
        if (key) {
          // Trigger DNA distillation and dream job with loaded data
          _runMemoryJobs(tr, wn, mr, key).catch(() => {});
        }
      } catch (err) {
        console.warn("Bootstrap lazy-path error:", err);
      }
    })();
  }, []);

  // ---- memory jobs (DNA distillation + dream consolidation) ----
  // Stable ref so AppState listener always sees current state without re-registering
  const latestStateRef = useRef({});
  useEffect(() => {
    latestStateRef.current = { trades, weeklyNotes, monthlyReviews, philosophy, rules, apiKeyPresent };
  });

  // Run on foreground resume — silently, non-blocking
  useEffect(() => {
    if (!bootstrapped) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      const s = latestStateRef.current;
      if (!s.apiKeyPresent) return;
      getApiKey().then(key => {
        if (key) _runMemoryJobs(s.trades, s.weeklyNotes, s.monthlyReviews, key).catch(() => {});
      }).catch(() => {});
    });
    return () => sub.remove();
  }, [bootstrapped]);

  // ---- action handlers ----
  const savePhilosophy = useCallback(async (v) => {
    setPhilosophy(v);
    await db.kvSet("philosophy", v);
    updateHotCache("philosophy", v);
  }, []);
  const saveRules = useCallback(async (v) => {
    setRules(v);
    await db.kvSet("rules", v);
    updateHotCache("rules", v);
  }, []);
  const saveDefaultMaster = useCallback(async (v) => {
    setDefaultMaster(v);
    await db.kvSet("defaultMaster", v);
    updateHotCache("defaultMaster", v);
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
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppInner ctx={ctx} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function App() {
  return (
    <RootErrorBoundary>
      <AppContent />
    </RootErrorBoundary>
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
