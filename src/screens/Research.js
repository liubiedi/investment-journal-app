// Research Home — review queue and new memo entry point.
import React, { useState, useCallback, useEffect } from "react";
import {
  View, ScrollView, Pressable, Text, Modal, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ChevronRight, Clock, Bell, TrendingUp, TrendingDown } from "lucide-react-native";

import { useApp } from "../context";
import { colors, fonts, spacing } from "../theme";
import * as db from "../db";
import { saveSignalOutcome, getSignalOutcome, updateSignalOutcome, newId } from "../db";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  Masthead, Section, FilledButton, HR,
  StockSearchInput, PaperInput,
  StatusBadge, ConfidencePill,
} from "../components";
import { preWarmYFCrumb } from "../api";
import { todayIso } from "../utils";
import { startResearchGeneration, buildPlaceholder } from "../research/pipeline";

export default function ResearchScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { researchMemos, holdings, prices, rules, profile, saveResearchMemo, refreshResearchMemoById, apiKeyPresent, activeSignals, dismissSignals } = useApp();

  const [composerVisible, setComposerVisible] = useState(false);
  const [prefillTicker, setPrefillTicker] = useState(null);
  const [prefillHoldingId, setPrefillHoldingId] = useState(null);

  // Auto-open composer when navigated from Holdings or Log with prefill params
  useEffect(() => {
    const { prefillTicker: pt, prefillHoldingId: phid } = route.params || {};
    if (pt) {
      setPrefillTicker(pt);
      setPrefillHoldingId(phid || null);
      setComposerVisible(true);
    }
  }, [route.params?.prefillTicker, route.params?.prefillHoldingId]);

  const today = todayIso();
  const overdue = researchMemos.filter(m => m.next_review_date && m.next_review_date <= today);
  const active = researchMemos.filter(m => !m.next_review_date || m.next_review_date > today);

  const handleSignalAct = useCallback(async (signal, entryPrice) => {
    // Record acted outcome
    const existing = await db.getSignalOutcome(signal.id);
    if (existing) {
      await db.updateSignalOutcome(existing.id, {
        actionTaken: "acted",
        entryPrice,
        entryDate: todayIso(),
      });
    } else {
      await saveSignalOutcome({
        id: newId("sout"),
        signalEventId: signal.id,
        ticker: signal.ticker,
        direction: signal.direction,
        actionTaken: "acted",
        entryPrice,
        entryDate: todayIso(),
      });
    }
    dismissSignals([signal.id]);
  }, [dismissSignals]);

  const handleSignalSkip = useCallback(async (signal, skipReason) => {
    const existing = await db.getSignalOutcome(signal.id);
    if (existing) {
      await db.updateSignalOutcome(existing.id, { actionTaken: "skipped", skipReason });
    } else {
      await saveSignalOutcome({
        id: newId("sout"),
        signalEventId: signal.id,
        ticker: signal.ticker,
        direction: signal.direction,
        actionTaken: "skipped",
        skipReason: skipReason ?? null,
      });
    }
    dismissSignals([signal.id]);
  }, [dismissSignals]);

  const openComposer = useCallback((ticker = null, holdingId = null) => {
    setPrefillTicker(ticker);
    setPrefillHoldingId(holdingId);
    setComposerVisible(true);
  }, []);

  const handleMemoCreated = useCallback((memo) => {
    setComposerVisible(false);
    nav.navigate("researchMemo", { memoId: memo.id });
  }, [nav]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Masthead kicker="个股研究" title="Research Queue" />
          </View>
          <Pressable
            onPress={() => nav.navigate("signalAnalytics")}
            style={{ paddingBottom: 12, paddingLeft: 8 }}
            hitSlop={10}
          >
            <TMono style={{ fontSize: 11, color: colors.inkFaint }}>复盘 →</TMono>
          </Pressable>
        </View>

        {activeSignals && activeSignals.length > 0 && (
          <SignalCenterBanner
            signals={activeSignals}
            researchMemos={researchMemos}
            onAct={handleSignalAct}
            onSkip={handleSignalSkip}
            onDismissAll={() => dismissSignals(activeSignals.map(s => s.id))}
            onOpenMemo={(memoId) => {
              dismissSignals(activeSignals.filter(s => s.memo_id === memoId).map(s => s.id));
              nav.navigate("researchMemo", { memoId });
            }}
          />
        )}

        {researchMemos.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {overdue.length > 0 && (
              <Section label="需要复盘  Review Due">
                {overdue.map(m => (
                  <ResearchMemoCard key={m.id} memo={m} overdue onPress={() => nav.navigate("researchMemo", { memoId: m.id })} />
                ))}
              </Section>
            )}
            <Section label="进行中  Active">
              {active.map(m => (
                <ResearchMemoCard key={m.id} memo={m} onPress={() => nav.navigate("researchMemo", { memoId: m.id })} />
              ))}
              {active.length === 0 && (
                <TSerifItalic style={{ fontSize: 13, paddingVertical: 8 }}>全部已到期。</TSerifItalic>
              )}
            </Section>
          </>
        )}
      </ScrollView>

      <MemoComposer
        visible={composerVisible}
        onClose={() => setComposerVisible(false)}
        onCreated={handleMemoCreated}
        prefillTicker={prefillTicker}
        prefillHoldingId={prefillHoldingId}
        holdings={holdings}
        prices={prices}
        rules={rules}
        profile={profile}
        saveResearchMemo={saveResearchMemo}
        refreshResearchMemoById={refreshResearchMemoById}
        apiKeyPresent={apiKeyPresent}
      />
    </SafeAreaView>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function ResearchMemoCard({ memo, overdue, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? "#ede8db" : "#f0ebe0",
        borderRadius: 8,
        padding: 14,
        marginBottom: 10,
        borderLeftWidth: overdue ? 3 : 0,
        borderLeftColor: overdue ? "#a03434" : "transparent",
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <TMono style={{ fontSize: 13, color: colors.ink, fontFamily: fonts.monoMed }}>
              {memo.ticker?.toUpperCase()}
            </TMono>
            {memo.company_name ? (
              <TSerifItalic style={{ fontSize: 12 }}>{memo.company_name}</TSerifItalic>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {memo.status && <StatusBadge status={memo.status} />}
            {memo.confidence && <ConfidencePill level={memo.confidence} />}
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {overdue ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Clock size={10} color="#a03434" />
              <TMono style={{ fontSize: 9, color: "#a03434" }}>到期</TMono>
            </View>
          ) : null}
          {memo.next_review_date ? (
            <TMono style={{ fontSize: 9 }}>复盘 {memo.next_review_date}</TMono>
          ) : null}
          <ChevronRight size={14} color={colors.inkFaint} />
        </View>
      </View>
    </Pressable>
  );
}

// ── Signal Center banner ──────────────────────────────────────────────────────

function SignalCenterBanner({ signals, researchMemos, onAct, onSkip, onDismissAll, onOpenMemo }) {
  const [activeSheet, setActiveSheet] = useState(null); // signal being actioned
  const [priceInput, setPriceInput] = useState("");
  const [skipReason, setSkipReason] = useState(null);
  const [sheetMode, setSheetMode] = useState(""); // "act" | "skip"

  const openActSheet = (signal) => {
    const memo = researchMemos.find(m => m.id === signal.memo_id);
    const price = signal.fired_price?.toFixed(2) ?? "";
    setPriceInput(price);
    setSheetMode("act");
    setActiveSheet(signal);
  };
  const openSkipSheet = (signal) => {
    setSkipReason(null);
    setSheetMode("skip");
    setActiveSheet(signal);
  };

  return (
    <View style={{ backgroundColor: "#1a1611", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Bell size={13} color="#f5c842" />
          <TMono style={{ fontSize: 10, color: "#f5c842", letterSpacing: 1 }}>信号中心 SIGNAL CENTER</TMono>
        </View>
        <Pressable onPress={onDismissAll} hitSlop={8}>
          <TMono style={{ fontSize: 9, color: "#8b7d6a" }}>全部忽略</TMono>
        </Pressable>
      </View>
      {signals.map((signal) => (
        <View key={signal.id} style={{ borderTopWidth: 1, borderTopColor: "#2d2820", padding: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {signal.direction === "buy"
                ? <TrendingUp size={13} color="#5cba7a" />
                : <TrendingDown size={13} color="#e07055" />}
              <TMono style={{ fontSize: 12, color: "#f0ebe0", fontFamily: fonts.monoMed }}>{signal.ticker}</TMono>
              <View style={{
                backgroundColor: signal.direction === "buy" ? "#1a3d28" : "#3d1a1a",
                borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
              }}>
                <TMono style={{ fontSize: 9, color: signal.direction === "buy" ? "#5cba7a" : "#e07055" }}>
                  {signal.direction === "buy" ? "买入条件满足" : "减仓条件满足"}
                </TMono>
              </View>
            </View>
            <Pressable onPress={() => onOpenMemo(signal.memo_id)} hitSlop={8}>
              <TMono style={{ fontSize: 9, color: "#8b7d6a" }}>查看备忘录 →</TMono>
            </Pressable>
          </View>
          {signal.fired_price ? (
            <TMono style={{ fontSize: 11, color: "#c8b89a", marginBottom: 8 }}>
              触发价 ${signal.trigger_price?.toFixed(2) ?? "?"} | 当前 ${signal.fired_price.toFixed(2)}
            </TMono>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => openActSheet(signal)}
              style={{ flex: 1, backgroundColor: "#5cba7a22", borderWidth: 1, borderColor: "#5cba7a55", borderRadius: 6, padding: 7, alignItems: "center" }}
            >
              <TMono style={{ fontSize: 10, color: "#5cba7a" }}>
                {signal.direction === "buy" ? "已买入 →" : "已减仓 →"}
              </TMono>
            </Pressable>
            <Pressable
              onPress={() => openSkipSheet(signal)}
              style={{ flex: 1, backgroundColor: "#2d2820", borderWidth: 1, borderColor: "#3d3628", borderRadius: 6, padding: 7, alignItems: "center" }}
            >
              <TMono style={{ fontSize: 10, color: "#8b7d6a" }}>跳过 ↓</TMono>
            </Pressable>
          </View>
        </View>
      ))}

      {/* Act confirmation sheet */}
      <Modal visible={sheetMode === "act" && !!activeSheet} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: "#00000060" }} onPress={() => setActiveSheet(null)}>
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#f5f1e8", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, gap: 14 }}>
            <TSerifBold style={{ fontSize: 16 }}>记录{activeSheet?.direction === "buy" ? "买入" : "减仓"}</TSerifBold>
            <View>
              <TMono style={{ fontSize: 11, color: colors.inkFaint, marginBottom: 4 }}>成交价格</TMono>
              <PaperInput
                value={priceInput}
                onChangeText={setPriceInput}
                keyboardType="numeric"
                placeholder="输入实际成交价"
              />
            </View>
            <FilledButton
              label="确认记录"
              onPress={() => {
                onAct(activeSheet, parseFloat(priceInput) || activeSheet?.fired_price);
                setActiveSheet(null);
              }}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Skip reason sheet */}
      <Modal visible={sheetMode === "skip" && !!activeSheet} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: "#00000060" }} onPress={() => setActiveSheet(null)}>
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#f5f1e8", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, gap: 12 }}>
            <TSerifBold style={{ fontSize: 16 }}>跳过原因（可选）</TSerifBold>
            {["等待更好的买入价格", "论文有不确定性", "资金暂时不足", "其他"].map(reason => (
              <Pressable
                key={reason}
                onPress={() => setSkipReason(reason === skipReason ? null : reason)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8,
                  backgroundColor: skipReason === reason ? "#ede8db" : "transparent" }}
              >
                <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5,
                  borderColor: skipReason === reason ? colors.ink : colors.inkFaint,
                  backgroundColor: skipReason === reason ? colors.ink : "transparent" }} />
                <TSerif style={{ fontSize: 14 }}>{reason}</TSerif>
              </Pressable>
            ))}
            <FilledButton
              label="确认跳过"
              onPress={() => {
                onSkip(activeSheet, skipReason);
                setActiveSheet(null);
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
      <TSerifItalic style={{ fontSize: 15, textAlign: "center", maxWidth: 280, lineHeight: 22 }}>
        暂无研究备忘录。
      </TSerifItalic>
      <TSerifItalic style={{ fontSize: 13, textAlign: "center", maxWidth: 280, lineHeight: 20, color: colors.inkMuted }}>
        在「持仓」或「记录」中点击「深度研究」开始。
      </TSerifItalic>
    </View>
  );
}

