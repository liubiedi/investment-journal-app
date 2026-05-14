# The Investor's Ledger — User Manual

---

# English Manual

---

## Part 0 · The Premise

Most investment mistakes are not made in ignorance. They are made in the fog of the moment — when you knew your rule and broke it anyway, when you told yourself a story that felt true at the time, when fear dressed itself up as analysis. Six months later, you can no longer remember exactly what you were thinking. The outcome has colonised the memory.

The most expensive thing in investing is not a bad trade. It is the inability to learn from one.

Learning requires a record. Not a record of outcomes — outcomes you already have, in your brokerage account. A record of *thinking*: what you were reasoning when you acted, what you were feeling, which rules you verified, what you feared, what you hoped. These are the inputs that determined the decision. They are also the only inputs that can be changed.

This app exists to capture that record systematically — at the moment of decision, before outcome has a chance to rewrite the story.

---

## Part 1 · The Second Brain — Structured Storage as Foundation

A journal is only as useful as its structure allows.

Notes scattered across a generic app are hard to query, impossible to compare across time, and invisible to AI. The Investor's Ledger stores every trade, every thought, every review as *structured data*: typed fields, consistent schema, timestamped entries, emotion and reasoning captured alongside the decision. This structure is not bureaucracy. It is what makes your notes queryable — by search, by pattern, and by intelligence.

The **Obsidian Vault export** is the most significant feature in the app, and it is buried in Settings. That is a mistake this manual corrects by explaining it first.

When you export your Vault, the app converts your entire journal into structured Markdown files with YAML front-matter — individual files per trade, per thought, per weekly note, per monthly review, with bidirectional links between them. This is the format that knowledge-base tools and AI agents understand natively. Once exported, your journal lives outside any single application, in a format you own and control indefinitely.

This is the foundation of a **second brain** for your investment thinking. A permanent, portable, AI-readable record of how your mind has worked — and how it has grown. The app is not the destination. The structured data it produces is.

