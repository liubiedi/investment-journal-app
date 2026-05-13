// components.js — shared UI primitives matching the editorial aesthetic.

import React, { useState, useRef } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator,
  StyleSheet, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Pin, Edit2, Plus, X, Check, Loader2, Quote, Trash2, ChevronLeft, MessageCircle, Maximize2,
} from "lucide-react-native";
import { colors, fonts, spacing } from "./theme";
import { MASTERS, getMaster } from "./constants";
import { yahooSearch } from "./api";

// ========== Typography ==========
export const TSerif = ({ style, ...p }) => <Text {...p} style={[{ fontFamily: fonts.serif, color: colors.ink }, style]} />;
export const TSerifBold = ({ style, ...p }) => <Text {...p} style={[{ fontFamily: fonts.serifBold, color: colors.ink }, style]} />;
export const TSerifItalic = ({ style, ...p }) => <Text {...p} style={[{ fontFamily: fonts.serifItalic, color: colors.inkMuted }, style]} />;
export const TMono = ({ style, ...p }) => <Text {...p} style={[{ fontFamily: fonts.mono, color: colors.inkFaint }, style]} />;

// ========== Label used for small uppercase mono section headers ==========
export const Kicker = ({ children, style, color }) => (
  <Text style={[{
    fontFamily: fonts.monoMed,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: color || colors.inkFaint,
  }, style]}>
    {children}
  </Text>
);

// ========== Section with divider and optional pin ==========
export function Section({ label, sub, pin, children }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
      <View style={{ marginBottom: 12, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {pin && <Pin size={11} color={colors.inkFaint} strokeWidth={2} style={{ marginBottom: 3 }} />}
        <View>
          <TSerifBold style={{ fontSize: 17 }}>{label}</TSerifBold>
          {sub && <Kicker style={{ marginTop: 2 }}>{sub}</Kicker>}
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 16 }}>
        {children}
      </View>
    </View>
  );
}

// ========== At-a-glance stat ==========
export function Stat({ value, label }) {
  return (
    <View>
      <TSerifBold style={{ fontSize: 26, lineHeight: 28 }}>{value}</TSerifBold>
      <Kicker style={{ marginTop: 4 }}>{label}</Kicker>
    </View>
  );
}

// ========== Field wrapper (label + children) ==========
export function Field({ label, children, right, hint }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Kicker>{label}</Kicker>
        {right}
      </View>
      {children}
      {hint && <TSerifItalic style={{ fontSize: 11, marginTop: 4 }}>{hint}</TSerifItalic>}
    </View>
  );
}

// ========== Primary filled button ==========
export function FilledButton({ onPress, disabled, children, loading, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{
        backgroundColor: colors.ink,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.3 : pressed ? 0.85 : 1,
        flexDirection: "row",
        gap: 8,
      }, style]}
    >
      {loading && <ActivityIndicator color={colors.bg} size="small" />}
      {typeof children === "string"
        ? <TSerifBold style={{ color: colors.bg, fontSize: 15 }}>{children}</TSerifBold>
        : children}
    </Pressable>
  );
}

// ========== Outline (secondary) button ==========
export function OutlineButton({ onPress, disabled, children, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: colors.divider,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      }, style]}
    >
      {typeof children === "string"
        ? <Text style={{ color: colors.ink, fontSize: 14 }}>{children}</Text>
        : children}
    </Pressable>
  );
}

// ========== Paper text input (single line or multi) ==========
export const PaperInput = React.forwardRef(function PaperInput(
  { multiline, style, ...rest }, ref
) {
  return (
    <TextInput
      ref={ref}
      multiline={multiline}
      placeholderTextColor={colors.inkFaint}
      style={[{
        fontFamily: fonts.serif,
        color: colors.ink,
        fontSize: 16,
        padding: multiline ? 12 : 8,
        borderWidth: multiline ? 1 : 0,
        borderBottomWidth: 1,
        borderColor: colors.divider,
        textAlignVertical: multiline ? "top" : "center",
        backgroundColor: "transparent",
      }, style]}
      {...rest}
    />
  );
});

