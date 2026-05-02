# Product Requirements Document

## 投资日志 · The Investor's Ledger

**Version:** 1.3
**Date:** 2026-05-01
**Format:** Android mobile application
**Target:** AI coding agents (single-source-of-truth for autonomous implementation)

---

## 1. Product Summary

A personal, offline-first investment journaling Android app that combines structured trade logging with an AI mentor system. Users record their investment philosophy, rules, trades, thoughts, and holdings; the app provides on-demand commentary from a personalized AI mentor or from AI personas of famous investors (Peter Lynch, Buffett, Munger, Dalio, Marks, Graham).

**Key differentiators:**
1. **Template-driven structure** — enforces philosophy → rules → weekly notes → monthly reviews → trade log, rather than freeform journaling.
2. **AI mentor persona** — DeepSeek with the user's full journal as context, accessible via chat or on-demand feedback on individual entries.
3. **Master personas** — switch perspectives to get Peter Lynch's, Buffett's, etc. reaction on any entry.
4. **Voice-first input** — every text field supports speech-to-text.
5. **Local-only data** — SQLite on device, never cloud-synced. User owns their data.
6. **Token-frugal AI** — feedback is on-demand (never auto-triggered), prompt caching reduces cost ~90% for chat.

---

## 2. Technology Stack (MANDATORY)

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Expo SDK 54 / React Native 0.81.5** | Enables APK build via EAS without Android Studio; cross-platform future-proof |
| Language | **JavaScript (no TypeScript)** | Matches project style; lower cognitive overhead |
| Database | **expo-sqlite** (async API) | Industry-standard mobile SQLite; works offline |
| Secure Storage | **expo-secure-store** | For the DeepSeek API key only |
| Navigation | **@react-navigation/bottom-tabs** v6 | Standard RN tab navigation |
| Voice Input (in-app button) | **@react-native-voice/voice** | Native Android/iOS speech-to-text. On devices with iFlytek IME installed, the system STT already routes through it automatically — we get iFlytek accuracy for free. |
| Voice Input (keyboard mic) | **System IME** (e.g., iFlytek 讯飞输入法) | Users with iFlytek IME installed can tap the keyboard's mic button on any TextInput — transcript is injected like normal typing. Zero integration work. |
| Icons | **lucide-react-native** | Consistent icon set |
| Fonts | **@expo-google-fonts/fraunces**, **@expo-google-fonts/jetbrains-mono** | Editorial serif + technical mono |
| AI API | **DeepSeek API direct** (fetch, OpenAI-compatible) | No backend; BYOK model; cost-effective vs Anthropic |
| Price Data | **Yahoo Finance public endpoints** (`query1.finance.yahoo.com/v8/finance/chart/`) | Free, no API key, global coverage |
| Date Picker | **@react-native-community/datetimepicker** | Native Android calendar dialog; Expo SDK 54 / EAS compatible; no Modal wrapper needed |
| Build | **EAS Build** (cloud) with APK profile | Produces installable `.apk` without local Android Studio |

**Forbidden:**
- Web-only dependencies (e.g., `window.storage`, `localStorage`, DOM APIs)
- Cloud sync services
- Any backend server
- TypeScript (keep JS)

---

## 3. User Flow Overview

```
First Launch
    ↓
[If no API key] → Home shows "API key 未配置" banner → tap gear icon → Settings → paste key
    ↓
心法 (Home — philosophy, rules, default mentor, stats)
    ↓
┌─────────────┬──────────────┬──────────────────────────┬──────────────┐
│    记录      │    持仓       │          复盘             │    问道       │
│    Log      │  Holdings    │  Review (sub-tabs)        │   Mentor     │
│             │              │ ┌──────────┬───────────┐  │              │
│ trades +    │ positions    │ │  周记     │   月评    │  │ chat with    │
│ thoughts    │ w/ live      │ │ weekly   │ monthly   │  │ mentor (all  │
│ w/ voice,   │ prices       │ │ note     │ 4-5 pts + │  │ context +    │
│ AI parsing  │ (Yahoo)      │ │ w/ voice │ AI view   │  │ caching)     │
│             │              │ └──────────┴───────────┘  │              │
└─────────────┴──────────────┴──────────────────────────┴──────────────┘
                                          ↑
              Settings (hidden — via ⚙ gear in 心法 masthead)
```

---

## 4. Data Model (SQLite Schema)

All data persists in `journal.db` located at the app's document directory. Schema uses `WAL` mode for durability.

```sql
-- Key-value store for singletons (philosophy, rules, default master)
CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL  -- JSON-stringified
);

-- Trade log entries
CREATE TABLE trades (
  id TEXT PRIMARY KEY,           -- trade_<timestamp>_<random>
  date TEXT NOT NULL,            -- ISO 8601
  action TEXT NOT NULL,          -- buy|sell|hold|watch
  stock TEXT NOT NULL,           -- ticker symbol (e.g., AAPL, 0700.HK)
  stock_name TEXT,               -- display name from Yahoo Finance autocomplete (e.g., "Apple Inc.")
  reason TEXT NOT NULL,
  emotion TEXT NOT NULL,         -- calm|confident|neutral|anxious|fearful
  shares REAL,                   -- optional; used for holdings sync
  cost_per_share REAL,           -- optional; used for holdings sync
  rules_checked TEXT,            -- JSON string[] of rule texts
  raw_input TEXT,                -- original voice/text before AI parsing (nullable)
  feedback TEXT,                 -- JSON [{masterId, text, createdAt}]
  created_at INTEGER NOT NULL
);

-- Dilemma/thought entries (not trades)
CREATE TABLE thoughts (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  raw_input TEXT,
  feedback TEXT,                 -- JSON [{masterId, text, createdAt}]
  created_at INTEGER NOT NULL
);

-- Current positions
CREATE TABLE holdings (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,          -- e.g., AAPL, 0700.HK, 600519.SS, BTC-USD
  display_name TEXT,
  shares REAL NOT NULL,
  cost_basis REAL NOT NULL,      -- per-share cost
  currency TEXT,                 -- USD|CNY|HKD|SGD|EUR|JPY
  buy_reason TEXT,               -- investment thesis / why this position exists
  notes TEXT,
  buy_date TEXT,                 -- YYYY-MM-DD; null for pre-feature holdings
  added_at INTEGER NOT NULL
);

-- Weekly notes (one per ISO week)
CREATE TABLE weekly_notes (
  week_key TEXT PRIMARY KEY,     -- YYYY-Www e.g., "2026-W16"
  text TEXT NOT NULL,
  updated_at INTEGER
);

-- Monthly reviews (4-5 bullets per month)
CREATE TABLE monthly_reviews (
  month_key TEXT PRIMARY KEY,    -- YYYY-MM
  bullets TEXT NOT NULL,         -- JSON string[]
  updated_at INTEGER
);

-- Cached mentor commentary per (month, master)
CREATE TABLE monthly_mentor_cache (
  month_key TEXT,
  master_id TEXT,
  text TEXT,
  created_at INTEGER,
  PRIMARY KEY (month_key, master_id)
);

-- Chat history with personal mentor
CREATE TABLE chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,            -- user|assistant
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Yahoo Finance price cache
CREATE TABLE prices_cache (
  symbol TEXT PRIMARY KEY,
  price REAL,
  currency TEXT,
  change_percent REAL,           -- today's % change
  resolved_ticker TEXT,
  as_of TEXT,                    -- e.g., "2026-04-20 3:45pm EDT"
  updated_at INTEGER
);

-- Singleton for last price batch fetch time
CREATE TABLE prices_meta (
  id INTEGER PRIMARY KEY CHECK (id=1),
  last_updated INTEGER
);
```