// ── Composer modal ────────────────────────────────────────────────────────────

function MemoComposer({ visible, onClose, onCreated, prefillTicker, prefillHoldingId, holdings, prices, rules, profile, saveResearchMemo, refreshResearchMemoById, apiKeyPresent }) {
  const [ticker, setTicker] = useState(prefillTicker || "");
  const [companyName, setCompanyName] = useState("");
  const [thesis, setThesis] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Reset when modal opens; pre-warm the YF crumb so it's ready before Generate is pressed.
  React.useEffect(() => {
    if (visible) {
      setTicker(prefillTicker || "");
      setCompanyName("");
      setThesis("");
      setManualNotes("");
      setShowNotes(false);
      setError(null);
      setGenerating(false);
      preWarmYFCrumb();
    }
  }, [visible, prefillTicker]);

  const handleGenerate = useCallback(async () => {
    if (!ticker.trim()) { setError("Please select a ticker."); return; }
    if (!apiKeyPresent) { setError("API key required. Set it in Settings."); return; }
    setError(null);
    setGenerating(true);
    try {
      const sym = ticker.trim().toUpperCase();
      const currentPrice = prices?.data?.[sym]?.price ?? null;
      const holdingCtx = prefillHoldingId
        ? holdings.find(h => h.id === prefillHoldingId)
        : holdings.find(h => h.symbol.toUpperCase() === sym);

      // Build placeholder + persist it so we have a memoId to navigate to.
      const memoId = newId("rmemo");
      const versionId = newId("rv");
      const { memo, version } = buildPlaceholder({
        memoId, versionId, ticker: sym,
        companyName: companyName || null,
        holdingId: holdingCtx?.id || null,
      });
      await saveResearchMemo(memo, version, []);

      // Navigate immediately — the memo screen will show skeletons + subscribe
      // to progress events as the pipeline fills in fields.
      onCreated(memo);

      // Fire-and-forget the pipeline. It writes partial fields to the DB and
      // emits progress events; the open memo screen re-fetches on each event.
      startResearchGeneration({
        memoId,
        versionId,
        ticker: sym,
        currentPrice,
        userThesis: thesis,
        manualNotes,
        holdingContext: holdingCtx,
        profile,
        rules,
        onMemoComplete: () => {
          // Refresh queue state so the Research home list shows the final status.
          refreshResearchMemoById?.(memoId);
        },
      }).catch((e) => {
        // Pipeline-level failure (e.g. network down before any call started).
        // Stage-level failures are already surfaced via progress events.
        console.warn("Research pipeline failed:", e?.message);
      });
    } catch (e) {
      setError(e.message || "Generation failed. Please try again.");
      setGenerating(false);
    }
  }, [ticker, thesis, manualNotes, apiKeyPresent, prices, holdings, prefillHoldingId, profile, rules, saveResearchMemo, refreshResearchMemoById, companyName, onCreated]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose} />
      <View style={{
        backgroundColor: colors.bg,
        paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40,
        borderTopWidth: 1, borderTopColor: colors.divider,
        maxHeight: "88%",
      }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <TSerifBold style={{ fontSize: 20 }}>研究这个想法</TSerifBold>
            <Pressable onPress={onClose}>
              <TMono style={{ fontSize: 13, color: colors.inkMuted }}>取消</TMono>
            </Pressable>
          </View>

          <View style={{ marginBottom: 16 }}>
            <TMono style={{ fontSize: 10, letterSpacing: 1, color: colors.inkFaint, marginBottom: 6 }}>
              标的代码 · TICKER
            </TMono>
            <StockSearchInput
              value={ticker}
              onChangeText={setTicker}
              onSelect={(sym, name) => {
                setTicker(sym);
                setCompanyName(name || "");
              }}
              placeholder="搜索代码或公司名称 · AAPL / 腾讯 / 0700.HK"
            />
          </View>

          <PaperInput
            label="投资逻辑  Thesis"
            hint="为什么关注？需要什么条件才值得买？"
            value={thesis}
            onChangeText={setThesis}
            multiline
            numberOfLines={3}
            style={{ marginBottom: 12 }}
          />

          <Pressable
            onPress={() => setShowNotes(p => !p)}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: showNotes ? 10 : 20 }}
          >
            <TMono style={{ fontSize: 11, color: colors.inkMuted }}>
              {showNotes ? "− 隐藏补充信息" : "+ 添加补充信息"}
            </TMono>
          </Pressable>

          {showNotes && (
            <PaperInput
              label="补充信息  Manual Notes"
              hint="公开数据之外的数字、背景或判断"
              value={manualNotes}
              onChangeText={setManualNotes}
              multiline
              numberOfLines={3}
              style={{ marginBottom: 20 }}
            />
          )}

          {error ? (
            <View style={{ backgroundColor: "#f8d7da", borderRadius: 6, padding: 10, marginBottom: 12 }}>
              <TMono style={{ fontSize: 11, color: "#a03434" }}>{error}</TMono>
            </View>
          ) : null}

          {generating ? (
            <View style={{ alignItems: "center", paddingVertical: 20, gap: 10 }}>
              <ActivityIndicator color={colors.inkFaint} />
              <TSerifItalic style={{ fontSize: 13 }}>打开备忘录…</TSerifItalic>
            </View>
          ) : (
            <FilledButton
              label="生成研究备忘录"
              onPress={handleGenerate}
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

