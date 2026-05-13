# 投资日志 · Investor's Ledger

Personal investment journal — Android app built with Expo / React Native.

## Features

- 📖 Philosophy + 5 Rules (your constitution)
- 📅 Weekly notes, Monthly reviews (with voice input)
- 💼 Trade log with AI parsing from natural speech/text
- 🤔 Thoughts / dilemmas (non-trade journaling)
- 📊 Current holdings with live prices (Yahoo Finance)
- 🎓 AI mentor chat, or consult investment masters (Peter Lynch, Buffett, Munger, Dalio, Marks, Graham)
- 🔬 **Research module** — versioned, source-backed decision memos with AI-generated conditional status (Buy Setup / Watch / Reduce Risk / Avoid), bull/base/bear valuation, rules conflict check, and Yahoo Finance fundamental data enrichment
- 📓 **Export to Obsidian-compatible Markdown vault** — save anywhere (Google Drive, email, etc.)
- 🔒 All data stored locally in SQLite — never leaves your device unless you explicitly export

## Prerequisites

1. **Node.js** (>= 20 LTS) — https://nodejs.org
2. **DeepSeek API key** for mentor features — https://platform.deepseek.com/api_keys
3. For APK build: **Expo account** (free) — https://expo.dev

## Setup

```bash
# Clone or download this folder, then:
cd investment-journal-app
npm install
```

## Running in development

```bash
# Start Metro bundler
npx expo start

# Then either:
#  - Press 'a' to open Android emulator (requires Android Studio)
#  - Scan QR with Expo Go app on your phone (limited — no voice recognition)
```

For a realistic dev experience **with voice recognition** on your phone, create a **development build** (one-time):

```bash
npx expo prebuild
npx expo run:android   # requires Android Studio SDK installed
```

## Building an Android APK (to install on your phone)

### Option A — EAS Build (cloud, recommended, no Android Studio needed)

```bash
npm install -g eas-cli
eas login                          # sign in with your Expo account
eas build:configure                # creates eas.json (already included here, skip if asked)
eas build -p android --profile preview
```

Wait ~10-15 minutes. When finished, EAS gives you a URL to download `.apk`. Transfer to your phone and install (enable "Install from unknown sources" in Android settings).

### Option B — Local build (faster iteration, needs Android Studio)

```bash
npx expo prebuild --clean
cd android
./gradlew assembleRelease
# APK appears at: android/app/build/outputs/apk/release/app-release.apk
```

## First launch

1. Open the app — you'll see a one-time Setup screen.
2. Paste your DeepSeek API key. It's stored in device `SecureStore`, never sent anywhere except `api.deepseek.com`.
3. (Optional) Edit your default Philosophy + Rules.
4. Start journaling.

## Token economy

The app is deliberately frugal with DeepSeek tokens:

- **Yahoo Finance for prices** — 0 tokens, 200ms.
- **deepseek-chat** for structured trade parsing — ~$0.0002 per trade.
- **deepseek-v4-pro** for mentor feedback, master views, monthly commentary, and research memo generation.
- **deepseek-v4-flash** for rules conflict checking in research memos.
- **Server-side prefix caching** — DeepSeek auto-caches request prefixes; rapid back-and-forth in chat reuses the cached system prompt at a discount.
- **No auto-feedback** — mentor comments only on explicit request. Each "求教" button tap costs roughly a fraction of a cent.
- **Context trimming** — trade feedback only passes last 10 trades (not all history) to save ingress tokens.

Estimated cost: ~$1-3/month for a daily user.

## Data

All data lives in an SQLite file inside the app's sandbox (`FileSystem.documentDirectory/SQLite/journal.db`). Export/backup via Android's app data backup, or use the "Export JSON" button in Settings.

Uninstalling the app deletes all data. Back up first.

## Project structure

```
investment-journal-app/
├── App.js                          # root; fonts, splash, navigation
├── app.json                        # Expo config (package name, icon, permissions)
├── eas.json                        # build profiles
├── package.json
├── babel.config.js
├── src/
│   ├── theme.js                    # colors, typography
│   ├── constants.js                # ACTIONS, EMOTIONS, MASTERS
│   ├── utils.js                    # date/currency helpers
│   ├── db.js                       # SQLite schema + CRUD
│   ├── api.js                      # DeepSeek + Yahoo Finance
│   ├── voice.js                    # speech-to-text hook
│   ├── components.js               # shared UI components
│   ├── memory/                     # four-tier context system (HotCache, MemoryManager, DNA, FTS5 retrieval)
│   └── screens/
│       ├── Home.js
│       ├── Weekly.js
│       ├── Monthly.js
│       ├── Log.js                  # trades + thoughts; "研究这个想法" on watch entries
│       ├── Holdings.js             # "更新研究" CTA + status dot per holding row
│       ├── Research.js             # 研究 tab — review queue + new-memo composer
│       ├── ResearchMemo.js         # memo detail with versioning, rules check, attach-to-trade
│       ├── Roundtable.js
│       ├── Mentor.js
│       └── Settings.js
└── assets/
    ├── icon.png
    └── splash.png
```

## License

MIT — personal use, do what you like.
