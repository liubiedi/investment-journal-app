// Log screen — trades + thoughts with on-demand mentor feedback.
// IMPORTANT: feedback is NOT auto-generated on save (to save tokens).
// User must tap "求教 xx" to request feedback from a specific master.

import React, { useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TrendingUp, TrendingDown, Eye, Search,
  Smile, Meh, Frown, Zap, Cloud,
  FileText, Lightbulb, HelpCircle, Quote,
  Plus, Wand2, Pencil, Mic, MicOff,
  Check, Trash2, ChevronLeft, Sparkles, Loader2,
} from "lucide-react-native";

import { colors, fonts } from "../theme";
import { useApp } from "../context";
import { ACTIONS, EMOTIONS, getAction, getEmotion } from "../constants";
import { fmtDate } from "../utils";
import { parseTradeText, generateEntryFeedback } from "../api";
import { useSpeech } from "../voice";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  PaperInput, FilledButton, OutlineButton, MasterChips, FeedbackBlock,
  Masthead, FormHeader, Field, HR, StockSearchInput,
} from "../components";

// Name -> icon lookup (RN can't import by name string dynamically)
const ACTION_ICONS = { buy: TrendingUp, sell: TrendingDown, hold: Eye, watch: Search };
const EMOTION_ICONS = { calm: Smile, confident: Zap, neutral: Meh, anxious: Cloud, fearful: Frown };

// Sync holdings after a buy/sell trade is saved.
// Only runs when the trade includes shares + costPerShare.
function syncHoldings(t, app) {
  const symbol = t.stock.trim().toUpperCase();
  const existing = app.holdings.find((h) => h.symbol === symbol);

  if (t.action === "buy" && t.shares > 0 && t.costPerShare > 0) {
    if (existing) {
      const newShares = existing.shares + t.shares;
      const newCost = (existing.shares * existing.costBasis + t.shares * t.costPerShare) / newShares;
      app.updateHoldingById(existing.id, {
        shares: Math.round(newShares * 10000) / 10000,
        costBasis: Math.round(newCost * 10000) / 10000,
      });
    } else {
      Alert.alert(
        "加入持仓？",
        `${symbol} 不在当前持仓中，是否立即添加？`,
        [
          { text: "稍后手动添加", style: "cancel" },
          {
            text: "添加", onPress: () => app.addHolding({
              symbol,
              displayName: symbol,
              shares: t.shares,
              costBasis: t.costPerShare,
              currency: "USD",
              buyReason: t.reason,
              notes: "",
            }),
          },
        ]
      );
    }
  } else if (t.action === "sell" && t.shares > 0) {
    if (existing) {
      const newShares = Math.round((existing.shares - t.shares) * 10000) / 10000;
      if (newShares <= 0) {
        app.deleteHoldingById(existing.id);
      } else {
        app.updateHoldingById(existing.id, { shares: newShares });
      }
    }
  }
}

