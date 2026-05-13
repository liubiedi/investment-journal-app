// ResearchMemo — full memo viewer with versioning, rules check, and attach-to-trade.
import React, { useState, useEffect, useCallback } from "react";
import {
  View, ScrollView, Pressable, Text, Modal, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ChevronDown, ChevronUp, ChevronLeft, History, Trash2, Link } from "lucide-react-native";

import { useApp } from "../context";
import { colors, fonts, spacing } from "../theme";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker, HR,
  FilledButton, OutlineButton,
  StatusBadge, ConfidencePill, SourceCard, DisclaimerBlock,
} from "../components";
import {
  fetchResearchSnapshot, generateResearchMemo, checkResearchRules, buildResearchSources,
} from "../api";
import {
  getResearchVersion, listResearchVersions, listResearchRuleChecks,
  updateRuleCheckOverride, insertResearchVersion, insertResearchRuleChecks,
} from "../db";
import { memoryManager } from "../memory/MemoryManager";
import { newId } from "../db";
import { todayIso, addMonths } from "../utils";

export default function ResearchMemoScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { memoId } = route.params || {};

  const { researchMemos, holdings, prices, rules, profile, saveResearchMemo, deleteResearchMemo, linkResearchMemo, trades, apiKeyPresent } = useApp();

  const memo = researchMemos.find(m => m.id === memoId);
  const [version, setVersion] = useState(null);
  const [ruleChecks, setRuleChecks] = useState([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [allVersions, setAllVersions] = useState([]);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState(null);
  const [attachVisible, setAttachVisible] = useState(false);

  useEffect(() => {
    if (!memo?.current_version_id) return;
    let active = true;
    Promise.all([
      getResearchVersion(memo.current_version_id),
      listResearchRuleChecks(memo.current_version_id),
    ]).then(([v, checks]) => {
      if (!active) return;
      if (v) setVersion(v);
      setRuleChecks(checks);
    });
    return () => { active = false; };
  }, [memo?.current_version_id]);

  const loadHistory = useCallback(() => {
    if (!memoId) return;
    listResearchVersions(memoId).then(setAllVersions);
    setHistoryVisible(true);
  }, [memoId]);

  const handleDelete = useCallback(() => {
    Alert.alert("删除研究备忘录", "This will permanently delete this memo and all its versions.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await deleteResearchMemo(memoId);
          nav.goBack();
        },
      },
    ]);
  }, [memoId, deleteResearchMemo, nav]);

  const handleRegenerate = useCallback(async () => {
    if (!memo || !apiKeyPresent) return;
    setRegenError(null);
    setRegenerating(true);
    try {
      const sym = memo.ticker.toUpperCase();
      const currentPrice = prices?.data?.[sym]?.price ?? null;
      const holdingCtx = memo.holding_id
        ? holdings.find(h => h.id === memo.holding_id)
        : holdings.find(h => h.symbol.toUpperCase() === sym);

      const snapshot = await fetchResearchSnapshot(sym).catch(() => null);
      const memoData = await generateResearchMemo({
        ticker: sym,
        currentPrice,
        snapshot,
        userThesis: version?.thesis || "",
        manualNotes: "",
        holdingContext: holdingCtx,
        profile,
        rules,
      });
      const ruleCheckResults = await checkResearchRules(memoData, rules).catch(() => []);

      const versionId = newId("rv");
      const today = todayIso();
      const reviewDate = memoData.trading_strategy?.review_date || addMonths(today, 3);

      const updatedMemo = {
        ...memo,
        currentVersionId: versionId,
        status: memoData.status,
        confidence: memoData.confidence,
        companyName: memo.company_name,
        lastReviewedAt: today,
        nextReviewDate: reviewDate,
      };

      const newVersion = {
        id: versionId,
        memoId: memo.id,
        versionNum: (allVersions.length || 1) + 1,
        thesis: memoData.thesis_summary,
        businessSnapshot: memoData.business_snapshot,
        valuation: memoData.valuation,
        positionSizing: memoData.position_sizing,
        tradingStrategy: memoData.trading_strategy,
        disclaimerFlags: { ...memoData.disclaimer_flags, snapshot_fetched_at: snapshot?.fetchedAt },
        sources: buildResearchSources(memoData, snapshot),
        modelId: "deepseek-v4-pro",
        generatedAt: new Date().toISOString(),
        createdAt: today,
      };

      const dbRuleChecks = ruleCheckResults.map(rc => ({
        id: newId("rrc"), versionId,
        ruleText: rc.rule_text || "", result: rc.result || "n/a",
        notes: rc.notes || "", overrideReason: null,
      }));

      await saveResearchMemo(updatedMemo, newVersion, dbRuleChecks);
      setVersion(newVersion);
      setRuleChecks(dbRuleChecks);

      memoryManager.recordInsight({
        type: "research_memo",
        scope: sym,
        content: `${memoData.status?.toUpperCase()}: ${memoData.thesis_summary || ""}. Invalidated if: ${memoData.position_sizing?.invalidation_condition || "(not set)"}`,
        structured: {
          status: memoData.status, confidence: memoData.confidence,
          next_review_date: reviewDate, version_id: versionId,
          rules_pass: ruleCheckResults.every(r => r.result !== "fail"),
        },
        modelId: "deepseek-v4-pro",
      }).catch(() => {});
    } catch (e) {
      setRegenError(e.message || "Regeneration failed.");
    } finally {
      setRegenerating(false);
    }
  }, [memo, version, allVersions, apiKeyPresent, prices, holdings, profile, rules, saveResearchMemo]);

  const handleAttachTrade = useCallback(async (tradeId) => {
    await linkResearchMemo(memoId, "trade", tradeId);
    const trade = trades.find(t => t.id === tradeId);
    memoryManager.recordInsight({
      type: "memo_execution",
      scope: memo?.ticker?.toUpperCase(),
      content: `Traded ${trade?.action || "?"} (${trade?.stock || "?"}) while memo said ${memo?.status || "?"}. Rule check: ${ruleChecks.every(r => r.result !== "fail") ? "passed" : "had failures"}.`,
      structured: {
        trade_id: tradeId,
        memo_version_id: memo?.current_version_id,
        alignment: memo?.status === "buy_setup" && ["buy", "buy_option"].includes(trade?.action) ? "aligned" : "review",
      },
      modelId: "system",
    }).catch(() => {});
    setAttachVisible(false);
    Alert.alert("已关联", "Trade linked to this research memo.");
  }, [memoId, memo, ruleChecks, trades, linkResearchMemo]);

  if (!memo) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <TSerifItalic>Memo not found.</TSerifItalic>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Pressable onPress={() => nav.goBack()} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <ChevronLeft size={14} color={colors.inkMuted} />
            <TMono style={{ fontSize: 12, color: colors.inkMuted }}>研究</TMono>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable onPress={loadHistory}>
              <History size={16} color={colors.inkFaint} />
            </Pressable>
            <Pressable onPress={handleDelete}>
              <Trash2 size={16} color={colors.inkFaint} />
            </Pressable>
          </View>
        </View>

        <TMono style={{ fontSize: 22, fontFamily: fonts.monoMed, color: colors.ink, letterSpacing: -0.5, marginBottom: 4 }}>
          {memo.ticker?.toUpperCase()}
        </TMono>
        {memo.company_name ? (
          <TSerifItalic style={{ fontSize: 14, marginBottom: 10 }}>{memo.company_name}</TSerifItalic>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          {memo.status && <StatusBadge status={memo.status} />}
          {memo.confidence && <ConfidencePill level={memo.confidence} />}
          {memo.current_version_id && (
            <TMono style={{ fontSize: 9, color: colors.inkFaint }}>
              v{version?.versionNum || "?"} · {memo.last_reviewed_at || ""}
            </TMono>
          )}
        </View>
        {memo.next_review_date && (
          <TMono style={{ fontSize: 10, color: memo.next_review_date <= todayIso() ? "#a03434" : colors.inkFaint, marginBottom: 16 }}>
            复盘日期 {memo.next_review_date}
            {memo.next_review_date <= todayIso() ? "  ← 已到期" : ""}
          </TMono>
        )}

        <HR />

        {!version ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={colors.inkFaint} />
          </View>
        ) : (
          <>
            <CollapsibleSection title="当前结论  Current Conclusion" defaultOpen>
              <Field label="Thesis">{version.thesis || "(none)"}</Field>
              {version.positionSizing?.invalidation_condition ? (
                <Field label="Invalidated if">
                  <TSerif style={{ fontSize: 13, color: "#a03434" }}>
                    {version.positionSizing.invalidation_condition}
                  </TSerif>
                </Field>
              ) : null}
              {version.disclaimerFlags?.confidence_basis ? (
                <Field label="Confidence basis">{version.disclaimerFlags.confidence_basis}</Field>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="商业概况  Business Snapshot" defaultOpen>
              {version.businessSnapshot?.summary ? (
                <Field label="Summary">{version.businessSnapshot.summary}</Field>
              ) : null}
              {version.businessSnapshot?.revenue_drivers ? (
                <Field label="Revenue Drivers">{version.businessSnapshot.revenue_drivers}</Field>
              ) : null}
              {version.businessSnapshot?.competitive_edge ? (
                <Field label="Competitive Edge">{version.businessSnapshot.competitive_edge}</Field>
              ) : null}
              {version.businessSnapshot?.market_debates ? (
                <Field label="Market Debates">{version.businessSnapshot.market_debates}</Field>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="估值检验  Valuation Check" defaultOpen>
              <ValuationSection valuation={version.valuation} />
            </CollapsibleSection>

            <CollapsibleSection title="仓位管理  Position Sizing" defaultOpen>
              <PositionSection ps={version.positionSizing} />
            </CollapsibleSection>

            <CollapsibleSection title="3–6月计划  Trading Strategy">
              <StrategySection ts={version.tradingStrategy} />
            </CollapsibleSection>

            <CollapsibleSection title="研究清单  Deep Research Checklist">
              <ChecklistSection version={version} />
            </CollapsibleSection>

            <CollapsibleSection title="规则检验  Rules Conflict Check" defaultOpen>
              <RulesSection ruleChecks={ruleChecks} />
            </CollapsibleSection>

            <CollapsibleSection title="信息来源  Sources">
              {(version.sources || []).map((s, i) => (
                <SourceCard key={i} source={s} />
              ))}
              {(!version.sources || version.sources.length === 0) && (
                <TSerifItalic style={{ fontSize: 12 }}>No sources recorded.</TSerifItalic>
              )}
            </CollapsibleSection>

            <DisclaimerBlock flags={version.disclaimerFlags} />
          </>
        )}

        {regenError ? (
          <View style={{ backgroundColor: "#f8d7da", borderRadius: 6, padding: 10, marginTop: 12 }}>
            <TMono style={{ fontSize: 11, color: "#a03434" }}>{regenError}</TMono>
          </View>
        ) : null}
      </ScrollView>

      {/* Action bar */}
      <View style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        backgroundColor: colors.bg,
        borderTopWidth: 1, borderTopColor: colors.divider,
        padding: 16, paddingBottom: 28,
        flexDirection: "row", gap: 10,
      }}>
        {regenerating ? (
          <View style={{ flex: 1, alignItems: "center", paddingVertical: 10 }}>
            <ActivityIndicator color={colors.inkFaint} />
            <TSerifItalic style={{ fontSize: 12, marginTop: 4 }}>Updating memo…</TSerifItalic>
          </View>
        ) : (
          <>
            <View style={{ flex: 2 }}>
              <FilledButton label="更新研究  Update" onPress={handleRegenerate} />
            </View>
            <Pressable
              onPress={() => setAttachVisible(true)}
              style={({ pressed }) => ({
                flex: 1, borderWidth: 1, borderColor: colors.divider,
                borderRadius: 6, alignItems: "center", justifyContent: "center",
                paddingVertical: 12, opacity: pressed ? 0.7 : 1,
                flexDirection: "row", gap: 6,
              })}
            >
              <Link size={13} color={colors.ink} />
              <TMono style={{ fontSize: 11 }}>关联交易</TMono>
            </Pressable>
          </>
        )}
      </View>

      {/* Version history sheet */}
      <VersionHistorySheet
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        versions={allVersions}
        currentVersionId={memo.current_version_id}
        onSelect={(v) => { setVersion(v); setHistoryVisible(false); }}
      />

      {/* Attach to trade sheet */}
      <AttachTradeSheet
        visible={attachVisible}
        onClose={() => setAttachVisible(false)}
        trades={trades}
        ticker={memo.ticker}
        onAttach={handleAttachTrade}
      />
    </SafeAreaView>
  );
}

// ── Section components ────────────────────────────────────────────────────────

function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ marginBottom: 4 }}>
      <Pressable
        onPress={() => setOpen(p => !p)}
        style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingVertical: 12, opacity: pressed ? 0.7 : 1,
        })}
      >
        <Kicker>{title}</Kicker>
        {open ? <ChevronUp size={13} color={colors.inkFaint} /> : <ChevronDown size={13} color={colors.inkFaint} />}
      </Pressable>
      {open && (
        <View style={{ paddingBottom: 12 }}>
          {children}
        </View>
      )}
      <View style={{ height: 1, backgroundColor: colors.dividerSoft }} />
    </View>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <TMono style={{ fontSize: 9, letterSpacing: 0.8, color: colors.inkFaint, marginBottom: 3 }}>
        {label?.toUpperCase()}
      </TMono>
      {typeof children === "string"
        ? <TSerif style={{ fontSize: 13, lineHeight: 20 }}>{children}</TSerif>
        : children}
    </View>
  );
}

