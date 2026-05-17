// Roundtable.js — 华山论道 · Virtual Investment Committee
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View, ScrollView, Modal, Pressable, TextInput, ActivityIndicator,
  Alert, Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, ChevronDown, ChevronUp, Trash2 } from "lucide-react-native";

import { colors, fonts } from "../theme";
import { useApp } from "../context";
import { useTransientMessage } from "../utils";
import { ROUNDTABLE_MASTERS, ROUNDTABLE_MAX_MENTORS, MASTER_MEETING_ROLES, getMaster } from "../constants";
import { mentorPanelResponse, runSynthesis } from "../api";
import * as db from "../db";
import { TSerif, TSerifBold, TSerifItalic, TMono, Kicker, ModalShell } from "../components";

// Mentor cards emit BULL/BEAR/NEUTRAL; committee-level synthesis adds WAIT
// (treated as warn-amber, distinct from a mentor's faint NEUTRAL).
const VERDICT_COLOR = {
  BULL: colors.good,
  BEAR: colors.bad,
  NEUTRAL: colors.inkMuted,
  WAIT: colors.warn,
};

// ──────────────────────────────────────────────────────────────
// Main modal
// ──────────────────────────────────────────────────────────────
export default function RoundtableModal({ visible, onClose }) {
  const app = useApp();

  const [session, setSession] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loadingMasters, setLoadingMasters] = useState(new Set());
  const [isDebating, setIsDebating] = useState(false);
  // Default to the first N (cross-philosophy balanced) — user can swap from the full pool.
  const [selectedMasters, setSelectedMasters] = useState(
    () => ROUNDTABLE_MASTERS.slice(0, ROUNDTABLE_MAX_MENTORS)
  );
  const [selectionWarning, showSelectionWarning] = useTransientMessage(2200);

  const [topicInput, setTopicInput] = useState("");
  const [debateInput, setDebateInput] = useState("");

  // `synthesis` is the new structured decision object (PR 2). `legacyMinutes`
  // holds the old markdown string for sessions saved before PR 2 — readable
  // but not regenerable. The "view" modal dispatches between them.
  const [synthesis, setSynthesis] = useState(null);
  const [legacyMinutes, setLegacyMinutes] = useState("");
  const [generatingSynthesis, setGeneratingSynthesis] = useState(false);
  const [showSynthesis, setShowSynthesis] = useState(false);

  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [synthesisHistoryVisible, setSynthesisHistoryVisible] = useState(false);
  const [preview, setPreview] = useState({ synthesis: null, legacyMinutes: "" });
  const [showPreview, setShowPreview] = useState(false);

  const scrollRef = useRef(null);

  const isLoading = loadingMasters.size > 0 || isDebating;

  // Auto-persist whenever loading finishes
  useEffect(() => {
    if (!session || !sessionId || isLoading) return;
    db.updateRoundtableSession(sessionId, session).catch(() => {});
  }, [session, sessionId, isLoading]);

  // Decision made from the current state (closure-captured), then side effects
  // dispatched separately. Keeping the setState updater pure avoids duplicate
  // warning timers under React Strict Mode (which double-invokes updaters) and
  // stays correct under future concurrent-rendering paths.
  const toggleMaster = (id) => {
    if (session) return;
    if (selectedMasters.includes(id)) {
      setSelectedMasters(selectedMasters.filter(m => m !== id));
      return;
    }
    if (selectedMasters.length >= ROUNDTABLE_MAX_MENTORS) {
      // Soft-block at the cap: surface the constraint, let the user decide who to drop.
      showSelectionWarning(`最多选 ${ROUNDTABLE_MAX_MENTORS} 位 · 请先取消一位`);
      return;
    }
    setSelectedMasters([...selectedMasters, id]);
  };

  // Functional update — safe to call from parallel async ops
  const addResponse = useCallback((roundNum, masterId, text, verdict) => {
    setSession(prev => {
      if (!prev) return prev;
      const rounds = prev.rounds.map(r => {
        if (r.roundNum !== roundNum) return r;
        if (r.responses.find(x => x.masterId === masterId)) return r;
        return { ...r, responses: [...r.responses, { masterId, text, verdict }] };
      });
      return { ...prev, rounds };
    });
  }, []);

  const removeResponse = useCallback((roundNum, masterId) => {
    setSession(prev => {
      if (!prev) return prev;
      const rounds = prev.rounds.map(r => {
        if (r.roundNum !== roundNum) return r;
        return { ...r, responses: r.responses.filter(x => x.masterId !== masterId) };
      });
      return { ...prev, rounds };
    });
  }, []);

  const retryMaster = async (roundNum, masterId) => {
    if (!session) return;
    removeResponse(roundNum, masterId);
    setLoadingMasters(prev => new Set([...prev, masterId]));
    try {
      const round = session.rounds.find(r => r.roundNum === roundNum);
      const prevRound = session.rounds.find(r => r.roundNum === roundNum - 1);
      // Include siblings already answered in the same round so the retried
      // master sees what others said in this round, not just the previous one.
      const currentSiblings = round
        ? round.responses.filter(r => r.masterId !== masterId)
        : [];
      const priorResponses = [...(prevRound?.responses ?? []), ...currentSiblings];
      const additionalQuestion = roundNum > 1 ? (round?.userInput || "") : "";
      const { text, verdict } = await mentorPanelResponse(
        session.topic, masterId, app.profile, priorResponses, additionalQuestion
      );
      if (!text) throw new Error("收到空回复，请重试");
      addResponse(roundNum, masterId, text, verdict);
    } catch (e) {
      const msg = e.message === "NO_API_KEY" ? "请先配置 API key" : (e.message || "未知错误");
      addResponse(roundNum, masterId, `[请求失败: ${msg}]`, null);
    } finally {
      setLoadingMasters(prev => { const s = new Set(prev); s.delete(masterId); return s; });
    }
  };

  // ── Round 1: concurrency-limited (2 at a time) ────────────
  // Firing all 6 simultaneously on mobile causes silent failures / empty responses
  // from the API. A worker pool of 2 keeps requests reliable without feeling slow.
  const startRound1 = async () => {
    const topic = topicInput.trim();
    if (!topic || selectedMasters.length === 0) return;

    const newSession = {
      topic,
      selectedMasters,
      rounds: [{ roundNum: 1, type: "parallel", userInput: topic, responses: [] }],
      synthesis: null,
    };

    setSession(newSession);
    setSynthesis(null);
    setLegacyMinutes("");
    setLoadingMasters(new Set(selectedMasters));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);

    let dbId = null;
    try {
      dbId = await db.saveRoundtableSession(newSession);
      setSessionId(dbId);
    } catch {}

    const queue = [...selectedMasters];

    const worker = async () => {
      while (queue.length > 0) {
        const masterId = queue.shift();
        if (!masterId) break;
        try {
          const { text, verdict } = await mentorPanelResponse(topic, masterId, app.profile);
          if (!text) throw new Error("收到空回复，请重试");
          addResponse(1, masterId, text, verdict);
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        } catch (e) {
          const msg = e.message === "NO_API_KEY" ? "请先配置 API key" : (e.message || "未知错误");
          addResponse(1, masterId, `[请求失败: ${msg}]`, null);
        } finally {
          setLoadingMasters(prev => { const s = new Set(prev); s.delete(masterId); return s; });
        }
      }
    };

    // Intentionally not awaited — workers update state independently via
    // functional updates; isLoading tracks completion via loadingMasters.
    void Promise.all([worker(), worker()]);
  };

  // ── Round 2+: sequential debate ───────────────────────────
  const startDebateRound = async () => {
    if (!session || isLoading) return;

    // Check the most recent round is fully complete (not just round 1)
    const lastRound = session.rounds[session.rounds.length - 1];
    if (!lastRound || lastRound.responses.length < session.selectedMasters.length) {
      Alert.alert("请等待", "上一轮发言尚未完成，请稍候。");
      return;
    }

    const additionalQuestion = debateInput.trim();
    const nextRoundNum = session.rounds.length + 1;
    const newRound = { roundNum: nextRoundNum, type: "sequential", userInput: additionalQuestion, responses: [] };

    setSession(prev => prev ? { ...prev, rounds: [...prev.rounds, newRound] } : prev);
    setDebateInput("");
    setIsDebating(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    // Only pass the immediately preceding round as context — not all rounds.
    // Accumulating all rounds causes context explosion (27k+ tokens after round 3)
    // which makes the API silently return empty responses.
    const priorRoundResponses = lastRound.responses;
    const roundAccum = [];

    for (const masterId of session.selectedMasters) {
      setLoadingMasters(prev => new Set([...prev, masterId]));
      try {
        const { text, verdict } = await mentorPanelResponse(
          session.topic, masterId, app.profile,
          [...priorRoundResponses, ...roundAccum],
          additionalQuestion
        );
        if (!text) throw new Error("收到空回复，请重试");
        const resp = { masterId, text, verdict };
        roundAccum.push(resp);
        setSession(prev => {
          if (!prev) return prev;
          const rounds = prev.rounds.map(r =>
            r.roundNum === nextRoundNum ? { ...r, responses: [...r.responses, resp] } : r
          );
          return { ...prev, rounds };
        });
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      } catch (e) {
        const err = { masterId, text: `[请求失败: ${e.message || "未知错误"}]`, verdict: null };
        roundAccum.push(err);
        setSession(prev => {
          if (!prev) return prev;
          const rounds = prev.rounds.map(r =>
            r.roundNum === nextRoundNum ? { ...r, responses: [...r.responses, err] } : r
          );
          return { ...prev, rounds };
        });
      } finally {
        setLoadingMasters(prev => { const s = new Set(prev); s.delete(masterId); return s; });
      }
    }
    setIsDebating(false);
  };

  // ── Decision synthesis ─────────────────────────────────────
  const doGenerateSynthesis = async () => {
    if (!session || generatingSynthesis) return;
    setGeneratingSynthesis(true);
    try {
      const result = await runSynthesis(session, app.profile);
      setSynthesis(result);
      // Persist synthesis on the session; legacy `minutes` is dropped on regeneration.
      const updated = { ...session, synthesis: result, minutes: undefined };
      setSession(updated);
      setLegacyMinutes("");
      if (sessionId) await db.updateRoundtableSession(sessionId, updated);
      setShowSynthesis(true);
    } catch (e) {
      const msg = e.message === "NO_API_KEY" ? "请先配置 API key" : (e.message || "综合生成失败，请稍后重试");
      Alert.alert("生成失败", msg);
    } finally {
      setGeneratingSynthesis(false);
    }
  };

  // ── History ────────────────────────────────────────────────
  const openHistory = async () => {
    try {
      const items = await db.listRoundtableSessions();
      setHistoryItems(items);
      setHistoryVisible(true);
    } catch {}
  };

  const openSynthesisHistory = async () => {
    try {
      const items = await db.listRoundtableSessions();
      setHistoryItems(items);
      setSynthesisHistoryVisible(true);
    } catch {}
  };

  const loadFromHistory = (item) => {
    setSession(item);
    setSessionId(item.id);
    setSynthesis(item.synthesis || null);
    setLegacyMinutes(typeof item.minutes === "string" ? item.minutes : "");
    // Clear any in-flight state from a previous session
    setLoadingMasters(new Set());
    setIsDebating(false);
    setHistoryVisible(false);
  };

  const deleteHistoryItem = async (id) => {
    try {
      await db.deleteRoundtableSession(id);
    } catch {
      Alert.alert("删除失败", "无法删除该记录，请稍后重试");
      return;
    }
    setHistoryItems(prev => prev.filter(h => h.id !== id));
    if (sessionId === id) { setSession(null); setSessionId(null); }
  };

  const resetSession = () => {
    setSession(null);
    setSessionId(null);
    setTopicInput("");
    setDebateInput("");
    setSynthesis(null);
    setLegacyMinutes("");
    setLoadingMasters(new Set());
    setIsDebating(false);
  };

  // Ordered display (loading/pending states)
  const getOrderedEntries = (round) => {
    const isCurrentRound = round.roundNum === (session?.rounds.length ?? 0);
    return (session?.selectedMasters ?? []).map(masterId => {
      const response = round.responses.find(r => r.masterId === masterId);
      // loadingMasters check is not gated to current round so retries in past rounds show spinner
      const loading = loadingMasters.has(masterId);
      const pending = isCurrentRound && !response && !loading && isLoading;
      return { masterId, response, loading, pending, onRetry: () => retryMaster(round.roundNum, masterId) };
    });
  };

  const lastRound = session?.rounds[session.rounds.length - 1];
  const canStartDebate = !!session && !isLoading &&
    (lastRound?.responses.length ?? 0) >= (session.selectedMasters?.length ?? 1);

  // Pre-session derived state (consumed by the mentor selector + start button below).
  const capReached = selectedMasters.length >= ROUNDTABLE_MAX_MENTORS;
  const readyToStart = !!topicInput.trim() && selectedMasters.length === ROUNDTABLE_MAX_MENTORS;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={{
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: colors.divider,
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Kicker>INVESTMENT COMMITTEE</Kicker>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              {session && (synthesis || legacyMinutes) ? (
                <Pressable onPress={() => setShowSynthesis(true)} hitSlop={8}>
                  <TMono style={{ fontSize: 10, color: colors.accent }}>查看综合</TMono>
                </Pressable>
              ) : null}
              <Pressable onPress={openSynthesisHistory} hitSlop={8}>
                <TMono style={{ fontSize: 10 }}>历史综合</TMono>
              </Pressable>
              <Pressable onPress={openHistory} hitSlop={8}>
                <TMono style={{ fontSize: 10 }}>历史议题</TMono>
              </Pressable>
              {session && (
                <Pressable onPress={resetSession} hitSlop={8}>
                  <TMono style={{ fontSize: 10 }}>新议题</TMono>
                </Pressable>
              )}
              <Pressable onPress={onClose} hitSlop={12}>
                <X size={18} color={colors.inkMuted} />
              </Pressable>
            </View>
          </View>
          <TSerifBold style={{ fontSize: 22, marginTop: 4, letterSpacing: -0.5 }}>华山论道</TSerifBold>
          <TSerifItalic style={{ fontSize: 12, color: colors.inkMuted, marginTop: 2 }}>
            虚拟投资委员会 · 多宗师辩论
          </TSerifItalic>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Topic setup (pre-session) ── */}
          {!session && (
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Kicker>选择参与宗师</Kicker>
                <TMono style={{
                  fontSize: 10,
                  color: selectedMasters.length === ROUNDTABLE_MAX_MENTORS ? colors.good : colors.inkMuted,
                }}>
                  已选 {selectedMasters.length}/{ROUNDTABLE_MAX_MENTORS}
                </TMono>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {ROUNDTABLE_MASTERS.map(id => {
                  const m = getMaster(id);
                  const sel = selectedMasters.includes(id);
                  // Fade non-selected chips when cap is reached — still tappable to surface the warning.
                  const dimmed = !sel && capReached;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => toggleMaster(id)}
                      style={{
                        paddingHorizontal: 10, paddingVertical: 6,
                        borderWidth: 1,
                        borderColor: sel ? colors.ink : colors.divider,
                        backgroundColor: sel ? colors.ink : colors.bgElev,
                        opacity: dimmed ? 0.45 : 1,
                      }}
                    >
                      <TMono style={{ fontSize: 10, color: sel ? colors.bg : colors.inkMuted }}>
                        {m.short} · {MASTER_MEETING_ROLES[id]?.roleZh}
                      </TMono>
                    </Pressable>
                  );
                })}
              </View>
              {selectionWarning ? (
                <TMono style={{ fontSize: 10, color: colors.bad, marginBottom: 16 }}>
                  {selectionWarning}
                </TMono>
              ) : (
                <TSerifItalic style={{ fontSize: 11, color: colors.inkFaint, marginBottom: 16 }}>
                  恰好 {ROUNDTABLE_MAX_MENTORS} 位 · 不同流派的对撞才有信息增量
                </TSerifItalic>
              )}

              <Kicker style={{ marginBottom: 8 }}>投资议题</Kicker>
              <TextInput
                value={topicInput}
                onChangeText={setTopicInput}
                placeholder="e.g. 黄金 ETF 在降息周期下的配置价值"
                placeholderTextColor={colors.inkFaint}
                multiline
                style={{
                  fontFamily: fonts.serif, fontSize: 15, color: colors.ink,
                  borderWidth: 1, borderColor: colors.divider,
                  padding: 14, marginBottom: 16,
                  minHeight: 80, textAlignVertical: "top",
                }}
              />
              <Pressable
                onPress={startRound1}
                disabled={!readyToStart}
                style={{
                  backgroundColor: colors.ink, padding: 14, alignItems: "center",
                  opacity: readyToStart ? 1 : 0.35,
                }}
              >
                <TMono style={{ color: colors.bg, fontSize: 12, letterSpacing: 0.5 }}>
                  开始第一轮 · 独立发言
                </TMono>
              </Pressable>
            </View>
          )}

          {/* ── Session rounds ── */}
          {session && session.rounds.map(round => (
            <View key={round.roundNum} style={{ marginBottom: 32 }}>
              {/* Round divider */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
                <TMono style={{ fontSize: 10 }}>
                  第 {round.roundNum} 轮 · {round.type === "parallel" ? "独立发言" : "顺序辩论"}
                </TMono>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
              </View>

              {/* Topic / follow-up question */}
              {round.userInput ? (
                <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.bgMuted }}>
                  <TMono style={{ fontSize: 9, color: colors.inkFaint, marginBottom: 4 }}>
                    {round.roundNum === 1 ? "议题" : "追加问题"}
                  </TMono>
                  <TSerif style={{ fontSize: 14 }}>{round.userInput}</TSerif>
                </View>
              ) : null}

              {getOrderedEntries(round).map(({ masterId, response, loading, pending, onRetry }) => (
                <MasterCard
                  key={masterId}
                  masterId={masterId}
                  response={response}
                  loading={loading}
                  pending={pending}
                  onRetry={onRetry}
                />
              ))}
            </View>
          ))}
        </ScrollView>

        {/* ── Bottom debate bar (active session) ── */}
        {session && (
          <View style={{
            borderTopWidth: 1, borderTopColor: colors.divider,
            padding: 12, backgroundColor: colors.bg,
          }}>
            <TextInput
              value={debateInput}
              onChangeText={setDebateInput}
              placeholder="追加问题（可留空，直接发起下一轮辩论）"
              placeholderTextColor={colors.inkFaint}
              style={{
                fontFamily: fonts.serif, fontSize: 14, color: colors.ink,
                borderWidth: 1, borderColor: colors.divider,
                padding: 10, marginBottom: 8, minHeight: 42,
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={startDebateRound}
                disabled={!canStartDebate}
                style={{
                  flex: 1, backgroundColor: colors.ink, padding: 12, alignItems: "center",
                  opacity: canStartDebate ? 1 : 0.35,
                }}
              >
                {isLoading && !generatingSynthesis ? (
                  <ActivityIndicator size="small" color={colors.bg} />
                ) : (
                  <TMono style={{ color: colors.bg, fontSize: 11, letterSpacing: 0.5 }}>
                    下一轮辩论
                  </TMono>
                )}
              </Pressable>
              <Pressable
                onPress={doGenerateSynthesis}
                disabled={!canStartDebate || generatingSynthesis}
                style={{
                  flex: 1, padding: 12, alignItems: "center",
                  borderWidth: 1, borderColor: colors.ink,
                  opacity: (!canStartDebate || generatingSynthesis) ? 0.35 : 1,
                }}
              >
                {generatingSynthesis ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : (
                  <TMono style={{ color: colors.ink, fontSize: 11, letterSpacing: 0.5 }}>
                    终止辩论，生成综合
                  </TMono>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>

      <SynthesisModal
        visible={showSynthesis}
        synthesis={synthesis}
        legacyMinutes={legacyMinutes}
        onClose={() => setShowSynthesis(false)}
      />
      <SynthesisModal
        visible={showPreview}
        synthesis={preview.synthesis}
        legacyMinutes={preview.legacyMinutes}
        onClose={() => setShowPreview(false)}
      />
      <SynthesisHistoryModal
        visible={synthesisHistoryVisible}
        items={historyItems}
        onClose={() => setSynthesisHistoryVisible(false)}
        onPreview={(item) => {
          setPreview({
            synthesis: item.synthesis || null,
            legacyMinutes: typeof item.minutes === "string" ? item.minutes : "",
          });
          setShowPreview(true);
        }}
      />
      <HistoryModal
        visible={historyVisible}
        items={historyItems}
        onClose={() => setHistoryVisible(false)}
        onLoad={loadFromHistory}
        onDelete={deleteHistoryItem}
      />
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────
// Master response card
// ──────────────────────────────────────────────────────────────
function MasterCard({ masterId, response, loading, pending, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const master = getMaster(masterId);
  const role = MASTER_MEETING_ROLES[masterId];
  const verdict = response?.verdict;
  const isError = response && response.text.startsWith("[请求失败");
  const longText = response && response.text.length > 600;

  return (
    <View style={{
      marginBottom: 16, borderWidth: 1,
      borderColor: loading ? colors.accent : colors.divider,
      backgroundColor: colors.bgElev,
    }}>
      {/* Card header */}
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 8,
        padding: 10, borderBottomWidth: 1, borderBottomColor: colors.dividerSoft,
        backgroundColor: colors.bgMuted,
      }}>
        {verdict && !isError && (
          <View style={{
            paddingHorizontal: 6, paddingVertical: 2,
            backgroundColor: VERDICT_COLOR[verdict.stance] || colors.inkMuted,
          }}>
            <TMono style={{ fontSize: 9, color: "#fff", letterSpacing: 0.3 }}>
              {verdict.stance} · {verdict.conviction}
            </TMono>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <TMono style={{ fontSize: 10, color: colors.ink }}>{master.zh} · {master.name}</TMono>
          <TMono style={{ fontSize: 9, color: colors.inkFaint }}>{role?.roleZh}</TMono>
        </View>
        {loading && <ActivityIndicator size="small" color={colors.accent} />}
      </View>

      {/* Verdict thesis line */}
      {verdict && !isError && (
        <View style={{ paddingHorizontal: 10, paddingTop: 8 }}>
          <TSerifItalic style={{ fontSize: 12, color: VERDICT_COLOR[verdict.stance] || colors.inkMuted }}>
            {verdict.thesis}
          </TSerifItalic>
        </View>
      )}

      {/* Body */}
      <View style={{ padding: 10 }}>
        {loading && (
          <TSerifItalic style={{ fontSize: 13, color: colors.inkMuted }}>正在思考…</TSerifItalic>
        )}
        {pending && !loading && (
          <TSerifItalic style={{ fontSize: 13, color: colors.inkFaint }}>等待发言…</TSerifItalic>
        )}
        {response && (
          <>
            <TSerif
              style={{ fontSize: 14, lineHeight: 22, color: isError ? colors.bad : colors.ink }}
              numberOfLines={!expanded && longText ? 10 : undefined}
            >
              {response.text}
            </TSerif>
            {isError && onRetry && (
              <Pressable
                onPress={onRetry}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  marginTop: 10, paddingVertical: 6, paddingHorizontal: 10,
                  borderWidth: 1, borderColor: colors.bad, alignSelf: "flex-start",
                }}
              >
                <TMono style={{ fontSize: 10, color: colors.bad }}>重试</TMono>
              </Pressable>
            )}
            {longText && (
              <Pressable
                onPress={() => setExpanded(e => !e)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}
              >
                {expanded
                  ? <ChevronUp size={11} color={colors.inkMuted} />
                  : <ChevronDown size={11} color={colors.inkMuted} />
                }
                <TMono style={{ fontSize: 10, color: colors.inkMuted }}>
                  {expanded ? "收起" : "展开全文"}
                </TMono>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Synthesis history modal — lists past sessions with either a
// structured synthesis (PR2+) or legacy markdown minutes.
// ──────────────────────────────────────────────────────────────
function SynthesisHistoryModal({ visible, items, onClose, onPreview }) {
  // Memoised so this work doesn't recompute on every parent re-render while hidden.
  const sessions = useMemo(
    () => items.filter(item => item.synthesis || (typeof item.minutes === "string" && item.minutes)),
    [items],
  );

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      kicker="SYNTHESIS ARCHIVE"
      title="历史综合"
      edges={["top", "bottom"]}
    >
      {sessions.length === 0 && (
        <TSerifItalic style={{ fontSize: 14, color: colors.inkMuted, textAlign: "center", marginTop: 40 }}>
          暂无历史综合
        </TSerifItalic>
      )}
      {sessions.map(item => {
        const isLegacy = !item.synthesis && !!item.minutes;
        return (
          <Pressable
            key={item.id}
            onPress={() => onPreview(item)}
            style={{
              marginBottom: 12, padding: 14,
              borderWidth: 1, borderColor: colors.divider,
              backgroundColor: colors.bgElev,
            }}
          >
            <TSerif style={{ fontSize: 14, marginBottom: 4 }} numberOfLines={2}>
              {item.topic || "(无题)"}
            </TSerif>
            <TMono style={{ fontSize: 10, color: colors.inkFaint }}>
              {item.createdAt
                ? new Date(item.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" })
                : ""}
              {" · "}{item.rounds?.length ?? 0} 轮
              {isLegacy ? " · 旧版纪要" : ` · ${item.synthesis?.headlineVerdict ?? ""}`}
            </TMono>
          </Pressable>
        );
      })}
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────
// Synthesis modal — dispatches between the new dashboard and
// the legacy markdown renderer based on what the session holds.
// ──────────────────────────────────────────────────────────────
function SynthesisModal({ visible, synthesis, legacyMinutes, onClose }) {
  const hasSynthesis = !!synthesis;
  const hasLegacy = !hasSynthesis && typeof legacyMinutes === "string" && legacyMinutes.length > 0;

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      kicker="DECISION SYNTHESIS"
      title={hasSynthesis ? "决策综合" : hasLegacy ? "会议纪要（旧版）" : "决策综合"}
      edges={["top", "bottom"]}
    >
      {hasSynthesis ? (
        <SynthesisDashboard synthesis={synthesis} />
      ) : hasLegacy ? (
        <Text selectable style={{ fontFamily: fonts.serif, fontSize: 14, lineHeight: 24, color: colors.ink }}>
          {legacyMinutes}
        </Text>
      ) : (
        <TSerifItalic style={{ fontSize: 14, color: colors.inkMuted, textAlign: "center", marginTop: 40 }}>
          暂无综合内容
        </TSerifItalic>
      )}
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────
// Synthesis dashboard — the structured decision view.
// Renders verdict badge, vote tally, axis of disagreement,
// consensus bullets, trigger-condition table, decisive crux,
// suggested next action, and the narrative.
// ──────────────────────────────────────────────────────────────
function SynthesisDashboard({ synthesis }) {
  const verdict = synthesis.headlineVerdict || "WAIT";
  const verdictColor = VERDICT_COLOR[verdict] || colors.warn;
  const tally = synthesis.voteTally || { BULL: 0, BEAR: 0, NEUTRAL: 0 };
  const tallyTotal = (tally.BULL || 0) + (tally.BEAR || 0) + (tally.NEUTRAL || 0);

  return (
    <View>
      {/* Headline verdict + vote tally */}
      <View style={{
        padding: 18, borderWidth: 1, borderColor: verdictColor,
        backgroundColor: colors.bgElev,
        flexDirection: "row", alignItems: "center", gap: 16,
      }}>
        <View style={{
          paddingHorizontal: 16, paddingVertical: 10,
          backgroundColor: verdictColor,
        }}>
          <TMono style={{ color: colors.bg, fontSize: 20, letterSpacing: 1, fontWeight: "700" }}>
            {verdict}
          </TMono>
        </View>
        <View style={{ flex: 1 }}>
          <Kicker style={{ marginBottom: 4 }}>VOTE TALLY · 投票</Kicker>
          <TMono style={{ fontSize: 12, color: colors.inkSoft }}>
            {tally.BULL || 0} BULL · {tally.BEAR || 0} BEAR · {tally.NEUTRAL || 0} NEUTRAL
            {tallyTotal > 0 ? `  (${tallyTotal})` : ""}
          </TMono>
        </View>
      </View>

      {/* Axis of disagreement */}
      {synthesis.axisOfDisagreement ? (
        <View style={{ marginTop: 24 }}>
          <Kicker style={{ marginBottom: 6 }}>AXIS OF DISAGREEMENT · 分歧轴心</Kicker>
          <TSerifItalic style={{ fontSize: 15, lineHeight: 22, color: colors.ink }}>
            「{synthesis.axisOfDisagreement}」
          </TSerifItalic>
        </View>
      ) : null}

      {/* Decisive crux */}
      {synthesis.decisiveCrux ? (
        <View style={{
          marginTop: 20, padding: 14,
          borderLeftWidth: 3, borderLeftColor: colors.cool,
          backgroundColor: colors.bgElev,
        }}>
          <Kicker style={{ marginBottom: 4 }}>DECISIVE CRUX · 决胜事实</Kicker>
          <TSerif style={{ fontSize: 14, lineHeight: 21, color: colors.ink }}>
            {synthesis.decisiveCrux}
          </TSerif>
        </View>
      ) : null}

      {/* Consensus points */}
      {synthesis.consensusPoints?.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Kicker style={{ marginBottom: 8 }}>CONSENSUS · 共识</Kicker>
          {synthesis.consensusPoints.map((point, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <TSerifBold style={{ color: colors.accent, fontSize: 14, marginTop: 2 }}>·</TSerifBold>
              <TSerif style={{ fontSize: 14, lineHeight: 21, flex: 1, color: colors.ink }}>{point}</TSerif>
            </View>
          ))}
        </View>
      ) : null}

      {/* Trigger conditions */}
      {synthesis.triggerConditions?.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Kicker style={{ marginBottom: 8 }}>TRIGGER CONDITIONS · 触发条件</Kicker>
          <View style={{ borderWidth: 1, borderColor: colors.divider }}>
            <View style={{
              flexDirection: "row", backgroundColor: colors.ink,
              paddingVertical: 6, paddingHorizontal: 10,
            }}>
              <TMono style={{ flex: 1, fontSize: 9, color: colors.bg, letterSpacing: 1 }}>IF · 若</TMono>
              <TMono style={{ flex: 1, fontSize: 9, color: colors.bg, letterSpacing: 1 }}>THEN · 则</TMono>
            </View>
            {synthesis.triggerConditions.map((row, i) => (
              <View key={i} style={{
                flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.dividerSoft,
                backgroundColor: i % 2 === 0 ? colors.bgElev : colors.bgCard,
              }}>
                <TSerif style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.ink, paddingRight: 8 }}>
                  {row.if || "—"}
                </TSerif>
                <TSerif style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.ink }}>
                  {row.then || "—"}
                </TSerif>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Suggested next action */}
      {synthesis.suggestedNextAction ? (
        <View style={{
          marginTop: 24, padding: 14,
          borderWidth: 1, borderColor: colors.accent,
          backgroundColor: colors.bgCard,
        }}>
          <Kicker style={{ marginBottom: 6, color: colors.accent }}>NEXT ACTION · 建议下一步</Kicker>
          <TSerifBold style={{ fontSize: 15, lineHeight: 22, color: colors.ink }}>
            {synthesis.suggestedNextAction}
          </TSerifBold>
        </View>
      ) : null}

      {/* Narrative */}
      {synthesis.narrative ? (
        <View style={{ marginTop: 28, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.dividerSoft }}>
          <Text selectable style={{ fontFamily: fonts.serif, fontSize: 14, lineHeight: 23, color: colors.inkSoft }}>
            {synthesis.narrative}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// History modal
// ──────────────────────────────────────────────────────────────
function HistoryModal({ visible, items, onClose, onLoad, onDelete }) {
  const confirmDelete = (id) => {
    Alert.alert("删除记录", "确认删除这条论道记录？", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => onDelete(id) },
    ]);
  };

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      kicker="HISTORY"
      title="历史论道"
      edges={["top", "bottom"]}
    >
      {items.length === 0 && (
        <TSerifItalic style={{ fontSize: 14, color: colors.inkMuted, textAlign: "center", marginTop: 40 }}>
          暂无历史记录
        </TSerifItalic>
      )}
      {items.map(item => (
        <Pressable
          key={item.id}
          onPress={() => onLoad(item)}
          style={{
            marginBottom: 12, padding: 14,
            borderWidth: 1, borderColor: colors.divider,
            backgroundColor: colors.bgElev,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <TSerif style={{ fontSize: 14, marginBottom: 4 }} numberOfLines={2}>
                {item.topic || "(无题)"}
              </TSerif>
              <TMono style={{ fontSize: 10, color: colors.inkFaint }}>
                {item.createdAt
                  ? new Date(item.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" })
                  : ""}
                {" · "}{item.rounds?.length ?? 0} 轮
                {item.synthesis ? " · 有综合" : item.minutes ? " · 有纪要" : ""}
              </TMono>
            </View>
            <Pressable onPress={() => confirmDelete(item.id)} hitSlop={10}>
              <Trash2 size={14} color={colors.inkFaint} />
            </Pressable>
          </View>
        </Pressable>
      ))}
    </ModalShell>
  );
}
