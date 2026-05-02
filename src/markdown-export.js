// markdown-export.js
// Serializes all journal data into an Obsidian-friendly Markdown vault structure,
// then packages it as a zip the user can save anywhere (Google Drive, etc).
//
// Vault structure produced:
//   Investment Journal/
//     _Foundations/
//       Philosophy.md
//       Rules.md
//     _Strategy/
//       StrategyReport-YYYY-MM-DD.md   ← AI-generated, optional
//     Trades/         (one file per trade)
//     Thoughts/       (one file per thought)
//     Weekly/         (one file per week)
//     Monthly/        (one file per month, with mentor commentaries)
//     Holdings/
//       Snapshot.md
//     _Index.md
//
// Each file has YAML front-matter so Obsidian's Dataview plugin can query it.

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { zip } from "react-native-zip-archive";

import * as db from "./db";
import { getMaster } from "./constants";
import { fmtDate, monthKey, monthLabel, weekKey, weekRange } from "./utils";

// ============================================================
// Helpers
// ============================================================

// Sanitize a string for use in a filename. Keeps Chinese characters,
// strips OS-illegal chars (/ \ : * ? " < > |) and trims length.
const safeName = (s, maxLen = 60) => {
  if (!s) return "untitled";
  return s
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
};

const yyyy = (iso) => new Date(iso).getFullYear();
const yyyyMmDd = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// YAML-quote a value (handle strings with special chars by wrapping in quotes)
const yamlVal = (v) => {
  if (v === null || v === undefined) return '""';
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (/[:#\n"'\[\]{}|>%@`]/.test(s) || s.startsWith(" ") || s.endsWith(" ")) {
    // Escape inner quotes and wrap
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
};

const yamlList = (arr) => {
  if (!arr || arr.length === 0) return "[]";
  return "[" + arr.map(yamlVal).join(", ") + "]";
};

// Front-matter block builder
const fm = (obj) => {
  const lines = ["---"];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) lines.push(`${k}: ${yamlList(v)}`);
    else lines.push(`${k}: ${yamlVal(v)}`);
  }
  lines.push("---");
  return lines.join("\n");
};

// Convert a feedback array into markdown sections
const renderFeedback = (feedbackArr) => {
  if (!feedbackArr || feedbackArr.length === 0) return "";
  const parts = ["## 导师点评 · Mentor Views\n"];
  for (const f of feedbackArr) {
    const master = getMaster(f.masterId);
    const when = f.createdAt ? new Date(f.createdAt).toISOString().slice(0, 10) : "";
    parts.push(`### ${master.zh}${when ? `  · ${when}` : ""}\n`);
    parts.push(f.text || "");
    parts.push("");
  }
  return parts.join("\n");
};

// ============================================================
// Per-section file generators
// ============================================================

function buildPhilosophyFile(philosophy) {
  return [
    fm({ type: "philosophy", tags: ["foundation"] }),
    "",
    "# 投资哲学 · Investment Philosophy",
    "",
    philosophy?.trim()
      ? `> "${philosophy.trim()}"`
      : "*尚未定义。返回 App → Home 写下你的一句话信条。*",
    "",
    "---",
    "",
    "*Update annually. This is your North Star.*",
    "",
  ].join("\n");
}

function buildRulesFile(rules) {
  const body = (rules || []).map((r, i) => `${i + 1}. ${r}`).join("\n");
  return [
    fm({ type: "rules", count: (rules || []).length, tags: ["foundation"] }),
    "",
    "# 我的规则 · My Rules",
    "",
    body || "*尚未定义。*",
    "",
    "---",
    "",
    "*Maximum 5. Each trade should be checkable against this list.*",
    "",
  ].join("\n");
}

function buildTradeFile(trade) {
  const date = yyyyMmDd(trade.date);
  const action = (trade.action || "").toUpperCase();
  const tags = [
    "trade",
    trade.action,
    trade.stock,
    `emotion/${trade.emotion}`,
  ].filter(Boolean);

  const rulesSection = trade.rulesChecked && trade.rulesChecked.length > 0
    ? `## 规则自检 · Rules Checked\n\n${trade.rulesChecked.map(r => `- [x] ${r}`).join("\n")}\n`
    : "";

  const rawSection = trade.rawInput
    ? `## 原始输入 · Original Input\n\n> ${trade.rawInput.replace(/\n/g, "\n> ")}\n`
    : "";

  return [
    fm({
      type: "trade",
      date,
      action: trade.action,
      ticker: trade.stock,
      emotion: trade.emotion,
      tags,
    }),
    "",
    `# ${date} · ${action} [[${trade.stock}]]`,
    "",
    `**情绪 · Emotion:** ${trade.emotion}`,
    "",
    "## 理由 · Reasoning",
    "",
    trade.reason || "*(none)*",
    "",
    rulesSection,
    rawSection,
    renderFeedback(trade.feedback),
  ].filter(Boolean).join("\n");
}