function ValuationSection({ valuation }) {
  if (!valuation) return <TSerifItalic style={{ fontSize: 12 }}>No valuation data.</TSerifItalic>;
  const m = valuation.multiples || {};
  const pe = valuation.current_price;
  const fvb = valuation.fair_value_band || {};
  const scenarios = valuation.scenarios || {};

  return (
    <>
      {pe != null && <Field label="Current Price">{`$${pe}`}</Field>}
      <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        {m.trailing_pe != null && <MetricChip label="P/E (TTM)" value={m.trailing_pe?.toFixed(1)} />}
        {m.forward_pe != null && <MetricChip label="P/E (Fwd)" value={m.forward_pe?.toFixed(1)} />}
        {m.ev_ebitda != null && <MetricChip label="EV/EBITDA" value={m.ev_ebitda?.toFixed(1)} />}
        {m.price_to_book != null && <MetricChip label="P/B" value={m.price_to_book?.toFixed(2)} />}
        {m.fcf_yield != null && <MetricChip label="FCF Yield" value={`${(m.fcf_yield * 100).toFixed(1)}%`} />}
      </View>
      {(fvb.low != null && fvb.high != null) && (
        <Field label="Fair Value Range">{`$${fvb.low} – $${fvb.high}`}</Field>
      )}
      <View style={{ gap: 8 }}>
        {scenarios.bull?.fair_value != null && (
          <ScenarioRow label="Bull" value={scenarios.bull.fair_value} note={scenarios.bull.assumptions} color="#2d5f3f" />
        )}
        {scenarios.base?.fair_value != null && (
          <ScenarioRow label="Base" value={scenarios.base.fair_value} note={scenarios.base.assumptions} color="#6b5a3f" />
        )}
        {scenarios.bear?.fair_value != null && (
          <ScenarioRow label="Bear" value={scenarios.bear.fair_value} note={scenarios.bear.assumptions} color="#a03434" />
        )}
      </View>
      {valuation.data_source && (
        <TMono style={{ fontSize: 9, marginTop: 8, color: colors.inkFaint }}>Source: {valuation.data_source}</TMono>
      )}
    </>
  );
}

