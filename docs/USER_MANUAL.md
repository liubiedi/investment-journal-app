# The Investor's Ledger — User Manual

> **投资日志** · A private, AI-powered investment journal for thoughtful long-term investors.

---

## Table of Contents

**English**
1. [Overview](#1-overview)
2. [Setup — Getting Started](#2-setup--getting-started)
3. [Navigation Overview](#3-navigation-overview)
4. [心法 · Home](#4-心法--home)
5. [记录 · Log](#5-记录--log)
6. [持仓 · Holdings](#6-持仓--holdings)
7. [复盘 · Review](#7-复盘--review)
8. [问道 · Mentor](#8-问道--mentor)
9. [Settings](#9-settings)
10. [Tips & Best Practices](#10-tips--best-practices)

**中文**
11. [应用简介](#11-应用简介)
12. [开始使用](#12-开始使用)
13. [界面导览](#13-界面导览)
14. [心法](#14-心法)
15. [记录](#15-记录)
16. [持仓](#16-持仓)
17. [复盘](#17-复盘)
18. [问道](#18-问道)
19. [设置](#19-设置)
20. [使用技巧](#20-使用技巧)

---

# English Manual

## 1. Overview

**The Investor's Ledger** is a private AI-powered investment journal designed for individual investors who want to think more clearly about their decisions. It helps you:

- **Record** every trade and market thought before you act, with your emotion and reasoning captured at the moment of decision
- **Track** your portfolio positions with live market prices and P&L
- **Review** your week and month with structured reflection prompts
- **Consult** legendary investors — Peter Lynch, Warren Buffett, Charlie Munger, Ray Dalio, Howard Marks, and Benjamin Graham — as AI mentors who have read your entire journal

All data is stored **locally on your device** in a SQLite database. Nothing is uploaded to a server. The AI mentors use the [DeepSeek](https://platform.deepseek.com) API, which you configure with your own key.

---

## 2. Setup — Getting Started

### Step 1: Get a DeepSeek API Key

1. Visit [platform.deepseek.com](https://platform.deepseek.com) and create a free account
2. Navigate to **API Keys** and generate a new key (starts with `sk-`)
3. Copy the key

### Step 2: Configure the App

1. Open the app and tap the **gear icon (⚙)** in the top-right corner of the Home screen
2. Paste your API key into the **DeepSeek API Key** field
3. Tap **保存 API Key** (Save API Key)
4. The status indicator changes from red **未配置** to green **已配置**

> **Cost estimate:** Typical monthly usage runs $1–3 USD. The app uses `deepseek-chat` for structured parsing and `deepseek-reasoner` (v3 Pro) for mentor responses, with server-side prefix caching to minimize repeated costs.

---

## 3. Navigation Overview

The app has five main tabs at the bottom of the screen:

| Tab | Chinese | Purpose |
|-----|---------|---------|
| Home | 心法 | Philosophy, rules, strategy report |
| Log | 记录 | Trade journal and thought notes |
| Holdings | 持仓 | Portfolio tracker with live prices |
| Review | 复盘 | Weekly notes and monthly deep review |
| Mentor | 问道 | AI mentor chat (per-master threads) |

Settings are accessed via the **gear icon** on the Home screen.

---

## 4. 心法 · Home

The Home screen is your investing command center — where you articulate your edge and monitor your consistency.

### Investment Philosophy

Tap the philosophy line to edit your one-sentence personal investing principle. This is sent to the AI mentor as foundational context. Be specific: instead of "Buy good companies," try "Buy profitable, founder-led businesses at 15× earnings or less, with durable pricing power."

Tap **SAVE** to confirm or **CANCEL** to discard.

### Rules

Your rules are personal guardrails — checklists you commit to checking before every trade.

- Tap **EDIT RULES** to enter edit mode
- Tap **＋** to add a rule (maximum 5)
- Tap **✕** next to a rule to delete it
- Tap **SAVE** when done

Rules appear as checkboxes in the trade form and are tracked for consistency in the strategy report.

> **Tip:** Rules should be specific enough to be verifiable. "No stock over 25% of portfolio" is a rule. "Only buy quality stocks" is not.

### Default Mentor

Select which AI mentor you want as the default for the 问道 (Mentor) tab. This can be overridden at any time inside the Mentor screen. The "Your Mentor" (你的导师) option gives you a personalized assistant who speaks about your specific trades and patterns.

### At a Glance Stats

Counts of your recorded data — Holdings, Trades, Thoughts, Weekly Notes, Monthly Reviews — displayed for quick reference.

### Strategy Profile Report

Once you have at least **5 trade records**, tap **生成我的投资策略报告** (Generate Strategy Report) to produce an AI analysis of your actual behavior. The report covers:

- What your real strategy looks like (vs. your stated philosophy)
- Emotional patterns and how they affect outcomes
- Which rules you follow vs. break most often
- Blind spots and suggested improvements

Tap **导出 PDF** to export and share the report. Tap **重新生成报告** to refresh with newer data.

> **Cost:** Each report generation uses approximately $0.05–0.10 of API credits.

---

## 5. 记录 · Log

The Log screen is where you build your investment journal. It has two sub-tabs:

- **交易计划** (Trade Plan) — structured trade records
- **心念** (Thoughts) — unstructured notes and questions

### Trade Log — Creating a Trade

Tap **新建交易** (New Trade) to open the trade form. You have two input modes:

#### AI Smart Input (AI 智能输入)

Type or dictate a freeform description of your trade in natural language, for example:

> "今天买了 200 股苹果，均价 175。服务收入增长好，股价回调 15%，估值合理。"

Tap **AI 生成交易摘要** and the AI will extract the action, stock, reason, and emotion automatically. Review the populated form and save.

#### Manual Input (手动填写)

Fill in each field:

| Field | Description |
|-------|-------------|
| **ACTION** | Buy / Sell / Hold / Watch |
| **STOCK** | Search by ticker or company name (e.g., AAPL, 腾讯, BTC) |
| **DISPLAY NAME** | Optional custom label |
| **DATE** | Tap to open calendar picker; future dates show a calendar reminder option |
| **REASON** | Write your thesis *before* acting — why this stock, why now, what you expect |
| **EMOTION** | Calm / Confident / Neutral / Anxious / Fearful |
| **RULES CHECK** | Check off which of your rules you verified (if you have rules set) |

Tap **写入交易日志** (Write to Journal) to save.

#### Holding Update Prompt

After a Buy or Sell, the app prompts you to update your Holdings. Fill in shares, price (for buys), and currency, then tap **确认更新持仓**. Tap **跳过** to skip.

### Trade Log — Viewing and Expanding Trades

Each trade row shows the date, action, stock, emotion, and a preview of your reason. Tap any row to expand it and see:

- Full reason text
- Rules you checked
- Original AI-parsed input (if smart mode was used)
- **Mentor feedback** already received
- Buttons to request new feedback from any mentor

#### Requesting Mentor Feedback

Tap **求教 [Mentor Name]** (Ask [Mentor]) to get that mentor's take on the specific trade. The response streams in. You can request feedback from multiple mentors on the same trade.

#### Continuing in Mentor Chat (带入问道)

Tap **继续 ↗** next to any mentor's feedback to carry that conversation into the full Mentor chat screen. The app automatically:
1. Saves the trade context and the mentor's feedback to that master's chat thread
2. Switches to the Mentor tab
3. Selects the correct master

### Thought Log

Switch to the **心念** sub-tab for unstructured notes — market observations, questions you can't resolve, intuitions you want to examine.

Tap **记下心念** (Note a Thought) and write freely:

> "我在纠结要不要加仓苹果。一方面业绩扎实，另一方面占比已经快 30%，违反我自己的规则…"

Thoughts support the same mentor feedback workflow as trades.

---

## 6. 持仓 · Holdings

The Holdings screen tracks your open positions with live market data.

### Adding a Position

Tap **新增持仓** and fill in:

| Field | Required | Notes |
|-------|----------|-------|
| **SYMBOL** | Yes | Search by ticker or name |
| **DISPLAY NAME** | No | Shown instead of ticker if set |
| **SHARES** | Yes | Decimal values supported |
| **COST** | Yes | Average cost per share |
| **CURRENCY** | Yes | USD, CNY, HKD, SGD, EUR, JPY |
| **BUY DATE** | No | Used in mentor context |
| **REASON TO BUY** | No | Your original thesis — shared with mentor |
| **NOTES** | No | Stop levels, ideas, reminders |

Tap **加入持仓** (Add to Holdings) to save.

### Viewing Positions

Each holding row displays:
- Symbol and display name
- Shares held and cost basis
- **Live price** and today's change (color-coded green/red)
- **市值** (Market Value) and **浮盈亏** (Unrealized P&L) with percentage

The **TOTALS · 汇总** section at the top aggregates cost, market value, and P&L by currency.

### Live Price Updates

Tap **刷新** (Refresh) to fetch the latest prices from Yahoo Finance. The **更新于** timestamp shows how recently prices were fetched. Prices auto-refresh when the Mentor screen loads.

### Editing and Deleting

Tap any holding row to enter edit mode. Update any field and tap **保存修改** (Save Changes). To remove a position, tap **删除此持仓** and confirm twice.

### 带入问道 (Bring to Mentor)

Tap the **带入问道 ↗** link on any holding to start a mentor conversation about that specific position. The app pre-fills a message with your position details — shares, cost basis, current price, P&L, buy date, and your original reason. The Mentor tab opens automatically.

---

## 7. 复盘 · Review

The Review screen has two sub-tabs for structured reflection:

### 周记 · Weekly Notes

Write a brief weekly note covering what happened in the market, how you felt, and what you learned. Regular weekly reflection builds pattern recognition over time.

### 月评 · Monthly Review

A deeper monthly review prompt helps you assess your decision quality for the month — not just returns, but process. A banner on the Home screen reminds you when the month is ending and you have trades pending review.

---

## 8. 问道 · Mentor

The Mentor screen is a private chat with AI mentors who have read your entire investment journal.

### Selecting a Mentor

The seven available mentors (选择导师):

| ID | Chinese | English | Philosophy |
|----|---------|---------|------------|
| 你的导师 | 你的导师 | Your Mentor | Personalised to your journal, trades, and patterns |
| 彼得·林奇 | 彼得·林奇 | Peter Lynch | Invest in what you know; GARP; simple businesses |
| 巴菲特 | 巴菲特 | Warren Buffett | Wonderful companies at fair prices; moats; long-term |
| 芒格 | 芒格 | Charlie Munger | Mental models; inversion; incentives; blunt and demanding |
| 达利欧 | 达利欧 | Ray Dalio | Principles; economic cycles; diversification; stress-testing |
| 霍华德·马克斯 | 霍华德·马克斯 | Howard Marks | Second-level thinking; cycle awareness; risk vs. return |
| 格雷厄姆 | 格雷厄姆 | Benjamin Graham | Margin of safety; intrinsic value; quantitative discipline |

Tap a mentor chip to switch. **Each mentor maintains a separate, independent conversation thread.** Switching masters shows only that master's history.

### Sending Messages

Type your question in the input field at the bottom and tap the **send button** (paper plane icon). Suggested starter questions appear when the chat is empty:

- "帮我看看最近几笔交易有什么规律？"
- "我焦虑的时候做的决定，结果通常怎样？"
- "我的哪条规则最容易被我自己违反？"
- "下个月我应该重点关注什么？"

### Copying Messages

**Long-press** any message bubble (user or mentor) to copy its text to the clipboard. A brief **已复制 ✓** confirmation appears.

### Retrying Failed Messages

If the AI is temporarily unreachable, an error message appears with a **重新发送** (Retry) button. Tap it to retry without re-typing your question. No duplicate messages are created.

### Resetting a Thread

Tap **RESET** in the top-right corner to clear the current master's conversation history. This only affects the selected master — other masters' threads are unaffected.

### Live Price Sync

The header shows the freshness of your holdings data. Tap **刷新** or **同步** to fetch the latest prices before asking about your portfolio.

---

## 9. Settings

Access Settings via the **gear icon (⚙)** on the Home screen.

### DeepSeek API Key

- **已配置** (green dot): Key is saved and ready
- **未配置** (red dot): No key configured — AI features are disabled

Paste a new key to replace an existing one. Tap **清除** to remove it. Tap the external link to open the DeepSeek platform website.

### Data Export

#### Obsidian Vault Export (Recommended)
Exports all your trades, thoughts, and reviews as individual Markdown files in a structured zip archive with YAML front-matter and bidirectional links. Import the zip into [Obsidian](https://obsidian.md) or any Markdown-based system for long-term archiving and analysis.

Tap **导出 Vault → 保存到 Google Drive 等** and choose where to save the zip file.

#### JSON Backup
Exports the complete raw database as JSON — useful for migrating to a new device or keeping a backup.

Tap **导出 JSON 备份** and share or save the file.

> Your in-app data is never deleted by an export. The export creates a separate copy.

### Privacy

- All journal data stays in local SQLite — nothing is uploaded to any server
- DeepSeek only receives the relevant excerpts of your journal when you ask a mentor
- Yahoo Finance only receives the ticker symbols of your holdings
- Voice input is handled by your Android system keyboard — not by this app

### Danger Zone

**清空与导师的聊天记录** permanently deletes all mentor chat history across all masters. This requires two-step confirmation and cannot be undone.

---

## 10. Tips & Best Practices

1. **Write before you trade.** The reason field is most valuable when filled in *before* executing the trade, not after. The app is designed for pre-trade journaling.

2. **Capture your emotion honestly.** Logging "Fearful" when you felt fearful is more useful than logging "Calm." The AI mentor uses emotional patterns to give you better feedback.

3. **Use Your Mentor for patterns, specific masters for frameworks.** "Your Mentor" gives context-rich personalised feedback. Switch to Peter Lynch or Buffett when you want a specific philosophical lens applied to a decision.

4. **One thought per dilemma.** When you're unsure about something, log it as a 心念 (thought) immediately — even a sentence. You can elaborate later and ask any mentor for their view.

5. **Run the strategy report monthly.** After your monthly review, regenerate the strategy profile report. The gap between your stated philosophy and your actual trades often reveals your most important blind spots.

6. **Export to Obsidian regularly.** The Vault export creates a permanent, searchable archive of your investment thinking. Your notes compound over time.

---

---

# 中文使用手册

## 11. 应用简介

**投资日志**（The Investor's Ledger）是一款面向理性长线投资者的私人 AI 投资日记。它帮助你：

- **记录**每一笔交易和市场想法——在行动前捕捉你当下的情绪与逻辑
- **追踪**投资组合持仓，附带实时行情与浮盈亏
- **复盘**每周、每月，通过结构化反思不断迭代
- **问道**彼得·林奇、巴菲特、芒格、达利欧、霍华德·马克斯、格雷厄姆——这六位 AI 导师已经读完你的每一篇日志

所有数据**本地存储**在设备 SQLite 数据库中，不上传任何服务器。AI 功能通过你自己的 [DeepSeek](https://platform.deepseek.com) API Key 调用。

---

## 12. 开始使用

### 第一步：获取 DeepSeek API Key

1. 访问 [platform.deepseek.com](https://platform.deepseek.com)，注册账号
2. 进入 **API Keys** 页面，生成一个新的 Key（以 `sk-` 开头）
3. 复制该 Key

### 第二步：配置应用

1. 打开应用，点击主页右上角的**齿轮图标（⚙）**
2. 将 API Key 粘贴到 **DeepSeek API Key** 输入框
3. 点击**保存 API Key**
4. 状态指示从红色**未配置**变为绿色**已配置**

> **费用参考：** 日常使用月均花费约 $1–3 美元。应用使用 `deepseek-chat` 进行结构化解析，使用 `deepseek-reasoner`（v3 Pro）处理导师回复，服务端自动复用前缀缓存，有效控制成本。

---

## 13. 界面导览

应用底部有五个主标签：

| 标签 | 英文 | 功能 |
|------|------|------|
| 心法 | Home | 投资哲学、规则、策略报告 |
| 记录 | Log | 交易日志与心念记录 |
| 持仓 | Holdings | 持仓追踪与实时行情 |
| 复盘 | Review | 周记与月评 |
| 问道 | Mentor | AI 导师对话（按导师分线程） |

设置入口位于主页右上角的**齿轮图标**。

---

## 14. 心法

心法页是你投资理念的核心阵地，用于明确你的优势并监测自我一致性。

### 投资哲学

点击哲学那一行即可编辑你的单句投资原则。这句话会作为 AI 导师的基础上下文。建议具体明确：与其写"买好公司"，不如写"以不超过 15 倍市盈率买入利润稳定、创始人主导、具有定价权的企业"。

点击 **SAVE** 保存，点击 **CANCEL** 放弃修改。

### 规则

规则是你在每次交易前承诺执行的检查清单。

- 点击 **EDIT RULES** 进入编辑模式
- 点击 **＋** 添加新规则（最多 5 条）
- 点击规则旁边的 **✕** 删除
- 点击 **SAVE** 完成

规则会在交易表单中以复选框形式出现，并在策略报告中追踪你的遵守情况。

> **提示：** 规则要具体到可以核查。"单只股票不超过持仓 25%"是规则；"只买好股票"不是。

### 默认导师

在此选择你在「问道」标签默认使用的 AI 导师。进入问道后随时可以切换。选择「你的导师」可获得基于你具体交易和模式的个性化分析。

### 数据概览

快速查看已记录的数量：持仓、交易、心念、周记、月评。

### 投资策略报告

拥有至少 **5 条交易记录**后，点击**生成我的投资策略报告**，AI 将分析你的实际行为，报告涵盖：

- 你真实的投资策略（对比你声明的哲学）
- 情绪规律及其对决策的影响
- 你最常遵守与违反的规则
- 盲点与改进建议

点击**导出 PDF** 可分享报告；点击**重新生成报告**可用新数据刷新。

> **费用：** 每次生成报告约消耗 $0.05–0.10 API 费用。

---

## 15. 记录

记录页是构建投资日志的核心，分两个子标签：

- **交易计划** — 结构化交易记录
- **心念** — 非结构化的想法与疑问

### 交易日志 — 新建交易

点击**新建交易**打开交易表单，支持两种输入方式：

#### AI 智能输入

用自然语言描述你的交易，例如：

> "今天买了 200 股苹果，均价 175。服务收入增长好，股价回调 15%，估值合理。"

点击 **AI 生成交易摘要**，AI 将自动提取操作、股票、理由和情绪。检查填入的表单后保存即可。

#### 手动填写

逐项填写各字段：

| 字段 | 说明 |
|------|------|
| **ACTION** | 买入 / 卖出 / 持有 / 观察 |
| **STOCK** | 按代码或公司名搜索（如 AAPL、腾讯、BTC） |
| **DISPLAY NAME** | 可选的自定义显示名称 |
| **DATE** | 点击打开日历选择器；未来日期会提示是否添加日历提醒 |
| **REASON** | 在行动**前**写下你的逻辑：为什么是这只？为什么是现在？预期什么会发生？ |
| **EMOTION** | 平静 / 笃定 / 中性 / 焦虑 / 恐惧 |
| **RULES CHECK** | 勾选你已核查的规则（需提前在心法页设置规则） |

点击**写入交易日志**保存。

#### 更新持仓提示

买入或卖出后，应用会提示你更新持仓。填写股数、价格（买入时需填）和币种，点击**确认更新持仓**。不需要更新时点击**跳过**。

### 交易日志 — 查看与展开

每条交易行显示日期、操作、股票、情绪和理由预览。点击任意行展开，可查看：

- 完整理由
- 已核查的规则
- AI 智能输入的原始文本（如适用）
- 已收到的**导师点评**
- 向任意导师求教的按钮

#### 求教导师点评

点击**求教 [导师名]** 获取该导师对此笔交易的具体点评，回复实时流式输出。你可以对同一笔交易向多位导师求教。

#### 带入问道

点击导师点评旁的**继续 ↗** 按钮，将此次对话延续到完整的问道聊天界面。应用将自动：
1. 把交易上下文和导师点评保存到该导师的聊天线程
2. 跳转到问道标签
3. 自动切换到对应导师

### 心念日志

切换到**心念**子标签，用于记录非结构化的市场观察、疑问和直觉。

点击**记下心念**，自由书写：

> "我在纠结要不要加仓苹果。一方面业绩扎实，另一方面占比已经快 30%，违反我自己的规则…"

心念同样支持向任意导师求教，流程与交易记录相同。

---

## 16. 持仓

持仓页追踪你的当前仓位，提供实时行情数据。

### 新增持仓

点击**新增持仓**，填写以下信息：

| 字段 | 是否必填 | 说明 |
|------|----------|------|
| **SYMBOL · 代码** | 是 | 按代码或名称搜索 |
| **DISPLAY NAME · 显示名** | 否 | 设置后代替代码显示 |
| **SHARES · 数量** | 是 | 支持小数 |
| **COST · 成本单价** | 是 | 每股平均成本 |
| **CURRENCY · 币种** | 是 | USD、CNY、HKD、SGD、EUR、JPY |
| **BUY DATE · 买入时间** | 否 | 在导师对话中使用 |
| **REASON TO BUY · 购买原因** | 否 | 你的原始投资逻辑，会分享给导师 |
| **NOTES · 备注** | 否 | 止损位、想法、提醒 |

点击**加入持仓**保存。

### 查看持仓

每个持仓行显示：
- 代码与显示名
- 持有股数和成本基础
- **实时价格**和今日涨跌幅（绿色/红色）
- **市值**和**浮盈亏**（含百分比）

顶部的 **TOTALS · 汇总** 区域按币种汇总成本、市值和盈亏。

### 刷新行情

点击**刷新**从 Yahoo Finance 获取最新价格。**更新于**时间戳显示最近获取时间。进入问道页面时价格会自动同步。

### 编辑与删除

点击任意持仓行进入编辑模式。修改后点击**保存修改**。删除持仓请点击**删除此持仓**，需二次确认。

### 带入问道

点击持仓行上的**带入问道 ↗** 链接，针对该持仓直接开启导师对话。应用会预填一条包含持仓详情的消息——股数、成本、当前价格、盈亏、买入日期和原始买入理由——并自动跳转到问道标签。

---

## 17. 复盘

复盘页包含两个子标签，用于结构化反思。

### 周记

撰写简短的每周总结：市场发生了什么、你的感受、你学到了什么。定期的周记有助于建立规律识别能力。

### 月评

更深入的月度复盘帮助你评估当月的决策质量——不只是收益，更是决策过程。当月末将近且有待复盘的交易时，主页会弹出提醒横幅。

---

## 18. 问道

问道页是你与 AI 导师的私人对话空间，这些导师已读完你的完整投资日志。

### 选择导师

七位可选导师：

| 选项 | 姓名 | 投资哲学 |
|------|------|----------|
| 你的导师 | 你的导师 | 基于你的日志个性化分析，熟悉你的每一笔交易和规律 |
| 彼得·林奇 | Peter Lynch | 投资你了解的——GARP（合理价格的成长股）、简单商业模式 |
| 巴菲特 | Warren Buffett | 好公司合理价格、护城河、长期持有思维 |
| 芒格 | Charlie Munger | 心智模型、逆向思维、激励分析，直率且要求严格 |
| 达利欧 | Ray Dalio | 原则、经济周期、多元化、压力测试 |
| 霍华德·马克斯 | Howard Marks | 二阶思维、周期意识、风险与收益 |
| 格雷厄姆 | Benjamin Graham | 安全边际、内在价值、定量纪律 |

点击导师芯片切换。**每位导师维护独立的对话线程**，切换导师只显示该导师的历史对话记录。

### 发送消息

在底部输入框输入问题，点击发送按钮（纸飞机图标）。对话历史为空时会显示推荐开场问题：

- "帮我看看最近几笔交易有什么规律？"
- "我焦虑的时候做的决定，结果通常怎样？"
- "我的哪条规则最容易被我自己违反？"
- "下个月我应该重点关注什么？"

### 复制消息

**长按**任意消息气泡（用户或导师的消息均可）即可将文本复制到剪贴板。短暂显示**已复制 ✓** 确认提示。

### 重新发送失败消息

若 AI 服务暂时不可用，会显示错误提示和**重新发送**按钮。点击即可重试，无需重新输入，也不会产生重复消息。

### 重置对话

点击右上角 **RESET** 清空当前导师的对话历史。此操作**只影响当前选中的导师**，其他导师的对话记录不受影响。

### 实时行情同步

顶部显示持仓数据的新鲜度。在向导师询问持仓情况前，可点击**刷新**或**同步**获取最新价格。

---

## 19. 设置

通过主页右上角的**齿轮图标**进入设置页面。

### DeepSeek API Key

- **已配置**（绿色）：Key 已保存，AI 功能可用
- **未配置**（红色）：未配置 Key，AI 功能不可用

粘贴新 Key 可替换已有配置。点击**清除**删除当前 Key。点击外部链接跳转 DeepSeek 平台网站。

### 数据导出

#### Obsidian Vault 导出（推荐）
将所有交易、心念和复盘导出为结构化 Markdown 文件夹，以 zip 打包，包含 YAML 元数据和双向链接。可导入 [Obsidian](https://obsidian.md) 或其他 Markdown 系统进行长期归档与分析。

点击**导出 Vault → 保存到 Google Drive 等**，选择保存位置。

#### JSON 备份
将完整原始数据库导出为 JSON——适用于换设备迁移数据或定期备份。

点击**导出 JSON 备份**，分享或保存文件。

> 导出操作不会删除应用内数据，导出内容是独立副本。

### 隐私说明

- 所有日志数据本地 SQLite 存储，不上传任何服务器
- DeepSeek 仅在你求教导师时收到相关档案片段
- Yahoo Finance 仅收到你持仓的 ticker 代码
- 语音输入由 Android 系统输入法处理，不经过本应用

### 危险操作

**清空与导师的聊天记录** 会永久删除所有导师的对话历史。需要二次确认，操作不可撤销。

---

## 20. 使用技巧

1. **交易前先写理由。** 理由字段在你执行交易**之前**填写最有价值，事后填写会受到结果偏差的影响。应用的设计出发点就是交易前日记。

2. **如实记录情绪。** 当时感到"焦虑"就记"焦虑"，比事后记"平静"更有用。AI 导师会根据情绪规律提供更精准的反馈。

3. **用"你的导师"看规律，用大师视角看框架。** "你的导师"给出基于你具体交易的个性化分析；切换到彼得·林奇或巴菲特，则可以用特定的投资哲学框架来审视一个决策。

4. **一个纠结，一条心念。** 对某件事拿不定主意时，立刻记一条心念——哪怕只有一句话。之后可以补充，也可以随时求教任意导师的看法。

5. **每月跑一次策略报告。** 写完月评后，重新生成投资策略报告。你声明的哲学与实际交易之间的落差，往往就是最重要的盲点所在。

6. **定期导出到 Obsidian。** Vault 导出会创建一份永久、可搜索的投资思考档案。你的笔记会随时间复利增值。

---

*投资日志 v1.0 · The Investor's Ledger · All data stored locally on your device.*
