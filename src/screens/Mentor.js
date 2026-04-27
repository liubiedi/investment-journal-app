// Mentor screen â€” chat with AI mentor. Auto-refreshes prices on mount if stale.
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MessageCircle, Send, RotateCcw, Loader2, AlertCircle, Mic, MicOff,
} from "lucide-react-native";

import { colors, fonts } from "../theme";
import { useApp } from "../context";
import { ago } from "../utils";
import { chatMessage, fetchLivePrices } from "../api";
import { useSpeech } from "../voice";
import * as db from "../db";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker, PaperInput,
} from "../components";

const PRICE_STALE_MS = 15 * 60 * 1000;

export default function MentorScreen() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const scrollRef = useRef(null);
  const { listening, supported, start, stop } = useSpeech(setInput);

  // Load chat history on mount
  useEffect(() => {
    (async () => {
      const h = await db.listChat();
      setHistory(h);
    })();
  }, []);

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
        setSyncError("è¡Œæƒ…åŒæ­¥å¤±è´¥");
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
      setSyncError("è¡Œæƒ…åŒæ­¥å¤±è´¥");
    } finally {
      setSyncing(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput(""); setError("");
    const userMsg = { role: "user", content: text };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    await db.appendChat("user", text);
    setSending(true);
    try {
      const reply = await chatMessage(history, text, app.profile, "default");
      const updated = [...newHistory, { role: "assistant", content: reply }];
      setHistory(updated);
      await db.appendChat("assistant", reply);
    } catch (e) {
      setError(e.message === "NO_API_KEY" ? "è¯·å…ˆåœ¨è®¾ç½®ä¸­é…ç½® API key" : "å¯¼å¸ˆæš‚æ—¶å¤±è”ï¼Œè¯·ç¨åŽå†è¯•");
    } finally {
      setSending(false);
    }
  };

  const reset = async () => {
    if (history.length === 0) return;
    await db.clearChat();
    setHistory([]);
  };

  const priceFreshness = useMemo(() => ago(app.prices?.lastUpdated), [app.prices]);
  const ctxSummary = `${app.trades.length} äº¤æ˜“ Â· ${app.holdings.length} æŒä»“ Â· ${Object.keys(app.weeklyNotes).length} å‘¨è®° Â· ${Object.keys(app.monthlyReviews).length} æœˆè¯„`;

  const hasHoldings = app.holdings.length > 0;

  const STARTERS = [
    "å¸®æˆ‘çœ‹çœ‹æœ€è¿‘å‡ ç¬”äº¤æ˜“æœ‰ä»€ä¹ˆè§„å¾‹ï¼Ÿ",
    "æˆ‘ç„¦è™‘çš„æ—¶å€™åšçš„å†³å®šï¼Œç»“æžœé€šå¸¸æ€Žæ ·ï¼Ÿ",
    "æˆ‘çš„å“ªæ¡è§„åˆ™æœ€å®¹æ˜“è¢«æˆ‘è‡ªå·±è¿åï¼Ÿ",
    "ä¸‹ä¸ªæœˆæˆ‘åº”è¯¥é‡ç‚¹å…³æ³¨ä»€ä¹ˆï¼Ÿ",
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: 20, paddingTop: 24, paddingBottom: 14,
        borderBottomWidth: 1, borderBottomColor: colors.divider,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <Kicker>AI MENTOR</Kicker>
          {history.length > 0 && (
            <Pressable onPress={reset} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <RotateCcw size={10} color={colors.inkFaint} />
              <TMono style={{ fontSize: 10 }}>RESET</TMono>
            </Pressable>
          )}
        </View>
        <TSerifBold style={{ fontSize: 26, letterSpacing: -0.5 }}>æŠ•èµ„å¯¼å¸ˆ</TSerifBold>
        <TMono style={{ fontSize: 10, marginTop: 4, color: colors.inkMuted }}>å·²åŒæ­¥ Â· {ctxSummary}</TMono>

        {hasHoldings && (
          <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
            {syncing ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Loader2 size={10} color={colors.accent} />
                <TMono style={{ fontSize: 10, color: colors.accent }}>æ­£åœ¨åŒæ­¥å®žæ—¶è¡Œæƒ…â€¦</TMono>
              </View>
            ) : priceFreshness ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.good }} />
                <TMono style={{ fontSize: 10, color: colors.inkMuted }}>è¡Œæƒ… {priceFreshness}</TMono>
                <Pressable onPress={manualSync}>
                  <TMono style={{ fontSize: 10, color: colors.inkMuted, textDecorationLine: "underline" }}>åˆ·æ–°</TMono>
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AlertCircle size={10} color={colors.warn} />
                <TMono style={{ fontSize: 10, color: colors.warn }}>å°šæ— å®žæ—¶è¡Œæƒ…</TMono>
                <Pressable onPress={manualSync}>
                  <TMono style={{ fontSize: 10, color: colors.inkMuted, textDecorationLine: "underline" }}>åŒæ­¥</TMono>
                </Pressable>
              </View>
            )}
            {syncError ? <TMono style={{ fontSize: 10, color: colors.bad }}>{syncError}</TMono> : null}
          </View>
        )}
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={64}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
        >
          {history.length === 0 && (
            <View>
              <TSerifItalic style={{ fontSize: 15, color: colors.inkMuted, lineHeight: 24, marginBottom: 24 }}>
                "æˆ‘è¯»è¿‡ä½ çš„æ¯ä¸€é¡µæ—¥å¿—ã€‚ä½ çš„å“²å­¦ã€è§„åˆ™ã€å¿ƒå¿µã€æ¯ä¸€ç¬”çš„çº ç»“ä¸Žç¬ƒå®š â€”â€” éƒ½åœ¨æˆ‘è¿™é‡Œã€‚"
              </TSerifItalic>
              <Kicker style={{ marginBottom: 12 }}>STARTERS Â· å»ºè®®æé—®</Kicker>
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

          {history.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}

          {sending && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
              <ActivityIndicator size="small" color={colors.inkFaint} />
              <TSerifItalic style={{ fontSize: 13 }}>å¯¼å¸ˆæ­£åœ¨æ€è€ƒâ€¦</TSerifItalic>
            </View>
          )}

          {error ? <TMono style={{ color: colors.bad, fontSize: 11, paddingVertical: 6 }}>{error}</TMono> : null}
        </ScrollView>

        {/* Input row */}
        <View style={{
          paddingHorizontal: 12, paddingTop: 10,
          paddingBottom: Math.max(10, insets.bottom - 20),
          borderTopWidth: 1, borderTopColor: colors.divider,
          backgroundColor: colors.bg,
          flexDirection: "row", alignItems: "flex-end", gap: 8,
        }}>
          {supported && (
            <Pressable
              onPress={() => listening ? stop() : start(input)}
              style={{
                width: 42, height: 42,
                alignItems: "center", justifyContent: "center",
                backgroundColor: listening ? colors.bad : "transparent",
                borderWidth: listening ? 0 : 1, borderColor: colors.divider,
              }}
            >
              {listening ? <MicOff size={15} color={colors.bg} /> : <Mic size={15} color={colors.inkMuted} />}
            </Pressable>
          )}
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="é—®å¯¼å¸ˆä¸€ä¸ªé—®é¢˜â€¦"
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
      </KeyboardAvoidingView>
    </View>
  );
}

function MessageBubble({ role, content }) {
  if (role === "user") {
    return (
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 14 }}>
        <View style={{
          maxWidth: "85%", padding: 12,
          backgroundColor: colors.ink,
        }}>
          <TSerif style={{ color: colors.bg, fontSize: 14, lineHeight: 22 }}>{content}</TSerif>
        </View>
      </View>
    );
  }
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <View style={{ width: 18, height: 18, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
          <MessageCircle size={10} color={colors.accent} />
        </View>
        <Kicker>MENTOR</Kicker>
      </View>
      <TSerif style={{ fontSize: 15, lineHeight: 24 }}>{content}</TSerif>
    </View>
  );
}