function MetricChip({ label, value }) {
  return (
    <View style={{ backgroundColor: "#f0ebe0", borderRadius: 4, padding: 6, minWidth: 60 }}>
      <TMono style={{ fontSize: 8, color: colors.inkFaint }}>{label}</TMono>
      <TMono style={{ fontSize: 13, color: colors.ink, fontFamily: fonts.monoMed }}>{value ?? "N/A"}</TMono>
    </View>
  );
}

function ScenarioRow({ label, value, note, color }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ width: 36, paddingTop: 2 }}>
        <TMono style={{ fontSize: 10, color }}>{label}</TMono>
      </View>
      <View style={{ flex: 1 }}>
        <TMono style={{ fontSize: 12, color, fontFamily: fonts.monoMed }}>${value}</TMono>
        {note ? <TSerifItalic style={{ fontSize: 11, marginTop: 1 }}>{note}</TSerifItalic> : null}
      </View>
    </View>
  );
}

function PositionSection({ ps }) {
  if (!ps) return <TSerifItalic style={{ fontSize: 12 }}>No position sizing data.</TSerifItalic>;
  return (
    <>
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 10 }}>
        <MetricChip label="Current %" value={ps.current_pct != null ? `${ps.current_pct}%` : "0%"} />
        <MetricChip label="Max %" value={ps.max_pct != null ? `${ps.max_pct}%` : "N/A"} />
        <MetricChip label="First Tranche" value={ps.first_tranche_pct != null ? `${ps.first_tranche_pct}%` : "N/A"} />
      </View>
      {ps.add_condition && <Field label="Add when">{ps.add_condition}</Field>}
      {ps.trim_condition && <Field label="Trim when">{ps.trim_condition}</Field>}
      {ps.invalidation_condition && (
        <Field label="Invalidate if">
          <TSerif style={{ fontSize: 13, color: "#a03434" }}>{ps.invalidation_condition}</TSerif>
        </Field>
      )}
    </>
  );
}