function buildThoughtFile(thought) {
  const date = yyyyMmDd(thought.date);
  // Make a short subject from the first line of content
  const firstLine = (thought.content || "").split("\n")[0].slice(0, 30);

  return [
    fm({
      type: "thought",
      date,
      tags: ["thought", "dilemma"],
    }),
    "",
    `# ${date} · ${firstLine}`,
    "",
    "## 心念 · Thought",
    "",
    thought.content || "",
    "",
    renderFeedback(thought.feedback),
  ].filter(Boolean).join("\n");
}

function buildWeeklyFile(weekKeyStr, text) {
  return [
    fm({
      type: "weekly",
      week: weekKeyStr,
      range: weekRange(weekKeyStr),
      tags: ["weekly"],
    }),
    "",
    `# ${weekKeyStr} · 周记`,
    "",
    `**Range:** ${weekRange(weekKeyStr)}`,
    "",
    text || "*(empty)*",
    "",
  ].join("\n");
}

async function buildMonthlyFile(monthKeyStr, bullets, monthTrades) {
  // Pull cached mentor commentaries for this month
  const masterIds = ["default", "lynch", "buffett", "munger", "dalio", "marks", "graham"];
  const mentorParts = [];
  for (const mid of masterIds) {
    const text = await db.getMonthlyMentor(monthKeyStr, mid);
    if (text) {
      const master = getMaster(mid);
      mentorParts.push(`### ${master.zh}\n\n${text}\n`);
    }
  }

  // Build trade links for this month
  const tradeLinks = monthTrades.map((t) => {
    const date = yyyyMmDd(t.date);
    const fname = `${date} ${(t.action || "").toUpperCase()} ${t.stock}`;
    return `- [[${fname}]] · ${(t.action || "").toUpperCase()} ${t.stock} (${t.emotion})`;
  }).join("\n");

  return [
    fm({
      type: "monthly",
      month: monthKeyStr,
      tradesCount: monthTrades.length,
      tags: ["monthly"],
    }),
    "",
    `# ${monthLabel(monthKeyStr)} · 月评`,
    "",
    "## 复盘要点 · Review Bullets",
    "",
    (bullets && bullets.length > 0)
      ? bullets.map(b => `- ${b}`).join("\n")
      : "*尚未填写。*",
    "",
    monthTrades.length > 0 ? `## 本月交易 · Trades This Month (${monthTrades.length})\n\n${tradeLinks}\n` : "",
    mentorParts.length > 0 ? `## 导师月度点评 · Mentor Monthly Views\n\n${mentorParts.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

function buildHoldingsFile(holdings, prices) {
  const updatedAt = prices?.lastUpdated
    ? new Date(prices.lastUpdated).toLocaleString()
    : "尚未获取实时价格";

  // Group by currency for totals
  const byCcy = {};
  for (const h of holdings) {
    const p = prices?.data?.[h.symbol];
    const ccy = h.currency || p?.currency || "?";
    if (!byCcy[ccy]) byCcy[ccy] = { cost: 0, market: 0 };
    byCcy[ccy].cost += h.shares * h.costBasis;
    byCcy[ccy].market += p ? h.shares * p.price : h.shares * h.costBasis;
  }

  const totalsTable = Object.keys(byCcy).length > 0
    ? [
      "| 币种 | 成本 | 市值 | 浮盈亏 |",
      "|------|------|------|--------|",
      ...Object.entries(byCcy).map(([c, t]) => {
        const pnl = t.market - t.cost;
        const pct = t.cost > 0 ? (pnl / t.cost) * 100 : 0;
        return `| ${c} | ${t.cost.toFixed(2)} | ${t.market.toFixed(2)} | ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%) |`;
      }),
    ].join("\n")
    : "*暂无持仓。*";

  const positions = holdings.length > 0
    ? [
      "| 代码 | 名称 | 数量 | 成本 | 现价 | 今日 | P&L |",
      "|------|------|------|------|------|------|-----|",
      ...holdings.map((h) => {
        const p = prices?.data?.[h.symbol];
        const cost = h.shares * h.costBasis;
        const market = p ? h.shares * p.price : cost;
        const pnl = market - cost;
        const pct = cost > 0 ? (pnl / cost) * 100 : 0;
        const ccy = h.currency || p?.currency || "";
        return `| [[${h.symbol}]] | ${h.displayName || ""} | ${h.shares} | ${h.costBasis} ${ccy} | ${p ? p.price + " " + (p.currency || "") : "—"} | ${p ? (p.changePercent >= 0 ? "+" : "") + p.changePercent?.toFixed?.(2) + "%" : "—"} | ${p ? (pnl >= 0 ? "+" : "") + pnl.toFixed(2) + " (" + (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%)" : "—"} |`;
      }),
    ].join("\n")
    : "*暂无持仓。*";

  return [
    fm({
      type: "holdings",
      snapshotAt: new Date().toISOString(),
      pricesUpdatedAt: prices?.lastUpdated ? new Date(prices.lastUpdated).toISOString() : null,
      count: holdings.length,
      tags: ["holdings"],
    }),
    "",
    "# 当前持仓 · Holdings Snapshot",
    "",
    `**Snapshot 时间:** ${new Date().toLocaleString()}`,
    `**行情数据:** ${updatedAt}`,
    "",
    "## 汇总 · Totals (by currency)",
    "",
    totalsTable,
    "",
    "## 持仓明细 · Positions",
    "",
    positions,
    "",
  ].join("\n");
}