**Default KV values on first launch:**
- `philosophy`: empty string
- `rules`: `["No single stock >25%", "Only sell when thesis breaks", "Write before I trade", "Read 5 pages a week", "Never trade on emotion"]`
- `defaultMaster`: `"default"`

---

## 5. Screen-by-Screen Specification

### 5.1 Home (tab: 心法)

**Layout top-to-bottom:**

1. **Masthead**: "Vol. {year}" + today's date, then "The Investor's Ledger" (Fraunces serif, 32pt), then "私人投资日志 · Personal Journal" (italic). **Gear icon (⚙) in the top-right of the masthead navigates to the hidden Settings screen** (since Settings has no tab bar button).
2. **API key warning banner** (conditional): Shows if no DeepSeek API key configured. Dark background (ink color), gold kicker "API KEY 未配置", with button pointing user to the gear icon to reach Settings.
3. **Monthly review banner** (conditional): Shows only during the **last 7 days of the month** AND when current month has ≥ 1 trade AND no monthly review saved yet AND user hasn't dismissed this month's banner. Dark background, gold accents, "该写月评了" + count of trades, CTA "开始写月评" navigates to Monthly tab. Dismiss (X) persists to KV `reviewDismissed:<YYYY-MM>=true`.
4. **Mentor shortcut card**: White card, "与投资导师对话" + "一位熟知你全部日志的 AI mentor", tap navigates to Mentor tab.
5. **Section: My Investment Philosophy** (pin icon): One-sentence quote in italic serif, left border accent-colored. Tap to edit; supports multiline up to 3 rows.
6. **Section: My Rules**: Ordered list 01-05, each row with gold number + serif text. "EDIT RULES" button toggles edit mode where each rule is an input with ✕ delete and "+ ADD RULE" (up to 5).
7. **Section: Default Mentor**: Explanation italic "新条目需要点评时，默认请哪一位？", then horizontal scrollable chips of all 7 masters (see §6). Tap = set default.
8. **Section: At a Glance**: 5-column grid of `Stat` components: 持仓 / 交易 / 心念 / 周记 / 月评 (counts).

### 5.2 Review (tab: 复盘)

**Container screen** (`src/screens/Review.js`) that hosts two sub-tabs:
- **周记 Weekly** — left sub-tab (default)
- **月评 Monthly** — right sub-tab

Sub-tab switcher: two full-width buttons at the top; active tab has ink background + paper text. Tapping switches between the two child screens rendered below.

### 5.2a Weekly (sub-tab of 复盘)

**Features:**
- Current ISO week shown with label + date range (e.g., "2026-W16 · 4.13 – 4.19").
- Large multiline PaperInput (min 110pt height) for the week's note.
- VoiceMic button (size 32) to the right of the week title for voice-to-text.
- Save button label: "写入本周" or "更新本周记录", disabled when unchanged.
- **Archive section** below: list all past weeks (sorted descending) with week_key in mono + first line of note in serif. Tap loads that week into the editor.

**Data operations:**
- Load: `db.listWeeklyNotes()` on mount.
- Save: `db.saveWeeklyNote(weekKey, text)`. Empty text deletes the row.

### 5.3 Monthly (sub-tab of 复盘)

