// Mentor screen — chat with AI mentor. Auto-refreshes prices on mount if stale.
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  View, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput, Modal, Text,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import {
  MessageCircle, Send, RotateCcw, Loader2, AlertCircle, Maximize2, X, Users, Copy,
} from "lucide-react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useRoute } from "@react-navigation/native";

import { colors, fonts } from "../theme";
import { useApp } from "../context";
import { ago } from "../utils";
import { chatMessage, fetchLivePrices } from "../api";
import { getMaster } from "../constants";
import * as db from "../db";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker, MasterChips,
} from "../components";
import RoundtableModal from "./Roundtable";

const PRICE_STALE_MS = 15 * 60 * 1000;

export default function MentorScreen() {
  const app = useApp();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pendingRetry, setPendingRetry] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [activeMaster, setActiveMaster] = useState("default");
  const [roundtableVisible, setRoundtableVisible] = useState(false);
  const scrollRef = useRef(null);

  // Auto-switch to the master used in "带入问道" navigation
  useEffect(() => {
    const m = route.params?.autoMaster;
    if (m) setActiveMaster(m);
  }, [route.params?.autoMaster]);

  // Auto-reply when Holdings pre-loads a user message and navigates here
  useEffect(() => {
    const ts = route.params?.autoReplyTs;
    const m = route.params?.autoMaster || "default";
    if (!ts) return;
    (async () => {
      const h = await db.listChat(m);
      setHistory(h);
      const last = h[h.length - 1];
      if (!last || last.role !== "user") return;
      setSending(true);
      setError(""); setPendingRetry(null);
      try {
        const reply = await chatMessage(h.slice(0, -1), last.content, app.profile, m);
        const updated = [...h, { role: "assistant", content: reply, masterId: m, createdAt: Date.now() }];
        setHistory(updated);
        await db.appendChat("assistant", reply, m);
      } catch (e) {
        setError(e?.message || "请求失败");
        setPendingRetry(last.content);
      } finally {
        setSending(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.autoReplyTs]);

  const reloadChat = useCallback(() => {
    async function run() {
      const h = await db.listChat(activeMaster);
      setHistory(h);
      setPendingRetry(null);
      setError("");
    }
    run();
  }, [activeMaster]);

  // Reload on screen focus (picks up 带入问道 entries from Log screen)
  useFocusEffect(reloadChat);
  // Reload when master changes while screen is already focused
  useEffect(reloadChat, [reloadChat]);

  // Auto price refresh on mount if stale
  useEffect(() => {
    if (app.holdings.length === 0) return;
    const stale = !app.prices?.lastUpdated || Date.now() - app.prices.lastUpdated > PRICE_STALE_MS;
    if (!stale) return;
    (async () => {
      setSyncing(true); setSyncError("");
      try {
        const symbols = [...new Set(app.holdings.map((h) => h.symbol))];
        const map = await fetchLivePrices(symbols);
        await app.savePricesData(map);
      } catch {
        setSyncError("行情同步失败");
      } finally {
        setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [history, sending]);

  const manualSync = async () => {
    if (syncing || app.holdings.length === 0) return;
    setSyncing(true); setSyncError("");
    try {
      const symbols = [...new Set(app.holdings.map((h) => h.symbol))];
      const map = await fetchLivePrices(symbols);
      await app.savePricesData(map);
    } catch {
      setSyncError("行情同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput(""); setError(""); setPendingRetry(null);
    const userMsg = { role: "user", content: text, masterId: activeMaster, createdAt: Date.now() };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    await db.appendChat("user", text, activeMaster);
    setSending(true);
    try {
      const reply = await chatMessage(history, text, app.profile, activeMaster);
      const updated = [...newHistory, { role: "assistant", content: reply, masterId: activeMaster, createdAt: Date.now() }];
      setHistory(updated);
      await db.appendChat("assistant", reply, activeMaster);
    } catch (e) {
      setError(e.message === "NO_API_KEY" ? "请先在设置中配置 API key" : "导师暂时失联，请稍后再试");
      if (e.message !== "NO_API_KEY") setPendingRetry(text);
    } finally {
      setSending(false);
    }
  };

  const retry = async () => {
    if (!pendingRetry || sending) return;
    setError(""); setSending(true);
    // history already has the failed user message as last item;
    // chatMessage expects context = messages BEFORE the new user message
    const contextHistory = history.slice(0, -1);
    try {
      const reply = await chatMessage(contextHistory, pendingRetry, app.profile, activeMaster);
      const updated = [...history, { role: "assistant", content: reply, masterId: activeMaster, createdAt: Date.now() }];
      setHistory(updated);
      await db.appendChat("assistant", reply, activeMaster);
      setPendingRetry(null);
    } catch (e) {
      setError(e.message === "NO_API_KEY" ? "请先在设置中配置 API key" : "导师暂时失联，请稍后再试");
    } finally {
      setSending(false);
    }
  };

  const reset = async () => {
    if (history.length === 0) return;
    await db.clearChat(activeMaster);
    setHistory([]);
    setPendingRetry(null);
    setError("");
  };

  const priceFreshness = useMemo(() => ago(app.prices?.lastUpdated), [app.prices]);
  const ctxSummary = `${app.trades.length} 交易 · ${app.holdings.length} 持仓 · ${Object.keys(app.weeklyNotes).length} 周记 · ${Object.keys(app.monthlyReviews).length} 月评`;

  const hasHoldings = app.holdings.length > 0;

  const STARTERS = [
    "帮我看看最近几笔交易有什么规律？",
    "我焦虑的时候做的决定，结果通常怎样？",
    "我的哪条规则最容易被我自己违反？",
    "下个月我应该重点关注什么？",
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={tabBarHeight}
    >
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 20, paddingTop: 24, paddingBottom: 14,
        borderBottomWidth: 1, borderBottomColor: colors.divider,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <Kicker>AI MENTOR</Kicker>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={() => setRoundtableVisible(true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Users size={10} color={colors.inkFaint} />
              <TMono style={{ fontSize: 10 }}>论道</TMono>
            </Pressable>
            {history.length > 0 && (
              <Pressable onPress={reset} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <RotateCcw size={10} color={colors.inkFaint} />
                <TMono style={{ fontSize: 10 }}>RESET</TMono>
              </Pressable>
            )}
          </View>
        </View>
        <TSerifBold style={{ fontSize: 26, letterSpacing: -0.5 }}>投资导师</TSerifBold>
        <TMono style={{ fontSize: 10, marginTop: 4, color: colors.inkMuted }}>已同步 · {ctxSummary}</TMono>
        <View style={{ marginTop: 10 }}>
          <MasterChips active={activeMaster} onSelect={setActiveMaster} />
        </View>

        {hasHoldings && (
          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
            {syncing ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Loader2 size={10} color={colors.accent} />
                <TMono style={{ fontSize: 10, color: colors.accent }}>正在同步实时行情…</TMono>
              </View>
            ) : priceFreshness ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.good }} />
                <TMono style={{ fontSize: 10, color: colors.inkMuted }}>行情 {priceFreshness}</TMono>
                <Pressable onPress={manualSync}>
                  <TMono style={{ fontSize: 10, color: colors.inkMuted, textDecorationLine: "underline" }}>刷新</TMono>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AlertCircle size={10} color={colors.warn} />
                <TMono style={{ fontSize: 10, color: colors.warn }}>尚无实时行情</TMono>
                <Pressable onPress={manualSync}>
                  <TMono style={{ fontSize: 10, color: colors.inkMuted, textDecorationLine: "underline" }}>同步</TMono>
                </Pressable>
              </View>
            )}
            {syncError ? <TMono style={{ fontSize: 10, color: colors.bad }}>{syncError}</TMono> : null}
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
        >
          {history.length === 0 && (
            <View>
              <TSerifItalic style={{ fontSize: 15, color: colors.inkMuted, lineHeight: 24, marginBottom: 24 }}>
                "我读过你的每一页日志。你的哲学、规则、心念、每一笔的纠结与笃定 —— 都在我这里。"
              </TSerifItalic>
              <Kicker style={{ marginBottom: 12 }}>STARTERS · 建议提问</Kicker>
              {STARTERS.map((s, i) => (
                <Pressable key={i} onPress={() => setInput(s)}
                  style={{
                    padding: 12, marginBottom: 8,
                    borderWidth: 1, borderColor: colors.divider,
                    backgroundColor: colors.bgElev,
                  }}>
                  <TSerif style={{ fontSize: 14 }}>{s}</TSerif>
                </Pressable>
              ))}
            </View>
          )}

          {history.map((m, i) => {
            const prev = history[i - 1];
            const mDate = m.createdAt ? new Date(m.createdAt).toDateString() : null;
            const prevDate = prev?.createdAt ? new Date(prev.createdAt).toDateString() : null;
            const showDateDivider = mDate && mDate !== prevDate;
            return (
              <React.Fragment key={i}>
                {showDateDivider && (
                  <View style={{ alignItems: "center", marginVertical: 12, flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.dividerSoft }} />
                    <TMono style={{ fontSize: 9 }}>
                      {new Date(m.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                    </TMono>
                    <View style={{ flex: 1, height: 1, backgroundColor: colors.dividerSoft }} />
                  </View>
                )}
                <MessageBubble role={m.role} content={m.content} masterId={m.masterId} />
              </React.Fragment>
            );
          })}

          {sending && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
              <ActivityIndicator size="small" color={colors.inkFaint} />
              <TSerifItalic style={{ fontSize: 13 }}>导师正在思考…</TSerifItalic>
            </View>
          )}

          {error ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
              <TMono style={{ color: colors.bad, fontSize: 11, flex: 1 }}>{error}</TMono>
              {pendingRetry && (
                <Pressable onPress={retry} disabled={sending}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <RotateCcw size={11} color={colors.ink} />
                  <TMono style={{ fontSize: 11 }}>重新发送</TMono>
                </Pressable>
              )}
            </View>
          ) : null}
        </ScrollView>

        {/* Input row */}
        <View style={{
          paddingHorizontal: 12, paddingTop: 10,
          paddingBottom: Math.max(10, insets.bottom),
          borderTopWidth: 1, borderTopColor: colors.divider,
          backgroundColor: colors.bg,
          flexDirection: "row", alignItems: "flex-end", gap: 8,
        }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="问导师一个问题…"
            placeholderTextColor={colors.inkFaint}
            multiline
            style={{
              flex: 1,
              fontFamily: fonts.serif, color: colors.ink, fontSize: 15,
              paddingHorizontal: 12, paddingVertical: 10,
              borderWidth: 1, borderColor: colors.divider,
              maxHeight: 100,
              textAlignVertical: "top",
              minHeight: 42,
            }}
          />
          <Pressable onPress={send} disabled={!input.trim() || sending}
            style={{
              width: 42, height: 42,
              alignItems: "center", justifyContent: "center",
              backgroundColor: colors.ink,
              opacity: (!input.trim() || sending) ? 0.3 : 1,
            }}>
            {sending ? <Loader2 size={15} color={colors.bg} /> : <Send size={15} color={colors.bg} />}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
      <RoundtableModal visible={roundtableVisible} onClose={() => setRoundtableVisible(false)} />
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ role, content, masterId }) {
  const [copied, setCopied] = useState(false);
  const [showFullText, setShowFullText] = useState(false);

  const handleCopy = async () => {
    try {
      const Clipboard = require("expo-clipboard");
      await Clipboard.setStringAsync(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* silently ignore */ }
  };

  if (role === "user") {
    return (
      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end", gap: 6, marginBottom: 14 }}>
        {copied
          ? <TMono style={{ color: colors.accent, fontSize: 9 }}>已复制 ✓</TMono>
          : <Pressable onPress={handleCopy} hitSlop={8}><Copy size={12} color={colors.inkFaint} /></Pressable>}
        <View style={{ maxWidth: "85%", padding: 12, backgroundColor: colors.ink }}>
          <TSerif selectable style={{ color: colors.bg, fontSize: 14, lineHeight: 22 }}>{content}</TSerif>
        </View>
      </View>
    );
  }

  const master = getMaster(masterId || "default");
  const isLongReply = content.length > 1200;
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <View style={{ width: 18, height: 18, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
          <MessageCircle size={10} color={colors.accent} />
        </View>
        <Kicker style={{ flex: 1 }}>{master.zh} · {master.name}</Kicker>
        <Pressable onPress={handleCopy} hitSlop={8}>
          {copied
            ? <TMono style={{ fontSize: 9, color: colors.accent }}>已复制 ✓</TMono>
            : <Copy size={12} color={colors.inkFaint} />}
        </Pressable>
      </View>
      <TSerif selectable style={{ fontSize: 15, lineHeight: 24 }} numberOfLines={isLongReply ? 14 : undefined}>{content}</TSerif>
      {isLongReply && (
        <Pressable
          onPress={() => setShowFullText(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}
        >
          <Maximize2 size={10} color={colors.inkMuted} />
          <TMono style={{ fontSize: 10, color: colors.inkMuted }}>FULL TEXT</TMono>
        </Pressable>
      )}
      <FullMessageModal
        visible={showFullText}
        content={content}
        masterName={master.name}
        onClose={() => setShowFullText(false)}
      />
    </View>
  );
}

function FullMessageModal({ visible, content, masterName, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 20, paddingVertical: 14,
          borderBottomWidth: 1, borderBottomColor: colors.divider,
        }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Kicker>MENTOR REPLY</Kicker>
            <Text style={{ fontFamily: fonts.serifBold, fontSize: 18, color: colors.ink, marginTop: 2 }}>
              {masterName}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
          <Text selectable style={{ fontFamily: fonts.serif, fontSize: 16, lineHeight: 28, color: colors.ink }}>
            {content}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