function buildIndexFile(stats) {
  const strategyLink = stats.hasStrategyReport
    ? `- [[_Strategy/StrategyReport-${new Date().toISOString().slice(0, 10)}]] — AI 生成的投资策略画像 ⭐`
    : `- \`_Strategy/\` — 生成策略报告后会出现在这里`;

  const lines = [
    fm({ type: "index", generatedAt: new Date().toISOString(), tags: ["index"] }),
    "",
    "# Investment Journal · Vault Index",
    "",
    `> Auto-generated on ${new Date().toLocaleString()}.`,
    "",
    "## 数据概览 · Stats",
    "",
    `- 交易 Trades: **${stats.tradeCount}**`,
    `- 心念 Thoughts: **${stats.thoughtCount}**`,
    `- 周记 Weekly: **${stats.weeklyCount}**`,
    `- 月评 Monthly: **${stats.monthlyCount}**`,
    `- 持仓 Holdings: **${stats.holdingsCount}**`,
    "",
    "## 文件夹 · Folders",
    "",
    "- [[_Foundations/Philosophy]] — 投资信条",
    "- [[_Foundations/Rules]] — 规则",
    strategyLink,
    "- `Trades/` — 每笔交易一个文件，文件名 `YYYY-MM-DD ACTION TICKER`",
    "- `Thoughts/` — 每条心念一个文件",
    "- `Weekly/` — 每周记一个文件，按 ISO 周编号",
    "- `Monthly/` — 每月一个文件，含月评 bullets + 各导师月度点评",
    "- [[Holdings/Snapshot]] — 当前持仓快照",
    "",
    "## 给 AI 的提示 · For AI",
    "",
    "If you're an AI tasked with summarizing this user's investment style, start with:",
    "",
    "1. `_Strategy/` — the pre-generated strategy profile (if present) is your best starting point",
    "2. `_Foundations/Philosophy.md` + `_Foundations/Rules.md` — their stated worldview",
    "3. `Monthly/` files in chronological order — their reflective synthesis",
    "4. The `emotion` front-matter pattern across `Trades/` — do they trade calm or anxious?",
    "5. The gap between `_Foundations/Rules.md` and what actually happened in `Trades/`",
    "",
    "The gap between aspiration (rules) and behavior (trades) is where the real strategy lives.",
    "",
  ];
  return lines.join("\n");
}

// ============================================================
// Main export function
// ============================================================

/**
 * Build and share an Obsidian-compatible vault as a zip file.
 * User chooses where to save (Google Drive, Files, Email, etc) via Android share sheet.
 *
 * @param {object} appData — bundle of all loaded state
 * @returns {Promise<{path: string, fileCount: number, sharedSuccessfully: boolean}>}
 */
