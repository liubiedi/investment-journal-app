// Settings screen â€” API key, voice hint, export, about, danger zone
import React, { useState, useEffect } from "react";
import { View, ScrollView, Pressable, Alert, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Key, Mic, Download, Info, Trash2, ExternalLink, Check, Loader2, FileText, BookMarked,
} from "lucide-react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { colors, fonts } from "../theme";
import { useApp } from "../context";
import { getApiKey, setApiKey, clearApiKey, generateStrategyReport } from "../api";
import * as db from "../db";
import { exportToObsidianVault } from "../markdown-export";

import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  Section, PaperInput, FilledButton, OutlineButton, Masthead,
} from "../components";

export default function SettingsScreen() {
  const app = useApp();
  const insets = useSafeAreaInsets();

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [hasKey, setHasKey] = useState(app.apiKeyPresent);

  const [exportingVault, setExportingVault] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [exportResult, setExportResult] = useState("");

  // Strategy report
  const [strategyReport, setStrategyReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    (async () => {
      const key = await getApiKey();
      setHasKey(!!key);
    })();
  }, []);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await setApiKey(apiKeyInput.trim());
      setHasKey(true);
      setApiKeyInput("");
      setKeySaved(true);
      app.setApiKeyPresent(true);
      setTimeout(() => setKeySaved(false), 2000);
    } catch {
      // Silently fail; user will retry
    } finally {
      setSavingKey(false);
    }
  };

  const handleClearKey = async () => {
    Alert.alert("æ¸…é™¤ API Key", "ç¡®å®šè¦åˆ é™¤å·²ä¿å­˜çš„ Anthropic API key å—ï¼Ÿ", [
      { text: "å–æ¶ˆ", style: "cancel" },
      {
        text: "æ¸…é™¤", style: "destructive",
        onPress: async () => {
          await clearApiKey();
          setHasKey(false);
          app.setApiKeyPresent(false);
        },
      },
    ]);
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true); setReportError("");
    try {
      const report = await generateStrategyReport(app.profile);
      setStrategyReport(report);
    } catch (e) {
      setReportError(e.message === "NO_API_KEY" ? "è¯·å…ˆé…ç½® API key" : "ç”Ÿæˆå¤±è´¥ï¼š" + (e.message || String(e)));
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleExportVault = async () => {
    setExportingVault(true); setExportResult("");
    try {
      const result = await exportToObsidianVault(app.profile, strategyReport);
      setExportResult(`âœ“ å·²ç”Ÿæˆ ${result.fileCount} ä¸ªæ–‡ä»¶${strategyReport ? "ï¼ˆå«ç­–ç•¥æŠ¥å‘Šï¼‰" : ""}`);
    } catch (e) {
      setExportResult("å¯¼å‡ºå¤±è´¥ï¼š" + (e.message || String(e)));
    } finally {
      setExportingVault(false);
    }
  };

  const handleExportJson = async () => {
    setExportingJson(true); setExportResult("");
    try {
      const data = await db.exportAll();
      const json = JSON.stringify(data, null, 2);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `${FileSystem.cacheDirectory}investment-journal-${stamp}.json`;
      await FileSystem.writeAsStringAsync(filename, json, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filename, {
          mimeType: "application/json",
          dialogTitle: "JSON æ•°æ®å¤‡ä»½",
        });
        setExportResult("âœ“ JSON å¤‡ä»½å·²åˆ†äº«");
      } else {
        setExportResult(`å·²å¯¼å‡ºåˆ° ${filename}`);
      }
    } catch (e) {
      setExportResult("å¯¼å‡ºå¤±è´¥ï¼š" + (e.message || String(e)));
    } finally {
      setExportingJson(false);
    }
  };

  const handleClearChat = () => {
    Alert.alert("æ¸…ç©ºèŠå¤©è®°å½•", "å°†åˆ é™¤ä¸Žå¯¼å¸ˆçš„å…¨éƒ¨å¯¹è¯è®°å½•ã€‚æ­¤æ“ä½œä¸å¯æ¢å¤ã€‚", [
      { text: "å–æ¶ˆ", style: "cancel" },
      { text: "æ¸…ç©º", style: "destructive", onPress: async () => { await db.clearChat(); } },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead kicker="SETTINGS" title="è®¾ç½®" subtitle="é…ç½® Â· å¯¼å‡º Â· å…³äºŽ" />

      {/* API Key */}
      <Section label="Anthropic API Key" sub="AI å¯¼å¸ˆåŠŸèƒ½æ‰€éœ€">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <View style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: hasKey ? colors.good : colors.bad,
          }} />
          <TSerif style={{ fontSize: 13 }}>
            {hasKey ? "å·²é…ç½®" : "æœªé…ç½®"}
          </TSerif>
        </View>

        <PaperInput
          value={apiKeyInput}
          onChangeText={setApiKeyInput}
          placeholder={hasKey ? "ç²˜è´´æ–° key ä»¥æ›¿æ¢çŽ°æœ‰çš„â€¦" : "sk-ant-api03-â€¦"}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={{ fontFamily: fonts.mono, fontSize: 13 }}
        />

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {hasKey && (
            <OutlineButton onPress={handleClearKey}>æ¸…é™¤</OutlineButton>
          )}
          <FilledButton
            onPress={handleSaveKey}
            disabled={!apiKeyInput.trim() || savingKey}
            loading={savingKey}
            style={{ flex: 1 }}
          >
            {keySaved ? (
              <>
                <Check size={14} color={colors.bg} strokeWidth={3} />
                <TSerifBold style={{ color: colors.bg, fontSize: 15 }}>å·²ä¿å­˜</TSerifBold>
              </>
            ) : (
              <TSerifBold style={{ color: colors.bg, fontSize: 15 }}>ä¿å­˜ API Key</TSerifBold>
            )}
          </FilledButton>
        </View>

        <Pressable onPress={() => Linking.openURL("https://console.anthropic.com/settings/keys")}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 }}>
          <ExternalLink size={11} color={colors.inkMuted} />
          <TMono style={{ fontSize: 11 }}>å‰å¾€ Anthropic æŽ§åˆ¶å°èŽ·å– key</TMono>
        </Pressable>
      </Section>

      {/* Voice Input */}
      <Section label="è¯­éŸ³è¾“å…¥ Â· Voice Input" sub="ç³»ç»Ÿçº§æ–¹æ¡ˆ">
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Mic size={16} color={colors.inkMuted} style={{ marginTop: 3 }} />
          <View style={{ flex: 1 }}>
            <TSerif style={{ fontSize: 14, lineHeight: 22 }}>
              ä¸ºèŽ·å¾—æ›´å¥½çš„ä¸­æ–‡è¯­éŸ³è¯†åˆ«ï¼Œå»ºè®®å®‰è£… <TSerifBold style={{ fontSize: 14 }}>è®¯é£žè¾“å…¥æ³•</TSerifBold> æˆ–æœç‹—è¾“å…¥æ³•ã€‚
            </TSerif>
            <TSerif style={{ fontSize: 13, lineHeight: 20, marginTop: 6, color: colors.inkMuted }}>
              â€¢ åœ¨ä»»æ„è¾“å…¥æ¡†ä¸­ï¼Œç‚¹å‡»é”®ç›˜ä¸Šçš„éº¦å…‹é£ŽæŒ‰é’®å³å¯è¯­éŸ³è¾“å…¥ï¼ˆè¯†åˆ«å‡†ç¡®åº¦ç”±è¾“å…¥æ³•å†³å®šï¼‰{"\n"}
              â€¢ æˆ–ç‚¹å‡» App å†…çš„éº¦å…‹é£Žå›¾æ ‡ <Mic size={11} color={colors.inkMuted} /> å¿«æ·å½•å…¥ï¼ˆè°ƒç”¨ç³»ç»Ÿé»˜è®¤è¯­éŸ³è¯†åˆ«ï¼‰
            </TSerif>
          </View>
        </View>

        <Pressable
          onPress={() => Linking.openURL("https://play.google.com/store/search?q=è®¯é£žè¾“å…¥æ³•&c=apps")}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 }}>
          <ExternalLink size={11} color={colors.inkMuted} />
          <TMono style={{ fontSize: 11 }}>Play Store æœç´¢"è®¯é£žè¾“å…¥æ³•"</TMono>
        </Pressable>
      </Section>

      {/* Strategy Report */}
      <Section label="æŠ•èµ„ç­–ç•¥æŠ¥å‘Š Â· Strategy Profile" sub="AI åˆ†æžä½ çš„å®Œæ•´æ—¥å¿—">
        <TSerif style={{ fontSize: 13, lineHeight: 22, color: colors.inkSoft, marginBottom: 12 }}>
          åŸºäºŽä½ çš„å…¨éƒ¨äº¤æ˜“è®°å½•ã€æœˆè¯„ã€å‘¨è®°ã€è§„åˆ™ï¼ŒAI ä¼šç”Ÿæˆä¸€ä»½è¯šå®žçš„ã€ŠæŠ•èµ„ç­–ç•¥ç”»åƒã€‹â€”â€”
          å†™æ˜Žä½ å®žé™…åœ¨åšä»€ä¹ˆã€æƒ…ç»ªå¦‚ä½•å½±å“å†³ç­–ã€è§„åˆ™æ‰§è¡Œæƒ…å†µã€æ ¸å¿ƒç›²ç‚¹ï¼Œä»¥åŠæŽ¥ä¸‹æ¥ 6 ä¸ªæœˆçš„æ”¹è¿›é‡ç‚¹ã€‚
        </TSerif>

        {/* Minimum data warning */}
        {app.trades.length < 5 && (
          <View style={{ padding: 10, marginBottom: 12, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.divider }}>
            <TSerifItalic style={{ fontSize: 12, color: colors.inkMuted }}>
              è‡³å°‘è®°å½• 5 ç¬”äº¤æ˜“åŽï¼Œç­–ç•¥æŠ¥å‘Šæ‰æœ‰æ„ä¹‰ã€‚ç›®å‰æœ‰ {app.trades.length} ç¬”ã€‚
            </TSerifItalic>
          </View>
        )}

        {/* Generated report preview */}
        {strategyReport && (
          <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.good }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Check size={12} color={colors.good} strokeWidth={3} />
              <Kicker color={colors.good}>æŠ¥å‘Šå·²ç”Ÿæˆ Â· READY</Kicker>
            </View>
            {/* Show first ~300 chars as preview */}
            <TSerif style={{ fontSize: 12, lineHeight: 20, color: colors.inkSoft }}>
              {strategyReport.slice(0, 280).replace(/^---[\s\S]*?---\n*/, "")}â€¦
            </TSerif>
            <TSerifItalic style={{ fontSize: 11, marginTop: 8, color: colors.inkMuted }}>
              å¯¼å‡º Vault æ—¶æŠ¥å‘Šä¼šè‡ªåŠ¨åŒ…å«åœ¨ _Strategy/ æ–‡ä»¶å¤¹å†…ã€‚
            </TSerifItalic>
          </View>
        )}

        {reportError ? (
          <TMono style={{ color: colors.bad, fontSize: 11, marginBottom: 10 }}>{reportError}</TMono>
        ) : null}

        <FilledButton
          onPress={handleGenerateReport}
          disabled={generatingReport || app.trades.length === 0}
          loading={generatingReport}
        >
          <TSerifBold style={{ color: colors.bg, fontSize: 14 }}>
            {generatingReport
              ? "AI åˆ†æžä¸­â€¦ï¼ˆçº¦ 30-60 ç§’ï¼‰"
              : strategyReport
              ? "é‡æ–°ç”ŸæˆæŠ¥å‘Š"
              : "ç”Ÿæˆæˆ‘çš„æŠ•èµ„ç­–ç•¥æŠ¥å‘Š"}
          </TSerifBold>
        </FilledButton>
        <TSerifItalic style={{ fontSize: 11, marginTop: 8, color: colors.inkMuted }}>
          çº¦ $0.05-0.10 / æ¬¡ã€‚è¯»å–å…¨é‡æ—¥å¿—ï¼Œç”Ÿæˆç»“æž„åŒ– Markdown æŠ¥å‘Šã€‚
        </TSerifItalic>
      </Section>

      {/* Data Export */}
      <Section label="å¯¼å‡º Â· Export" sub="å¤‡ä»½ä¸Žå¤–éƒ¨åˆ†æž">
        {/* Markdown Vault â€” primary, recommended */}
        <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.accent }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <BookMarked size={13} color={colors.accent} />
            <Kicker color={colors.accent}>OBSIDIAN VAULT Â· æŽ¨è</Kicker>
          </View>
          <TSerifBold style={{ fontSize: 14, marginBottom: 6 }}>å¯¼å‡ºä¸º Markdown æ–‡ä»¶å¤¹</TSerifBold>
          <TSerif style={{ fontSize: 12, lineHeight: 20, color: colors.inkSoft, marginBottom: 12 }}>
            ç”Ÿæˆç»“æž„åŒ– Markdown æ–‡ä»¶åŒ…ï¼ˆzipï¼‰ã€‚æ¯ç¬”äº¤æ˜“ã€å¿ƒå¿µã€æœˆè¯„ç‹¬ç«‹æˆæ–‡ä»¶ï¼Œå« YAML å…ƒæ•°æ®å’ŒåŒå‘é“¾æŽ¥ï¼Œå¯ç›´æŽ¥ç”¨ <TSerifBold style={{ fontSize: 12 }}>Obsidian</TSerifBold> æ‰“å¼€ã€‚
            é€‚åˆé•¿æœŸå½’æ¡£ã€AI é˜…è¯»ã€è·¨å¹´åº¦ç­–ç•¥æç‚¼ã€‚
          </TSerif>
          <FilledButton onPress={handleExportVault} disabled={exportingVault} loading={exportingVault}>
            <BookMarked size={14} color={colors.bg} />
            <TSerifBold style={{ color: colors.bg, fontSize: 14 }}>
              {exportingVault ? "æ­£åœ¨ç”Ÿæˆâ€¦" : "å¯¼å‡º Vault â†’ ä¿å­˜åˆ° Google Drive ç­‰"}
            </TSerifBold>
          </FilledButton>
          <TSerifItalic style={{ fontSize: 11, marginTop: 8, color: colors.inkMuted }}>
            App æ²™ç›’é‡Œçš„æ•°æ®ä¿ç•™ä¸å˜ï¼Œå¯¼å‡ºçš„ zip ç”±ä½ ä¿å­˜åˆ°ä»»æ„ä½ç½®ã€‚
          </TSerifItalic>
        </View>

        {/* JSON full backup â€” secondary */}
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <FileText size={12} color={colors.inkMuted} />
            <Kicker>JSON BACKUP Â· å®Œæ•´å¤‡ä»½</Kicker>
          </View>
          <TSerifItalic style={{ fontSize: 11, marginBottom: 8 }}>
            åŽŸå§‹æ•°æ®åº“ JSONï¼Œç”¨äºŽæ¢è®¾å¤‡æ—¶æ¢å¤ã€‚åŒ…å«æ‰€æœ‰å­—æ®µå’Œç¼“å­˜çš„å¯¼å¸ˆç‚¹è¯„ã€‚
          </TSerifItalic>
          <OutlineButton onPress={handleExportJson} disabled={exportingJson}>
            {exportingJson ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Loader2 size={12} color={colors.ink} />
                <TSerif style={{ fontSize: 13, color: colors.ink }}>å¯¼å‡ºä¸­â€¦</TSerif>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Download size={12} color={colors.ink} />
                <TSerif style={{ fontSize: 13, color: colors.ink }}>å¯¼å‡º JSON å¤‡ä»½</TSerif>
              </View>
            )}
          </OutlineButton>
        </View>

        {exportResult ? (
          <TMono style={{
            fontSize: 11, marginTop: 12, lineHeight: 18,
            color: exportResult.includes("å¤±è´¥") ? colors.bad : colors.good,
          }}>
            {exportResult}
          </TMono>
        ) : null}
      </Section>

      {/* About */}
      <Section label="About Â· å…³äºŽ" sub="éšç§ä¸Žæˆæœ¬">
        <TSerifBold style={{ fontSize: 14, marginBottom: 6 }}>æŠ•èµ„æ—¥å¿— v1.0</TSerifBold>
        <TSerif style={{ fontSize: 13, lineHeight: 22, color: colors.inkSoft }}>
          Token ä½¿ç”¨ç»æµŽï¼šHaiku è´Ÿè´£ç»“æž„åŒ–è§£æžï¼ŒSonnet è´Ÿè´£å¯¼å¸ˆç‚¹è¯„ã€‚é€šè¿‡ prompt caching å¤ç”¨æŠ•èµ„æ¡£æ¡ˆä¸Šä¸‹æ–‡ã€‚æœˆä½¿ç”¨æˆæœ¬é€šå¸¸ $1-3ã€‚
        </TSerif>
        <View style={{ marginTop: 14, padding: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.dividerSoft }}>
          <Kicker style={{ marginBottom: 6 }}>PRIVACY Â· éšç§</Kicker>
          <TSerif style={{ fontSize: 12, lineHeight: 20, color: colors.inkSoft }}>
            â€¢ æ‰€æœ‰æ—¥å¿—æ•°æ®æœ¬åœ° SQLite å­˜å‚¨ï¼Œä¸ä¸Šä¼ ä»»ä½•æœåŠ¡å™¨{"\n"}
            â€¢ Anthropic ä»…åœ¨ä½ æ±‚æ•™å¯¼å¸ˆæ—¶æ”¶åˆ°ç›¸å…³æ¡£æ¡ˆç‰‡æ®µ{"\n"}
            â€¢ Yahoo Finance ä»…æ”¶åˆ°ä½ æŒä»“çš„ ticker ä»£ç {"\n"}
            â€¢ è¯­éŸ³ç»ç”± Android è¾“å…¥æ³•å¤„ç†ï¼Œä¸ç»è¿‡æœ¬ App
          </TSerif>
        </View>
      </Section>

      {/* Danger zone */}
      <Section label="Danger Zone" sub="ä¸å¯æ¢å¤çš„æ“ä½œ">
        <Pressable
          onPress={handleClearChat}
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            paddingVertical: 12,
            borderWidth: 1, borderColor: colors.bad,
          }}>
          <Trash2 size={13} color={colors.bad} />
          <TSerifBold style={{ fontSize: 13, color: colors.bad }}>æ¸…ç©ºä¸Žå¯¼å¸ˆçš„èŠå¤©è®°å½•</TSerifBold>
        </Pressable>
      </Section>
    </ScrollView>
  );
}
