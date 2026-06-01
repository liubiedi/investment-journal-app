# Product Requirements Document

## 投资日志 · The Investor's Ledger

**Version:** 1.8.1
**Date:** 2026-06-01
**Format:** Android mobile application
**Target:** AI coding agents (single-source-of-truth for autonomous implementation)

**v1.8.1 changelog** (2026-06-01, bug fixes — PR #31):
- Fixed `package-lock.json` out of sync with `expo-notifications` entry in `package.json`; `npm ci` on clean installs now works.
- Fixed signal banner race condition on cold start and foreground resume: `checkAllSignals()` is now awaited before `getUnacknowledgedSignals()` so newly-fired signals appear in the Signal Center banner immediately on the same launch/resume that triggered them.
- Fixed skipped signal outcomes never receiving forward returns: `getPendingForwardReturns()` now includes `action_taken='skipped'` rows, using `signal_events.fired_at`/`fired_price` as the observation baseline. `CalibrationTab`'s missed-opportunity analysis now receives real data.
- Fixed `rowToResearchMemo` only returning camelCase fields while screen code (`Research.js`, `ResearchMemo.js`) read snake_case fields (`memo.next_review_date`, `memo.current_version_id`, `memo.company_name`, `memo.holding_id`); transformer now emits both forms.
- Fixed `TaskManager.defineTask` called inside `registerSignalMonitorTask()` function instead of at module load time; headless OS background launches can now resolve the task handler (matches `research/background.js` pattern).
- Fixed same earnings report re-triggering after the 24-hour dedup window: `checkAllSignals()` now stamps `last_checked_earnings_period` on the memo after a buy signal fires on an earnings condition. `updateResearchMemoFields` map extended with the new field.

**v1.8 changelog** (2026-06-01, Signal Monitoring + Outcome Tracking):
- **Signal monitoring with push alerts** (PR #29). Background task (`expo-background-task`, 12-hour floor) and on-foreground-resume check evaluate confirmed buy/sell trigger conditions for all research memos. When all conditions for a memo are met — price within 5% of trigger AND optional earnings beat threshold — a local push notification fires containing the full action plan prose. The background check is a backstop; the `AppState "active"` listener is the primary trigger for part-time investors who open the app daily.
- **Trigger price trust chain**. AI-generated trigger prices are now backed by explicit evidence: `buy_trigger_anchors` (array of 1-3 strings, each citing a specific data point and source), `buy_trigger_confidence` (`"high"` if ≥2 anchors converge within 5%, `"medium"` if 1 anchor, `"low"` if weak), and `min_earnings_surprise_pct` (required if prose mentions an earnings condition). The `DEEP_SYSTEM` prompt now forbids fabricating trigger prices: all numeric trigger fields must derive from `<market_signals>` or snapshot data, or be set to `null`. A historical backtest (`computeTriggerBacktest`) uses 2-year Yahoo Finance data to show how often the trigger price was hit and the average 3-month forward return at those hits.
- **User confirmation gate**. A newly generated memo's trigger prices start as `"待确认"` (unconfirmed). The background monitor ignores them until the user reads the anchor evidence and taps **确认并开始监控** or **调整价格**. The `MonitoringPanel` UI in `ResearchMemo.js` shows unconfirmed / confirmed / user-overridden states, with a collapsible **查看依据** section displaying the full anchor evidence trail.
- **Live `<market_signals>` context block**. `src/marketSignals.js` fetches Yahoo Finance price history (free, no key) and Finnhub.io data (free API key: earnings, analyst ratings, news). Results are cached for 2 hours in `market_signals_cache`. A formatted `<market_signals>` XML block is injected into the AI context for research memo generation (`pipeline.js`), mentor chat, and roundtable (via `MemoryManager` at priority 4.2, STANDARD+ depth). The mentor system prompt now requires concrete numbers from this block — "MSFT is at $410, 2.5% above your buy trigger of $400" not "if the stock weakens."
- **Finnhub API key in Settings**. New section in `Settings.js` with masked key input (same UX as DeepSeek key), save/clear, and a link to finnhub.io. A **signal notifications toggle** (`kv` key `signal_notifications_enabled`) lets the user suppress push notifications while still logging signal events.
- **Signal Center banner on Research screen**. When unacknowledged signals exist, a dark banner appears at the top of the Research screen showing each triggered memo with ticker, direction (📈买入 / 📉减仓), current price vs trigger, and action plan prose. Each row has **已买入** and **跳过** buttons.
- **Outcome tracking — Act or Skip**. Tapping **已买入** opens a price-entry sheet (pre-filled with current price); confirming saves a `signal_outcome` with `action_taken='acted'` and `entry_price`. Tapping **跳过** opens a reason picker (5 common reasons); confirming saves `action_taken='skipped'` with `skip_reason`. Unresolved signals remain in the banner.
- **Auto-computed forward returns**. `computePendingForwardReturns()` runs in every `checkAllSignals()` call. For outcomes where `action_taken='acted'` and enough time has elapsed, it fetches 2-year Yahoo Finance history and computes `forward_1m_pct` (30d), `forward_3m_pct` (90d), `forward_6m_pct` (180d), and `max_drawdown_3m` (worst trough in first 90 trading days). Unique tickers are de-duplicated and fetched in parallel.
- **AI post-trade debrief at 3 months**. When `forward_3m_pct` becomes available, `generateSignalDebrief()` makes a `callFlash` call producing a 3-paragraph Chinese debrief (150–200 words): entry result, trigger calibration review, next-step recommendation. Stored in `signal_outcomes.ai_debrief`. A push notification fires: "MSFT买入信号3个月复盘已生成".
- **Per-memo signal history panel** (`SignalHistoryPanel` in `ResearchMemo.js`). A collapsible section below the strategy card shows every past signal for the memo's ticker — fired date, fired price, action (bought/skipped), 3-month return (colour-coded: green acted/positive, red acted/negative, amber skipped/would-have-been-positive), and a debrief snippet.
- **Signal analytics dashboard** (`src/screens/SignalAnalytics.js`, 4 tabs). Accessible via **复盘 →** in the Research screen header. Tab 1 (总览): total signals, acted/skipped counts, win rate, average 3-month return, best/worst outcomes. Tab 2 (信号列表): full sortable list with per-row debrief. Tab 3 (标的分析): per-ticker aggregated win rate and average return. Tab 4 (策略校准): entry analysis (average return, max drawdown), skip analysis (missed opportunities), calibration suggestions after 3+ outcomes.
- **DB additions**. Three new tables: `signal_events`, `signal_outcomes`, `market_signals_cache`. Thirteen new columns on `research_memos` (all via idempotent `ALTER TABLE`): `buy_trigger_price`, `buy_trigger_anchors` (JSON), `buy_trigger_confidence`, `buy_trigger_confirmed`, `buy_trigger_price_override`, `min_earnings_surprise_pct`, `last_checked_earnings_period`, `sell_trim_price`, `sell_trigger_anchors` (JSON), `sell_trigger_confidence`, `sell_trim_confirmed`, `sell_trim_price_override`, `trigger_backtest` (JSON). `rowToResearchMemo` transformer updated to parse all JSON columns.
- **New source files**: `src/marketSignals.js` (market data + signals block builder), `src/signalMonitor.js` (background task, condition evaluation, outcome tracking, debriefs), `src/screens/SignalAnalytics.js` (analytics dashboard).

**v1.7 changelog** (2026-05-18, Roundtable decision-tool turn):
- **PEG ratio indicator on Holdings** (PR #22). Each holding row now shows a color-coded PEG chip (green < 1, amber 1–2, red ≥ 2) fetched from Yahoo Finance's `defaultKeyStatistics` module in parallel with the live-price refresh. Negative/zero PEG (declining-earnings stocks) is suppressed so misleading green never shows. The lightweight `fetchPEGRatios()` does up to 3 retries with exponential backoff + jitter on 429/5xx since Yahoo throttles bursty quote-summary calls.
- **Roundtable mentor pool 6 → 9, session hard-capped at 4** (PR #22). Three new personas added — Taleb (tail-risk / antifragility / convex options bets), Bogle (passive ETF / cost-matters hypothesis), Cathie Wood (disruptive innovation / Wright's Law) — bringing the named-master pool to 9. Each session must select **exactly 4 mentors** (no more, no less). Default selection is the first 4 of `ROUNDTABLE_MASTERS` (`lynch, buffett, marks, taleb`) for cross-philosophy balance (growth · value · cycle · tail-risk). Trying to add a 5th surfaces a soft-block via the new `useTransientMessage` hook; non-selected chips dim at the cap. Smaller token budget per stage and sharper divergence vs the old 6-master debates.
- **`useTransientMessage` hook** (PR #22). Extracted to `src/utils.js` to centralise the "show a message/flag, auto-clear after N ms" pattern that had been duplicated across 4 screens with inconsistent timeouts. Ref-based cancellation handles rapid re-trigger and unmount cleanup (fixed latent setState-after-unmount bugs in `Mentor.js` MessageBubble and `Settings.js`).
- **Decision synthesis replaces meeting minutes** (PR #25). The Roundtable's end-of-session output is no longer a free-prose markdown recap. It is now a structured `synthesis` object — `{ headlineVerdict, voteTally, axisOfDisagreement, consensusPoints, triggerConditions, decisiveCrux, suggestedNextAction, narrative }` — rendered by a new `SynthesisDashboard` with a verdict badge, IF/THEN trigger-conditions table, and accent-bordered next-action callout. Prompt enforces decision usefulness via HARD RULES (trigger conditions must be observable market signals, suggested action is one concrete sentence, vote tally must sum to committee size). String-typed vote counts emitted by DeepSeek are coerced to numbers via `Number()` with rounding so the rendered total never concatenates as `"211"`.
- **Backward-compatible legacy renderer**. Sessions saved before v1.7 stored `session.minutes` as markdown; those still render via a text-view fallback in the same modal. History list distinguishes `有综合` (new) from `有纪要` (legacy).
- **Reusable modal scaffold** (PR #26). Extracted `<ModalShell>` in `src/components.js`; collapsed 5 full-screen modals (3 in Roundtable, plus Home's `StrategyReportModal`, Mentor's `FullMessageModal`, and `FullFeedbackModal`) into single-block invocations. Internal refactor, no behaviour change. Net -255 / +238 lines.
- **App icon** refreshed.

**v1.6.1 changelog** (2026-05-16, defensive hardening pass):
- Fixed `listResearchVersions` returning raw SQLite rows — JSON columns now parsed via `rowToResearchVersion` (sources was leaking as a stringified JSON into render, crashing the version-history selector).
- Fixed "Updating memo…" indicator getting stuck after content was already rendered — `isGenerating` now derives from `memo.status` + visible-content stages, ignoring the background rules check. FINALIZE.DONE also force-clears any stuck stage state.
- Fixed `_finalize` errors silently swallowing FINALIZE.DONE emission — wrapped in try/finally so `_activeJobs` always drains and the screen always receives the cleanup signal.
- Fixed Mentor screen showing a permanent ~120-150px dead zone between input row and tab bar on Android — `KeyboardAvoidingView` had `keyboardVerticalOffset={tabBarHeight}` with `behavior="height"`, which reserves that many pixels even when the keyboard is hidden. Offset is now iOS-only.
- Added `scripts/check-imports.mjs` — catches missing imports in `src/` before runtime. React Native has no compile step; a missing import only surfaces as a render-time `ReferenceError`.
- Added "DB row → model boundary" invariant in `CLAUDE.md` — every exported query on a JSON-bearing table MUST map through a `rowTo*()` transformer.

---

## 1. Product Summary

A personal, offline-first investment journaling Android app that combines structured trade logging with an AI mentor system. Users record their investment philosophy, rules, trades, thoughts, and holdings; the app provides on-demand commentary from a personalized AI mentor or from AI personas of famous investors (Peter Lynch, Buffett, Munger, Dalio, Marks, Graham, Taleb, Bogle, Cathie Wood).

**Key differentiators:**
1. **Template-driven structure** — enforces philosophy → rules → weekly notes → monthly reviews → trade log, rather than freeform journaling.
2. **AI mentor persona** — DeepSeek with the user's full journal as context, accessible via chat or on-demand feedback on individual entries.
3. **Master personas** — switch perspectives to get Peter Lynch's, Buffett's, etc. reaction on any entry.
4. **Voice-first input** — every text field supports speech-to-text.
5. **Local-only data** — SQLite on device, never cloud-synced. User owns their data.
6. **Token-frugal AI** — feedback is on-demand (never auto-triggered), prompt caching reduces cost ~90% for chat.
7. **华山论道 roundtable** — launch a multi-master AI investment committee discussion on any topic or holding; masters debate in structured rounds and the session closes with a **structured decision synthesis** (headline verdict, vote tally, axis of disagreement, decisive crux, IF/THEN trigger conditions, suggested next action) rendered as a dashboard — not a free-prose recap.
8. **Research module (个股研究)** — versioned, source-backed decision memos for stocks being watched or held. AI generates conditional status (Buy Setup / Watch / Reduce Risk / Avoid) with bull/base/bear valuation, position sizing, rules conflict check, and full data provenance. Never imperative language. Every regeneration is a new immutable version. Integrated into the four-tier memory system so mentors always know the current research conclusion when a stock is discussed.
9. **Signal monitoring + outcome tracking** — after confirming a trigger price (with anchor evidence and historical backtest), the app monitors conditions in the background and pushes alerts when buy/sell criteria are met. Users log "acted" or "skipped" at signal time; the app auto-computes 1m/3m/6m forward returns and generates an AI debrief at 3 months. A personal calibration dashboard tracks win rate, average return, and skip analysis over time.

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
| Market Data (optional) | **Finnhub.io** (`finnhub.io/api/v1`) | Free API key; provides earnings surprises, analyst ratings, company news; key stored in SecureStore |
| Push Notifications | **expo-notifications ~0.29.13** | Local push alerts for signal triggers; permission requested at first use |
| Background Tasks | **expo-background-task** | 12-hour-floor background signal monitoring; primary trigger is AppState foreground resume |
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

-- Roundtable discussion sessions
CREATE TABLE roundtable_sessions (
  id TEXT PRIMARY KEY,             -- session_<timestamp>_<random>
  topic TEXT NOT NULL,             -- the discussion topic/question
  masters TEXT NOT NULL,           -- JSON string[] of master IDs in this session
  data TEXT NOT NULL,              -- JSON: { rounds: [{masterId, text, verdict}[]], synthesis: SynthesisObject | null, minutes?: string }
                                   -- `synthesis` is the v1.7+ structured decision output (see §5.7).
                                   -- `minutes` is the legacy markdown recap (v1.6 and earlier) — still rendered by the legacy renderer when no synthesis exists.
  created_at INTEGER NOT NULL
);

-- Per-holding review log entries
CREATE TABLE holding_reviews (
  id TEXT PRIMARY KEY,
  holding_id TEXT NOT NULL,        -- FK → holdings.id
  date TEXT NOT NULL,              -- YYYY-MM-DD
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

-- Research module (V2)

-- Core memo (one row per ticker; current_version_id points to latest version)
CREATE TABLE research_memos (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  exchange TEXT,
  company_name TEXT,
  current_version_id TEXT,
  status TEXT,           -- 'buy_setup'|'watch'|'reduce_risk'|'avoid'
  confidence TEXT,       -- 'high'|'medium'|'low'
  created_at TEXT,
  last_reviewed_at TEXT,
  next_review_date TEXT,
  holding_id TEXT        -- nullable FK → holdings.id
);

-- Immutable version snapshots (every save/regenerate = new row; never updated in place)
CREATE TABLE research_versions (
  id TEXT PRIMARY KEY,
  memo_id TEXT NOT NULL,
  version_num INTEGER NOT NULL,
  thesis TEXT,
  business_snapshot TEXT,   -- JSON: {summary, revenue_drivers, competitive_edge, market_debates}
  valuation TEXT,           -- JSON: {multiples, scenarios, fair_value_band, assumptions, ...}
  position_sizing TEXT,     -- JSON: {current_pct, max_pct, first_tranche_pct, add/trim/invalidation conditions}
  trading_strategy TEXT,    -- JSON: {watch_items, buy_trigger, sell_trim_trigger, review_date, batch_plan}
  disclaimer_flags TEXT,    -- JSON: {data_tier, stale, missing_data, snapshot_fetched_at}
  sources TEXT,             -- JSON array of source cards
  model_id TEXT,
  generated_at TEXT,
  created_at TEXT
);

-- Rule evaluations per version
CREATE TABLE research_rule_checks (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  rule_text TEXT,
  result TEXT,          -- 'pass'|'fail'|'n/a'
  notes TEXT,
  override_reason TEXT  -- required when overriding a 'fail'
);

-- Cross-reference links to other app entities (trades, thoughts, holdings)
CREATE TABLE research_links (
  id TEXT PRIMARY KEY,
  memo_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,   -- 'holding'|'trade'|'thought'
  entity_id TEXT NOT NULL,
  linked_at TEXT
);

-- Yahoo Finance quoteSummary 24h cache
CREATE TABLE research_snapshot_cache (
  ticker TEXT PRIMARY KEY,
  data TEXT NOT NULL,          -- full JSON snapshot
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL     -- fetched_at + 24h
);

-- FTS5 triggers: research_versions → journal_fts (auto-indexing for episodic retrieval)
-- CREATE TRIGGER research_fts_ai AFTER INSERT ON research_versions ...
-- CREATE TRIGGER research_fts_au AFTER UPDATE ON research_versions ...
-- CREATE TRIGGER research_fts_ad AFTER DELETE ON research_versions ...
-- (source_type = 'research'; EpisodicMemoryRetriever._hydrate() handles this type)

-- Signal monitoring (v1.8)

-- One row per fired signal event (both buy and sell directions)
CREATE TABLE IF NOT EXISTS signal_events (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL,          -- 'buy' | 'sell'
  trigger_price REAL,               -- effective trigger at fire time
  earnings_surprise REAL,           -- pct surprise if earnings condition triggered
  fired_price REAL NOT NULL,        -- actual market price at fire time
  memo_id TEXT,                     -- FK → research_memos.id
  fired_at INTEGER NOT NULL,        -- ms epoch
  acknowledged INTEGER DEFAULT 0,   -- 0 = unread, 1 = seen/dismissed
  conditions_detail TEXT            -- JSON: { buyOk, sellOk, buyPriceDist, ... }
);

-- User's act/skip decision per signal + auto-computed forward returns
CREATE TABLE IF NOT EXISTS signal_outcomes (
  id TEXT PRIMARY KEY,
  signal_event_id TEXT NOT NULL,    -- FK → signal_events.id
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL,
  action_taken TEXT,                -- 'acted' | 'skipped' | NULL (pending)
  skip_reason TEXT,
  entry_price REAL,
  entry_date TEXT,                  -- ISO 'YYYY-MM-DD'
  trade_id TEXT,                    -- optional FK to trade journal
  forward_1m_pct REAL,              -- auto-computed 30d after entry
  forward_3m_pct REAL,              -- auto-computed 90d after entry
  forward_6m_pct REAL,              -- auto-computed 180d after entry
  max_drawdown_3m REAL,             -- worst trough in first 90 trading days
  forward_computed_at INTEGER,
  ai_debrief TEXT,                  -- AI 3-paragraph debrief at 3-month mark
  debrief_notified INTEGER DEFAULT 0,
  reviewed INTEGER DEFAULT 0
);

-- 2-hour market data cache (Yahoo Finance + Finnhub)
CREATE TABLE IF NOT EXISTS market_signals_cache (
  ticker TEXT PRIMARY KEY,
  data TEXT NOT NULL,               -- JSON blob of full signals object
  fetched_at INTEGER NOT NULL
);

-- research_memos gets 13 new columns via idempotent ALTER TABLE (v1.8):
--   buy_trigger_price REAL
--   buy_trigger_anchors TEXT         -- JSON array of anchor strings (cited data points)
--   buy_trigger_confidence TEXT      -- 'high'|'medium'|'low'
--   buy_trigger_confirmed INTEGER    -- 0=unconfirmed, 1=monitoring active
--   buy_trigger_price_override REAL  -- user-adjusted price (overrides AI suggestion)
--   min_earnings_surprise_pct REAL   -- optional earnings condition (% beat required)
--   last_checked_earnings_period TEXT
--   sell_trim_price REAL
--   sell_trigger_anchors TEXT        -- JSON array
--   sell_trigger_confidence TEXT
--   sell_trim_confirmed INTEGER
--   sell_trim_price_override REAL
--   trigger_backtest TEXT            -- JSON: { hitCount, avgForward3m, hitDates }
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
- **导师 button** beside the save button (shown when draft is non-empty): opens `MasterPickerModal` → on master selection, appends the week note as a user message to `chat_history` (with week label + prompt), then navigates to the 问道 tab with the selected master pre-loaded. Same pattern as Holdings "带入问道".
- **Archive section** below: list all past weeks (sorted descending) with week_key in mono + first line of note in serif. Tap loads that week into the editor. Each archive row also has a small 导师 icon button for sending that week's note to the mentor.

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
  - Box shows cached text from `monthly_mentor_cache` if exists **and passes truncation check** (must end in sentence-final punctuation `。！？.!?"`); otherwise shows "请 {master.zh} 点评本月" button that calls `generateMonthlyCommentary(month, monthTrades, masterId, profile)` and caches result to DB.
  - "重新生成" button appears below any displayed commentary; clears cache for that master and fetches fresh.
- **Review bullets editor**: 4-5 bullet inputs, each with VoiceMic. Placeholders rotate: ["最成功的一笔决策？", "最想重来的一笔？", "这个月学到了什么？", "下月要改什么？", "其他观察…"]. "+ ADD BULLET" to grow to 5.
- **导师 button** beside the save button (shown when any bullet is non-empty): opens `MasterPickerModal` → on master selection, appends the month label + bullet points as a user message to `chat_history`, then navigates to the 问道 tab with the selected master pre-loaded. Same pattern as Holdings "带入问道".
- Save button: "归档月评" (new) or "更新月评" (existing).

**Data operations:**
- Save bullets: `db.saveMonthlyReview(monthKey, filteredBullets)`.
- Mentor cache: `db.getMonthlyMentor(monthKey, masterId)` / `db.setMonthlyMentor(monthKey, masterId, text)`.

### 5.4 Log (tab: 记录, route: `log`)

**Two sub-tabs**: 交易 Trades | 心念 Thoughts

**Trades sub-tab:**
- "新建交易" button reveals TradeForm.
- List of trades: date (mono) | action icon+label | stock ticker (serif bold) + entry price inline (mono muted, e.g. "USD 150" or "HKD 25.5" — shown only when entryPrice is set; all currencies displayed as 3-letter code prefix) | emotion icon (muted).
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
- **Market data bar** (when holdings exist): shows freshness ("更新于 X 分钟前" or "尚未获取实时价格"), with "刷新" button → calls `fetchLivePrices(uniqueSymbols)` AND `fetchPEGRatios(uniqueSymbols)` in parallel → persists prices via `db.savePrices(map)`; PEG ratios are held in component state (not persisted).
- **Totals block** (grouped by currency): for each currency, show cost / market value / P&L % in colored serif.
- "新增持仓" button reveals HoldingForm.
- **Holding row**:
  - Top row: symbol (serif bold) + display name (small serif muted) on left; current price + today's % change on right (colored green/red).
  - Bottom row (dashed separator): 市值 + P&L amount & percent (colored).
  - **PEG chip** (v1.7+): when a forward-PEG ratio is available, a small color-coded chip displays `PEG X.XX` — green (< 1, growth at a discount), amber (1–2, fair), red (≥ 2, expensive vs growth). Hidden for ETFs, crypto, and stocks with no forward earnings. Negative/zero PEG (declining-earnings stocks) is also hidden so misleading green never shows. PEG is fetched from Yahoo Finance's `defaultKeyStatistics` module; the lightweight fetcher does up to 3 retries with exponential backoff + jitter on 429/5xx since Yahoo throttles bursty quote-summary calls.
  - Footer: mono "as of" timestamp + resolved ticker if different.
  - Tap opens HoldingForm in edit mode (with delete option).

- **"带入问道 ↗" button** on each holding row: builds a context message containing symbol, shares, cost, live price, buy date, buy reason, notes, and **all review log entries** (each as `[date] content`), appends it to chat history, then navigates to the 问道 tab.

**HoldingForm fields:**
- SYMBOL — `StockSearchInput` with Yahoo Finance autocomplete (debounced 400ms); selecting a result auto-fills DISPLAY NAME. Hint: "AAPL / 0700.HK / 腾讯…"
- DISPLAY NAME (optional)
- SHARES (numeric) + COST (numeric) — side by side
- CURRENCY (chips: USD/CNY/HKD/SGD/EUR/JPY)
- BUY DATE · 买入时间 — tappable date display (Calendar icon + formatted date); opens native Android calendar picker via `@react-native-community/datetimepicker`; defaults to today; stored as `YYYY-MM-DD` TEXT
- REASON TO BUY · 购买原因 (multiline, optional) — investment thesis; included in mentor's investor profile context
- NOTES (multiline, optional)

**Review Log (edit mode only):**
- Section "REVIEW LOG · 复盘记录" with "添加复盘" toggle button.
- Add form: date picker (defaults to today) + multiline content input + "保存" / "取消".
- Saved via `db.addHoldingReview(holdingId, date, content)` → persisted to `holding_reviews` table.
- List shows entries newest-first: date (mono) + content (serif) + trash icon to delete.
- Review entries are loaded on form mount via `db.listHoldingReviews(holdingId)` and included in the "带入问道" mentor message.

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

**Keyboard handling:** wrap in `KeyboardAvoidingView` with `behavior="padding"` + `keyboardVerticalOffset={tabBarHeight}` on iOS only. On Android, pass `behavior="height"` with `keyboardVerticalOffset=0` — Android's default `windowSoftInputMode=adjustResize` (Expo default) already shrinks the window when the keyboard appears, and a non-zero offset reserves that many pixels of bottom padding even when the keyboard is hidden, leaving a dead zone between the input bar and the tab bar.


### 5.7 Roundtable (hidden screen, route: `roundtable`)

**华山论道** — an AI investment committee that debates a topic through multiple structured rounds. Launched from Holdings "带入问道 ↗" or from any context that pushes `{ topic }` via navigation params.

**Features:**
- **Topic display**: shows the discussion topic at the top (e.g., a holding's full context or a user-typed question).
- **Master selector**: multi-select chips drawn from `ROUNDTABLE_MASTERS` (the 9-mentor pool defined in `src/constants.js`). Each session is **hard-capped at exactly 4 active mentors** (`ROUNDTABLE_MAX_MENTORS`) — Start button is disabled unless `selectedMasters.length === 4`. Default selection on a fresh session is the first 4 (`[lynch, buffett, marks, taleb]`), chosen for cross-philosophy balance (growth · value · cycle · tail-risk). Trying to add a 5th surfaces a soft-block transient message (via `useTransientMessage`); non-selected chips dim at the cap.
- **Round structure**: each round, every selected master gives a response (120-180 words, 2-3 paragraphs). Masters are shown as cards, one per master.
- **VERDICT line**: each response includes a `VERDICT: BUY/HOLD/SELL/WATCH` line (stripped from display, used for UI tally). A verdict bar at the top tallies all masters' current stances.
- **Round navigation**: "下一轮" button advances to next round (min 2, max 4 rounds). Each subsequent round sees all previous responses in context.
- **Per-master retry**: if a master's response fails to load, a retry button appears on that card.
- **Decision synthesis** (决策综合, v1.7+): the "终止辩论，生成综合" button generates a structured synthesis of the full discussion via DeepSeek and renders it in `<SynthesisDashboard>`. Cached on the session. Replaces the v1.6-era markdown meeting-minutes flow; legacy sessions still display their stored markdown via a fallback renderer in the same modal. Header buttons: **查看综合** (view current), **历史综合** (browse past).
- **Language consistency**: all master responses are in the same language as the discussion topic (detected via `/[一-鿿]/` regex).

**Prompt discipline:**
- Round 1: each master responds independently based on topic + investor profile.
- Round 2+: each master sees all Round 1 responses (as attributed quotes) plus prior rounds. Stays on topic.
- Word count enforced via prompt instruction (not `max_tokens` ceiling). `max_tokens: 1200` is the output ceiling, never a length target.

#### 5.7.1 Decision Synthesis (`runSynthesis`, v1.7+)

**Goal:** turn a multi-round committee debate into an *actionable decision*, not a recap.

**API:** `runSynthesis(session, profile) → SynthesisObject` (`src/api.js`).

**Prompt shape:** a single LLM call (max_tokens 2000). The model returns a fenced ```json``` block followed by a 120–150 word markdown narrative. JSON extraction reuses the existing `parseLooseJson` helper (fence + curly-quote tolerance, unfenced-JSON fallback). All array fields are normalised through `Array.isArray(x) ? x : []` per the CLAUDE.md "DB row → model boundary" invariant; vote-tally fields are coerced to `Number()` with rounding and a non-negative finite guard so string-typed counts (`"2"`) never produce `"211"` totals via string concatenation.

**SynthesisObject schema:**
```ts
{
  version: 1,
  generatedAt: number,                          // ms epoch
  headlineVerdict: "BULL" | "BEAR" | "WAIT",
  voteTally: { BULL: number, BEAR: number, NEUTRAL: number },   // sums to committee size
  axisOfDisagreement: string,                   // one sentence — the single point most divisive
  consensusPoints: string[],                    // 2-4 items, ≤20 words each
  triggerConditions: { if: string, then: string }[],  // observable market signals → recommended action
  decisiveCrux: string,                         // one sentence — the fact that would settle the debate
  suggestedNextAction: string,                  // one concrete actionable sentence
  narrative: string,                            // 120-150 word markdown summary
}
```

**Prompt HARD RULES** (enforced in system prompt):
- `voteTally` counts MUST sum to committee size.
- Each `triggerCondition.if` MUST be observable from market data or news (price level, macro print, earnings beat, etc.) — NOT a vague feeling.
- `suggestedNextAction` is ONE concrete sentence (e.g. *"维持现有头寸 5%，待 10Y 实际利率跌破 1.5% 后加仓至 8%"*).
- `decisiveCrux` names a single resolvable fact (not a list, not a question chain).
- No preamble or trailing commentary outside the JSON block + narrative.

**Dashboard rendering (`<SynthesisDashboard synthesis>`, in `Roundtable.js`):**
- Headline verdict badge with `VERDICT_COLOR[verdict]` border (BULL→good, BEAR→bad, WAIT→warn). `VERDICT_COLOR` is extended from the existing `BULL/BEAR/NEUTRAL` map with a `WAIT` entry; mentor-level NEUTRAL keeps its faint colour.
- Vote tally row.
- **Axis of disagreement** as `TSerifItalic` pull-quote with bracketed quotation marks.
- **Decisive crux** call-out with `colors.cool` left border.
- **Consensus points** as a bulleted list.
- **Trigger conditions** as a two-column IF / THEN table (DOM-ready for future price/macro alert wiring).
- **Suggested next action** as an accent-bordered call-out box.
- **Narrative** at the bottom, separated by a soft divider.

**Memory write:** `runSynthesis` preserves the v1.6 behaviour of writing a `stock_thesis` insight to `memoryManager` when the topic contains a ticker — now persists both a derived text summary and the structured synthesis object under `structured`.

**Token budget:** synthesis input is at most `selectedMasters.length × roundCount × ~600-char snippets` + ~900 tokens of schema — comfortably inside the LLM context budget for any realistic committee size.

**Backward compatibility:**
- New sessions write `session.synthesis = SynthesisObject` and drop the legacy `session.minutes`.
- Sessions created before v1.7 retain `session.minutes` as a markdown string and render via the legacy text view inside `<SynthesisModal>`.
- `<SynthesisHistoryModal>` lists both formats; the meta line tags new sessions with their `headlineVerdict` and legacy sessions with `· 旧版纪要`.
- `HistoryModal` (历史议题) meta now distinguishes `有综合` vs `有纪要`.
- DB schema unchanged: both fields live in the existing `roundtable_sessions.data` JSON blob.

**Data:** sessions persisted to `roundtable_sessions` table; full round data (responses + verdicts + synthesis + optional legacy minutes) stored as JSON in `data` column.

### 5.9 Research (tab: 研究, routes: `research` + `researchMemo`)

Two screens: Research Home (queue) and Research Memo detail. `researchMemo` is a hidden tab (`tabBarButton: () => null`), navigated via `nav.navigate("researchMemo", { memoId })`.

#### Research Home (`src/screens/Research.js`)

```
[复盘 →]  ← header button, navigates to SignalAnalytics screen

SignalCenterBanner  ← shown when activeSignals.length > 0 (from App context)
  Per-signal row: ticker + direction badge (📈买入 / 📉减仓) + price vs trigger
  Buttons: [已买入] → price entry sheet  |  [跳过] → reason picker

Masthead kicker="个股研究" title="Research Queue"

Section "需要复盘 Review Due"  ← next_review_date ≤ today
  ResearchMemoCard × N          ← red left border, clock icon

Section "进行中 Active"
  ResearchMemoCard × N

EmptyState if no memos  ← hint: "在「持仓」或「记录」中点击「深度研究」开始"
```

**No standalone 新建 button.** Research is always initiated from a stock context (Holdings or Log).

**New Memo composer (bottom-sheet Modal):**
1. `StockSearchInput` — ticker autocomplete (Yahoo Finance search); `onSelect(sym, name)` fills ticker + company name
2. `PaperInput` — 投资逻辑 Thesis (optional; 2–3 lines)
3. Toggle "+ 添加补充信息" → expands `PaperInput` for Manual Notes (public-data gaps; hidden by default)
4. [生成研究备忘录] → `buildPlaceholder()` writes a `status="generating"` memo + version row → navigate immediately → `startResearchGeneration()` runs in background (see §8.3 Research Pipeline). The composer modal closes within ~100ms; the user sees skeletons on the memo screen while three parallel LLM calls fill in sections progressively.
5. Review Horizon removed — AI provides `trading_strategy.review_date`; fallback hardcoded to 3 months.

**Auto-open:** when navigated with `route.params.prefillTicker` (from Holdings or Log `深度研究` chip), composer opens pre-filled and YF crumb is pre-warmed.

#### Research Memo detail (`src/screens/ResearchMemo.js`)

**Header:** Masthead kicker=ticker, title=company_name; `StatusBadge` · `ConfidencePill` · version chip ("v3 · 2026-05-13")

**Collapsible sections:**

| Section | Default | Content |
|---------|---------|---------|
| Current Conclusion | expanded | status, confidence, max risk, thesis summary |
| Business Snapshot | expanded | summary, revenue drivers, competitive edge, market debates |
| Deep Research Checklist | collapsed | items with evidence-quality tags |
| Valuation Check | expanded | multiples (P/E, P/B, PEG, EV/EBITDA), scenarios (bull/base/bear), fair-value band, assumptions |
| Position Sizing | expanded | current % / max % / first tranche, add/trim/invalidation conditions |
| 3–6 Month Strategy | collapsed | `MonitoringPanel` (v1.8, see below) + watch items, review date, batch plan |
| Rules Conflict Check | expanded | pass/fail/n/a per rule; override note required for fails |
| Sources | collapsed | `SourceCard` per source with data-tier badge + timestamp |

**MonitoringPanel** (v1.8, within 3–6 Month Strategy section):

Shown for any memo that has a `buy_trigger_price` or `sell_trim_price`.

*Unconfirmed state* (`confirmed = 0`): shows AI-suggested price, confidence stars, collapsible anchor evidence ("依据"), historical backtest line ("历史回测: N次触发 | 3个月均 +X%"), earnings condition if set, and prose. Buttons: **[确认并开始监控]** (calls `confirmTrigger`) and **[调整价格]** (inline price edit + confirm).

*Confirmed state* (`confirmed = 1`): shows green "监控中" badge, effective trigger price (with "AI建议 $X, 已手动调整" note if user overrode), earnings condition status, prose, and collapsible anchor evidence. Buttons: **[修改价格]** (resets to unconfirmed so user re-confirms) and **[停止监控]** (calls `stopTrigger`).

**SignalHistoryPanel** (v1.8, below Strategy section): collapsible list of all past signal_outcomes for this memo's ticker. Each row: fired date, fired price, action taken (买入/跳过 with reason), 3-month forward return (colour-coded), debrief snippet. Hidden when no outcomes exist.

**`DisclaimerBlock`** always visible at bottom: "decision support, not investment advice."

**Action bar:** [Update / Regenerate] · [Clone for peer] · [Attach to Trade]
- Attach to Trade writes `memo_execution` entry to `semantic_memory` recording alignment/override signal for InvestorDNA.

**Version history:** tap version chip → sheet with list; tap any → diff view (status / thesis / valuation side-by-side).

**DB→model boundary (do not break):** the version-history sheet feeds `setVersion(rawRow)` directly from `listResearchVersions(memoId)`. That function MUST map rows through `rowToResearchVersion` — otherwise `sources`/`businessSnapshot`/`valuation` arrive as JSON strings and `.map`/`.length`/member access on them throws at render. `rowToResearchVersion` also guards `sources` with `Array.isArray(parsed) ? parsed : []` so a corrupted legacy row can't crash the Sources section. See CLAUDE.md → "DB row → model boundary" for the full convention.

**LLM output language:** all narrative text fields (`thesis_summary`, `business_snapshot.*`, `trading_strategy.*`, etc.) are Simplified Chinese. JSON keys and enum values stay English.

**Integration points:**
- Holdings row: `ResearchChip` ("深度研究") on every holding → navigates to Research with `prefillTicker` + `prefillHoldingId`.
- Log rows: `ResearchChip` ("深度研究") on every trade (not just watch/hold) → navigates to Research with `prefillTicker`.

#### Memory system integration

| Layer | Mechanism | Effect |
|-------|-----------|--------|
| Tier 2 (FTS5) | `research_fts_ai/au/ad` triggers on `research_versions` | Research memos retrievable by `EpisodicMemoryRetriever` |
| Tier 3 (semantic) | `recordInsight(type:"research_memo")` after generation | Conclusion stored; surfaces in STANDARD/DEEP context |
| MemoryManager | `researchMemos` block at priority 4.5 in `assemble()` | Mentor sees current research status when discussing a ticker |
| InvestorDNA | `recordInsight(type:"memo_execution")` on trade attach | Feeds research-discipline signal into behavioural profile |

---

### 5.8 Settings (hidden screen, route: `settings`)

Accessible via the ⚙ gear icon in the 心法 (Home) masthead. Not shown in the tab bar.

**Sections:**
1. **DeepSeek API Key**:
   - Password-masked input (`sk-…` format). "保存" button calls `setApiKey(value)` (SecureStore).
   - "清除" button for deletion.
   - Link to `https://platform.deepseek.com/api_keys`.
2. **Finnhub API Key** (v1.8):
   - Password-masked input. "保存" button calls `setFinnhubKey(value)` (SecureStore).
   - "清除" button for deletion.
   - Status dot: green if key present ("已配置 — 财报与分析师数据已启用"), grey if absent ("未配置 — 仅使用免费价格数据").
   - Link to `https://finnhub.io/register`.
   - Without this key: signal monitoring works on price-only conditions; earnings conditions are never satisfied (signals deferred until key added).
3. **信号通知 · Signal Notifications** (v1.8):
   - Toggle switch. Stored in `kv` as `signal_notifications_enabled` (default on).
   - When off: `checkAllSignals()` still evaluates conditions and logs `signal_events` but skips `scheduleSignalNotification`. Signal Center banner on Research screen still works.
4. **语音输入 · Voice Input**:
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

Ten selectable personas (as of v1.7). Each has a hard-coded system prompt style (~150–200 words) that DeepSeek adopts. `MASTERS[0]` is always `"default"` = personal mentor. The other 9 are named masters; `ROUNDTABLE_MASTERS` enumerates them in their default selection order (the first 4 are the out-of-box Roundtable picks: growth · value · cycle · tail-risk).

| id | zh | Core stance |
|---|---|---|
| `default` | 你的导师 | Warm, knows user's history, pattern-spotter, challenges gently |
| `lynch` | 彼得·林奇 | Invest in what you know, GARP, categorize stocks, pragmatic |
| `buffett` | 巴菲特 | Wonderful companies fair prices, moats, 10-year holding mindset |
| `marks` | 霍华德·马克斯 | Second-level thinking, cycle awareness, risk over return |
| `taleb` | 纳西姆·塔勒布 | Tail risk, antifragility, convex options bets, barbell strategy, no false precision |
| `munger` | 芒格 | Mental models, inversion, blunt, incentive-aware |
| `dalio` | 达利欧 | Principles, cycles, diversification, stress-test beliefs |
| `graham` | 格雷厄姆 | Margin of safety, investment vs speculation, conservative |
| `bogle` | 约翰·博格 | Passive index ETF, cost-matters hypothesis, "buy the haystack", stay the course |
| `wood` | 凯西·伍德 | Disruptive innovation, thematic active ETF, Wright's Law cost curves, 5-year time horizon |

Each named master also has a meeting-role entry in `MASTER_MEETING_ROLES` (committee-specific instruction prepended to their style when they participate in a Roundtable session) — e.g. Lynch is the "Opportunity Scout", Munger the "Devil's Advocate", Taleb the "Tail-Risk Hunter", Bogle the "Passive Index Advocate", Wood the "Disruption Theorist".

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

**Live prices (`fetchLivePrices`):**
- Endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=2d`
- Headers: shared `YF_HEADERS` constant (`User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`).
- Parse response:
  - `price = result.meta.regularMarketPrice`
  - `currency = result.meta.currency`
  - `prevClose = result.meta.chartPreviousClose || result.meta.previousClose`
  - `changePercent = (price - prevClose) / prevClose * 100`
  - `asOf = new Date(result.meta.regularMarketTime * 1000).toLocaleString()`
- Parallel fetch with `Promise.allSettled` — failures omitted from output, don't crash.

**Research snapshot (`fetchResearchSnapshot`):**
- Endpoint: `https://query{1|2}.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=...&crumb=<crumb>`
- **Crumb auth required** for non-US tickers (e.g. `0700.HK`). Flow: touch `https://fc.yahoo.com` to set consent cookie → GET `/v1/test/getcrumb` → append `&crumb=` to all `quoteSummary` calls. Crumb cached process-lifetime; 401 invalidates and retries with fresh crumb. `preWarmYFCrumb()` called when composer opens.
- All YF requests share `YF_HEADERS = { User-Agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }`.
- Rotate between `query1` / `query2` subdomains on failure. Retry up to 4× with exponential backoff; 401 uses 1s base, 429 uses 2s base.
- Result cached 24h in `research_snapshot_cache` SQLite table. Stale cache sets `disclaimer_flags.stale = true`.
- Fields extracted: `businessSummary`, `sector`, `industry`, `marketCap`, `52w range`, `beta`, `trailingPE`, `forwardPE`, `pegRatio`, `priceToBook`, `evToEbitda`, `profitMargins`, `roe`, `roa`, `freeCashflow`, `debtToEquity`, `currentRatio`, `revenueGrowth`, `earningsGrowth`, `epsEstimateNextQ`, `nextEarningsDate`, `latestFilingDate`, `latestFilingUrl`.
- Passed as structured XML block `<snapshot>` into both `generateResearchHeadline()` and `generateResearchDeepAnalysis()` (via shared `_buildResearchContextBlocks` helper) so the LLMs focus on analysis, not recall.

**Symbol search (autocomplete):**
- Endpoint: `https://query1.finance.yahoo.com/v1/finance/search?q=<query>&quotesCount=5`
- Returns `data.quotes[]` with `{ symbol, longname, shortname, exchange, quoteType }`.
- Used in `StockSearchInput` component — debounced 400ms, min 2 chars, clears on unmount.
- Available in HoldingForm (Holdings), TradeForm (Log), and ResearchComposer (Research).

**Ticker conventions:**
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

### 8.4 Research Pipeline (parallel streaming generation)

**Problem solved:** the original `generateResearchMemo` was a single blocking `deepseek-v4-pro` call with `max_tokens: 8000` that produced a 10-section JSON. Wall-clock latency was ~2 minutes with no feedback — unacceptable on mobile.

**Architecture:** `src/research/pipeline.js` fans out into three parallel LLM calls and writes each slice to the placeholder version row as it lands.

| Stage | Model | Output | Latency | What user sees |
|---|---|---|---|---|
| **Placeholder** | — | DB row written, status="generating" | ~50ms | Memo screen opens, skeletons render |
| **Snapshot + Memory** (parallel) | — | Yahoo Finance fundamentals + memory context | ~1-2s | (concurrent with stage 1 below) |
| **1. Headline** (parallel) | `deepseek-v4-flash`, streamed | `status`, `confidence`, `confidence_basis`, `max_risk_summary`, `thesis_summary`, `business_snapshot` | ~5-8s | Verdict + business view fill in |
| **2. Rules** (depends on Headline) | `deepseek-v4-flash` | rules pass/fail/n/a | ~3-5s after Headline | Rules section fills in |
| **3. Deep** (parallel with Headline) | `deepseek-v4-pro`, streamed | `valuation`, `position_sizing`, `trading_strategy`, `deep_research_checklist` | ~25-40s | Below-the-fold sections fill in |
| **Finalize** | — | `sources`, `disclaimerFlags`, `generatedAt`; record rich insight to `semantic_memory` | <100ms | DisclaimerBlock renders, ProgressChip disappears |

**Time-to-first-useful-content: ~5-8s.** Total wall clock: ~25-40s, bounded by the Pro call. User can read and interact with the memo while deep analysis is still running.

**Why this preserves accuracy:**
- Headline (flash) handles summarization/extraction from the Yahoo Finance snapshot — task flash is good at.
- Deep (pro) keeps the reasoning-heavy work (valuation scenarios, sizing math, conditional triggers) with ~40% smaller token output because the headline fields are removed from its schema.
- Both calls receive identical context blocks via `_buildResearchContextBlocks` — no information loss.

**Progress events:** subscribers receive `{stage, phase, chunk?, data?, error?}`. Phases use the exported `StagePhase` const (`PENDING | RUNNING | CHUNK | DONE | ERROR | STALLED`). `ResearchMemo.js` subscribes via `subscribeResearchProgress(memoId, listener)` and dispatches per-stage refreshes:
- `HEADLINE/DONE` → reloadVersion + refreshMemoById (status/confidence flipped)
- `DEEP/DONE` → reloadVersion + refreshMemoById (nextReviewDate may have changed)
- `RULES/DONE` → reloadRuleChecks only
- `FINALIZE/DONE` → reloadVersion + refreshMemoById

**Failure handling:**
- Headline fails → `_finalize` sets memo status to `"watch"` with `confidence: "low"` and adds `headline_generation_failed` to `disclaimer_flags.missing_data`. The memo is still readable rather than stuck on `"generating"`.
- Deep fails → headline fields still render; `disclaimer_flags.partial: true` is set.
- Rules fails → `SectionBody` shows red error message via `errorText` prop instead of empty placeholder.
- Race avoided: deep_research_checklist is stored in `valuation.checklist` (not `business_snapshot`) so headline's `business_snapshot` write can't clobber a deep write that landed first. The viewer's `ChecklistSection` already falls back to this location.
- `_finalize` itself is wrapped in try/finally so the `_activeJobs.delete()` + FINALIZE.DONE emit always fire — a DB write failure inside `_finalize` must never leave the memo screen stuck on "Updating memo…".

**Loading-indicator semantics:** `ResearchMemo.js` derives `isGenerating` from `memo.status === "generating"` OR `isStageBusy(stages.headline | stages.deep)`. Crucially, `stages.rules` is NOT in this expression — the rules check is a background sanity check; a slow or never-fired RULES.DONE event must never block the action bar. On FINALIZE.DONE the subscriber also force-settles any headline/deep/rules still marked RUNNING/PENDING, as a safety net for missed events.

**Orphan recovery (app force-quit mid-pipeline):**
- DB row stays at `status="generating"` but `_activeJobs` map in pipeline.js is process-scoped — empty after a relaunch.
- ResearchMemo screen detects this (`status === "generating"` + no active job) and renders an amber retry banner instead of stuck skeletons.
- One-tap retry re-fires `startResearchGeneration` against the same versionId — pipeline UPDATEs overwrite any half-filled fields.

**Background resilience (within OS limits):**
- `expo-keep-awake` holds a wake lock during generation so iOS doesn't sleep the device + suspend the JS thread mid-call.
- `expo-task-manager` + `expo-background-task` installed; periodic background task registration is a planned follow-up (needs dev-build cycle to test).
- Full resilience to force-quit / phone reboot requires server-side execution; not implemented (would require moving the DeepSeek API key off-device).

**Mentor enrichment:** `_finalize` records a ~600-char prose insight per memo into `semantic_memory` (memory_type="research_memo", scope=ticker) containing the verdict, live Yahoo Finance fundamentals, business summary, valuation scenarios, position plan, watch items, and review date. The mentor's `MemoryManager.assemble()` pulls the 2 most-recent memos per ticker — gives the mentor situational awareness of current market data despite DeepSeek's 2025 training cutoff. Token cost: +400-600 input tokens per mentor query (prefix-cached after first hit; <50ms TTFT impact).

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
- `<MasterPickerModal visible onClose onSelect subtitle>` — slide-up modal listing all masters; `subtitle` is optional. Used by Holdings, Weekly, Monthly to let user pick a master before launching the mentor chat flow.
- `<ModalShell visible onClose kicker title children footer scrollable contentPadding edges>` (v1.7+) — shared full-screen modal scaffold: slide-up `Modal` + `SafeAreaView` + standard header (Kicker + TSerifBold + close-X) + optional `ScrollView` body + optional fixed footer. Used by `SynthesisModal`, `SynthesisHistoryModal`, `HistoryModal` (Roundtable), `StrategyReportModal` (Home), `FullMessageModal` (Mentor), and `FullFeedbackModal` (components). New modals should reuse it instead of re-implementing the scaffold. Defaults: `scrollable=true`, `contentPadding=20`, `edges` omitted (SafeAreaView's library default — all 4 edges). Pass `edges={["top","bottom"]}` for the Roundtable flavor.
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
│   ├── utils.js                    # fmtDate, monthKey, weekKey, weekRange, fmtCurrency, ago, todayIso, addMonths
│   ├── db.js                       # SQLite schema + typed CRUD helpers (9 tables + research tables)
│   ├── api.js                      # DeepSeek + Yahoo Finance (incl. fetchResearchSnapshot, generateResearchHeadline, generateResearchDeepAnalysis, parseLooseJson, fmtNumber)
│   ├── voice.js                    # useSpeech hook — wraps @react-native-voice/voice
│   ├── context.js                  # AppCtx React context + useApp hook (avoids circular imports)
│   ├── components.js               # shared UI primitives (incl. StatusBadge, ConfidencePill, SourceCard, DisclaimerBlock)
│   ├── memory/
│   │   ├── HotCache.js             # In-memory philosophy/rules/DNA cache
│   │   ├── MemoryManager.js        # assemble() / recordInsight() / triggerDNA() — four-tier context builder
│   │   ├── background/
│   │   │   └── DreamJob.js         # Background DNA distillation job
│   │   ├── entities/
│   │   │   └── InvestorDNA.js      # InvestorDNA entity: distill(), toPromptBlock(), isExpired()
│   │   └── retrieval/
│   │       └── EpisodicMemoryRetriever.js  # FTS5 BM25 retrieval with _hydrate() for all source types
│   ├── research/
│   │   └── pipeline.js             # Parallel research generation pipeline: startResearchGeneration(), buildPlaceholder(), subscribeResearchProgress(), getResearchJobStatus(), StagePhase, StageName
│   └── screens/
│       ├── Home.js                 # 心法 tab — philosophy, rules, mentor default, stats
│       ├── Review.js               # 复盘 tab — sub-tab container for Weekly + Monthly
│       ├── Weekly.js               # 周记 sub-tab (inside Review); 导师 button → mentor chat
│       ├── Monthly.js              # 月评 sub-tab (inside Review); 导师 button → mentor chat
│       ├── Log.js                  # 记录 tab — trades + thoughts (sub-tabs); "研究这个想法" on watch entries
│       ├── Holdings.js             # 持仓 tab; "更新研究" CTA + status dot per holding row
│       ├── Research.js             # 研究 tab — research queue + new-memo composer modal
│       ├── ResearchMemo.js         # hidden screen — memo detail with versioning, rules check, attach-to-trade
│       ├── Roundtable.js           # 华山论道 — hidden screen, multi-master roundtable
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
// max_tokens: 1500; prompt enforces 150-250 words; result cached in monthly_mentor_cache
mentorPanelResponse(topic, masterId, profile, previousRounds, additionalQuestion): Promise<{text, verdict}>
// Roundtable: one master's response for a given round. 120-180 words, VERDICT line stripped from display.
chatMessage(history, newUserMessage, profile, masterId="default"): Promise<string>

// Internal helpers
detectLang(text: string): "Chinese" | "English"
// Detects user content language via /[一-鿿]/ — result injected as LANGUAGE directive in all master prompts

// Yahoo Finance (no key, no throws from missing key)
fetchLivePrices(symbols: string[]): Promise<{[symbol]: {price, currency, changePercent, resolvedTicker, asOf}}>

// Research: Yahoo Finance quoteSummary (7 modules, 24h SQLite cache, exponential-backoff retry)
fetchResearchSnapshot(ticker: string): Promise<ResearchSnapshot | null>

// Research: AI memo generation — split into two parallel calls (see §8.4 Research Pipeline)
generateResearchHeadline({ticker, currentPrice, snapshot, userThesis, manualNotes, holdingContext, profile, preAssembledCtx, onChunk}): Promise<HeadlineData>
// HeadlineData: {status, confidence, confidence_basis, max_risk_summary, thesis_summary, business_snapshot}
// Model: deepseek-v4-flash, streamed, ~5-8s
// status: "buy_setup"|"watch"|"reduce_risk"|"avoid"
// confidence: "high"|"medium"|"low"

generateResearchDeepAnalysis({ticker, currentPrice, snapshot, userThesis, manualNotes, holdingContext, profile, preAssembledCtx, onChunk}): Promise<DeepData>
// DeepData: {valuation, position_sizing, trading_strategy, deep_research_checklist, disclaimer_flags}
// Model: deepseek-v4-pro, streamed, ~25-40s
// Strictly no imperative language ("Buy now" / "Sell now" forbidden in system prompt)

// Research: rules conflict check (deepseek-v4-flash)
checkResearchRules(memoSummary: object, rules: string[]): Promise<{rule_text, result, notes}[]>
// result: "pass"|"fail"|"n/a"

// Research: shared source builder
buildResearchSources(memoData: object, snapshot: ResearchSnapshot | null): SourceRecord[]

// Shared utilities (exported for cross-module reuse)
parseLooseJson(raw: string, opts?: {label, shape: "object"|"array", fallback}): object | array
// Strips markdown fences + Chinese curly quotes; carves out outermost {...} or [...]; throws on parse failure unless fallback given.

fmtNumber(n: number|null, decimals?: 2, missing?: "N/A"): string
// Compact number formatter with B/M suffix above 1e6.

// Internal helper
buildProfileContext({philosophy, rules, weeklyNotes, monthlyReviews, trades, holdings, prices, maxTrades, maxWeekly, maxMonthly}): string
```

### `src/research/pipeline.js`

```js
// Pipeline entry point — caller must pre-persist the placeholder memo + version
// via saveResearchMemoWithVersion (status: "generating") and navigate to the
// memo screen so skeletons render immediately. Returns once all stages settle;
// callers usually fire-and-forget and rely on progress events.
startResearchGeneration({memoId, versionId, ticker, currentPrice, userThesis, manualNotes, holdingContext, profile, rules, onMemoComplete?}): Promise<void>

// Build a placeholder {memo, version} pair (status="generating") for immediate
// DB insertion before the pipeline starts. Headline lands first and flips
// status to its real value.
buildPlaceholder({memoId, versionId, ticker, companyName, holdingId, versionNum?: 1}): {memo, version}

// Subscribe to progress events for one memo. Returns an unsubscribe fn.
// Event shape: {stage: StageName, phase: StagePhase, chunk?, data?, error?}
// Chunk events fire many times per second during streaming — subscribers
// typically ignore them.
subscribeResearchProgress(memoId, listener: (event) => void): () => void

// Read the active job's stage map (or null if no job for this memoId in this process).
getResearchJobStatus(memoId): {stages: {headline, deep, rules}, startedAt} | null

// Exported string-union constants — use these instead of raw stage/phase literals.
StageName.{ SNAPSHOT, HEADLINE, DEEP, RULES, FINALIZE }
StagePhase.{ IDLE, PENDING, RUNNING, CHUNK, DONE, ERROR, STALLED }
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

addHoldingReview(holdingId, date, content): Promise<void>
listHoldingReviews(holdingId): Promise<{id, date, content, createdAt}[]>
deleteHoldingReview(id): Promise<void>

listRoundtableSessions(): Promise<RoundtableSession[]>
addRoundtableSession(topic, masters, data): Promise<RoundtableSession>
deleteRoundtableSession(id): Promise<void>

// Research
listResearchMemos(): Promise<ResearchMemo[]>
getResearchMemo(id: string): Promise<ResearchMemo | null>
getResearchMemoByTicker(ticker: string): Promise<ResearchMemo | null>
saveResearchMemoWithVersion(memo, version, ruleChecks): Promise<void>   // transaction: upsert + insert
deleteResearchMemo(id: string): Promise<void>                           // cascades to versions, rule_checks, links
listResearchVersions(memoId: string): Promise<ResearchVersion[]>
getResearchVersion(id: string): Promise<ResearchVersion | null>
insertResearchRuleChecks(checks: ResearchRuleCheck[]): Promise<void>
listResearchRuleChecks(versionId: string): Promise<ResearchRuleCheck[]>
updateRuleCheckOverride(id: string, overrideReason: string): Promise<void>
updateResearchVersionFields(versionId: string, fields: Partial<ResearchVersion>): Promise<void>  // partial UPDATE; used by pipeline stages to patch slices
updateResearchMemoFields(memoId: string, fields: Partial<ResearchMemo>): Promise<void>           // partial UPDATE on memo header; used when headline lands
insertResearchLink(memoId, entityType, entityId): Promise<void>
listResearchLinks(memoId: string): Promise<ResearchLink[]>
getCachedSnapshot(ticker: string): Promise<ResearchSnapshot | null>     // null if stale > 24h
setCachedSnapshot(ticker: string, data: object): Promise<void>
getRecentResearchMemos(ticker: string, limit: number): Promise<SemanticRow[]>  // used by MemoryManager

newId(prefix: string): string                                           // exported — e.g. newId("rmemo") → "rmemo_8f3a..."

exportAll(): Promise<FullExportObject>              // Covers all tables including roundtable_sessions, holding_reviews, monthly_mentor_cache
importAll(data): Promise<void>
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
27. ✅ Tapping "带入问道 ↗" on a holding row includes all review log entries (date + content) in the mentor context message alongside buy reason and notes.
28. ✅ "导出 Vault" in Settings exports all thoughts as individual Markdown files under `Thoughts/`; the `profile` object passed to `exportToObsidianVault` includes `thoughts`.

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