export async function exportToObsidianVault(appData, strategyReport = null) {
  const {
    philosophy,
    rules,
    trades,
    thoughts,
    holdings,
    weeklyNotes,
    monthlyReviews,
    prices,
  } = appData;

  // Use a fresh staging directory each time
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const stagingRoot = `${FileSystem.cacheDirectory}vault-export-${stamp}/`;
  const vaultName = "Investment Journal";
  const vaultRoot = `${stagingRoot}${vaultName}/`;

  // Clean any prior staging dir (cache might have leftovers)
  try { await FileSystem.deleteAsync(stagingRoot, { idempotent: true }); } catch {}

  // Create folder structure
  const folders = [
    `${vaultRoot}_Foundations/`,
    `${vaultRoot}_Strategy/`,
    `${vaultRoot}Trades/`,
    `${vaultRoot}Thoughts/`,
    `${vaultRoot}Weekly/`,
    `${vaultRoot}Monthly/`,
    `${vaultRoot}Holdings/`,
  ];
  for (const f of folders) {
    await FileSystem.makeDirectoryAsync(f, { intermediates: true });
  }

  let fileCount = 0;
  const writeFile = async (relPath, content) => {
    await FileSystem.writeAsStringAsync(`${vaultRoot}${relPath}`, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    fileCount++;
  };

  // 1. Foundations
  await writeFile("_Foundations/Philosophy.md", buildPhilosophyFile(philosophy));
  await writeFile("_Foundations/Rules.md", buildRulesFile(rules));

  // 2. Strategy report — if provided
  if (strategyReport) {
    const reportDate = new Date().toISOString().slice(0, 10);
    await writeFile(`_Strategy/StrategyReport-${reportDate}.md`, strategyReport);
  } else {
    // Write a placeholder so the folder shows up and user knows it exists
    const placeholder = [
      fm({ type: "strategy-placeholder", tags: ["strategy"] }),
      "",
      "# Investment Strategy Profile",
      "",
      "*Strategy report not yet generated.*",
      "",
      "Return to the app → Settings → Generate Strategy Report to create your AI-powered analysis.",
      "",
    ].join("\n");
    await writeFile("_Strategy/StrategyReport-placeholder.md", placeholder);
  }

  // 3. Trades — one file per trade
  for (const t of trades) {
    const date = yyyyMmDd(t.date);
    const action = (t.action || "").toUpperCase();
    const filename = safeName(`${date} ${action} ${t.stock}`) + ".md";
    await writeFile(`Trades/${filename}`, buildTradeFile(t));
  }

  // 4. Thoughts — one file per thought
  for (const t of thoughts) {
    const date = yyyyMmDd(t.date);
    const firstLine = (t.content || "").split("\n")[0].slice(0, 25);
    const filename = safeName(`${date} ${firstLine}`) + ".md";
    await writeFile(`Thoughts/${filename}`, buildThoughtFile(t));
  }

  // 5. Weekly — one file per week
  for (const [wk, text] of Object.entries(weeklyNotes || {})) {
    const filename = `${wk}.md`;
    await writeFile(`Weekly/${filename}`, buildWeeklyFile(wk, text));
  }

  // 6. Monthly — one file per month (gather trades + cached mentor commentary)
  const allMonthKeys = new Set([
    ...Object.keys(monthlyReviews || {}),
    ...trades.map((t) => monthKey(t.date)),
  ]);
  for (const mk of allMonthKeys) {
    const bullets = (monthlyReviews || {})[mk] || [];
    const monthTrades = trades.filter((t) => monthKey(t.date) === mk);
    if (bullets.length === 0 && monthTrades.length === 0) continue;
    const content = await buildMonthlyFile(mk, bullets, monthTrades);
    await writeFile(`Monthly/${mk}.md`, content);
  }

  // 7. Holdings snapshot
  await writeFile("Holdings/Snapshot.md", buildHoldingsFile(holdings || [], prices));

  // 8. Index
  await writeFile("_Index.md", buildIndexFile({
    tradeCount: trades.length,
    thoughtCount: thoughts.length,
    weeklyCount: Object.keys(weeklyNotes || {}).length,
    monthlyCount: Object.keys(monthlyReviews || {}).length,
    holdingsCount: (holdings || []).length,
    hasStrategyReport: !!strategyReport,
  }));

  // 9. Zip the entire vault
  const zipPath = `${FileSystem.cacheDirectory}InvestmentJournal-${stamp}.zip`;
  try { await FileSystem.deleteAsync(zipPath, { idempotent: true }); } catch {}
  await zip(stagingRoot, zipPath);

  // 10. Trigger system share sheet
  let sharedSuccessfully = false;
  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(zipPath, {
        mimeType: "application/zip",
        dialogTitle: "保存投资日志 Vault (Google Drive / 文件 / 邮件)",
        UTI: "public.zip-archive",
      });
      sharedSuccessfully = true;
    } catch {
      sharedSuccessfully = false;
    }
  }

  // 11. Cleanup staging dir (zip stays in cache)
  try { await FileSystem.deleteAsync(stagingRoot, { idempotent: true }); } catch {}

  return { path: zipPath, fileCount, sharedSuccessfully };
}