function StrategySection({ ts }) {
  if (!ts) return <TSerifItalic style={{ fontSize: 12 }}>No strategy data.</TSerifItalic>;
  return (
    <>
      {ts.buy_trigger && <Field label="Buy trigger">{ts.buy_trigger}</Field>}
      {ts.sell_trim_trigger && <Field label="Sell / trim trigger">{ts.sell_trim_trigger}</Field>}
      {ts.review_date && <Field label="Scheduled review">{ts.review_date}</Field>}
      {ts.batch_plan && <Field label="Batch plan">{ts.batch_plan}</Field>}
      {ts.watch_items?.length > 0 && (
        <Field label="Watch items">
          {ts.watch_items.map((item, i) => (
            <TSerif key={i} style={{ fontSize: 13, lineHeight: 20 }}>{`• ${item}`}</TSerif>
          ))}
        </Field>
      )}
    </>
  );
}

function ChecklistSection({ version }) {
  const items = version?.businessSnapshot?.deep_research_checklist
    || version?.valuation?.checklist
    || [];
  if (!items.length) return <TSerifItalic style={{ fontSize: 12 }}>No checklist items.</TSerifItalic>;
  return (
    <>
      {items.map((item, i) => (
        <View key={i} style={{ marginBottom: 8, borderLeftWidth: 2, borderLeftColor: colors.divider, paddingLeft: 10 }}>
          <TMono style={{ fontSize: 10, color: colors.inkFaint }}>{item.item || item.name || `Item ${i + 1}`}</TMono>
          {item.finding ? <TSerif style={{ fontSize: 13, marginTop: 2 }}>{item.finding}</TSerif> : null}
          {item.evidence_quality && (
            <TMono style={{ fontSize: 9, color: colors.inkFaint, marginTop: 2 }}>
              {item.evidence_quality} {item.source ? `· ${item.source}` : ""}
            </TMono>
          )}
        </View>
      ))}
    </>
  );
}