export default function LogScreen() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [subTab, setSubTab] = useState("trades");
  const [adding, setAdding] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <Masthead
          kicker="LOG"
          title="记录"
          subtitle="Write before you trade. Think out loud."
          right={<Kicker style={{ fontSize: 9, letterSpacing: 3 }}>
            {subTab === "trades" ? `${app.trades.length} TRADES` : `${app.thoughts.length} THOUGHTS`}
          </Kicker>}
        />

        {/* Sub-tabs */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <View style={{ flexDirection: "row", padding: 4, backgroundColor: colors.bgMuted, gap: 4 }}>
            <SubTabButton active={subTab === "trades"} onPress={() => { setSubTab("trades"); setAdding(false); }}
              icon={<FileText size={12} color={subTab === "trades" ? colors.bg : colors.inkMuted} />}
              label="交易 Trades" />
            <SubTabButton active={subTab === "thoughts"} onPress={() => { setSubTab("thoughts"); setAdding(false); }}
              icon={<Lightbulb size={12} color={subTab === "thoughts" ? colors.bg : colors.inkMuted} />}
              label="心念 Thoughts" />
          </View>
        </View>

        {subTab === "thoughts" && (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <TSerifItalic style={{ fontSize: 12 }}>
              心念：拿不定主意时的私人记录。不是交易。
            </TSerifItalic>
          </View>
        )}

        {!adding && (
          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            <FilledButton onPress={() => setAdding(true)}>
              <Plus size={16} color={colors.bg} />
              <TSerifBold style={{ color: colors.bg, fontSize: 15 }}>
                {subTab === "trades" ? "新建交易" : "记下心念"}
              </TSerifBold>
            </FilledButton>
          </View>
        )}

        {adding && subTab === "trades" && (
          <TradeForm
            rules={app.rules}
            onSave={async (t) => {
              await app.addTrade(t);
              setAdding(false);
              syncHoldings(t, app);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {adding && subTab === "thoughts" && (
          <ThoughtForm
            onSave={async (content, raw) => { await app.addThought(content, raw); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        )}

        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          {subTab === "trades" ? (
            <>
              {app.trades.length === 0 && !adding && (
                <EmptyState icon={<FileText size={28} strokeWidth={1} color={colors.inkFaint} />}
                  text="还没有交易记录" />
              )}
              {app.trades.map((t) => (
                <TradeRow key={t.id} trade={t}
                  onDelete={() => app.deleteTradeById(t.id)}
                  onRequestFeedback={async (masterId) => {
                    const text = await generateEntryFeedback(t, "trade", masterId, app.profile);
                    const next = [...(t.feedback || []).filter(f => f.masterId !== masterId), { masterId, text, createdAt: Date.now() }];
                    await app.updateTradeFeedback(t.id, next);
                  }}
                  defaultMaster={app.defaultMaster}
                />
              ))}
            </>
          ) : (
            <>
              {app.thoughts.length === 0 && !adding && (
                <EmptyState icon={<Lightbulb size={28} strokeWidth={1} color={colors.inkFaint} />}
                  text="还没有心念记录"
                  hint="心念可以是一个疑问、一个纠结、一段直觉。" />
              )}
              {app.thoughts.map((t) => (
                <ThoughtRow key={t.id} thought={t}
                  onDelete={() => app.deleteThoughtById(t.id)}
                  onRequestFeedback={async (masterId) => {
                    const text = await generateEntryFeedback(t, "thought", masterId, app.profile);
                    const next = [...(t.feedback || []).filter(f => f.masterId !== masterId), { masterId, text, createdAt: Date.now() }];
                    await app.updateThoughtFeedback(t.id, next);
                  }}
                  defaultMaster={app.defaultMaster}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SubTabButton({ active, onPress, icon, label }) {
  return (
    <Pressable onPress={onPress}
      style={{ flex: 1, paddingVertical: 8, alignItems: "center", justifyContent: "center",
        flexDirection: "row", gap: 6,
        backgroundColor: active ? colors.ink : "transparent" }}>
      {icon}
      <TMono style={{ fontSize: 11, color: active ? colors.bg : colors.inkMuted, fontWeight: active ? "500" : "400" }}>
        {label}
      </TMono>
    </Pressable>
  );
}

function EmptyState({ icon, text, hint }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: "center" }}>
      {icon}
      <TSerifItalic style={{ fontSize: 13, marginTop: 12 }}>{text}</TSerifItalic>
      {hint && <TSerifItalic style={{ fontSize: 11, marginTop: 4 }}>{hint}</TSerifItalic>}
    </View>
  );
}

// ============================================================
function TradeRow({ trade, onDelete, onRequestFeedback, defaultMaster }) {
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const action = getAction(trade.action);
  const emotion = getEmotion(trade.emotion);
  const AIcon = ACTION_ICONS[trade.action] || TrendingUp;
  const EIcon = EMOTION_ICONS[trade.emotion] || Meh;
  const hasFeedback = trade.feedback?.length > 0;

  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.dividerSoft }}>
      <Pressable onPress={() => setExpanded(!expanded)}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <TMono style={{ fontSize: 10, minWidth: 68 }}>{fmtDate(trade.date)}</TMono>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minWidth: 56 }}>
            <AIcon size={11} color={action.color} strokeWidth={2.5} />
            <TMono style={{ fontSize: 10, color: action.color, fontWeight: "600", letterSpacing: 1 }}>
              {action.label.toUpperCase()}
            </TMono>
          </View>
          <TSerifBold style={{ flex: 1, fontSize: 15 }}>{trade.stock}</TSerifBold>
          <EIcon size={13} color={emotion.color} style={{ opacity: 0.7 }} />
        </View>
        <TSerif style={{ marginTop: 8, marginLeft: 80, fontSize: 14, lineHeight: 22, color: colors.inkSoft }}>
          {trade.reason}
        </TSerif>
        {hasFeedback && !expanded && (
          <View style={{ marginTop: 6, marginLeft: 80, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Quote size={9} color={colors.accent} />
            <TMono style={{ color: colors.accent, fontSize: 10 }}>
              {trade.feedback.length} 位导师点评 · 点击展开
            </TMono>
          </View>
        )}
        {!hasFeedback && !expanded && (
          <View style={{ marginTop: 6, marginLeft: 80 }}>
            <TMono style={{ color: colors.inkFaint, fontSize: 10 }}>点击展开以求教导师</TMono>
          </View>
        )}
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 12, marginLeft: 80, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.dividerSoft }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <EIcon size={12} color={emotion.color} />
            <TMono style={{ fontSize: 10, color: emotion.color, letterSpacing: 1 }}>
              {emotion.label.toUpperCase()}
            </TMono>
          </View>

          {trade.rulesChecked?.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Kicker style={{ marginBottom: 4 }}>RULES CHECKED</Kicker>
              {trade.rulesChecked.map((r, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 2 }}>
                  <Check size={11} color={colors.good} strokeWidth={3} style={{ marginTop: 3 }} />
                  <TSerif style={{ fontSize: 12, color: colors.inkSoft, flex: 1 }}>{r}</TSerif>
                </View>
              ))}
            </View>
          )}

          {trade.rawInput && (
            <View style={{ marginBottom: 12 }}>
              <Kicker style={{ marginBottom: 4 }}>ORIGINAL INPUT</Kicker>
              <TSerifItalic style={{ fontSize: 12 }}>"{trade.rawInput}"</TSerifItalic>
            </View>
          )}

          <FeedbackBlock
            feedback={trade.feedback}
            onRequestMaster={onRequestFeedback}
            defaultMaster={defaultMaster}
          />

          <View style={{ marginTop: 12 }}>
            {confirm ? (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable onPress={onDelete}><TMono style={{ color: colors.bad, fontSize: 10, fontWeight: "600" }}>CONFIRM DELETE</TMono></Pressable>
                <Pressable onPress={() => setConfirm(false)}><TMono style={{ fontSize: 10 }}>CANCEL</TMono></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setConfirm(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Trash2 size={10} color={colors.inkFaint} />
                <TMono style={{ fontSize: 10 }}>DELETE</TMono>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================
function ThoughtRow({ thought, onDelete, onRequestFeedback, defaultMaster }) {
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const hasFeedback = thought.feedback?.length > 0;

  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.dividerSoft }}>
      <Pressable onPress={() => setExpanded(!expanded)}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <TMono style={{ fontSize: 10, minWidth: 68 }}>{fmtDate(thought.date)}</TMono>
          <HelpCircle size={12} color={colors.inkFaint} strokeWidth={2} />
          <TSerif style={{ flex: 1, fontSize: 14, lineHeight: 22 }}>
            {expanded ? thought.content : thought.content.length > 80 ? thought.content.slice(0, 80) + "…" : thought.content}
          </TSerif>
        </View>
        {hasFeedback && !expanded && (
          <View style={{ marginTop: 6, marginLeft: 80, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Quote size={9} color={colors.accent} />
            <TMono style={{ color: colors.accent, fontSize: 10 }}>
              {thought.feedback.length} 位导师回应
            </TMono>
          </View>
        )}
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 12, marginLeft: 80, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.dividerSoft }}>
          <FeedbackBlock
            feedback={thought.feedback}
            onRequestMaster={onRequestFeedback}
            defaultMaster={defaultMaster}
          />

          <View style={{ marginTop: 12 }}>
            {confirm ? (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable onPress={onDelete}><TMono style={{ color: colors.bad, fontSize: 10, fontWeight: "600" }}>CONFIRM DELETE</TMono></Pressable>
                <Pressable onPress={() => setConfirm(false)}><TMono style={{ fontSize: 10 }}>CANCEL</TMono></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setConfirm(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Trash2 size={10} color={colors.inkFaint} />
                <TMono style={{ fontSize: 10 }}>DELETE</TMono>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================
function TradeForm({ rules, onSave, onCancel }) {
  const [mode, setMode] = useState("smart");
  const [action, setAction] = useState("buy");
  const [stock, setStock] = useState("");
  const [shares, setShares] = useState("");
  const [costPerShare, setCostPerShare] = useState("");
  const [reason, setReason] = useState("");
  const [emotion, setEmotion] = useState("calm");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rulesChecked, setRulesChecked] = useState([]);
  const [rawInput, setRawInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [error, setError] = useState("");

  const { listening, supported, start, stop } = useSpeech(setRawInput);

  const generate = async () => {
    if (!rawInput.trim()) return;
    setParsing(true); setError("");
    try {
      const res = await parseTradeText(rawInput.trim());
      setAction(res.action || "buy");
      setStock(res.stock || "");
      setReason(res.reason || "");
      setEmotion(res.emotion || "neutral");
      setParsed(true);
    } catch (e) {
      setError(e.message === "NO_API_KEY" ? "请先在设置中配置 API key" : "AI 解析失败，请手动填写");
    } finally {
      setParsing(false);
    }
  };

  const canSave = stock.trim() && reason.trim();

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <FormHeader title="NEW TRADE" onCancel={onCancel} />

      {/* Mode toggle */}
      <View style={{ flexDirection: "row", padding: 4, backgroundColor: colors.bgMuted, gap: 4, marginBottom: 20 }}>
        <Pressable onPress={() => setMode("smart")}
          style={{ flex: 1, paddingVertical: 8, alignItems: "center", justifyContent: "center",
            flexDirection: "row", gap: 6, backgroundColor: mode === "smart" ? colors.ink : "transparent" }}>
          <Wand2 size={12} color={mode === "smart" ? colors.bg : colors.inkMuted} />
          <TMono style={{ fontSize: 11, color: mode === "smart" ? colors.bg : colors.inkMuted }}>AI 智能输入</TMono>
        </Pressable>
        <Pressable onPress={() => setMode("manual")}
          style={{ flex: 1, paddingVertical: 8, alignItems: "center", justifyContent: "center",
            flexDirection: "row", gap: 6, backgroundColor: mode === "manual" ? colors.ink : "transparent" }}>
          <Pencil size={12} color={mode === "manual" ? colors.bg : colors.inkMuted} />
          <TMono style={{ fontSize: 11, color: mode === "manual" ? colors.bg : colors.inkMuted }}>手动填写</TMono>
        </Pressable>
      </View>

      {mode === "smart" && (
        <View style={{ marginBottom: 24, padding: 14, backgroundColor: colors.bgElev, borderWidth: 1, borderColor: colors.accent, borderStyle: "dashed" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Kicker>语音或文字 · 说说你做了什么</Kicker>
            {listening && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bad }} />
                <TMono style={{ color: colors.bad, fontSize: 10 }}>LISTENING</TMono>
              </View>
            )}
          </View>
          <PaperInput
            multiline value={rawInput} onChangeText={setRawInput}
            placeholder="例：今天买了 200 股苹果，均价 175。服务收入增长好，股价回调 15%，估值合理。"
            style={{ minHeight: 90, fontSize: 15, borderWidth: 0 }}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {supported && (
              <Pressable onPress={() => listening ? stop() : start(rawInput)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  paddingHorizontal: 14, paddingVertical: 10,
                  backgroundColor: listening ? colors.bad : "transparent",
                  borderWidth: listening ? 0 : 1, borderColor: colors.divider }}>
                {listening ? <MicOff size={12} color={colors.bg} /> : <Mic size={12} color={colors.ink} />}
                <TMono style={{ fontSize: 11, color: listening ? colors.bg : colors.ink, fontWeight: "500" }}>
                  {listening ? "停止" : "语音"}
                </TMono>
              </Pressable>
            )}
            <Pressable onPress={generate} disabled={!rawInput.trim() || parsing}
              style={{ flex: 1, paddingVertical: 10, backgroundColor: colors.accent,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: (!rawInput.trim() || parsing) ? 0.3 : 1 }}>
              {parsing ? <ActivityIndicator size="small" color={colors.ink} /> : <Sparkles size={12} color={colors.ink} />}
              <TSerifBold style={{ fontSize: 12, color: colors.ink }}>
                {parsing ? "生成中…" : "AI 生成交易摘要"}
              </TSerifBold>
            </Pressable>
          </View>
          {error ? <TMono style={{ color: colors.bad, fontSize: 11, marginTop: 8 }}>{error}</TMono> :
            parsed && <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
              <Check size={11} color={colors.good} strokeWidth={3} />
              <TMono style={{ color: colors.good, fontSize: 11 }}>已填入表单，检查后保存</TMono>
            </View>}
        </View>
      )}

      <Field label="ACTION · 动作">
        <View style={{ flexDirection: "row", gap: 8 }}>
          {ACTIONS.map((a) => {
            const AI = ACTION_ICONS[a.id];
            const isActive = action === a.id;
            return (
              <Pressable key={a.id} onPress={() => setAction(a.id)}
                style={{ flex: 1, paddingVertical: 10, alignItems: "center", gap: 4,
                  backgroundColor: isActive ? a.color : "transparent",
                  borderWidth: isActive ? 0 : 1, borderColor: colors.divider }}>
                <AI size={14} color={isActive ? colors.bg : colors.inkSoft} strokeWidth={2} />
                <TMono style={{ fontSize: 10, color: isActive ? colors.bg : colors.inkSoft }}>{a.zh}</TMono>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="STOCK · 标的">
        <StockSearchInput
          value={stock}
          onChangeText={setStock}
          placeholder="AAPL / 腾讯 / BTC…"
          style={{ fontSize: 17 }}
          onSelect={(item) => setStock(item.symbol)}
        />
      </Field>

      {(action === "buy" || action === "sell") && (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="SHARES · 数量（可选）">
              <PaperInput value={shares} onChangeText={setShares} placeholder="200"
                keyboardType="decimal-pad" style={{ fontFamily: fonts.mono, fontSize: 15 }} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="COST · 均价（可选）">
              <PaperInput value={costPerShare} onChangeText={setCostPerShare} placeholder="175.50"
                keyboardType="decimal-pad" style={{ fontFamily: fonts.mono, fontSize: 15 }} />
            </Field>
          </View>
        </View>
      )}

      <Field label="DATE · 日期">
        <PaperInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"
          style={{ fontFamily: fonts.mono, fontSize: 14 }} />
      </Field>

      <Field label="REASON · 为什么">
        <PaperInput multiline value={reason} onChangeText={setReason}
          placeholder="写在交易之前。为什么是这只？为什么是现在？预期什么会发生？"
          style={{ minHeight: 100, fontSize: 15 }} />
      </Field>

      <Field label="EMOTION · 情绪">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {EMOTIONS.map((e) => {
            const EI = EMOTION_ICONS[e.id];
            const isActive = emotion === e.id;
            return (
              <Pressable key={e.id} onPress={() => setEmotion(e.id)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6,
                  backgroundColor: isActive ? e.color : "transparent",
                  borderWidth: isActive ? 0 : 1, borderColor: e.color + "60" }}>
                <EI size={12} color={isActive ? colors.bg : e.color} />
                <TMono style={{ fontSize: 11, color: isActive ? colors.bg : e.color }}>
                  {e.label.split(" ")[0]}
                </TMono>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {rules.length > 0 && (
        <Field label="RULES CHECK · 规则自检" hint="勾选你已遵守的规则">
          {rules.map((r, i) => {
            const checked = rulesChecked.includes(r);
            return (
              <Pressable key={i}
                onPress={() => setRulesChecked(checked ? rulesChecked.filter((x) => x !== r) : [...rulesChecked, r])}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6 }}>
                <View style={{
                  width: 16, height: 16, marginTop: 3,
                  borderWidth: 1.5, borderColor: checked ? colors.good : colors.inkFaint,
                  backgroundColor: checked ? colors.good : "transparent",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {checked && <Check size={10} color={colors.bg} strokeWidth={3} />}
                </View>
                <TSerif style={{ flex: 1, fontSize: 14, color: checked ? colors.ink : colors.inkMuted }}>{r}</TSerif>
              </Pressable>
            );
          })}
        </Field>
      )}

      <FilledButton
        onPress={() => onSave({
          action, stock: stock.trim(), reason: reason.trim(), emotion,
          date: new Date(date).toISOString(), rulesChecked,
          shares: parseFloat(shares) || 0,
          costPerShare: parseFloat(costPerShare) || 0,
          rawInput: mode === "smart" && rawInput.trim() ? rawInput.trim() : undefined,
        })}
        disabled={!canSave}
        style={{ marginTop: 16, paddingVertical: 16 }}
      >
        写入交易日志
      </FilledButton>
      <TSerifItalic style={{ fontSize: 11, textAlign: "center", marginTop: 8 }}>
        在详情页可按需求教任一位导师点评
      </TSerifItalic>
    </ScrollView>
  );
}

// ============================================================
function ThoughtForm({ onSave, onCancel }) {
  const [text, setText] = useState("");
  const { listening, supported, start, stop } = useSpeech(setText);
  const [saving, setSaving] = useState(false);

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <FormHeader title="NEW THOUGHT" onCancel={onCancel} />

      <TSerifItalic style={{ fontSize: 14, marginBottom: 16 }}>
        把心里的纠结、疑问、直觉写/说出来。
      </TSerifItalic>

      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Kicker>MY THOUGHT · 我的心念</Kicker>
          {listening && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bad }} />
              <TMono style={{ color: colors.bad, fontSize: 10 }}>LISTENING</TMono>
            </View>
          )}
        </View>
        <PaperInput multiline autoFocus value={text} onChangeText={setText}
          placeholder="例：我现在在纠结要不要加仓苹果。一方面业绩扎实，另一方面占比已经快 30%，违反我自己的规则…"
          style={{ minHeight: 160, fontSize: 15 }} />
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {supported && (
          <Pressable onPress={() => listening ? stop() : start(text)}
            style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 6,
              backgroundColor: listening ? colors.bad : "transparent",
              borderWidth: listening ? 0 : 1, borderColor: colors.divider }}>
            {listening ? <MicOff size={12} color={colors.bg} /> : <Mic size={12} color={colors.ink} />}
            <TMono style={{ fontSize: 11, color: listening ? colors.bg : colors.ink, fontWeight: "500" }}>
              {listening ? "停止" : "语音输入"}
            </TMono>
          </Pressable>
        )}
        <FilledButton
          onPress={async () => { setSaving(true); try { await onSave(text.trim(), text.trim()); } finally { setSaving(false); } }}
          disabled={!text.trim() || saving}
          loading={saving}
          style={{ flex: 1 }}
        >
          <Check size={12} color={colors.bg} />
          <TSerifBold style={{ color: colors.bg, fontSize: 13 }}>记下</TSerifBold>
        </FilledButton>
      </View>
      <TSerifItalic style={{ fontSize: 11, textAlign: "center", marginTop: 12 }}>
        保存后在详情页按需求教导师回应
      </TSerifItalic>
    </ScrollView>
  );
}
