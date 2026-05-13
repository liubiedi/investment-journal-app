// Research Home — review queue and new memo entry point.
import React, { useState, useCallback, useEffect } from "react";
import {
  View, ScrollView, Pressable, Text, Modal, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ChevronRight, Clock } from "lucide-react-native";

import { useApp } from "../context";
import { colors, fonts, spacing } from "../theme";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  Masthead, Section, FilledButton, HR,
  StockSearchInput, PaperInput,
  StatusBadge, ConfidencePill,
} from "../components";
import {
  fetchResearchSnapshot, generateResearchMemo, checkResearchRules, buildResearchSources,
  assembleResearchContext, preWarmYFCrumb,
} from "../api";
import { memoryManager } from "../memory/MemoryManager";
import { newId } from "../db";
import { todayIso, addMonths } from "../utils";

export default function ResearchScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { researchMemos, holdings, prices, rules, profile, saveResearchMemo, apiKeyPresent } = useApp();

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
        <Masthead kicker="个股研究" title="Research Queue" />

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

function MemoComposer({ visible, onClose, onCreated, prefillTicker, prefillHoldingId, holdings, prices, rules, profile, saveResearchMemo, apiKeyPresent }) {
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

      // Fetch YF snapshot and assemble investor memory in parallel — they're independent.
      const [snapshot, preAssembledCtx] = await Promise.all([
        fetchResearchSnapshot(sym).catch(() => null),
        assembleResearchContext({ ticker: sym, thesis, profile }),
      ]);

      // Generate memo via DeepSeek Pro
      const memoData = await generateResearchMemo({
        ticker: sym,
        currentPrice,
        snapshot,
        userThesis: thesis,
        manualNotes,
        holdingContext: holdingCtx,
        profile,
        rules,
        preAssembledCtx,
      });

      // Run rules check (flash model)
      const ruleChecks = await checkResearchRules(memoData, rules).catch(() => []);

      // Build DB objects
      const memoId = newId("rmemo");
      const versionId = newId("rv");
      const today = todayIso();

      const reviewDate = memoData.trading_strategy?.review_date
        || addMonths(today, 3);

      const memo = {
        id: memoId,
        ticker: sym,
        companyName: companyName || null,
        currentVersionId: versionId,
        status: memoData.status,
        confidence: memoData.confidence,
        createdAt: today,
        lastReviewedAt: today,
        nextReviewDate: reviewDate,
        holdingId: holdingCtx?.id || null,
      };

      const version = {
        id: versionId,
        memoId,
        versionNum: 1,
        thesis: memoData.thesis_summary,
        businessSnapshot: memoData.business_snapshot,
        valuation: memoData.valuation,
        positionSizing: memoData.position_sizing,
        tradingStrategy: memoData.trading_strategy,
        disclaimerFlags: {
          ...memoData.disclaimer_flags,
          snapshot_fetched_at: snapshot?.fetchedAt,
        },
        sources: buildResearchSources(memoData, snapshot),
        modelId: "deepseek-v4-pro",
        generatedAt: new Date().toISOString(),
        createdAt: today,
      };

      const dbRuleChecks = ruleChecks.map(rc => ({
        id: newId("rrc"),
        versionId,
        ruleText: rc.rule_text || "",
        result: rc.result || "n/a",
        notes: rc.notes || "",
        overrideReason: null,
      }));

      await saveResearchMemo(memo, version, dbRuleChecks);

      // Record insight in semantic_memory for mentor context
      memoryManager.recordInsight({
        type: "research_memo",
        scope: sym,
        content: `${memoData.status?.toUpperCase()}: ${memoData.thesis_summary || ""}. Invalidated if: ${memoData.position_sizing?.invalidation_condition || "(not set)"}`,
        structured: {
          status: memoData.status,
          confidence: memoData.confidence,
          max_risk_summary: memoData.max_risk_summary,
          next_review_date: reviewDate,
          version_id: versionId,
          key_assumptions: memoData.valuation?.assumptions || [],
          rules_pass: ruleChecks.every(r => r.result !== "fail"),
        },
        modelId: "deepseek-v4-pro",
      }).catch(() => {});

      onCreated(memo);
    } catch (e) {
      setError(e.message || "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [ticker, thesis, manualNotes, apiKeyPresent, prices, holdings, prefillHoldingId, profile, rules, saveResearchMemo, companyName, onCreated]);

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
              <TSerifItalic style={{ fontSize: 13 }}>正在获取数据并生成研究备忘录…</TSerifItalic>
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