> Import the Vault zip into [Obsidian](https://obsidian.md) and your entire journal becomes a searchable knowledge graph. Load it as context into any AI agent — Claude, GPT, local models — and you have a system that can reason over years of your actual thinking, not just generic investment knowledge.

---

## Part 2 · The AI Layer — When the Agent Has Read Everything

Most AI tools answer from general knowledge. The mentors in this app answer from yours.

When you ask Warren Buffett's persona about a position, it has read your specific trades, your stated philosophy, your emotional patterns, your weekly reflections, your rule violations. It is not delivering a lecture on moats. It is applying Buffett's framework to *your actual behaviour* — the gap between what you said you would do and what you actually did.

This is only possible because of the structured recording. The AI is not inferring your patterns from a few sentences. It is reading your second brain.

The six mentor personas — Peter Lynch, Warren Buffett, Charlie Munger, Ray Dalio, Howard Marks, Benjamin Graham — each carry a distinct analytical framework. Lynch looks for businesses you understand and management you can trust. Munger inverts every problem and interrogates incentives. Marks asks what is already priced in. Graham demands a quantitative margin of safety before any qualitative argument is heard. Switching between them is not switching between chatbots. It is applying different lenses to the same body of evidence: your journal.

The Obsidian export extends this further. Every AI agent you use in the future — tools that do not yet exist — can be given your journal as a knowledge base. You are not just keeping a record. You are **building an asset**.

---

## Part 3 · The Recording Habit — Trades and Thoughts as Daily Practice

The value of this system is proportional to the quality of what you put into it. One honest entry recorded before a trade is worth more than ten reconstructed after the fact.

### Trade Records (记录 · 交易计划)

Navigate to the **Log** tab and tap **新建交易** (New Trade). The form can be filled two ways:

**AI Smart Input** — write or dictate a freeform description of your trade in natural language. The AI extracts the structured fields automatically. This is the fastest path to a complete record when you are acting quickly.

**Manual Input** — fill each field directly:

| Field | Why It Matters |
|-------|----------------|
| **ACTION** | Buy / Sell / Hold / Watch — the decision type |
| **STOCK** | Searchable by ticker or name; entry price (e.g. `USD 150`) is shown inline next to the ticker in the log list when set |
| **DATE** | Defaults to today; future dates can trigger a calendar reminder |
| **REASON** | The thesis, written *before* you act. This is the most important field in the app. |
| **EMOTION** | Calm / Confident / Neutral / Anxious / Fearful. Emotional state at the moment of decision. |
| **RULES CHECK** | Which of your personal rules you verified before acting |

After a Buy or Sell, the app prompts you to update your Holdings. Fill in shares, price, and currency, or tap **跳过** (Skip) if you prefer to do it separately.

The **REASON** field deserves a discipline of its own. The question it is asking is: *What would have to be true for this to be a good decision?* Answer that, in writing, before you act. Your future self will have something to hold your present self accountable to.

### Thought Records (心念)

Switch to the **心念** sub-tab. This is for everything that does not yet qualify as a trade decision — the doubts, the observations, the half-formed intuitions that precede clarity.

*Indecision is data.* The moments when you almost acted but didn't, the positions you thought about adding to, the companies you researched but didn't buy — these are the most revealing entries in any investor's journal. Log them. Tap **记下心念** and write freely.

Both trades and thoughts support **mentor feedback**: tap **求教 [Mentor Name]** on any expanded entry to receive a streamed response from that mentor grounded in the specific context of the entry.

Tap **继续 ↗** next to any feedback to carry that conversation directly into the Mentor chat, with context already loaded.

---

## Part 4 · Portfolio and Context — Holdings as Memory

Navigate to the **Holdings** tab (持仓). This screen is not primarily a portfolio tracker — though it functions as one. Its deeper purpose is to give the AI mentor *current, grounded context* when you ask about your portfolio.

Tap **新增持仓** to add a position. Beyond the basics (symbol, shares, cost, currency), the fields that matter most for AI context are:

- **REASON TO BUY** — your original thesis. When you ask a mentor about a position six months later, it will read this and measure your current thinking against it.
- **NOTES** — stop levels, monitoring triggers, any condition that would change your view.
- **BUY DATE** — gives the mentor a timeline for the position.

The **带入问道 ↗** link on any holding opens the Mentor tab with a pre-composed message containing your full position details — shares, cost, current price, P&L, buy date, and original reasoning. The mentor does not need to ask for context. It already has it.

**Live prices** are fetched from Yahoo Finance. Tap **刷新** to update. Prices auto-sync when the Mentor tab is opened.

---

## Part 4.5 · Research — Decision Memos Before You Trade

Navigate to the **Research** tab (研究).

The Research module exists for a specific problem: the gap between "I think this is interesting" and "I am ready to act." Most investment mistakes are made in that gap — when the idea is exciting but the thesis is still vague, when the checklist hasn't been run, when no one has pressure-tested the invalidation condition. A decision memo forces that work before any capital moves.

### Creating a Research Memo

Tap **新建** (New) in the top right, or tap **研究这个想法** on any Log entry to pre-fill the ticker.

The composer asks for:
- **Ticker** — search by symbol or company name
- **Thesis** — 2-4 sentences: why is this interesting, and what would have to be true for it to be a good investment?
- **Manual Notes** — any facts, numbers, or context not in public data (earnings call quote, recent news, insider detail)
- **Review Horizon** — how many months before scheduled re-evaluation (default: 3)

Tap **生成研究备忘录**. The app fetches Yahoo Finance fundamentals (P/E, P/B, PEG, free cash flow, 52-week range, analyst estimates, next earnings date) and generates a structured memo via AI.

### The Memo — What It Shows

The memo never says "Buy now" or "Sell now." It gives you a **conditional status**:

| Status | Meaning |
|--------|---------|
| Buy Setup 建仓机会 | Conditions are favourable; position sizing defines how much and when |
| Watch 观望 | Thesis valid but entry not triggered; define the trigger |
| Reduce Risk 降低风险 | Something has changed; trim or hedge before re-evaluating |
| Avoid 回避 | Thesis does not hold under current conditions |

Alongside this, the memo contains:
- **Business Snapshot** — what the company does, what drives revenue, competitive position, the market's key debates about it
- **Deep Research Checklist** — each item flagged with evidence quality (filing / fundamental / estimate / user-entered)
- **Valuation** — current multiples vs. peers, bull/base/bear scenarios, implied fair-value band, key assumptions
- **Position Sizing** — maximum position %, first tranche, conditions to add or trim, invalidation condition
- **3–6 Month Strategy** — specific watch items, buy trigger, sell/trim trigger, review date
- **Rules Conflict Check** — each of your personal rules evaluated pass / fail / n/a; a fail requires an override note before proceeding
- **Sources** — every data source tagged with tier (Yahoo Finance / Manual) and timestamp; stale data flagged

The **DisclaimerBlock** is always visible: "This memo is decision support, not investment advice."

### Versions

Every time you regenerate a memo (e.g., after an earnings report or a thesis change), the app creates a new immutable version. Tap the version chip in the header to see version history and compare status / thesis / valuation across versions. No version is ever overwritten.

### Holdings Integration

If a holding has a research memo, a small status dot appears on the holding row. Tap **更新研究 ↗** to open the composer pre-filled with the ticker and your current position context (shares, cost basis, buy reason).

### Mentor Integration

When you ask any mentor about a stock that has a research memo, the mentor receives the current conclusion and its invalidation condition as context — without you needing to paste it in. The mentor knows what you already concluded and can challenge it, validate it, or update it.

---

## Part 5 · The Review Loop — Reflection as Craft

Navigate to **Review** (复盘). The tab contains two sub-screens:

**週记 · Weekly Notes** — a brief weekly reflection on what happened in the market, how you responded, and what you noticed about your own behaviour. Regularity matters more than length. A few sentences written every week compounds into a remarkable record over a year.

**月评 · Monthly Review** — a deeper structured review of the month's decisions. Not returns — decision quality. Were the outcomes consistent with the quality of the reasoning? Where did process and result diverge? A banner on the Home screen appears in the final week of each month if you have unreviewed trades, prompting you to begin.

The review entries are exported with the Vault and included as context for the AI mentors. An investor who reviews consistently gives their AI mentor exponentially richer material to work with.

---

## Part 6 · The Mentor — Querying Your Second Brain

Navigate to **Mentor** (问道).

The header shows how much of your journal has been loaded: trades, holdings, weekly notes, monthly reviews. This is not decorative. It is telling you the scope of what the mentor has read.

Select a mentor from the chip row at the top. Each maintains a **separate, independent conversation thread** — switching masters shows only that master's history. Tap **RESET** in the top-right to clear the current master's thread; other masters are unaffected.

The seven available mentors:

| Mentor | Framework |
|--------|-----------|
| 你的导师 · Your Mentor | Personalised to your journal, trades, and patterns |
| 彼得·林奇 · Peter Lynch | Invest in what you know; GARP; simple businesses |
| 巴菲特 · Warren Buffett | Wonderful companies at fair prices; moats; long-term |
| 芒格 · Charlie Munger | Mental models; inversion; incentives; blunt |
| 达利欧 · Ray Dalio | Principles; cycles; diversification; stress-testing |
| 霍华德·马克斯 · Howard Marks | Second-level thinking; cycle awareness; risk vs. return |
| 格雷厄姆 · Benjamin Graham | Margin of safety; intrinsic value; quantitative discipline |

Type in the input field and tap send. If the AI is temporarily unreachable, an error appears with a **重新发送** (Retry) button — no need to retype. **Long-press** any message to copy it to the clipboard.

Suggested opening questions when a thread is empty:
- *"帮我看看最近几笔交易有什么规律？"* — Help me find patterns in my recent trades
- *"我焦虑的时候做的决定，结果通常怎样？"* — What happens to decisions I make when anxious?
- *"我的哪条规则最容易被我自己违反？"* — Which of my rules do I break most often?
- *"下个月我应该重点关注什么？"* — What should I focus on next month?

---

## Part 7 · Setup and Settings

Access Settings via the **gear icon (⚙)** on the Home screen.

### DeepSeek API Key

The app uses [DeepSeek](https://platform.deepseek.com) for all AI features — `deepseek-chat` for structured parsing, `deepseek-reasoner` for mentor responses. Both are billed to your own account.

1. Visit **platform.deepseek.com**, create an account, and generate a key starting with `sk-`
2. Paste it into the **DeepSeek API Key** field and tap **保存 API Key**
3. Status changes from red **未配置** to green **已配置**

> **Cost:** Typical monthly usage runs $1–3 USD, with server-side prefix caching reducing repeated costs automatically.

### Home Screen — Philosophy and Rules

The **Investment Philosophy** on the Home screen is your one-sentence investing principle. Write it precisely; it is sent to every mentor as foundational context.

**Rules** are the specific, verifiable commitments you check before every trade (maximum 5). They appear as checkboxes in the trade form and are tracked across the strategy report. A rule must be falsifiable to be useful: *"No single position over 25% of portfolio"* is a rule. *"Only buy quality"* is not.

The **Strategy Profile Report** (requires 5+ trades) generates an AI analysis of your actual behaviour: what your real strategy is, your emotional patterns, which rules you follow or violate, and your blind spots. Tap **导出 PDF** to share it.

### Data Export

**Obsidian Vault (Recommended):** Tap **导出 Vault** to generate a structured zip of all your data as Markdown files with YAML front-matter. This is your second brain in portable form. Save it to Google Drive, import into Obsidian, or feed it to any AI agent.

**JSON Backup:** Full raw database export for device migration or backup.

### Privacy

All journal data is stored in local SQLite on your device — nothing is uploaded to any server. DeepSeek receives only the relevant journal excerpts when you ask a mentor. Yahoo Finance receives only your ticker symbols. Voice input is processed by your Android system keyboard, not this app.

---

## Part 8 · The Discipline — Habits That Compound

A second brain is not built in a session. It is built in minutes, every day, over years. These are the habits worth forming:

1. **Record before you act, not after.** The reason field written before a trade is worth more than ten written from memory. The outcome will always rewrite the story; only a pre-act record is immune.

2. **Log the moments of doubt, not just the decisions.** A 心念 entry about a trade you almost made is often more revealing than the trade you did. Indecision has a pattern too.

3. **Be honest about emotion.** Logging "Fearful" when you were fearful is the only way to find out what fear-driven decisions actually produce. The AI mentor uses this data. So will you.

4. **Use Your Mentor for patterns; use specific masters for frameworks.** "Your Mentor" speaks about your actual trades. Switch to Munger when you want a rigorous cross-examination of a specific thesis.

5. **Review every week, even briefly.** The weekly note does not need to be long. It needs to exist. Continuity is the compounding mechanism.

6. **Export to Obsidian regularly.** The Vault export is your hedge against any single app or service. It is also the input for future AI tools you haven't met yet. Your journal is an asset — treat it like one.

---

---

# 中文使用手册

---

## 第零章 · 缘起 — 遗忘是最贵的代价

投资中代价最高的不是某一笔错误的交易，而是无法从中汲取教训。

我们以为自己会记得。交易发生时，逻辑在眼前，情绪在胸中，理由清晰如镜。但六个月之后，结果已经重写了记忆。亏损的仓位被追认为"本来就知道的风险"，盈利的仓位被包装成"早已看准的机会"。人类的记忆不是档案馆，是叙事机器——它会修改过去，以配合当下的自我感觉。

真正的复盘，需要的不是结果的记录，而是**决策时刻的真实留存**：那时你在想什么？感受到什么？核查了哪些规则？压制了哪些直觉？

这些，才是改变的起点。

这款应用存在的意义，就是在决策的瞬间留下一枚时间戳——在结果来临之前，在记忆开始改写之前。

---

## 第一章 · 外化心智 — 结构化存储与第二大脑

"外化心智"并非新概念。算盘、账本、地图——人类历史上一切伟大的认知工具，本质都是将内在思维投射为外在结构，使其可见、可传、可积累。

但记录有高下之分。

散落在备忘录里的笔记难以检索，无法跨时间对比，也无法被 AI 理解。**投资日志**将每一笔交易、每一段心念、每一篇复盘都存储为结构化数据：统一的字段、一致的模式、附带情绪与时间戳的决策快照。这种结构不是繁琐，而是**可查询**的基础——被你自己查，被规律查，被 AI 查。

### Obsidian Vault 导出：你的第二大脑出口

设置页有一个功能，其重要性远超它在菜单中的位置：**导出 Vault**。

点击后，应用将你的全部日志转换为结构化的 Markdown 文件夹——每笔交易一个文件，每段心念一个文件，每篇复盘一个文件，带 YAML 元数据，带双向链接，以 zip 打包。这是知识库工具和 AI 智能体原生理解的格式。导出后，你的日志脱离任何单一应用的束缚，以你永久掌控的形式存在。

这是**投资思维的第二大脑**——可搜索、可传承、AI 可读的心智外化产物。应用本身只是入口，结构化数据才是你真正积累的资产。

> 将 Vault zip 导入 [Obsidian](https://obsidian.md)，你的日志将成为可图谱化的知识网络。将其作为上下文加载给任意 AI 智能体，你将拥有一个能够对数年真实思维进行推理的系统——而非仅仅回答通用投资问题的对话机器。

---

## 第二章 · 问道之源 — 当 AI 读懂了你的修炼记录

绝大多数 AI 工具用通识回答你的问题。这款应用的导师，用你的记录回答你的问题。

当你向巴菲特的 AI 形象询问某个持仓时，他已读过你具体的交易记录、你声明的哲学、你的情绪规律、你的规则违反记录、你的周记与月评。他给出的不是关于"护城河"的通用讲解，而是将巴菲特的分析框架**照进你的真实行为**——你说要做到的与你实际做到的之间的那道缝隙。

这一切，只因你有过结构化的记录。AI 读到的是你的第二大脑，不是对你的猜测。

**七位导师，七种视角：**

- **你的导师**——熟读你的全部日志，以你的具体交易和规律为坐标，给出个性化分析
- **彼得·林奇**——投资你真正了解的生意，合理价格的成长，警惕热门题材
- **巴菲特**——好公司合理价格，护城河，以十年为尺度的持有心态
- **芒格**——心智模型，逆向思维，激励结构，不留情面的追问
- **达利欧**——原则，经济机器的周期，多元化，对极端情景的压力测试
- **霍华德·马克斯**——二阶思维，市场情绪的钟摆，价格里已经包含了什么
- **格雷厄姆**——安全边际，内在价值，定量纪律先于定性叙事

Vault 导出更将这种能力向未来延伸：你今后使用的任何 AI 工具，都可以将你的日志作为知识库加载。你不只是在记录——你在**积累一项资产**。

---

## 第三章 · 记录之功 — 交易与心念的日常修炼

道家有言：为学日益，为道日损。但积累认知的根基，须先"日益"——日积一笔，日存一念。

记录的价值与其质量成正比。一条在交易前诚实写下的记录，胜过十条事后追记。

### 交易计划（记录 · 交易计划）

点击底部**记录**标签，再点击**新建交易**，进入交易表单。支持两种输入方式：

**AI 智能输入** — 用自然语言自由描述交易，例如：

> "今天买了 200 股苹果，均价 175。服务收入增长好，股价回调 15%，估值合理。"

AI 自动提取操作、股票、理由和情绪，填入表单，检查后保存。行动仓促时，这是最快留下完整记录的路径。

**手动填写** — 逐项填写各字段：

| 字段 | 意义 |
|------|------|
| **ACTION** | 买入 / 卖出 / 持有 / 观察 |
| **STOCK** | 按代码或名称搜索 |
| **DATE** | 默认今日；未来日期可添加日历提醒 |
| **REASON** | 在行动**之前**写下你的逻辑。这是表单里最重要的字段。 |
| **EMOTION** | 平静 / 笃定 / 中性 / 焦虑 / 恐惧 |
| **RULES CHECK** | 交易前你核查了哪些自己的规则 |

点击**写入交易日志**保存。买入或卖出后，应用会提示更新持仓，也可点击**跳过**留待之后处理。

**关于 REASON 字段的修炼**

禅宗有"话头"之说——在念头生起时将其定格、审视。REASON 字段就是投资的话头功夫：在行动之前，用文字追问自己：*什么条件为真，这笔交易才算合理？*

写下去。未来的你，会持有这个问题，对照结果。

### 心念（心念）

切换至**心念**子标签。

"心念"在佛教与禅宗语境中，指意识流中升起的一个念头——未成形的觉知，悬而未决的思索。在这款应用里，心念栏专为那些**尚未落地为决策**的时刻而设：你几乎要加仓但没有；你研究了一家公司但搁置了；你感到某种不安但说不清来源。

这些时刻是最珍贵的数据。犹豫也是数据，克制也是数据，没有行动的直觉也是数据。

点击**记下心念**，自由书写，无需格式。

交易记录与心念，均支持向任意导师求教：展开任意条目，点击**求教 [导师名]**，获取该导师针对此条记录的实时点评。点击**继续 ↗**，可将此次对话带入完整的问道界面，上下文自动加载。

---

## 第四章 · 持仓与上下文 — 仓位不只是数字

点击底部**持仓**标签。

持仓页的核心不是实时盈亏的展示——尽管它确实做到了。它更深层的意义是：**让 AI 导师知道你当前的位置**。

点击**新增持仓**，除基础字段（代码、股数、成本、币种）外，对 AI 最有价值的字段是：

- **REASON TO BUY · 购买原因** — 你的原始买入逻辑。六个月后再向导师询问这只股票时，他将用这段逻辑衡量你当下的判断。
- **NOTES · 备注** — 止损位、观察触发条件、改变看法的前提。
- **BUY DATE · 买入时间** — 给导师一条时间轴。

持仓行上的**带入问道 ↗** 链接，会将该持仓的完整信息——股数、成本、当前价格、盈亏、买入日期、原始理由——预填为一条消息，直接打开问道标签。导师不需要你再次描述背景，他已经看到了。

实时价格通过 Yahoo Finance 获取。点击**刷新**更新；进入问道页时自动同步。持仓按币种汇总成本、市值和浮盈亏，显示在页面顶部。

---

## 第四点五章 · 个股研究 — 行动之前的决策备忘录

点击底部**研究**标签（研究）。

研究模块为了解决一个具体问题：从"这个想法有意思"到"我已准备好行动"之间的空白。许多投资错误正是在这个空白里发生的——逻辑还模糊，清单还没跑完，没有人逼问过失效条件。决策备忘录的作用，就是在任何资金移动之前，把这些工作强制完成。

### 新建研究备忘录

点击右上角**新建**，或点击记录页任意条目的**研究这个想法 ↗**（自动带入股票代码）。

填写器需要：
- **股票代码** — 按代码或公司名称搜索
- **投资逻辑** — 2-4 句话：为什么有趣？什么条件为真时这才是好的投资？
- **补充信息** — 任何公开数据里没有的事实：财报电话会引言、最新新闻、内部细节
- **复盘周期** — 多少个月后安排重新评估（默认：3 个月）

点击**生成研究备忘录**。应用自动获取 Yahoo Finance 基本面数据（市盈率、市净率、PEG、自由现金流、52 周区间、分析师预测、下次财报日期），通过 AI 生成结构化备忘录。

### 备忘录的内容

备忘录从不说"现在买入"或"现在卖出"，它给出的是**条件性判断**：

| 状态 | 含义 |
|------|------|
| 建仓机会 Buy Setup | 条件有利；仓位管理定义何时买、买多少 |
| 观望 Watch | 逻辑成立但入场条件未触发；明确触发器 |
| 降低风险 Reduce Risk | 某些情况已改变；在重新评估前减仓或对冲 |
| 回避 Avoid | 当前条件下逻辑不成立 |

备忘录同时包含：
- **商业快照** — 公司做什么，收入驱动因素，竞争优势，市场对它的核心争议
- **深度研究清单** — 每项标注证据质量（财报 / 基本面数据 / 分析师预测 / 用户输入）
- **估值核查** — 当前倍数与同行对比、牛/基准/熊三种情景、隐含合理价值区间、关键假设
- **仓位管理** — 最大仓位比例、首批建仓、加仓/减仓条件、失效条件
- **3-6 个月策略** — 具体观察项、买入触发条件、卖出/减仓触发条件、复盘日期
- **规则冲突检查** — 你的每条个人规则逐一核查（通过/不通过/不适用）；"不通过"需要填写覆盖理由方可继续
- **数据来源** — 每个数据源标注层级（Yahoo Finance / 用户输入）和时间戳；过期数据自动标注

**免责声明**始终可见于备忘录底部：此备忘录为决策支持，不构成投资建议。

### 版本管理

每次重新生成（如财报后或逻辑有变化），应用创建一个新的不可变版本。点击标题处的版本标签，查看历史版本并对比各版本的状态、投资逻辑和估值。旧版本永不被覆盖。

### 与持仓的联动

拥有研究备忘录的持仓行上会显示小状态点。点击**更新研究 ↗**，以当前持仓上下文（股数、成本、买入理由）预填入表单，生成新版本。

### 与问道的联动

当你向任意导师询问已有研究备忘录的股票时，导师自动收到当前结论及其失效条件作为上下文，无需你重新粘贴。导师知道你已得出什么结论，可以质疑、验证或更新它。

---

## 第五章 · 复盘之法 — 反思是修炼的核心功夫

围棋有"复盘"之术：对局结束后，重走一遍每一步，在结果已知的上帝视角里，重新审视每个决策节点。复盘不是检讨，是**认知的锻造**——将经验冶炼成智慧的过程。

点击底部**复盘**标签，包含两个子功能：

**周记** — 简短的每周记录：市场发生了什么，你如何回应，你注意到自己的什么倾向。频率重于深度。每周几句话，一年后是一部完整的认知史。

**月评** — 更深入的月度复盘：不只是收益，更是决策质量。过程正确而结果不佳，与过程草率而结果侥幸，是完全不同的两回事。学会区分它们，是走向成熟的标志。

当月末将近且有待复盘的交易时，主页会出现提醒横幅，引导你开始月评。

周记与月评均被导出到 Vault，也被 AI 导师读取。持续记录的投资者，给予了导师更丰富的上下文——得到的回应，也将更有针对性。

---

## 第六章 · 问道之悟 — 向读懂你的导师求教

"问道"二字，典出老子：道可道，非常道。问道，不是寻求标准答案，而是在追问中逼近自己的盲点。

点击底部**问道**标签。

页面顶部显示导师已同步的日志量：交易数、持仓数、周记数、月评数。这不是装饰，是他所读过的内容的边界。

顶部芯片栏选择导师。每位导师维护**独立的对话线程**——切换导师，只显示该导师的历史记录。点击右上角 **RESET** 清空当前导师的对话，其他导师的记录不受影响。

在底部输入框输入问题，点击发送。若 AI 暂时失联，会显示**重新发送**按钮，无需重新输入。**长按**任意消息气泡可复制文本。

对话为空时的推荐开场问题——问道的入口：

- *"帮我看看最近几笔交易有什么规律？"*
- *"我焦虑的时候做的决定，结果通常怎样？"*
- *"我的哪条规则最容易被我自己违反？"*
- *"下个月我应该重点关注什么？"*

问道，用"你的导师"看规律；用林奇、巴菲特、芒格看框架。两者是不同的功夫——前者照见你是谁，后者帮你看清这件事。

---

## 第七章 · 入门配置

通过主页右上角的**齿轮图标**进入设置页面。

### DeepSeek API Key

应用的全部 AI 功能依赖 [DeepSeek](https://platform.deepseek.com) API，以你自己的账号计费。

1. 访问 **platform.deepseek.com**，注册并生成 Key（以 `sk-` 开头）
2. 粘贴到 **DeepSeek API Key** 输入框，点击**保存 API Key**
3. 状态从红色**未配置**变为绿色**已配置**

> **费用参考：** 月均花费约 $1–3 美元。服务端自动复用前缀缓存，重复内容不重复计费。

### 主页 — 心法与规则

**心法**主页的投资哲学是你单句投资原则。写得越具体，AI 导师的基础上下文越准确。

**规则**是你在每次交易前承诺核查的清单（最多 5 条）。点击 **EDIT RULES** 管理。规则在交易表单中以复选框出现，并在策略报告中追踪遵守情况。规则必须具体可验证：*"单只股票不超过持仓 25%"* 是规则；*"只买好股票"* 不是。

**策略报告**（需 5 条以上交易记录）：点击**生成我的投资策略报告**，AI 分析你的真实行为——真实策略、情绪规律、规则遵守情况、盲点建议。点击**导出 PDF** 可分享。

### 数据导出

**Obsidian Vault 导出（推荐）：** 点击**导出 Vault**，生成结构化 Markdown 文件夹 zip。这是你第二大脑的可携带形式。保存到 Google Drive，导入 Obsidian，或加载给任意 AI 智能体。

**JSON 备份：** 完整原始数据库导出，用于换设备或定期备份。

### 隐私说明

所有日志数据本地 SQLite 存储，不上传任何服务器。DeepSeek 仅在你求教导师时收到相关档案片段。Yahoo Finance 仅收到持仓的 ticker 代码。语音输入由 Android 系统输入法处理，不经过本应用。

### 危险操作

**清空与导师的聊天记录** 永久删除所有导师的对话历史，需二次确认，不可撤销。

---

## 第八章 · 修炼之道 — 长期积累的纪律

投资日志是你的修炼道场。**记录是功，复盘是法，问道是悟。**

但道场的价值由你在其中投入的功夫决定。以下是值得养成的习惯：

1. **交易前写理由，而非交易后。** 事后追记已被结果污染。只有行动之前的记录，才是真正免疫于自我合理化的证据。

2. **记下犹豫，不只是决定。** 你几乎要买但没买的，你研究了但放弃的，你感到不安但说不清的——这些心念往往比最终的交易更能揭示你的思维盲区。

3. **如实记录情绪。** 当时焦虑就记焦虑。只有诚实的记录，才能找到"焦虑时做的决定最终如何"这个问题的真实答案。

4. **用"你的导师"照见自己，用大师视角审视具体决策。** 两者是不同的功夫——前者是镜子，后者是尺子。

5. **每周复盘，哪怕只有几行。** 周记的价值来自连续性，而非深度。断断续续的五千字，不如每周几句的五十二篇。

6. **定期导出到 Obsidian。** Vault 导出是你对任何单一工具的对冲，也是你对未来 AI 工具的开放接口。你的思想一旦结构化，便开始以复利增值。

---

*投资日志 v1.0 · The Investor's Ledger · 所有数据本地存储于您的设备 · All data stored locally on your device*