function RulesSection({ ruleChecks }) {
  if (!ruleChecks.length) return <TSerifItalic style={{ fontSize: 12 }}>No rules to check.</TSerifItalic>;
  const RESULT_COLOR = { pass: "#2d5f3f", fail: "#a03434", "n/a": "#6b5a3f" };
  return (
    <>
      {ruleChecks.map((rc) => (
        <View key={rc.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#f0ebe0" }}>
          <View style={{ width: 36, paddingTop: 2 }}>
            <TMono style={{ fontSize: 9, color: RESULT_COLOR[rc.result] || colors.inkFaint }}>
              {(rc.result || "n/a").toUpperCase()}
            </TMono>
          </View>
          <View style={{ flex: 1 }}>
            <TSerif style={{ fontSize: 13, lineHeight: 19 }}>{rc.rule_text || "(rule)"}</TSerif>
            {rc.notes ? <TSerifItalic style={{ fontSize: 11, marginTop: 2 }}>{rc.notes}</TSerifItalic> : null}
            {rc.override_reason ? (
              <TMono style={{ fontSize: 9, color: "#a03434", marginTop: 2 }}>Override: {rc.override_reason}</TMono>
            ) : null}
          </View>
        </View>
      ))}
    </>
  );
}

// ── Version history sheet ─────────────────────────────────────────────────────

function VersionHistorySheet({ visible, onClose, versions, currentVersionId, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose} />
      <View style={{
        backgroundColor: colors.bg,
        paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40,
        borderTopWidth: 1, borderTopColor: colors.divider, maxHeight: "60%",
      }}>
        <TSerifBold style={{ fontSize: 18, marginBottom: 16 }}>版本历史  Version History</TSerifBold>
        <ScrollView>
          {versions.map((v) => (
            <Pressable
              key={v.id}
              onPress={() => onSelect(v)}
              style={({ pressed }) => ({
                paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.dividerSoft,
                opacity: pressed ? 0.7 : 1,
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              })}
            >
              <View>
                <TMono style={{ fontSize: 12, color: v.id === currentVersionId ? colors.ink : colors.inkFaint }}>
                  v{v.version_num ?? v.versionNum}
                  {v.id === currentVersionId ? "  ← current" : ""}
                </TMono>
                <TSerifItalic style={{ fontSize: 11 }}>{v.created_at || v.createdAt || ""}</TSerifItalic>
              </View>
              {v.thesis ? (
                <TSerif style={{ fontSize: 11, color: colors.inkMuted, flex: 1, marginLeft: 12 }} numberOfLines={1}>
                  {v.thesis}
                </TSerif>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Attach to trade sheet ─────────────────────────────────────────────────────

function AttachTradeSheet({ visible, onClose, trades, ticker, onAttach }) {
  const sym = ticker?.toUpperCase();
  const relevant = trades
    .filter(t => t.stock?.toUpperCase() === sym)
    .slice(0, 20);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose} />
      <View style={{
        backgroundColor: colors.bg,
        paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40,
        borderTopWidth: 1, borderTopColor: colors.divider, maxHeight: "70%",
      }}>
        <TSerifBold style={{ fontSize: 18, marginBottom: 4 }}>关联交易  Attach to Trade</TSerifBold>
        <TSerifItalic style={{ fontSize: 12, marginBottom: 16 }}>
          Link this memo to a journal entry to record whether you followed your research.
        </TSerifItalic>
        <ScrollView>
          {relevant.length === 0 ? (
            <TSerifItalic style={{ fontSize: 13 }}>No {sym} trades in journal.</TSerifItalic>
          ) : (
            relevant.map(t => (
              <Pressable
                key={t.id}
                onPress={() => onAttach(t.id)}
                style={({ pressed }) => ({
                  paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.dividerSoft,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <TMono style={{ fontSize: 11, color: colors.ink }}>
                  {t.date?.slice(0, 10)} · {t.action?.toUpperCase()} · {t.stock}
                </TMono>
                <TSerifItalic style={{ fontSize: 11, marginTop: 2 }} numberOfLines={2}>{t.reason}</TSerifItalic>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