**Features:**
- Horizontal scrollable month selector at top (all months with trades or reviews, plus current month, sorted descending). Active month has ink background.
- **Month summary block** (for active month): count of trades + breakdown by action (buy/sell/hold/watch counts in colored serif).
- **Mentor monthly commentary block** (conditional: only if `monthTrades.length > 0`):
  - Title: "MONTHLY VIEW · 导师月度点评"
  - MasterChips selector (default = user's defaultMaster)
  - Box shows cached text from `monthly_mentor_cache` if exists; otherwise a "请 {master.zh} 点评本月" button that calls `generateMonthlyCommentary(month, monthTrades, masterId, profile)` and caches result to DB.
- **Review bullets editor**: 4-5 bullet inputs, each with VoiceMic. Placeholders rotate: ["最成功的一笔决策？", "最想重来的一笔？", "这个月学到了什么？", "下月要改什么？", "其他观察…"]. "+ ADD BULLET" to grow to 5.
- Save button: "归档月评" (new) or "更新月评" (existing).

**Data operations:**
- Save bullets: `db.saveMonthlyReview(monthKey, filteredBullets)`.
- Mentor cache: `db.getMonthlyMentor(monthKey, masterId)` / `db.setMonthlyMentor(monthKey, masterId, text)`.

### 5.4 Log (tab: 记录, route: `log`)

**Two sub-tabs**: 交易 Trades | 心念 Thoughts

**Trades sub-tab:**
- "新建交易" button reveals TradeForm.
- List of trades: date (mono) | action icon+label | stock name (serif bold) | emotion icon (muted).
- Tap row to expand → shows full reason, emotion label, rules checked, original input (if AI-parsed), **FeedbackBlock**, and EDIT / DELETE controls.
- **Inline edit mode**: tapping EDIT reveals an editable `reason` field (multiline) + emotion chip picker. SAVE persists changes via `db.updateTrade(id, {reason, emotion})`; CANCEL restores original. Editing replaces the FeedbackBlock in the expanded view (they do not overlap). Delete remains available only when not editing.
- **FeedbackBlock** behavior:
  - Horizontal MasterChips.
  - If cached feedback for active master exists: render it. Multi-master switching is supported — each master's text is independently cached in a `localCache` state within the component so switching away and back does not blank the previously-loaded text.
  - If not cached: tap to request → calls `generateEntryFeedback(trade, "trade", masterId, profile)` → appends to `feedback[]` → persists via `db.updateTradeFeedback`.
  - **CRITICAL: feedback is NEVER auto-generated on save. Always on explicit user tap.**
  - **"带入问道继续讨论 ↗" button** appears below any loaded feedback text. Tapping it: (1) appends two messages to `chat_history` (user context message + assistant feedback text), (2) navigates to the 问道 tab. The mentor screen reloads on focus and immediately shows the context so the conversation can continue seamlessly.

**TradeForm:**
- Segmented control at top: "AI 智能输入" (wand icon) vs "手动填写" (pencil icon).
- **Smart mode**: A bordered card (dashed accent) with:
  - Multiline input for raw voice/text.
  - "LISTENING" indicator when voice active.
  - Two buttons: [Mic toggle] and "AI 生成交易摘要" (gold button).
  - On tap: `parseTradeText(rawInput)` → populates form below.
- Structured fields (always visible, smart mode fills them):
  - ACTION (4 buttons: buy/sell/hold/watch, colored)
  - STOCK — `StockSearchInput` with Yahoo Finance autocomplete (debounced 400ms)
  - DATE (mono input, YYYY-MM-DD)
  - SHARES + COST · 均价 (side by side, numeric, optional) — shown only for buy/sell actions; hidden and reset for hold/watch
  - REASON (multiline, min 100pt)
  - EMOTION (5 chips: calm/confident/neutral/anxious/fearful)
  - RULES CHECK (checkboxes of current rules)
- Save button: "写入交易日志". Hint below: "在详情页可按需求教任一位导师点评".
- **Holdings auto-sync on save (buy/sell only):** When saving a trade with shares + cost filled in:
  - **BUY**: if symbol already in holdings → merge with weighted-average cost basis (`(old_shares × old_cost + new_shares × new_cost) / total`), update shares; if not in holdings → prompt user via Alert to add immediately, pre-filling buy_reason from trade reason.
  - **SELL**: reduce shares from matching holding; if shares reach ≤ 0 → delete holding entirely.
  - Precision: 8 decimal places (supports crypto). No action if shares/cost blank.

**Thoughts sub-tab:**
- "记下心念" button reveals ThoughtForm.
- List: date | help-circle icon | first 80 chars of content (expand on tap).
- Expanded: FeedbackBlock (with "带入问道" button, same as trades) + inline EDIT / DELETE. Tapping EDIT shows full content in an editable `PaperInput`; SAVE persists via `db.updateThought(id, content)`.
- ThoughtForm: header "把心里的纠结、疑问、直觉写/说出来。", large multiline input (160pt min) with voice, save button "记下".

### 5.5 Holdings (tab: 持仓, route: `holdings`)

**Features:**
- Masthead "当前持仓" + "What I own, at what cost, at what price."
- **Market data bar** (when holdings exist): shows freshness ("更新于 X 分钟前" or "尚未获取实时价格"), with "刷新" button → calls `fetchLivePrices(uniqueSymbols)` → persists via `db.savePrices(map)`.
- **Totals block** (grouped by currency): for each currency, show cost / market value / P&L % in colored serif.
- "新增持仓" button reveals HoldingForm.
- **Holding row**:
  - Top row: symbol (serif bold) + display name (small serif muted) on left; current price + today's % change on right (colored green/red).
  - Bottom row (dashed separator): 市值 + P&L amount & percent (colored).
  - Footer: mono "as of" timestamp + resolved ticker if different.
  - Tap opens HoldingForm in edit mode (with delete option).

**HoldingForm fields:**
- SYMBOL — `StockSearchInput` with Yahoo Finance autocomplete (debounced 400ms); selecting a result auto-fills DISPLAY NAME. Hint: "AAPL / 0700.HK / 腾讯…"
- DISPLAY NAME (optional)
- SHARES (numeric) + COST (numeric) — side by side
- CURRENCY (chips: USD/CNY/HKD/SGD/EUR/JPY)
- BUY DATE · 买入时间 — tappable date display (Calendar icon + formatted date); opens native Android calendar picker via `@react-native-community/datetimepicker`; defaults to today; stored as `YYYY-MM-DD` TEXT
- REASON TO BUY · 购买原因 (multiline, optional) — investment thesis; included in mentor's investor profile context
- NOTES (multiline, optional)

### 5.6 Mentor (tab: 问道, route: `mentor`)

**Features:**
- Masthead "投资导师", subtitle showing sync status:
  - `已同步 · {tradeCount} 交易 · {holdingsCount} 持仓 · {weeklyCount} 周记 · {monthlyCount} 月评`
  - Below: real-time price freshness indicator (green dot + "行情 X 分钟前" + refresh link) if holdings exist.
- **Auto-refresh prices on mount** if holdings exist AND `prices.lastUpdated > 15 minutes ago` OR null.
- **Empty state**: Italic quote "我读过你的每一页日志..." + 4 starter prompt buttons.
- **Message list**: user messages in ink bubble right-aligned; assistant messages left with small Quote icon + "MENTOR" kicker, then serif text with whitespace preserved.
- **Input row**: [VoiceMic] [multiline input] [Send button]. Enter sends (shift+Enter newline on hw keyboard).
- **Reset button** (top-right): clears all chat with confirmation prompt.

**Per message send:**
1. Append user message to local state and DB via `db.appendChat("user", text)`.
2. Call `chatMessage(history, text, profile, "default")` — internally trims to last 10 turns, uses cached system prompt.
3. Append response via `db.appendChat("assistant", reply)`.

**Chat reload on focus:** The screen uses `useFocusEffect` to reload `chat_history` from DB each time it gains focus. This ensures that entries written by "带入问道" from the Log screen appear immediately without requiring a manual refresh.


### 5.7 Settings (hidden screen, route: `settings`)

Accessible via the ⚙ gear icon in the 心法 (Home) masthead. Not shown in the tab bar.

**Sections:**
1. **DeepSeek API Key**:
   - Password-masked input (`sk-…` format). "保存" button calls `setApiKey(value)` (SecureStore).
   - "清除" button for deletion.
   - Link to `https://platform.deepseek.com/api_keys`.
2. **语音输入 · Voice Input**:
   - Informational only (no toggles or credentials).
   - Hint: "为获得更好的中文语音识别，建议安装讯飞输入法或搜狗输入法。在任意输入框中，可以点击键盘上的麦克风按钮进行语音输入；或点击 App 内的麦克风图标快捷录入。"
   - Links to Play Store pages for 讯飞输入法 / 搜狗输入法 (optional; can be plain text).
3. **导出 · Export** (TWO export modes):
   - **Markdown Vault (recommended, primary)**:
     - "导出 Vault → 保存到 Google Drive 等" button → calls `exportToObsidianVault(profile)`.
     - Generates an Obsidian-compatible folder structure (see §15) → zips to `cacheDirectory` → triggers `Sharing.shareAsync` so user picks any destination (Drive, email, downloads).
     - The user explicitly chooses where to save each time. App's local SQLite is unchanged.
   - **JSON Backup (secondary)**:
     - "导出 JSON 备份" outline button → calls `db.exportAll()` → JSON file → share dialog.
     - Used for restoring on a new device or as a raw record of all fields including cached mentor feedback.
4. **About**:
   - App version, token economy explanation (~$1-3/month), privacy note.
   - Privacy details: DeepSeek sees journal context (only when you tap 求教 or chat with mentor). Yahoo Finance sees tickers you hold. Voice audio goes through your chosen Android IME, not through this app. Everything else stays local.
5. **Danger zone**:
   - "清空聊天记录" button with confirmation.

---

## 6. Investment Masters

Seven selectable personas. Each has a hard-coded system prompt style (~200 words) that DeepSeek adopts. `MASTERS[0]` is always `"default"` = personal mentor. The other 6 are named masters.

| id | zh | Core stance |
|---|---|---|
| `default` | 你的导师 | Warm, knows user's history, pattern-spotter, challenges gently |
| `lynch` | 彼得·林奇 | Invest in what you know, GARP, categorize stocks, pragmatic |
| `buffett` | 巴菲特 | Wonderful companies fair prices, moats, 10-year holding mindset |
| `munger` | 芒格 | Mental models, inversion, blunt, incentive-aware |
| `dalio` | 达利欧 | Principles, cycles, diversification, stress-test beliefs |
| `marks` | 霍华德·马克斯 | Second-level thinking, cycle awareness, risk over return |
| `graham` | 格雷厄姆 | Margin of safety, investment vs speculation, conservative |

All master prompts end with: "Match the user's language exactly (Chinese/English/mixed). Do NOT start with 'As {name}...' — just speak naturally. Use the investor's actual record to make your advice specific, not generic."

---

## 7. Token Economy (NON-NEGOTIABLE)

**Principle**: minimize API cost without degrading UX.

### 7.1 Model selection
- **`deepseek-v4-flash`** for `parseTradeText` — fast, cheap, structured extraction only.
- **`deepseek-v4-pro`** for all mentor output (entry feedback, chat, monthly commentary, strategy report).

### 7.2 Prompt caching
- DeepSeek handles KV caching automatically server-side based on prefix matching — no client-side `cache_control` annotations needed.
- System prompt is built as a plain string: `persona + "\n\n" + <investor_profile>...</investor_profile>`.
- The `<investor_profile>` block is identical across rapid calls → subsequent chat messages benefit from server-side prefix cache.

### 7.3 On-demand feedback
- **Never auto-generate mentor feedback on trade/thought save.** User must tap to request per-master.
- Monthly commentary is cached in `monthly_mentor_cache` — computed once per (month, master), then re-used.

### 7.4 Context trimming
When building `<investor_profile>`:
- `recent_trades`: last **15** (was 30 in web version)
- `weekly_notes_recent`: last **8**
- `monthly_reviews_recent`: last **4**
- `holdings`: all (usually small list)
- Chat history: trim to last **10 turns** (5 exchanges) before sending.

### 7.5 Zero-token pricing
- Never use Claude's web_search for prices. Use Yahoo directly.
- Yahoo responses come back in ~200ms vs Claude's 15-30s.

**Estimated daily-user cost: $1-3/month** (assumes 3-5 feedback requests per day, 20-30 chat messages, 1-2 monthly reports).

---

## 8. External APIs

### 8.1 DeepSeek API
- Endpoint: `https://api.deepseek.com/chat/completions` (OpenAI-compatible)
- Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`
- Body: `{ model, max_tokens, messages: [{ role: "system", content: system }, ...userMessages] }`
- Response: `data.choices[0].message.content`
- Key stored in `expo-secure-store` (key name: `deepseek_api_key`).
- If no key: throw `Error("NO_API_KEY")` — UI catches and redirects to Settings.
- **No `cache_control` blocks needed** — DeepSeek caches automatically on the server side.
- **Streaming implementation note:** React Native's `fetch` does not expose `response.body` as a `ReadableStream` — `res.body.getReader()` is unavailable. `callLLMStream` detects this and falls back to `res.text()`, parsing all SSE `data:` lines at once. `onChunk` is still called (in a single batch at the end) so the streaming code path remains consistent. Progressive display is not available on React Native; the spinner shows until the full response is ready.

### 8.2 Yahoo Finance
- Endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=2d`
- Headers: `User-Agent: Mozilla/5.0 (compatible; InvestmentJournal/1.0)` (required to avoid 401).
- Parse response:
  - `price = result.meta.regularMarketPrice`
  - `currency = result.meta.currency`
  - `prevClose = result.meta.chartPreviousClose || result.meta.previousClose`
  - `changePercent = (price - prevClose) / prevClose * 100`
  - `asOf = new Date(result.meta.regularMarketTime * 1000).toLocaleString()`
- Parallel fetch with `Promise.allSettled` — failures omitted from output, don't crash.
**Symbol search (autocomplete):**
- Endpoint: `https://query1.finance.yahoo.com/v1/finance/search?q=<query>&quotesCount=5`
- Returns `data.quotes[]` with `{ symbol, longname, shortname, exchange, quoteType }`.
- Used in `StockSearchInput` component — debounced 400ms, min 2 chars, clears on unmount.
- Available in both HoldingForm (Holdings tab) and TradeForm (Log tab).

- Ticker conventions user must follow:
  - US stocks: `AAPL`, `TSLA`
  - HK stocks: `0700.HK`
  - A-shares: `600519.SS` (Shanghai) / `000001.SZ` (Shenzhen)
  - Crypto: `BTC-USD`, `ETH-USD`
  - ETFs: `SPY`, `QQQ`

### 8.3 Voice Input (IME-based, zero integration)

**Design decision:** The app does NOT integrate any cloud STT API directly. Chinese speech recognition quality is delegated to the user's chosen Android input method editor (IME).

**Why this works:**
- Android IMEs like 讯飞输入法, 搜狗输入法, Google Gboard, etc. have a mic button on their keyboard that works in any TextInput.
- When tapped, the IME shows its own voice UI, transcribes, and inserts text into the input — app is oblivious to whether text came from typing, paste, or voice.
- Users who care about Chinese STT accuracy already have iFlytek 讯飞输入法 installed; they get ~95% accuracy for free.
- No AppID, APIKey, or APISecret management. No network code. No SecureStore entries for STT.

**In-app mic button (@react-native-voice/voice) is still provided** as a shortcut: tap mic → record without opening keyboard. On Android this calls the system-default SpeechRecognizer, which on iFlytek-IME phones often routes to iFlytek anyway.

**What the app does:**
- Every text field (weekly note, monthly bullets, thought content, trade reason, raw trade input, chat input) uses standard React Native `<TextInput>` — IME mic button works automatically.
- In-app mic button appears next to key inputs for one-tap voice entry.
- Settings has a hint: "For best Chinese recognition, install 讯飞输入法 or similar and use the keyboard's mic button."

**What the app does NOT do:**
- No WebSocket to iFlytek. No HMAC signing. No PCM streaming.
- No credential screens. No `expo-av`, no `expo-crypto`.
- No provider selection logic. `useSpeech` stays simple (single provider: native).

---

## 9. Visual Design Spec

### 9.1 Color palette
```js
bg:         "#f5f1e8"   // paper
bgCard:     "#fcfaf4"
bgElev:     "#ffffff"
bgMuted:    "#eae3cf"   // segmented control bg
ink:        "#1a1611"   // primary text
inkSoft:    "#3d342a"
inkMuted:   "#6b5a3f"
inkFaint:   "#8b6f47"
divider:    "#d8cfbc"
dividerSoft:"#e3dcc8"
accent:     "#d4a853"   // gold
good:       "#2d5f3f"
bad:        "#a03434"
warn:       "#a07838"
cool:       "#3a5578"
```

### 9.2 Typography
- **Serif display/body**: Fraunces (500 medium for body, 600 semibold for emphasis, 400 italic for quotes)
- **Mono**: JetBrains Mono (400/500) for dates, tickers, kickers
- **Kickers** (section labels): 10pt, tracking 2, uppercase, mono, inkFaint
- **Masthead title**: 32pt Fraunces 500, letter-spacing -0.8
- **Section title**: 17pt Fraunces 600

### 9.3 Component primitives (reusable)
- `<Masthead kicker title subtitle right>` — top-of-page header with 2px ink bottom border
- `<Section label sub pin>` — section block with top divider
- `<Stat value label>` — stat number + kicker
- `<Field label right hint>` — form field wrapper
- `<PaperInput multiline>` — serif input with subtle bottom border (or full border if multiline)
- `<FilledButton>` — ink background, paper text, serif bold
- `<OutlineButton>` — transparent with divider border
- `<MasterChips active onSelect>` — horizontal scrollable persona selector
- `<FeedbackBlock feedback onRequestMaster pending defaultMaster onContinueInMentor>` — entry feedback with master switcher. `onContinueInMentor(masterId, text)` is optional; when provided, renders "带入问道继续讨论 ↗" button below any loaded feedback text. Uses internal `localCache` + `streamAccumRef` so multi-master switching never blanks already-loaded feedback.
- `<VoiceMic currentText onChange size>` — microphone toggle button
- `<FormHeader title onCancel>` — back + kicker row in forms
- `<StockSearchInput value onChangeText onSelect placeholder style>` — PaperInput with Yahoo Finance autocomplete dropdown; debounced 400ms; fires `onSelect({ symbol, name, exch, type })` on pick; has clear (×) button
- `<TSerif TSerifBold TSerifItalic TMono Kicker>` — typography primitives

### 9.4 Navigation bar

**"修炼循环" — 5-tab practice loop** (as of v1.2):
- 5 visible tabs: **心法** / **记录** / **持仓** / **复盘** / **问道**
- Settings is hidden from the tab bar; accessible via gear icon (⚙) in the Home (心法) masthead.
- Each visible tab has a lucide icon (20px) + 9pt mono label.
- Active state: ink color. Inactive: inkFaint.

| Tab label | Screen | Route name | Icon |
|---|---|---|---|
| 心法 | Home | `home` | `Anchor` |
| 记录 | Log | `log` | `FileText` |
| 持仓 | Holdings | `holdings` | `Briefcase` |
| 复盘 | Review (sub-tabs: 周记 / 月评) | `review` | `RotateCcw` |
| 问道 | Mentor | `mentor` | `MessageCircle` |
| *(hidden)* | Settings | `settings` | — |

### 9.5 Icons
Using `lucide-react-native`:
- 心法 (Home): `Anchor`
- 记录 (Log): `FileText`
- 持仓 (Holdings): `Briefcase`
- 复盘 (Review): `RotateCcw`
- 问道 (Mentor): `MessageCircle`
- Settings (gear in Home masthead): `Settings`
- Actions: `TrendingUp` (buy), `TrendingDown` (sell), `Eye` (hold), `Search` (watch)
- Emotions: `Smile` (calm), `Zap` (confident), `Meh` (neutral), `Cloud` (anxious), `Frown` (fearful)
- Misc: `Plus`, `X`, `Check`, `Trash2`, `Edit2`, `Pin`, `Quote`, `Wand2`, `Pencil`, `Mic`, `MicOff`, `Loader2`, `ChevronLeft`, `ChevronRight`, `AlertCircle`, `RefreshCw`, `Send`, `RotateCcw`, `HelpCircle`, `Lightbulb`

---

## 10. File Structure (MANDATORY)

```
investment-journal-app/
├── App.js                          # Root: fonts, splash, navigation, global state context
├── app.json                        # Expo config (permissions: RECORD_AUDIO, INTERNET)
├── eas.json                        # Build profiles (preview=APK)
├── package.json                    # Dependencies
├── babel.config.js                 # babel-preset-expo
├── README.md                       # Setup + APK build instructions
├── src/
│   ├── theme.js                    # colors, fonts, spacing
│   ├── constants.js                # ACTIONS, EMOTIONS, MASTERS, MASTER_STYLES, DEFAULT_RULES
│   ├── utils.js                    # fmtDate, monthKey, weekKey, weekRange, fmtCurrency, ago
│   ├── db.js                       # SQLite schema + typed CRUD helpers
│   ├── api.js                      # DeepSeek + Yahoo Finance
│   ├── voice.js                    # useSpeech hook — wraps @react-native-voice/voice
│   ├── context.js                  # AppCtx React context + useApp hook (avoids circular imports)
│   ├── components.js               # shared UI primitives
│   └── screens/
│       ├── Home.js                 # 心法 tab — philosophy, rules, mentor default, stats
│       ├── Review.js               # 复盘 tab — sub-tab container for Weekly + Monthly
│       ├── Weekly.js               # 周记 sub-tab (inside Review)
│       ├── Monthly.js              # 月评 sub-tab (inside Review)
│       ├── Log.js                  # 记录 tab — trades + thoughts (sub-tabs)
│       ├── Holdings.js             # 持仓 tab
│       ├── Mentor.js               # 问道 tab
│       └── Settings.js             # hidden screen — accessible via gear icon in Home
└── assets/
    ├── icon.png                    # 1024x1024, app icon
    └── splash.png                  # splash screen
```

---

## 11. Key Function Signatures

### `src/api.js`

```js
// API key management
getApiKey(): Promise<string | null>
setApiKey(key: string): Promise<void>
clearApiKey(): Promise<void>

// DeepSeek API (throws Error("NO_API_KEY") if key missing)
parseTradeText(text: string): Promise<{action, stock, reason, emotion}>
generateEntryFeedback(entry, entryType: "trade"|"thought", masterId, profile): Promise<string>
generateMonthlyCommentary(month, monthTrades, masterId, profile): Promise<string>
chatMessage(history, newUserMessage, profile, masterId="default"): Promise<string>

// Yahoo Finance (no key, no throws from missing key)
fetchLivePrices(symbols: string[]): Promise<{[symbol]: {price, currency, changePercent, resolvedTicker, asOf}}>

// Internal helper
buildProfileContext({philosophy, rules, weeklyNotes, monthlyReviews, trades, holdings, prices, maxTrades, maxWeekly, maxMonthly}): string
```

### `src/db.js`

```js
getDb(): Promise<Database>                          // Opens + runs schema init
kvGet(key, fallback): Promise<any>
kvSet(key, value): Promise<void>

listTrades(): Promise<Trade[]>
addTrade(t): Promise<Trade>                         // Assigns id, empty feedback
updateTrade(id, fields): Promise<void>              // fields: subset of {reason, emotion, stock, action, date}
updateTradeFeedback(id, feedbackArr): Promise<void>
deleteTrade(id): Promise<void>

listThoughts(): Promise<Thought[]>
addThought(content, rawInput?): Promise<Thought>
updateThought(id, content): Promise<void>
updateThoughtFeedback(id, feedbackArr): Promise<void>
deleteThought(id): Promise<void>

listHoldings(): Promise<Holding[]>
addHolding(h): Promise<Holding>
updateHolding(id, updates): Promise<void>
deleteHolding(id): Promise<void>

listWeeklyNotes(): Promise<{[weekKey]: string}>
saveWeeklyNote(weekKey, text): Promise<void>        // Empty deletes row

listMonthlyReviews(): Promise<{[monthKey]: string[]}>
saveMonthlyReview(monthKey, bullets): Promise<void>

getMonthlyMentor(monthKey, masterId): Promise<string|null>
setMonthlyMentor(monthKey, masterId, text): Promise<void>

listChat(): Promise<{role, content}[]>
appendChat(role, content): Promise<void>
clearChat(): Promise<void>

getPricesCache(): Promise<{data: {[symbol]: {...}}, lastUpdated: number|null}>
savePrices(map): Promise<void>

exportAll(): Promise<FullExportObject>              // For Settings > Export JSON
```

### `src/voice.js`

```js
useSpeech(onFinalText: (text: string) => void): {
  listening: boolean,
  supported: boolean,              // false in Expo Go
  start(initialText?: string): Promise<boolean>,
  stop(): Promise<void>,
  error: string | null,
}
```

**Implementation note**: wraps `@react-native-voice/voice` only. On Android, the system SpeechRecognizer is used — if the user has iFlytek 讯飞输入法 set as their default IME with voice enabled, iFlytek's recognizer is the backing engine. No app-level configuration needed for that to happen.

---

## 12. Behavior Edge Cases

### 12.1 First launch
- Bootstrap with `await db.getDb()` → creates tables.
- KV defaults: `philosophy = ""`, `rules = DEFAULT_RULES`, `defaultMaster = "default"`.
- `apiKeyPresent` = false → Home shows API key banner.

### 12.2 API failures
- `parseTradeText` fails → show inline error "AI 解析失败，请手动填写" → user falls back to manual fields.
- `generateEntryFeedback` fails → error persists in state but does NOT mutate DB feedback array. User can retry.
- Chat message fails → user message IS kept in history (even though no response); show inline error.
- `fetchLivePrices` failures → individual symbols just omitted from result; UI shows "暂无实时价" for those rows.

### 12.3 Voice recognition
- If `@react-native-voice/voice` module is unavailable (Expo Go), `supported = false` and mic buttons hide themselves. Keyboard mic (IME-provided) still works in every TextInput.
- Language code passed to native recognizer: `zh-CN`. English and mixed Chinese-English usually transcribes correctly.
- **Users are expected to install a good Chinese IME separately** (讯飞输入法 recommended). The app's Settings page hints at this but does not require or manage it.
- Combines `accumRef` (previously-finalized text) with latest interim for smooth continuous-dictation UX.

### 12.4 Date math
- `isLastWeekOfMonth()`: today's date is within the last 7 days of current month.
- `weekKey(iso)`: ISO-like week number `YYYY-Wnn`.
- `monthKey(iso)`: `YYYY-MM`.
- All dates stored as full ISO strings; formatting happens at display time.

### 12.5 Currency grouping
- Totals in Holdings tab group by currency. **Never** convert between currencies — user sees parallel totals.
- P&L % is relative to cost basis in same currency.

### 12.6 Prompt cache staleness
- When user edits philosophy, rules, or completes a trade, the cached profile block becomes stale naturally (DeepSeek's server-side prefix cache is content-based). Next call will be a cache miss but re-cache.
- Don't attempt manual invalidation.

### 12.7 Holdings sync edge cases
- Only triggers for `buy` / `sell` actions when `shares > 0`.
- Weighted average formula: `(old_shares × old_cost + new_shares × new_cost) / (old_shares + new_shares)`.
- Cost stored to 8 decimal places (`Math.round(x * 100000000) / 100000000`) to support crypto assets like 0.00001 BTC.
- SELL with more shares than held: removes holding (set to 0 → delete), does not go negative.
- Symbol matching is case-insensitive (normalized to uppercase before comparison).

---

## 13. Permissions & App Config

### `app.json`
```json
{
  "expo": {
    "name": "投资日志",
    "slug": "investment-journal",
    "version": "1.0.0",
    "orientation": "portrait",
    "splash": { "image": "./assets/splash.png", "resizeMode": "contain", "backgroundColor": "#f5f1e8" },
    "android": {
      "package": "com.you.investmentjournal",
      "adaptiveIcon": { "foregroundImage": "./assets/icon.png", "backgroundColor": "#f5f1e8" },
      "permissions": ["RECORD_AUDIO", "INTERNET"]
    },
    "plugins": [
      "expo-font",
      "expo-secure-store",
      ["@react-native-voice/voice", {
        "microphonePermission": "This app uses the microphone for voice journaling.",
        "speechRecognitionPermission": "This app uses speech recognition to convert your spoken entries to text."
      }]
    ]
  }
}
```

### `eas.json`
```json
{
  "cli": { "version": ">= 7.0.0", "appVersionSource": "local" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

### APK build steps (user-facing, in README)
1. `npm install -g eas-cli`
2. `eas login`
3. `eas build -p android --profile preview`
4. Download `.apk` from EAS dashboard URL.
5. Install on phone (enable "Install unknown apps" for the browser/file manager).

---

## 14. Acceptance Criteria

An implementation is correct if:

1. ✅ App launches on a clean Android phone with no crashes.
2. ✅ User can add philosophy + rules; these survive force-close/restart (SQLite persistence).
3. ✅ In-app mic button records and transcribes Chinese speech into any input (accuracy depends on device's IME).
4. ✅ Tapping the IME keyboard's mic button in any TextInput (e.g., with 讯飞输入法 installed) produces accurate Chinese transcription with no app-level code required.
5. ✅ User can say "今天买了 200 股苹果因为业绩好" and AI generates a structured trade entry.
6. ✅ User can tap "林奇" chip on a trade and see Peter Lynch's perspective within ~10 seconds.
7. ✅ User can add AAPL (200 shares @ 175) to holdings, tap refresh, and see current Yahoo price with today's %.
8. ✅ Opening Mentor tab auto-refreshes prices if >15 min stale; subsequent chat messages benefit from prompt cache.
9. ✅ Monthly commentary for a given month+master is cached and reappears instantly on second view.
10. ✅ Deleting a trade removes it permanently from SQLite.
11. ✅ Exporting JSON produces a complete backup of all user data.
12. ✅ App works offline for all non-AI features (weekly, monthly bullets, manual trade entry, thought entry). Voice requires network only if the IME does (most do).
13. ✅ Building via `eas build -p android --profile preview` produces an installable APK.
14. ✅ No telemetry, no analytics, no external calls except to `api.deepseek.com` and `query1.finance.yahoo.com`.
15. ✅ Searching "AAPL" in HoldingForm or TradeForm shows a Yahoo Finance autocomplete dropdown within 400ms.
16. ✅ After logging a BUY trade (with shares + cost), the matching holding in Holdings tab is updated with weighted-average cost basis, or user is prompted to add the symbol if not tracked.
17. ✅ After logging a SELL trade (with shares), the matching holding's share count decreases; reaching 0 removes the holding.
18. ✅ Holdings "Reason to Buy" is included in the `<investor_profile>` context sent to mentor AI.
19. ✅ Bottom nav shows exactly 5 tabs (心法 / 记录 / 持仓 / 复盘 / 问道); Settings is accessible only via the gear icon in the 心法 masthead.
20. ✅ 复盘 tab contains two sub-tabs (周记 / 月评) switchable without losing unsaved text.
21. ✅ All top-level screens (心法, 记录, 持仓, 复盘, 问道, Settings) reserve space for the device status bar / notch / punch-hole camera using `SafeAreaView edges={["top"]}`.
22. ✅ Tapping EDIT on an expanded trade row allows editing the reason and emotion; changes persist after restart.
23. ✅ Tapping EDIT on an expanded thought row allows editing the full content; changes persist after restart.
24. ✅ Switching between mentor chips (e.g., 林奇 → 芒格) after loading one master's feedback shows the second master's feedback correctly — does not blank or re-show the first master's text.
25. ✅ Tapping "带入问道继续讨论 ↗" on a feedback entry navigates to the 问道 tab and shows the trade context + mentor feedback as the opening exchange of a conversation ready for follow-up.
26. ✅ HoldingForm shows a tappable BUY DATE field defaulting to today; tapping opens the Android native calendar picker; the selected date is displayed in the holding row as "买入 YYYY.MM.DD".

---

## 14A. Obsidian Vault Export Format

The Markdown export feature (Settings → 导出 Vault) produces a zip with this structure, optimized for Obsidian and AI consumption:

```
Investment Journal/                  ← user opens this as an Obsidian Vault
├── _Index.md                        ← auto-generated overview
├── _Foundations/
│   ├── Philosophy.md
│   └── Rules.md
├── Trades/
│   ├── 2026-04-15 BUY AAPL.md       ← one file per trade
│   ├── 2026-04-08 SELL TSLA.md
│   └── ...
├── Thoughts/
│   ├── 2026-04-12 加仓纠结.md
│   └── ...
├── Weekly/
│   ├── 2026-W17.md
│   └── ...
├── Monthly/
│   ├── 2026-04.md                   ← bullets + cached mentor commentaries
│   └── ...
└── Holdings/
    └── Snapshot.md
```

**Per-file conventions:**
- Every file has YAML front-matter for Obsidian Dataview queries (`type`, `date`, `ticker`, `emotion`, `tags`).
- Trade files use `[[TICKER]]` wikilinks so Obsidian builds an automatic ticker graph.
- Monthly files contain `[[YYYY-MM-DD ACTION TICKER]]` links to all trades of that month.
- Filenames sanitize OS-illegal chars (`/ \ : * ? " < > |`) but preserve Chinese characters.

**Export trigger:** User taps "导出 Vault" → app generates files in cache → zips → `Sharing.shareAsync` lets user pick destination (Google Drive, email, Files app, etc). App's local SQLite data is untouched and stays on the device. Users can re-export anytime; each export is a full snapshot.

**Why this design:**
- Single-file-per-entity gives Obsidian's graph and backlinks something to chew on.
- YAML front-matter enables Dataview queries like `WHERE emotion = "anxious"`.
- AI tools can ingest the entire vault and reason across years of journal entries — perfect for asking Claude/GPT "summarize my investment style based on these files".

**Implementation:** `src/markdown-export.js` exposes `exportToObsidianVault(profile)`. Dependencies: `expo-file-system` (write files), `react-native-zip-archive` (zip up vault), `expo-sharing` (system share sheet).

---

## 15. Out of Scope (v1)

- iOS build (code is cross-platform but only Android packaging is required for v1).
- Cloud sync / multi-device.
- Import from brokers (Interactive Brokers, Robinhood, etc.).
- Charts and technical analysis.
- Portfolio optimization / Markowitz / backtesting.
- Push notifications (e.g., "month-end review reminder" pushed from OS). The banner on Home during the last week of month is sufficient.
- Widgets or shortcuts.
- Dark mode (paper aesthetic is intentionally light only).
- Multi-user / family accounts.

---

## 16. Implementation Order (Suggested for AI Agent)

1. Scaffold: `package.json`, `app.json`, `eas.json`, `babel.config.js`, `App.js` skeleton.
2. `src/theme.js`, `src/constants.js`, `src/utils.js` — pure data, no deps.
3. `src/db.js` — schema + all CRUD. Test by seeding sample data.
4. `src/api.js` — Claude + Yahoo. Test parseTradeText and fetchLivePrices independently.
5. `src/voice.js` — wrap @react-native-voice/voice.
6. `src/components.js` — shared UI primitives.
7. `src/screens/Home.js` — verify fonts + state hookup.
8. `src/screens/Weekly.js` and `src/screens/Monthly.js` — simpler screens first.
9. `src/screens/Log.js` — most complex; build trades flow first, then thoughts.
10. `src/screens/Holdings.js` — Yahoo price refresh flow.
11. `src/screens/Mentor.js` — chat + auto price sync.
12. `src/screens/Settings.js` — API key, export, about.
13. End-to-end test on Expo Go (voice will be disabled, that's expected).
14. `npx expo prebuild` + EAS Build to produce APK.
15. Install APK on device, verify voice + full flow.

**Estimated implementation time for a competent AI agent: 4-8 hours of continuous generation.**

---

## Appendix A: Master System Prompts (Verbatim)

See `src/constants.js` → `MASTER_STYLES` object. Each master gets a ~200-word English paragraph that captures their voice, frameworks, and probing questions. The app wraps each persona with: "Stay in character as {name}. Speak in their voice... Match the user's language exactly."

## Appendix B: Sample AI Prompts

### Trade parsing (deepseek-v4-flash)
```
Parse this trade description into JSON. Return ONLY the JSON object — no markdown fences, no explanation.

Description: """{user input}"""

Schema:
{
  "action": "buy" | "sell" | "hold" | "watch",
  "stock": string,
  "reason": string (1-2 sentence summary in SAME language as input, under 200 chars),
  "emotion": "calm" | "confident" | "neutral" | "anxious" | "fearful"
}

Infer emotion from tone. Match input language exactly.
```

### Entry feedback (deepseek-v4-pro, server-side cached system)
```
System (plain string, cached by DeepSeek prefix matching):
  [persona text]
  <investor_profile>...</investor_profile>

User:
  The investor just logged this trade:
  - Action: BUY
  - Stock: AAPL
  - Date: 2026-04-20
  - Reasoning: ...
  - Emotional state: calm

  Give your immediate, specific reaction. Reference their history, rules, or philosophy where relevant. Be direct. 2-3 short paragraphs. Match their language.
```

### Monthly commentary (deepseek-v4-pro)
```
System (cached): [persona + profile]

User:
  Look at the investor's trades for 2026.04:
  - 2026-04-02 | BUY | AAPL | emotion: calm | ...
  - 2026-04-15 | SELL | TSLA | emotion: anxious | ...

  Give your analysis of this month's trading activity. Look for patterns, emotional triggers, rule violations, or consistencies with their philosophy. Point out what was wise and what deserves scrutiny. Be specific — reference individual trades by ticker. 3-4 short paragraphs. Match their language.
```

---

*End of PRD. This document is the single source of truth — implementations should treat any conflict with prior web-version code as "the PRD wins".*