// ========== Stock symbol search input with Yahoo Finance autocomplete ==========
export function StockSearchInput({ value, onChangeText, onSelect, placeholder, style }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  const handleChange = (text) => {
    onChangeText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await yahooSearch(text.trim());
        setResults(r);
        setOpen(r.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const pick = (item) => {
    onChangeText(item.symbol);
    onSelect?.(item.symbol, item.name);
    setOpen(false);
    setResults([]);
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <PaperInput
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          autoCapitalize="characters"
          style={[{ flex: 1 }, style]}
        />
        {loading && <ActivityIndicator size="small" color={colors.inkFaint} style={{ marginLeft: 8 }} />}
      </View>
      {open && (
        <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: colors.divider, backgroundColor: colors.bgElev }}>
          {results.map((r, i) => (
            <Pressable
              key={r.symbol}
              onPress={() => pick(r)}
              style={{
                flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                paddingHorizontal: 10, paddingVertical: 9,
                borderTopWidth: i === 0 ? 0 : 1, borderColor: colors.divider,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.monoMed, fontSize: 13, color: colors.ink }}>{r.symbol}</Text>
                <Text style={{ fontFamily: fonts.serif, fontSize: 12, color: colors.inkMuted }} numberOfLines={1}>{r.name}</Text>
              </View>
              <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.inkFaint, marginLeft: 8 }}>{r.exch}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ========== Master chips (horizontal selector) ==========
export function MasterChips({ active, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
    >
      {MASTERS.map((m) => {
        const isActive = active === m.id;
        return (
          <Pressable
            key={m.id}
            onPress={() => onSelect(m.id)}
            style={({ pressed }) => ({
              paddingHorizontal: 12, paddingVertical: 6,
              backgroundColor: isActive ? colors.ink : "transparent",
              borderWidth: 1,
              borderColor: isActive ? colors.ink : colors.divider,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{
              fontSize: 11,
              color: isActive ? colors.bg : colors.inkSoft,
              fontWeight: isActive ? "500" : "400",
            }}>{m.zh}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ========== Feedback block (shown on entry rows) ==========
// Props:
//   feedback: [{ masterId, text, createdAt }]
//   onRequestMaster: (masterId, onChunk) => Promise<void>
//   onContinueInMentor: (masterId, text) => void  — optional, shows "带入问道" button
function FullFeedbackModal({ visible, text, masterName, onClose, onContinueInMentor }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 20, paddingVertical: 14,
          borderBottomWidth: 1, borderBottomColor: colors.divider,
        }}>
          <View>
            <Kicker>MENTOR'S VIEW · 导师点评</Kicker>
            <Text style={{ fontFamily: fonts.serifBold, fontSize: 18, color: colors.ink, marginTop: 2 }}>
              {masterName}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 16, lineHeight: 28, color: colors.ink }}>
            {text}
          </Text>
        </ScrollView>
        {onContinueInMentor && (
          <View style={{
            paddingHorizontal: 20, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: colors.divider,
          }}>
            <Pressable
              onPress={() => { onClose(); onContinueInMentor(); }}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                paddingVertical: 14, backgroundColor: colors.ink,
              }}
            >
              <MessageCircle size={14} color={colors.accent} />
              <Text style={{ fontFamily: fonts.serifBold, fontSize: 14, color: colors.bg }}>
                带入问道继续讨论 ↗
              </Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}


export function FeedbackBlock({ feedback, onRequestMaster, pending = false, defaultMaster = "default", onContinueInMentor }) {
  const [activeMaster, setActiveMaster] = useState(feedback?.[0]?.masterId || defaultMaster);
  const [loadingMaster, setLoadingMaster] = useState(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  // Local cache so text is visible immediately after generation even before the
  // feedback prop re-renders (the finally block cleared streamingText too early).
  const [localCache, setLocalCache] = useState({});
  const streamAccumRef = useRef("");

  const current = feedback?.find((f) => f.masterId === activeMaster)
    ?? (localCache[activeMaster] ? { text: localCache[activeMaster] } : null);

  const handleSelect = async (masterId) => {
    setActiveMaster(masterId);
    setError(null);
    const alreadyHave = feedback?.find((f) => f.masterId === masterId) || localCache[masterId];
    if (!alreadyHave) {
      setLoadingMaster(masterId);
      streamAccumRef.current = "";
      setStreamingText("");
      try {
        await onRequestMaster(masterId, (chunk) => {
          streamAccumRef.current += chunk;
          setStreamingText((prev) => prev + chunk);
        });
        if (streamAccumRef.current) {
          setLocalCache((prev) => ({ ...prev, [masterId]: streamAccumRef.current }));
        }
      } catch (e) {
        setError(e.message === "NO_API_KEY" ? "请先在设置中配置 API key" : "导师暂时失联，点击重试");
      } finally {
        setLoadingMaster(null);
        setStreamingText("");
      }
    }
  };

  const isLoading = loadingMaster === activeMaster || (pending && activeMaster === "default" && !current);
  const displayText = isLoading && streamingText ? streamingText : null;

  return (
    <View style={{
      marginTop: 12,
      padding: 12,
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.dividerSoft,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Quote size={11} color={colors.accent} />
        <Kicker>Mentor's View · 导师点评</Kicker>
      </View>
      <MasterChips active={activeMaster} onSelect={handleSelect} />
      <View style={{ marginTop: 12, minHeight: 40 }}>
        {error ? (
          <Pressable onPress={() => handleSelect(activeMaster)}>
            <TMono style={{ color: colors.bad, fontSize: 11 }}>{error}</TMono>
          </Pressable>
        ) : displayText ? (
          <TSerif style={{ fontSize: 14, lineHeight: 22 }}>{displayText}</TSerif>
        ) : isLoading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={colors.inkFaint} />
            <TSerifItalic style={{ fontSize: 12 }}>{getMaster(activeMaster).zh}正在思考…</TSerifItalic>
          </View>
        ) : current ? (
          <>
            <TSerif style={{ fontSize: 14, lineHeight: 22 }} numberOfLines={6}>{current.text}</TSerif>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <Pressable onPress={() => setShowModal(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Maximize2 size={10} color={colors.inkMuted} />
                <TMono style={{ fontSize: 10, color: colors.inkMuted }}>全文查看</TMono>
              </Pressable>
              {onContinueInMentor && (
                <Pressable
                  onPress={() => onContinueInMentor(activeMaster, current.text)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
                >
                  <MessageCircle size={10} color={colors.accent} />
                  <TMono style={{ fontSize: 10, color: colors.accent }}>带入问道 ↗</TMono>
                </Pressable>
              )}
            </View>
            <FullFeedbackModal
              visible={showModal}
              text={current.text}
              masterName={getMaster(activeMaster).zh}
              onClose={() => setShowModal(false)}
              onContinueInMentor={onContinueInMentor
                ? () => onContinueInMentor(activeMaster, current.text)
                : null}
            />
          </>
        ) : (
          <Pressable onPress={() => handleSelect(activeMaster)}>
            <TSerifItalic style={{ fontSize: 12 }}>点击上方 {getMaster(activeMaster).zh} 以获取点评</TSerifItalic>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ========== Row divider ==========
export const HR = ({ soft }) => (
  <View style={{ height: 1, backgroundColor: soft ? colors.dividerSoft : colors.divider }} />
);

// ========== Page header (masthead) ==========
export function Masthead({ kicker, title, subtitle, right }) {
  return (
    <View style={{
      paddingHorizontal: 20, paddingTop: 28, paddingBottom: 18,
      borderBottomWidth: 2, borderBottomColor: colors.ink,
      backgroundColor: colors.bg,
    }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <Kicker style={{ fontSize: 9, letterSpacing: 3 }}>{kicker}</Kicker>
        {right && <View>{right}</View>}
      </View>
      <Text style={{
        fontFamily: fonts.serif, color: colors.ink,
        fontSize: 32, fontWeight: "500",
        letterSpacing: -0.8,
      }}>{title}</Text>
      {subtitle && <TSerifItalic style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</TSerifItalic>}
    </View>
  );
}

// ========== Back-and-cancel header row ==========
export function FormHeader({ title, onCancel }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <Pressable onPress={onCancel} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        <ChevronLeft size={14} color={colors.inkMuted} />
        <Text style={{ fontSize: 14, color: colors.inkMuted }}>取消</Text>
      </Pressable>
      <Kicker>{title}</Kicker>
    </View>
  );
}

// ========== Research: StatusBadge ==========
const STATUS_META = {
  buy_setup:   { label: "建仓机会", en: "Buy Setup",    bg: "#d4edda", text: "#2d5f3f" },
  watch:       { label: "观望",     en: "Watch",        bg: "#fff3cd", text: "#856404" },
  reduce_risk: { label: "降低风险", en: "Reduce Risk",  bg: "#fde8d0", text: "#8a4800" },
  avoid:       { label: "回避",     en: "Avoid",        bg: "#f8d7da", text: "#a03434" },
};

export function StatusBadge({ status, style }) {
  const meta = STATUS_META[status] || { label: status || "—", en: "", bg: "#e9e4d8", text: "#6b5a3f" };
  return (
    <View style={[{ backgroundColor: meta.bg, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" }, style]}>
      <Text style={{ fontFamily: fonts.monoMed, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: meta.text }}>
        {meta.label}{meta.en ? `  ${meta.en}` : ""}
      </Text>
    </View>
  );
}

// ========== Research: ConfidencePill ==========
const CONF_META = {
  high:   { label: "High",   color: "#2d5f3f" },
  medium: { label: "Medium", color: "#856404" },
  low:    { label: "Low",    color: "#6b5a3f" },
};

export function ConfidencePill({ level, style }) {
  const meta = CONF_META[level] || { label: level || "—", color: "#6b5a3f" };
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 4 }, style]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.color }} />
      <TMono style={{ fontSize: 10, color: meta.color }}>
        {meta.label} confidence
      </TMono>
    </View>
  );
}

// ========== Research: SourceCard ==========
// Shows one evidence source with data-tier badge and staleness indicator.
export function SourceCard({ source }) {
  const isStale = source.fetchedAt && (Date.now() - new Date(source.fetchedAt).getTime() > 30 * 24 * 3600 * 1000);
  return (
    <View style={{ backgroundColor: "#f0ebe0", borderRadius: 6, padding: 10, marginBottom: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <TMono style={{ fontSize: 10, color: colors.inkFaint }}>{source.provider || "Unknown"}</TMono>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {isStale && (
            <View style={{ backgroundColor: "#fde8d0", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 }}>
              <TMono style={{ fontSize: 9, color: "#8a4800" }}>STALE</TMono>
            </View>
          )}
          <View style={{ backgroundColor: "#e9e4d8", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 }}>
            <TMono style={{ fontSize: 9, color: colors.inkFaint }}>{source.tier || "Manual"}</TMono>
          </View>
        </View>
      </View>
      <TSerif style={{ fontSize: 12, color: colors.inkMuted }}>{source.description || source.url || "(no description)"}</TSerif>
      {source.fetchedAt && (
        <TMono style={{ fontSize: 9, marginTop: 3 }}>as of {new Date(source.fetchedAt).toLocaleDateString()}</TMono>
      )}
    </View>
  );
}

// ========== Research: DisclaimerBlock ==========
// Always-visible, pinned below memo content.
export function DisclaimerBlock({ flags }) {
  const staleWarning = flags?.stale ? " Data may be stale or cached." : "";
  const missingItems = (flags?.missing_data || []).join(", ");
  const tierNote = flags?.data_tier ? ` Data: ${flags.data_tier}.` : "";
  return (
    <View style={{ backgroundColor: "#f0ebe0", borderRadius: 6, padding: 12, marginTop: 16, borderLeftWidth: 3, borderLeftColor: colors.gold }}>
      <TMono style={{ fontSize: 10, letterSpacing: 0.5, color: colors.inkMuted, lineHeight: 16 }}>
        {"DECISION SUPPORT · NOT INVESTMENT ADVICE\n"}
        {`This memo reflects conditional analysis, not a recommendation to buy or sell.${tierNote}${staleWarning}`}
        {missingItems ? `\nMissing data: ${missingItems}` : ""}
        {"\nReview all assumptions before acting. Conditions may have changed."}
      </TMono>
    </View>
  );
}

// ========== Master picker bottom sheet (shared across screens) ==========
export function MasterPickerModal({ visible, onClose, onSelect, subtitle }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose} />
      <View style={{
        backgroundColor: colors.bg,
        paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36,
        borderTopWidth: 1, borderTopColor: colors.divider,
      }}>
        <TSerifBold style={{ fontSize: 18, marginBottom: 4 }}>选择导师</TSerifBold>
        <TSerifItalic style={{ fontSize: 12, marginBottom: 16 }}>
          {subtitle || "以哪位大师的视角分析？"}
        </TSerifItalic>
        {MASTERS.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => onSelect(m.id)}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: colors.dividerSoft,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <TSerifBold style={{ fontSize: 15 }}>{m.zh}</TSerifBold>
            <TMono style={{ fontSize: 11, color: colors.inkMuted }}>{m.desc}</TMono>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}
