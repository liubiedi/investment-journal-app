// components.js — shared UI primitives matching the editorial aesthetic.

import React, { useState, useRef } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView, ActivityIndicator,
  StyleSheet,
} from "react-native";
import {
  Pin, Edit2, Plus, X, Check, Loader2, Mic, MicOff, Quote, Trash2, ChevronLeft, MessageCircle,
} from "lucide-react-native";
import { colors, fonts, spacing } from "./theme";
import { MASTERS, getMaster } from "./constants";
import { useSpeech } from "./voice";
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
export function FeedbackBlock({ feedback, onRequestMaster, pending = false, defaultMaster = "default", onContinueInMentor }) {
  const [activeMaster, setActiveMaster] = useState(feedback?.[0]?.masterId || defaultMaster);
  const [loadingMaster, setLoadingMaster] = useState(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState(null);
  // Local cache so text is visible immediately after generation even before the
  // feedback prop re-renders (the finallyblock cleared streamingText too early).
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
            <TSerif style={{ fontSize: 14, lineHeight: 22 }}>{current.text}</TSerif>
            {onContinueInMentor && (
              <Pressable
                onPress={() => onContinueInMentor(activeMaster, current.text)}
                style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <MessageCircle size={10} color={colors.accent} />
                <TMono style={{ fontSize: 10, color: colors.accent }}>带入问道继续讨论 ↗</TMono>
              </Pressable>
            )}
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

// ========== Voice mic button — small inline version ==========
export function VoiceMic({ currentText, onChange, size = 32 }) {
  const { listening, supported, start, stop } = useSpeech(onChange);
  if (!supported) return null;
  const Icon = listening ? MicOff : Mic;
  return (
    <Pressable
      onPress={() => listening ? stop() : start(currentText || "")}
      style={({ pressed }) => ({
        width: size, height: size,
        alignItems: "center", justifyContent: "center",
        backgroundColor: listening ? colors.bad : "transparent",
        borderWidth: listening ? 0 : 1,
        borderColor: colors.divider,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon size={14} color={listening ? colors.bg : colors.inkMuted} />
    </Pressable>
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
