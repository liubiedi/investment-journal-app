// Settings screen — API key, voice hint, export, about, danger zone
import React, { useState, useEffect } from "react";
import { View, ScrollView, Pressable, Alert, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Key, Mic, Download, Info, Trash2, ExternalLink, Check, Loader2, FileText, BookMarked,
} from "lucide-react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import { colors, fonts } from "../theme";
import { useApp } from "../../App";
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
    Alert.alert("清除 API Key", "确定要删除已保存的 DeepSeek API key 吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "清除", style: "destructive",
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
      setReportError(e.message === "NO_API_KEY" ? "请先配置 API key" : "生成失败：" + (e.message || String(e)));
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleExportVault = async () => {
    setExportingVault(true); setExportResult("");
    try {
      const result = await exportToObsidianVault(app.profile, strategyReport);
      setExportResult(`✓ 已生成 ${result.fileCount} 个文件${strategyReport ? "（含策略报告）" : ""}`);
    } catch (e) {
      setExportResult("导出失败：" + (e.message || String(e)));
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
          dialogTitle: "JSON 数据备份",
        });
        setExportResult("✓ JSON 备份已分享");
      } else {
        setExportResult(`已导出到 ${filename}`);
      }
    } catch (e) {
      setExportResult("导出失败：" + (e.message || String(e)));
    } finally {
      setExportingJson(false);
    }
  };

  const handleClearChat = () => {
    Alert.alert("清空聊天记录", "将删除与导师的全部对话记录。此操作不可恢复。", [
      { text: "取消", style: "cancel" },
      { text: "清空", style: "destructive", onPress: async () => { await db.clearChat(); } },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead kicker="SETTINGS" title="设置" subtitle="配置 · 导出 · 关于" />

      {/* API Key */}
      <Section label="DeepSeek API Key" sub="AI 导师功能所需">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <View style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: hasKey ? colors.good : colors.bad,
          }} />
          <TSerif style={{ fontSize: 13 }}>
            {hasKey ? "已配置" : "未配置"}
          </TSerif>
        </View>

        <PaperInput
          value={apiKeyInput}
          onChangeText={setApiKeyInput}
          placeholder={hasKey ? "粘贴新 key 以替换现有的…" : "sk-…"}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={{ fontFamily: fonts.mono, fontSize: 13 }}
        />

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {hasKey && (
            <OutlineButton onPress={handleClearKey}>清除</OutlineButton>
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
                <TSerifBold style={{ color: colors.bg, fontSize: 15 }}>已保存</TSerifBold>
              </>
            ) : (
              <TSerifBold style={{ color: colors.bg, fontSize: 15 }}>保存 API Key</TSerifBold>
            )}
          </FilledButton>
        </View>

        <Pressable onPress={() => Linking.openURL("https://platform.deepseek.com/api_keys")}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 }}>
          <ExternalLink size={11} color={colors.inkMuted} />
          <TMono style={{ fontSize: 11 }}>前往 DeepSeek 平台获取 key</TMono>
        </Pressable>
      </Section>

      {/* Voice Input */}
      <Section label="语音输入 · Voice Input" sub="系统级方案">
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Mic size={16} color={colors.inkMuted} style={{ marginTop: 3 }} />
          <View style={{ flex: 1 }}>
            <TSerif style={{ fontSize: 14, lineHeight: 22 }}>
              为获得更好的中文语音识别，建议安装 <TSerifBold style={{ fontSize: 14 }}>讯飞输入法</TSerifBold> 或搜狗输入法。
            </TSerif>
            <TSerif style={{ fontSize: 13, lineHeight: 20, marginTop: 6, color: colors.inkMuted }}>
              • 在任意输入框中，点击键盘上的麦克风按钮即可语音输入（识别准确度由输入法决定）{"\n"}
              • 或点击 App 内的麦克风图标 <Mic size={11} color={colors.inkMuted} /> 快捷录入（调用系统默认语音识别）
            </TSerif>
          </View>
        </View>

        <Pressable
          onPress={() => Linking.openURL("https://play.google.com/store/search?q=讯飞输入法&c=apps")}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 }}>
          <ExternalLink size={11} color={colors.inkMuted} />
          <TMono style={{ fontSize: 11 }}>Play Store 搜索"讯飞输入法"</TMono>
        </Pressable>
      </Section>

      {/* Strategy Report */}
      <Section label="投资策略报告 · Strategy Profile" sub="AI 分析你的完整日志">
        <TSerif style={{ fontSize: 13, lineHeight: 22, color: colors.inkSoft, marginBottom: 12 }}>
          基于你的全部交易记录、月评、周记、规则，AI 会生成一份诚实的《投资策略画像》——
          写明你实际在做什么、情绪如何影响决策、规则执行情况、核心盲点，以及接下来 6 个月的改进重点。
        </TSerif>

        {/* Minimum data warning */}
        {app.trades.length < 5 && (
          <View style={{ padding: 10, marginBottom: 12, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.divider }}>
            <TSerifItalic style={{ fontSize: 12, color: colors.inkMuted }}>
              至少记录 5 笔交易后，策略报告才有意义。目前有 {app.trades.length} 笔。
            </TSerifItalic>
          </View>
        )}

        {/* Generated report preview */}
        {strategyReport && (
          <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.good }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Check size={12} color={colors.good} strokeWidth={3} />
              <Kicker color={colors.good}>报告已生成 · READY</Kicker>
            </View>
            {/* Show first ~300 chars as preview */}
            <TSerif style={{ fontSize: 12, lineHeight: 20, color: colors.inkSoft }}>
              {strategyReport.slice(0, 280).replace(/^---[\s\S]*?---\n*/, "")}…
            </TSerif>
            <TSerifItalic style={{ fontSize: 11, marginTop: 8, color: colors.inkMuted }}>
              导出 Vault 时报告会自动包含在 _Strategy/ 文件夹内。
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
              ? "AI 分析中…（约 30-60 秒）"
              : strategyReport
              ? "重新生成报告"
              : "生成我的投资策略报告"}
          </TSerifBold>
        </FilledButton>
        <TSerifItalic style={{ fontSize: 11, marginTop: 8, color: colors.inkMuted }}>
          约 $0.05-0.10 / 次。读取全量日志，生成结构化 Markdown 报告。
        </TSerifItalic>
      </Section>

      {/* Data Export */}
      <Section label="导出 · Export" sub="备份与外部分析">
        {/* Markdown Vault — primary, recommended */}
        <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.accent }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <BookMarked size={13} color={colors.accent} />
            <Kicker color={colors.accent}>OBSIDIAN VAULT · 推荐</Kicker>
          </View>
          <TSerifBold style={{ fontSize: 14, marginBottom: 6 }}>导出为 Markdown 文件夹</TSerifBold>
          <TSerif style={{ fontSize: 12, lineHeight: 20, color: colors.inkSoft, marginBottom: 12 }}>
            生成结构化 Markdown 文件包（zip）。每笔交易、心念、月评独立成文件，含 YAML 元数据和双向链接，可直接用 <TSerifBold style={{ fontSize: 12 }}>Obsidian</TSerifBold> 打开。
            适合长期归档、AI 阅读、跨年度策略提炼。
          </TSerif>
          <FilledButton onPress={handleExportVault} disabled={exportingVault} loading={exportingVault}>
            <BookMarked size={14} color={colors.bg} />
            <TSerifBold style={{ color: colors.bg, fontSize: 14 }}>
              {exportingVault ? "正在生成…" : "导出 Vault → 保存到 Google Drive 等"}
            </TSerifBold>
          </FilledButton>
          <TSerifItalic style={{ fontSize: 11, marginTop: 8, color: colors.inkMuted }}>
            App 沙盒里的数据保留不变，导出的 zip 由你保存到任意位置。
          </TSerifItalic>
        </View>

        {/* JSON full backup — secondary */}
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <FileText size={12} color={colors.inkMuted} />
            <Kicker>JSON BACKUP · 完整备份</Kicker>
          </View>
          <TSerifItalic style={{ fontSize: 11, marginBottom: 8 }}>
            原始数据库 JSON，用于换设备时恢复。包含所有字段和缓存的导师点评。
          </TSerifItalic>
          <OutlineButton onPress={handleExportJson} disabled={exportingJson}>
            {exportingJson ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Loader2 size={12} color={colors.ink} />
                <TSerif style={{ fontSize: 13, color: colors.ink }}>导出中…</TSerif>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Download size={12} color={colors.ink} />
                <TSerif style={{ fontSize: 13, color: colors.ink }}>导出 JSON 备份</TSerif>
              </View>
            )}
          </OutlineButton>
        </View>

        {exportResult ? (
          <TMono style={{
            fontSize: 11, marginTop: 12, lineHeight: 18,
            color: exportResult.includes("失败") ? colors.bad : colors.good,
          }}>
            {exportResult}
          </TMono>
        ) : null}
      </Section>

      {/* About */}
      <Section label="About · 关于" sub="隐私与成本">
        <TSerifBold style={{ fontSize: 14, marginBottom: 6 }}>投资日志 v1.0</TSerifBold>
        <TSerif style={{ fontSize: 13, lineHeight: 22, color: colors.inkSoft }}>
          Token 使用经济：deepseek-chat 负责结构化解析，deepseek-v4-pro 负责导师点评。DeepSeek 服务端自动复用前缀缓存。月使用成本通常 $1-3。
        </TSerif>
        <View style={{ marginTop: 14, padding: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.dividerSoft }}>
          <Kicker style={{ marginBottom: 6 }}>PRIVACY · 隐私</Kicker>
          <TSerif style={{ fontSize: 12, lineHeight: 20, color: colors.inkSoft }}>
            • 所有日志数据本地 SQLite 存储，不上传任何服务器{"\n"}
            • DeepSeek 仅在你求教导师时收到相关档案片段{"\n"}
            • Yahoo Finance 仅收到你持仓的 ticker 代码{"\n"}
            • 语音经由 Android 输入法处理，不经过本 App
          </TSerif>
        </View>
      </Section>

      {/* Danger zone */}
      <Section label="Danger Zone" sub="不可恢复的操作">
        <Pressable
          onPress={handleClearChat}
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            paddingVertical: 12,
            borderWidth: 1, borderColor: colors.bad,
          }}>
          <Trash2 size={13} color={colors.bad} />
          <TSerifBold style={{ fontSize: 13, color: colors.bad }}>清空与导师的聊天记录</TSerifBold>
        </Pressable>
      </Section>
    </ScrollView>
  );
}
