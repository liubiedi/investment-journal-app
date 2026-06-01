// SQLite persistence layer
// Uses expo-sqlite (the new async API, SDK 51+)

import * as SQLite from "expo-sqlite";

let _db = null;

export async function getDb() {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync("journal.db");
    await initSchema(_db);
  }
  return _db;
}

async function initSchema(db) {
  // Set WAL mode in a separate call — iOS 26 SQLite rejects mixing PRAGMAs
  // and DDL statements in a single execAsync batch.
  await db.execAsync("PRAGMA journal_mode = WAL;");

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      action TEXT NOT NULL,
      stock TEXT NOT NULL,
      reason TEXT NOT NULL,
      emotion TEXT NOT NULL,
      rules_checked TEXT,
      raw_input TEXT,
      feedback TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thoughts (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      content TEXT NOT NULL,
      raw_input TEXT,
      feedback TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      display_name TEXT,
      shares REAL NOT NULL,
      cost_basis REAL NOT NULL,
      currency TEXT,
      buy_reason TEXT,
      notes TEXT,
      added_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weekly_notes (
      week_key TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS monthly_reviews (
      month_key TEXT PRIMARY KEY,
      bullets TEXT NOT NULL,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS monthly_mentor_cache (
      month_key TEXT,
      master_id TEXT,
      text TEXT,
      created_at INTEGER,
      PRIMARY KEY (month_key, master_id)
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prices_cache (
      symbol TEXT PRIMARY KEY,
      price REAL,
      currency TEXT,
      change_percent REAL,
      resolved_ticker TEXT,
      as_of TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS prices_meta (
      id INTEGER PRIMARY KEY CHECK (id=1),
      last_updated INTEGER
    );

    CREATE TABLE IF NOT EXISTS holding_reviews (
      id TEXT PRIMARY KEY,
      holding_id TEXT NOT NULL,
      date TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roundtable_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS research_memos (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      exchange TEXT,
      company_name TEXT,
      current_version_id TEXT,
      status TEXT,
      confidence TEXT,
      created_at TEXT,
      last_reviewed_at TEXT,
      next_review_date TEXT,
      holding_id TEXT
    );

    CREATE TABLE IF NOT EXISTS research_versions (
      id TEXT PRIMARY KEY,
      memo_id TEXT NOT NULL,
      version_num INTEGER NOT NULL,
      thesis TEXT,
      business_snapshot TEXT,
      valuation TEXT,
      position_sizing TEXT,
      trading_strategy TEXT,
      disclaimer_flags TEXT,
      sources TEXT,
      model_id TEXT,
      generated_at TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS research_rule_checks (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL,
      rule_text TEXT,
      result TEXT,
      notes TEXT,
      override_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS research_links (
      id TEXT PRIMARY KEY,
      memo_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      linked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS research_snapshot_cache (
      ticker TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_signals_cache (
      ticker TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signal_events (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      direction TEXT NOT NULL,
      trigger_price REAL,
      earnings_surprise REAL,
      fired_price REAL NOT NULL,
      memo_id TEXT,
      fired_at INTEGER NOT NULL,
      acknowledged INTEGER DEFAULT 0,
      conditions_detail TEXT
    );

    CREATE TABLE IF NOT EXISTS signal_outcomes (
      id TEXT PRIMARY KEY,
      signal_event_id TEXT NOT NULL,
      ticker TEXT NOT NULL,
      direction TEXT NOT NULL,
      action_taken TEXT,
      skip_reason TEXT,
      entry_price REAL,
      entry_date TEXT,
      trade_id TEXT,
      exit_price REAL,
      realized_pct REAL,
      realized_date TEXT,
      forward_1m_pct REAL,
      forward_3m_pct REAL,
      forward_6m_pct REAL,
      max_drawdown_3m REAL,
      forward_computed_at INTEGER,
      ai_debrief TEXT,
      debrief_notified INTEGER DEFAULT 0,
      reviewed INTEGER DEFAULT 0
    );
  `);
  // FTS5 full-text search + semantic memory tables (separate exec batch)
  await db.execAsync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS journal_fts USING fts5(
      content,
      ticker_mentions,
      source_type,
      source_id,
      entry_date,
      emotion,
      tokenize = 'porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS trades_fts_ai AFTER INSERT ON trades BEGIN
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(NEW.reason || ' ' || NEW.action || ' ' || NEW.stock, NEW.stock, 'trade', NEW.id, NEW.date, NEW.emotion);
    END;
    CREATE TRIGGER IF NOT EXISTS trades_fts_au AFTER UPDATE OF reason, stock, action, emotion ON trades BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.id AND source_type = 'trade';
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(NEW.reason || ' ' || NEW.action || ' ' || NEW.stock, NEW.stock, 'trade', NEW.id, NEW.date, NEW.emotion);
    END;
    CREATE TRIGGER IF NOT EXISTS trades_fts_ad AFTER DELETE ON trades BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.id AND source_type = 'trade';
    END;

    CREATE TRIGGER IF NOT EXISTS thoughts_fts_ai AFTER INSERT ON thoughts BEGIN
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(NEW.content, '', 'thought', NEW.id, NEW.date, COALESCE(NEW.emotion, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS thoughts_fts_au AFTER UPDATE OF content, emotion ON thoughts BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.id AND source_type = 'thought';
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(NEW.content, '', 'thought', NEW.id, NEW.date, COALESCE(NEW.emotion, ''));
    END;
    CREATE TRIGGER IF NOT EXISTS thoughts_fts_ad AFTER DELETE ON thoughts BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.id AND source_type = 'thought';
    END;

    CREATE TRIGGER IF NOT EXISTS weekly_fts_ai AFTER INSERT ON weekly_notes BEGIN
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(NEW.text, '', 'weekly', NEW.week_key, NEW.week_key || '-01', '');
    END;
    CREATE TRIGGER IF NOT EXISTS weekly_fts_au AFTER UPDATE OF text ON weekly_notes BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.week_key AND source_type = 'weekly';
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(NEW.text, '', 'weekly', NEW.week_key, NEW.week_key || '-01', '');
    END;
    CREATE TRIGGER IF NOT EXISTS weekly_fts_ad AFTER DELETE ON weekly_notes BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.week_key AND source_type = 'weekly';
    END;

    CREATE TRIGGER IF NOT EXISTS monthly_fts_ai AFTER INSERT ON monthly_reviews BEGIN
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(NEW.bullets, '', 'monthly', NEW.month_key, NEW.month_key || '-01', '');
    END;
    CREATE TRIGGER IF NOT EXISTS monthly_fts_au AFTER UPDATE OF bullets ON monthly_reviews BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.month_key AND source_type = 'monthly';
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(NEW.bullets, '', 'monthly', NEW.month_key, NEW.month_key || '-01', '');
    END;
    CREATE TRIGGER IF NOT EXISTS monthly_fts_ad AFTER DELETE ON monthly_reviews BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.month_key AND source_type = 'monthly';
    END;

    CREATE TRIGGER IF NOT EXISTS research_fts_ai AFTER INSERT ON research_versions BEGIN
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(
        COALESCE(NEW.thesis, '') || ' ' || COALESCE(json_extract(NEW.business_snapshot, '$.summary'), ''),
        (SELECT UPPER(ticker) FROM research_memos WHERE id = NEW.memo_id),
        'research',
        NEW.id,
        NEW.created_at,
        ''
      );
    END;
    CREATE TRIGGER IF NOT EXISTS research_fts_au AFTER UPDATE OF thesis, business_snapshot ON research_versions BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.id AND source_type = 'research';
      INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion)
      VALUES(
        COALESCE(NEW.thesis, '') || ' ' || COALESCE(json_extract(NEW.business_snapshot, '$.summary'), ''),
        (SELECT UPPER(ticker) FROM research_memos WHERE id = NEW.memo_id),
        'research',
        NEW.id,
        NEW.created_at,
        ''
      );
    END;
    CREATE TRIGGER IF NOT EXISTS research_fts_ad AFTER DELETE ON research_versions BEGIN
      DELETE FROM journal_fts WHERE source_id = OLD.id AND source_type = 'research';
    END;

    CREATE TABLE IF NOT EXISTS semantic_memory (
      id TEXT PRIMARY KEY,
      memory_type TEXT NOT NULL,
      scope TEXT,
      content TEXT NOT NULL,
      structured_data TEXT,
      source_entries INTEGER DEFAULT 0,
      distilled_at INTEGER NOT NULL,
      model_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_semantic_type ON semantic_memory(memory_type, scope);
  `);

  // Migrations for existing databases (idempotent — fails silently if column exists).
  // Signal monitoring columns on research_memos
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN buy_trigger_price REAL"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN buy_trigger_anchors TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN buy_trigger_confidence TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN buy_trigger_confirmed INTEGER DEFAULT 0"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN buy_trigger_price_override REAL"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN min_earnings_surprise_pct REAL"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN last_checked_earnings_period TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN sell_trim_price REAL"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN sell_trigger_anchors TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN sell_trigger_confidence TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN sell_trim_confirmed INTEGER DEFAULT 0"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN sell_trim_price_override REAL"); } catch {}
  try { await db.runAsync("ALTER TABLE research_memos ADD COLUMN trigger_backtest TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE holdings ADD COLUMN buy_reason TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE holdings ADD COLUMN buy_date TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE chat_history ADD COLUMN master_id TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN stock_name TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE thoughts ADD COLUMN emotion TEXT"); } catch {}
  // Memory architecture migrations
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN relevance_weight REAL NOT NULL DEFAULT 1.0"); } catch {}
  try { await db.runAsync("ALTER TABLE thoughts ADD COLUMN relevance_weight REAL NOT NULL DEFAULT 1.0"); } catch {}
  // Trade execution fields
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN quantity REAL"); } catch {}
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN entry_price REAL"); } catch {}
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN currency TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN option_type TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN strike_price REAL"); } catch {}
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN expiry TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN premium REAL"); } catch {}
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN executed INTEGER NOT NULL DEFAULT 0"); } catch {}
  // Backfill monthly reviews into journal_fts for existing DBs (idempotent via DELETE+INSERT).
  try {
    const months = await db.getAllAsync("SELECT month_key, bullets FROM monthly_reviews");
    if (months.length > 0) {
      await db.withTransactionAsync(async () => {
        for (const m of months) {
          await db.runAsync("DELETE FROM journal_fts WHERE source_id = ? AND source_type = 'monthly'", [m.month_key]);
          await db.runAsync(
            "INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion) VALUES(?,?,?,?,?,?)",
            [m.bullets, '', 'monthly', m.month_key, m.month_key + '-01', '']
          );
        }
      });
    }
  } catch {}
}

export const newId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ---------- kv (philosophy, rules, default master, etc.) ----------
export async function kvGet(key, fallback = null) {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT value FROM kv WHERE key = ?", [key]);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export async function kvSet(key, value) {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    [key, JSON.stringify(value)]
  );
}

// ---------- trades ----------
export async function listTrades() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM trades ORDER BY date DESC");
  return rows.map(rowToTrade);
}

export async function addTrade(t) {
  const db = await getDb();
  const id = newId("trade");
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO trades (id, date, action, stock, reason, emotion, rules_checked, raw_input, feedback, created_at,
       quantity, entry_price, currency, option_type, strike_price, expiry, premium, executed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, t.date, t.action, t.stock, t.reason, t.emotion,
      JSON.stringify(t.rulesChecked || []),
      t.rawInput || null,
      JSON.stringify([]),
      now,
      t.quantity ?? null,
      t.entryPrice ?? null,
      t.currency ?? null,
      t.optionType ?? null,
      t.strike ?? null,
      t.expiry ?? null,
      t.premium ?? null,
      0,
    ]
  );
  return { ...t, id, feedback: [], executed: 0 };
}

export async function updateTrade(id, fields) {
  const db = await getDb();
  const allowed = ["reason", "emotion", "stock", "action", "date", "executed"];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (keys.length === 0) return;
  await db.runAsync(
    `UPDATE trades SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    [...keys.map((k) => fields[k]), id]
  );
}

export async function updateTradeFeedback(id, feedback) {
  const db = await getDb();
  await db.runAsync("UPDATE trades SET feedback = ? WHERE id = ?", [JSON.stringify(feedback), id]);
}

export async function deleteTrade(id) {
  const db = await getDb();
  await db.runAsync("DELETE FROM trades WHERE id = ?", [id]);
}

function rowToTrade(r) {
  return {
    id: r.id, date: r.date, action: r.action, stock: r.stock,
    stockName: r.stock_name || undefined,
    reason: r.reason, emotion: r.emotion,
    rulesChecked: safeJson(r.rules_checked, []),
    rawInput: r.raw_input || undefined,
    feedback: safeJson(r.feedback, []),
    quantity: r.quantity ?? undefined,
    entryPrice: r.entry_price ?? undefined,
    currency: r.currency ?? undefined,
    optionType: r.option_type ?? undefined,
    strike: r.strike_price ?? undefined,
    expiry: r.expiry ?? undefined,
    premium: r.premium ?? undefined,
    executed: r.executed ?? 0,
  };
}

// ---------- thoughts ----------
function rowToThought(r) {
  return {
    id: r.id, date: r.date, content: r.content,
    emotion: r.emotion || undefined,
    rawInput: r.raw_input || undefined,
    feedback: safeJson(r.feedback, []),
  };
}

export async function listThoughts() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM thoughts ORDER BY date DESC");
  return rows.map(rowToThought);
}

export async function addThought(content, rawInput, emotion) {
  const db = await getDb();
  const id = newId("thought");
  const now = Date.now();
  const date = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO thoughts (id, date, content, raw_input, emotion, feedback, created_at) VALUES (?,?,?,?,?,?,?)`,
    [id, date, content, rawInput || null, emotion || null, JSON.stringify([]), now]
  );
  return { id, date, content, rawInput, emotion: emotion || undefined, feedback: [] };
}

export async function updateThought(id, content, emotion) {
  const db = await getDb();
  if (emotion !== undefined) {
    await db.runAsync("UPDATE thoughts SET content = ?, emotion = ? WHERE id = ?", [content, emotion || null, id]);
  } else {
    await db.runAsync("UPDATE thoughts SET content = ? WHERE id = ?", [content, id]);
  }
}

export async function updateThoughtFeedback(id, feedback) {
  const db = await getDb();
  await db.runAsync("UPDATE thoughts SET feedback = ? WHERE id = ?", [JSON.stringify(feedback), id]);
}

export async function deleteThought(id) {
  const db = await getDb();
  await db.runAsync("DELETE FROM thoughts WHERE id = ?", [id]);
}

// ---------- holdings ----------
export async function listHoldings() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM holdings ORDER BY added_at ASC");
  return rows.map(r => ({
    id: r.id, symbol: r.symbol, displayName: r.display_name,
    shares: r.shares, costBasis: r.cost_basis,
    currency: r.currency, buyReason: r.buy_reason, notes: r.notes, buyDate: r.buy_date || null, addedAt: r.added_at,
  }));
}

export async function addHolding(h) {
  const db = await getDb();
  const id = newId("holding");
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO holdings (id, symbol, display_name, shares, cost_basis, currency, buy_reason, notes, buy_date, added_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, h.symbol, h.displayName || null, h.shares, h.costBasis, h.currency || null, h.buyReason || null, h.notes || null, h.buyDate || null, now]
  );
  return { ...h, id, addedAt: now };
}

export async function updateHolding(id, updates) {
  const db = await getDb();
  const fields = [], vals = [];
  const map = { symbol: "symbol", displayName: "display_name", shares: "shares", costBasis: "cost_basis", currency: "currency", buyReason: "buy_reason", notes: "notes", buyDate: "buy_date" };
  for (const k of Object.keys(updates)) {
    if (map[k]) { fields.push(`${map[k]} = ?`); vals.push(updates[k]); }
  }
  if (fields.length === 0) return;
  vals.push(id);
  await db.runAsync(`UPDATE holdings SET ${fields.join(", ")} WHERE id = ?`, vals);
}

export async function deleteHolding(id) {
  const db = await getDb();
  await db.runAsync("DELETE FROM holdings WHERE id = ?", [id]);
}

// ---------- holding_reviews ----------
export async function listHoldingReviews(holdingId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT * FROM holding_reviews WHERE holding_id = ? ORDER BY date DESC",
    [holdingId]
  );
  return rows.map(r => ({ id: r.id, holdingId: r.holding_id, date: r.date, content: r.content, createdAt: r.created_at }));
}

export async function addHoldingReview(holdingId, date, content) {
  const db = await getDb();
  const id = newId("review");
  const now = Date.now();
  await db.runAsync(
    "INSERT INTO holding_reviews (id, holding_id, date, content, created_at) VALUES (?,?,?,?,?)",
    [id, holdingId, date, content, now]
  );
  return { id, holdingId, date, content, createdAt: now };
}

export async function deleteHoldingReview(id) {
  const db = await getDb();
  await db.runAsync("DELETE FROM holding_reviews WHERE id = ?", [id]);
}

export async function updateHoldingReview(id, date, content) {
  const db = await getDb();
  await db.runAsync("UPDATE holding_reviews SET date = ?, content = ? WHERE id = ?", [date, content, id]);
}

// ---------- weekly_notes ----------
export async function listWeeklyNotes() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM weekly_notes");
  const out = {};
  for (const r of rows) out[r.week_key] = r.text;
  return out;
}

export async function saveWeeklyNote(weekKey, text) {
  const db = await getDb();
  if (!text || !text.trim()) {
    await db.runAsync("DELETE FROM weekly_notes WHERE week_key = ?", [weekKey]);
    return;
  }
  await db.runAsync(
    "INSERT OR REPLACE INTO weekly_notes (week_key, text, updated_at) VALUES (?,?,?)",
    [weekKey, text, Date.now()]
  );
}

// ---------- monthly_reviews ----------
export async function listMonthlyReviews() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM monthly_reviews");
  const out = {};
  for (const r of rows) out[r.month_key] = safeJson(r.bullets, []);
  return out;
}

export async function saveMonthlyReview(monthKey, bullets) {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO monthly_reviews (month_key, bullets, updated_at) VALUES (?,?,?)",
    [monthKey, JSON.stringify(bullets), Date.now()]
  );
}

// ---------- monthly_mentor_cache ----------
export async function getMonthlyMentor(monthKey, masterId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    "SELECT text FROM monthly_mentor_cache WHERE month_key = ? AND master_id = ?",
    [monthKey, masterId]
  );
  return row ? row.text : null;
}

export async function setMonthlyMentor(monthKey, masterId, text) {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO monthly_mentor_cache (month_key, master_id, text, created_at) VALUES (?,?,?,?)",
    [monthKey, masterId, text, Date.now()]
  );
}

export async function listMonthlyMentorMasters(monthKey) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT master_id FROM monthly_mentor_cache WHERE month_key = ?", [monthKey]
  );
  return rows.map(r => r.master_id);
}

// ---------- chat_history ----------
export async function listChat(masterId = null) {
  const db = await getDb();
  const rows = masterId
    ? await db.getAllAsync(
        "SELECT role, content, master_id, created_at FROM chat_history WHERE master_id = ? ORDER BY id ASC",
        [masterId]
      )
    : await db.getAllAsync(
        "SELECT role, content, master_id, created_at FROM chat_history ORDER BY id ASC"
      );
  return rows.map((r) => ({ role: r.role, content: r.content, masterId: r.master_id || "default", createdAt: r.created_at }));
}

export async function appendChat(role, content, masterId = "default") {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO chat_history (role, content, master_id, created_at) VALUES (?,?,?,?)",
    [role, content, masterId, Date.now()]
  );
}

export async function clearChat(masterId = null) {
  const db = await getDb();
  if (masterId) {
    await db.runAsync("DELETE FROM chat_history WHERE master_id = ?", [masterId]);
  } else {
    await db.runAsync("DELETE FROM chat_history");
  }
}

// ---------- prices ----------
export async function getPricesCache() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM prices_cache");
  const data = {};
  for (const r of rows) {
    data[r.symbol] = {
      price: r.price, currency: r.currency,
      changePercent: r.change_percent,
      resolvedTicker: r.resolved_ticker,
      asOf: r.as_of,
    };
  }
  const meta = await db.getFirstAsync("SELECT last_updated FROM prices_meta WHERE id = 1");
  return { data, lastUpdated: meta?.last_updated || null };
}

export async function savePrices(map) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const [symbol, p] of Object.entries(map)) {
      await db.runAsync(
        `INSERT OR REPLACE INTO prices_cache (symbol, price, currency, change_percent, resolved_ticker, as_of, updated_at)
         VALUES (?,?,?,?,?,?,?)`,
        [symbol, p.price, p.currency, p.changePercent, p.resolvedTicker || symbol, p.asOf || null, Date.now()]
      );
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO prices_meta (id, last_updated) VALUES (1, ?)",
      [Date.now()]
    );
  });
}

// ---------- roundtable_sessions ----------
export async function saveRoundtableSession(data) {
  const db = await getDb();
  const now = Date.now();
  const result = await db.runAsync(
    "INSERT INTO roundtable_sessions (created_at, data) VALUES (?, ?)",
    [now, JSON.stringify(data)]
  );
  return result.lastInsertRowId;
}

export async function updateRoundtableSession(id, data) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE roundtable_sessions SET data = ? WHERE id = ?",
    [JSON.stringify(data), id]
  );
}

export async function listRoundtableSessions() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT id, created_at, data FROM roundtable_sessions ORDER BY created_at DESC"
  );
  return rows.map(r => ({ id: r.id, createdAt: r.created_at, ...safeJson(r.data, {}) }));
}

export async function deleteRoundtableSession(id) {
  const db = await getDb();
  await db.runAsync("DELETE FROM roundtable_sessions WHERE id = ?", [id]);
}

// ---------- helpers ----------
function safeJson(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

// Export all app data as a single JSON for backup
export async function exportAll() {
  const database = await getDb();
  const [kvRows, trades, thoughts, holdings, weekly, monthly, chat, prices, roundtable, holdingReviews, mentorCache] = await Promise.all([
    database.getAllAsync("SELECT * FROM kv"),
    listTrades(), listThoughts(), listHoldings(),
    listWeeklyNotes(), listMonthlyReviews(), listChat(), getPricesCache(),
    listRoundtableSessions(),
    database.getAllAsync("SELECT * FROM holding_reviews"),
    database.getAllAsync("SELECT * FROM monthly_mentor_cache"),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    kv: Object.fromEntries(kvRows.map(r => [r.key, safeJson(r.value, r.value)])),
    trades, thoughts, holdings, weeklyNotes: weekly, monthlyReviews: monthly,
    chatHistory: chat, prices, roundtableSessions: roundtable,
    holdingReviews: holdingReviews.map(r => ({ id: r.id, holdingId: r.holding_id, date: r.date, content: r.content, createdAt: r.created_at })),
    monthlyMentorCache: mentorCache.map(r => ({ monthKey: r.month_key, masterId: r.master_id, text: r.text, createdAt: r.created_at })),
  };
}

// ──────────────────────────────────────────────────────────────
// FTS5 backfill — call once after schema upgrade for existing data
// ──────────────────────────────────────────────────────────────
export async function backfillFts() {
  const db = await getDb();
  const check = await db.getFirstAsync("SELECT count(*) as n FROM journal_fts");
  if ((check?.n || 0) > 0) return; // already populated
  const [trades, thoughts, weekly] = await Promise.all([
    db.getAllAsync("SELECT id, date, action, stock, reason, emotion FROM trades"),
    db.getAllAsync("SELECT id, date, content, emotion FROM thoughts"),
    db.getAllAsync("SELECT week_key, text FROM weekly_notes"),
  ]);
  await db.withTransactionAsync(async () => {
    for (const t of trades) {
      await db.runAsync(
        "INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion) VALUES(?,?,?,?,?,?)",
        [t.reason + " " + t.action + " " + t.stock, t.stock, "trade", t.id, t.date, t.emotion || ""]
      );
    }
    for (const t of thoughts) {
      await db.runAsync(
        "INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion) VALUES(?,?,?,?,?,?)",
        [t.content, "", "thought", t.id, t.date, t.emotion || ""]
      );
    }
    for (const w of weekly) {
      await db.runAsync(
        "INSERT INTO journal_fts(content, ticker_mentions, source_type, source_id, entry_date, emotion) VALUES(?,?,?,?,?,?)",
        [w.text || "", "", "weekly", w.week_key, w.week_key + "-01", ""]
      );
    }
  });
}

// ──────────────────────────────────────────────────────────────
// Semantic memory (Tier 3 — AI-distilled knowledge)
// ──────────────────────────────────────────────────────────────

export async function getSemanticMemory(memoryType, scope = null) {
  const db = await getDb();
  if (scope) {
    return await db.getFirstAsync(
      "SELECT * FROM semantic_memory WHERE memory_type = ? AND scope = ? ORDER BY distilled_at DESC",
      [memoryType, scope]
    );
  }
  return await db.getFirstAsync(
    "SELECT * FROM semantic_memory WHERE memory_type = ? AND scope IS NULL ORDER BY distilled_at DESC",
    [memoryType]
  );
}

export async function setSemanticMemory(memoryType, scope, { content, structured, sourceEntries, modelId }) {
  const db = await getDb();
  const id = scope ? `${memoryType}:${scope}` : memoryType;
  await db.runAsync(
    `INSERT OR REPLACE INTO semantic_memory
     (id, memory_type, scope, content, structured_data, source_entries, distilled_at, model_id)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, memoryType, scope || null, content, structured ? JSON.stringify(structured) : null,
     sourceEntries || 0, Date.now(), modelId || "unknown"]
  );
}

// Append (multiple records per type+scope, e.g. mentor_insight)
export async function appendSemanticMemory(memoryType, scope, { content, structured, modelId }) {
  const db = await getDb();
  const id = `${memoryType}:${scope || "global"}:${Date.now()}`;
  await db.runAsync(
    `INSERT INTO semantic_memory
     (id, memory_type, scope, content, structured_data, source_entries, distilled_at, model_id)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, memoryType, scope || null, content, structured ? JSON.stringify(structured) : null,
     1, Date.now(), modelId || "unknown"]
  );
}

export async function listSemanticMemory(memoryType) {
  const db = await getDb();
  return await db.getAllAsync(
    "SELECT * FROM semantic_memory WHERE memory_type = ? ORDER BY distilled_at DESC",
    [memoryType]
  );
}

// Fetch recent mentor insights for a specific ticker (for STANDARD context)
export async function getRecentInsights(scope, limit = 3) {
  const db = await getDb();
  return await db.getAllAsync(
    "SELECT * FROM semantic_memory WHERE memory_type = 'mentor_insight' AND scope = ? ORDER BY distilled_at DESC LIMIT ?",
    [scope.toUpperCase(), limit]
  );
}

// ──────────────────────────────────────────────────────────────
// Dream job helpers — counting, listing, and weight management
// ──────────────────────────────────────────────────────────────

export async function countEntriesSince(timestamp) {
  const db = await getDb();
  const [t, th] = await Promise.all([
    db.getFirstAsync("SELECT count(*) as n FROM trades WHERE created_at > ?", [timestamp]),
    db.getFirstAsync("SELECT count(*) as n FROM thoughts WHERE created_at > ?", [timestamp]),
  ]);
  return (t?.n || 0) + (th?.n || 0);
}

export async function listTradesSince(timestamp) {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM trades WHERE created_at > ? ORDER BY date DESC", [timestamp]);
  return rows.map(rowToTrade);
}

export async function listThoughtsSince(timestamp) {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM thoughts WHERE created_at > ? ORDER BY date DESC", [timestamp]);
  return rows.map(rowToThought);
}

// Decay relevance weight for entries older than 30 days (5% per dream cycle, floor 0.1)
export async function applyRelevanceDecay() {
  const db = await getDb();
  const cutoff = Date.now() - 30 * 86400000;
  await Promise.all([
    db.runAsync("UPDATE trades SET relevance_weight = MAX(0.1, relevance_weight * 0.95) WHERE created_at < ?", [cutoff]),
    db.runAsync("UPDATE thoughts SET relevance_weight = MAX(0.1, relevance_weight * 0.95) WHERE created_at < ?", [cutoff]),
  ]);
}

// Reinforce an entry identified as significant by the dream job (+0.2, cap 2.0)
export async function reinforceEntry(entryId) {
  const db = await getDb();
  const table = entryId.startsWith("trade_") ? "trades" : "thoughts";
  await db.runAsync(
    `UPDATE ${table} SET relevance_weight = MIN(2.0, relevance_weight + 0.2) WHERE id = ?`,
    [entryId]
  );
}

// ──────────────────────────────────────────────────────────────
// Research memos
// ──────────────────────────────────────────────────────────────

export async function listResearchMemos() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM research_memos ORDER BY created_at DESC");
  return rows.map(rowToResearchMemo);
}

export async function getResearchMemo(memoId) {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT * FROM research_memos WHERE id = ?", [memoId]);
  return row ? rowToResearchMemo(row) : null;
}

export async function getResearchMemoByTicker(ticker) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    "SELECT * FROM research_memos WHERE UPPER(ticker) = UPPER(?) ORDER BY created_at DESC",
    [ticker]
  );
  return row ? rowToResearchMemo(row) : null;
}

export async function upsertResearchMemo(memo) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO research_memos
     (id, ticker, exchange, company_name, current_version_id, status, confidence,
      created_at, last_reviewed_at, next_review_date, holding_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      memo.id, memo.ticker, memo.exchange || null, memo.companyName || null,
      memo.currentVersionId || null, memo.status || null, memo.confidence || null,
      memo.createdAt, memo.lastReviewedAt || null, memo.nextReviewDate || null,
      memo.holdingId || null,
    ]
  );
}

export async function deleteResearchMemo(memoId) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const versions = await db.getAllAsync(
      "SELECT id FROM research_versions WHERE memo_id = ?", [memoId]
    );
    for (const v of versions) {
      await db.runAsync("DELETE FROM research_rule_checks WHERE version_id = ?", [v.id]);
    }
    await db.runAsync("DELETE FROM research_versions WHERE memo_id = ?", [memoId]);
    await db.runAsync("DELETE FROM research_links WHERE memo_id = ?", [memoId]);
    await db.runAsync("DELETE FROM research_memos WHERE id = ?", [memoId]);
  });
}

// ── versions ──

export async function listResearchVersions(memoId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    "SELECT * FROM research_versions WHERE memo_id = ? ORDER BY version_num DESC",
    [memoId]
  );
  // Parse JSON fields before returning — callers (e.g. the version history
  // sheet) hand these rows straight to render code, which crashes if
  // `sources` is still a JSON string instead of an array.
  return rows.map(rowToResearchVersion);
}

export async function getResearchVersion(versionId) {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT * FROM research_versions WHERE id = ?", [versionId]);
  if (!row) return null;
  return rowToResearchVersion(row);
}

export async function insertResearchVersion(v) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO research_versions
     (id, memo_id, version_num, thesis, business_snapshot, valuation,
      position_sizing, trading_strategy, disclaimer_flags, sources, model_id, generated_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      v.id, v.memoId, v.versionNum, v.thesis || null,
      v.businessSnapshot ? JSON.stringify(v.businessSnapshot) : null,
      v.valuation ? JSON.stringify(v.valuation) : null,
      v.positionSizing ? JSON.stringify(v.positionSizing) : null,
      v.tradingStrategy ? JSON.stringify(v.tradingStrategy) : null,
      v.disclaimerFlags ? JSON.stringify(v.disclaimerFlags) : null,
      v.sources ? JSON.stringify(v.sources) : null,
      v.modelId || null, v.generatedAt || null, v.createdAt,
    ]
  );
}

function rowToResearchVersion(r) {
  // Defensive parse: `sources` must always be an array — older rows or
  // partial writes could leave a stringified object behind.
  const parsedSources = safeJson(r.sources, []);
  return {
    id: r.id, memoId: r.memo_id, versionNum: r.version_num,
    thesis: r.thesis || '',
    businessSnapshot: safeJson(r.business_snapshot, {}),
    valuation: safeJson(r.valuation, {}),
    positionSizing: safeJson(r.position_sizing, {}),
    tradingStrategy: safeJson(r.trading_strategy, {}),
    disclaimerFlags: safeJson(r.disclaimer_flags, {}),
    sources: Array.isArray(parsedSources) ? parsedSources : [],
    modelId: r.model_id, generatedAt: r.generated_at, createdAt: r.created_at,
  };
}

// Patch a subset of fields on an existing research_version row.
// Used by the streaming pipeline to fill in fields as they arrive from the LLM.
// `fields` is an object with any of: thesis, businessSnapshot, valuation,
// positionSizing, tradingStrategy, disclaimerFlags, sources, modelId, generatedAt.
export async function updateResearchVersionFields(versionId, fields) {
  const db = await getDb();
  const map = {
    thesis: ["thesis", (v) => v ?? null],
    businessSnapshot: ["business_snapshot", (v) => v ? JSON.stringify(v) : null],
    valuation: ["valuation", (v) => v ? JSON.stringify(v) : null],
    positionSizing: ["position_sizing", (v) => v ? JSON.stringify(v) : null],
    tradingStrategy: ["trading_strategy", (v) => v ? JSON.stringify(v) : null],
    disclaimerFlags: ["disclaimer_flags", (v) => v ? JSON.stringify(v) : null],
    sources: ["sources", (v) => v ? JSON.stringify(v) : null],
    modelId: ["model_id", (v) => v ?? null],
    generatedAt: ["generated_at", (v) => v ?? null],
  };
  const cols = [], vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!map[k]) continue;
    cols.push(`${map[k][0]} = ?`);
    vals.push(map[k][1](v));
  }
  if (cols.length === 0) return;
  vals.push(versionId);
  await db.runAsync(`UPDATE research_versions SET ${cols.join(", ")} WHERE id = ?`, vals);
}

// Patch status / confidence / review-date on a memo without rewriting all fields.
export async function updateResearchMemoFields(memoId, fields) {
  const db = await getDb();
  const map = {
    status: "status",
    confidence: "confidence",
    companyName: "company_name",
    lastReviewedAt: "last_reviewed_at",
    nextReviewDate: "next_review_date",
    currentVersionId: "current_version_id",
    holdingId: "holding_id",
  };
  const cols = [], vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!map[k]) continue;
    cols.push(`${map[k]} = ?`);
    vals.push(v ?? null);
  }
  if (cols.length === 0) return;
  vals.push(memoId);
  await db.runAsync(`UPDATE research_memos SET ${cols.join(", ")} WHERE id = ?`, vals);
}

// ── rule checks ──

export async function insertResearchRuleChecks(checks) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const c of checks) {
      await db.runAsync(
        `INSERT INTO research_rule_checks (id, version_id, rule_text, result, notes, override_reason)
         VALUES (?,?,?,?,?,?)`,
        [c.id, c.versionId, c.ruleText, c.result, c.notes || null, c.overrideReason || null]
      );
    }
  });
}

export async function listResearchRuleChecks(versionId) {
  const db = await getDb();
  return await db.getAllAsync(
    "SELECT * FROM research_rule_checks WHERE version_id = ?", [versionId]
  );
}

export async function updateRuleCheckOverride(checkId, overrideReason) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE research_rule_checks SET override_reason = ? WHERE id = ?",
    [overrideReason, checkId]
  );
}

// ── links ──

export async function insertResearchLink(memoId, entityType, entityId) {
  const db = await getDb();
  const id = newId("rlink");
  await db.runAsync(
    "INSERT OR IGNORE INTO research_links (id, memo_id, entity_type, entity_id, linked_at) VALUES (?,?,?,?,?)",
    [id, memoId, entityType, entityId, new Date().toISOString()]
  );
}

export async function listResearchLinks(memoId) {
  const db = await getDb();
  return await db.getAllAsync("SELECT * FROM research_links WHERE memo_id = ?", [memoId]);
}

// ── Yahoo Finance snapshot cache ──

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function getCachedSnapshot(ticker) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    "SELECT data, fetched_at FROM research_snapshot_cache WHERE UPPER(ticker) = UPPER(?)",
    [ticker]
  );
  if (!row) return null;
  if (Date.now() - row.fetched_at > SNAPSHOT_TTL_MS) return null; // expired
  return safeJson(row.data, null);
}

export async function setCachedSnapshot(ticker, data) {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO research_snapshot_cache (ticker, data, fetched_at) VALUES (UPPER(?),?,?)",
    [ticker, JSON.stringify(data), Date.now()]
  );
}

// ── semantic memory helpers for research ──

export async function getRecentResearchMemos(ticker, limit = 2) {
  const db = await getDb();
  return await db.getAllAsync(
    "SELECT * FROM semantic_memory WHERE memory_type = 'research_memo' AND scope = UPPER(?) ORDER BY distilled_at DESC LIMIT ?",
    [ticker, limit]
  );
}

// ── save memo + version + rule checks atomically ──

export async function saveResearchMemoWithVersion(memo, version, ruleChecks) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await upsertResearchMemo(memo);
    await insertResearchVersion(version);
    if (ruleChecks && ruleChecks.length > 0) {
      for (const c of ruleChecks) {
        await db.runAsync(
          `INSERT INTO research_rule_checks (id, version_id, rule_text, result, notes, override_reason)
           VALUES (?,?,?,?,?,?)`,
          [c.id, c.versionId, c.ruleText, c.result, c.notes || null, c.overrideReason || null]
        );
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// Market signals cache
// ──────────────────────────────────────────────────────────────

const SIGNALS_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function getCachedMarketSignals(ticker) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    "SELECT data, fetched_at FROM market_signals_cache WHERE ticker = UPPER(?)",
    [ticker]
  );
  if (!row) return null;
  if (Date.now() - row.fetched_at > SIGNALS_CACHE_TTL_MS) return null;
  return safeJson(row.data, null);
}

export async function saveMarketSignalsCache(ticker, data) {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO market_signals_cache (ticker, data, fetched_at) VALUES (UPPER(?),?,?)",
    [ticker, JSON.stringify(data), Date.now()]
  );
}

// ──────────────────────────────────────────────────────────────
// Signal events
// ──────────────────────────────────────────────────────────────

export async function saveSignalEvent(event) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO signal_events
     (id, ticker, direction, trigger_price, earnings_surprise, fired_price, memo_id, fired_at, acknowledged, conditions_detail)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      event.id, event.ticker.toUpperCase(), event.direction,
      event.triggerPrice ?? null, event.earningsSurprise ?? null,
      event.firedPrice, event.memoId ?? null,
      event.firedAt ?? Date.now(), 0,
      event.conditionsDetail ? JSON.stringify(event.conditionsDetail) : null,
    ]
  );
}

export async function getRecentSignalEvent(ticker, direction, withinMs) {
  const db = await getDb();
  const since = Date.now() - withinMs;
  return await db.getFirstAsync(
    "SELECT * FROM signal_events WHERE ticker = UPPER(?) AND direction = ? AND fired_at > ? ORDER BY fired_at DESC",
    [ticker, direction, since]
  );
}

export async function getUnacknowledgedSignals() {
  const db = await getDb();
  return await db.getAllAsync(
    "SELECT * FROM signal_events WHERE acknowledged = 0 ORDER BY fired_at DESC"
  );
}

export async function acknowledgeSignal(id) {
  const db = await getDb();
  await db.runAsync("UPDATE signal_events SET acknowledged = 1 WHERE id = ?", [id]);
}

export async function getSignalEventsForMemo(memoId) {
  const db = await getDb();
  return await db.getAllAsync(
    "SELECT * FROM signal_events WHERE memo_id = ? ORDER BY fired_at DESC",
    [memoId]
  );
}

// ──────────────────────────────────────────────────────────────
// Signal outcomes
// ──────────────────────────────────────────────────────────────

export async function saveSignalOutcome(outcome) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO signal_outcomes
     (id, signal_event_id, ticker, direction, action_taken, skip_reason,
      entry_price, entry_date, trade_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      outcome.id, outcome.signalEventId, outcome.ticker.toUpperCase(),
      outcome.direction, outcome.actionTaken ?? null, outcome.skipReason ?? null,
      outcome.entryPrice ?? null, outcome.entryDate ?? null, outcome.tradeId ?? null,
    ]
  );
}

export async function updateSignalOutcome(id, fields) {
  const db = await getDb();
  const map = {
    actionTaken: "action_taken", skipReason: "skip_reason",
    entryPrice: "entry_price", entryDate: "entry_date",
    tradeId: "trade_id", exitPrice: "exit_price",
    realizedPct: "realized_pct", realizedDate: "realized_date",
    forward1mPct: "forward_1m_pct", forward3mPct: "forward_3m_pct",
    forward6mPct: "forward_6m_pct", maxDrawdown3m: "max_drawdown_3m",
    forwardComputedAt: "forward_computed_at", aiDebrief: "ai_debrief",
    debriefNotified: "debrief_notified", reviewed: "reviewed",
  };
  const cols = [], vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!map[k]) continue;
    cols.push(`${map[k]} = ?`);
    vals.push(v ?? null);
  }
  if (cols.length === 0) return;
  vals.push(id);
  await db.runAsync(`UPDATE signal_outcomes SET ${cols.join(", ")} WHERE id = ?`, vals);
}

export async function getSignalOutcome(signalEventId) {
  const db = await getDb();
  return await db.getFirstAsync(
    "SELECT * FROM signal_outcomes WHERE signal_event_id = ?",
    [signalEventId]
  );
}

export async function getSignalOutcomesForMemo(memoId) {
  const db = await getDb();
  return await db.getAllAsync(
    `SELECT so.*, se.fired_at, se.fired_price, se.trigger_price as event_trigger_price
     FROM signal_outcomes so
     JOIN signal_events se ON so.signal_event_id = se.id
     WHERE se.memo_id = ?
     ORDER BY se.fired_at DESC`,
    [memoId]
  );
}

export async function getAllSignalOutcomes() {
  const db = await getDb();
  return await db.getAllAsync(
    `SELECT so.*, se.fired_at, se.fired_price, se.trigger_price as event_trigger_price,
            se.ticker as event_ticker, se.direction as event_direction, se.memo_id
     FROM signal_outcomes so
     JOIN signal_events se ON so.signal_event_id = se.id
     ORDER BY se.fired_at DESC`
  );
}

export async function getPendingForwardReturns() {
  const db = await getDb();
  // Include skipped outcomes using signal fired_at/fired_price as the observation point —
  // this powers the CalibrationTab "missed opportunity" analysis.
  return await db.getAllAsync(
    `SELECT so.*, se.ticker as event_ticker, se.fired_at, se.fired_price
     FROM signal_outcomes so
     JOIN signal_events se ON so.signal_event_id = se.id
     WHERE (so.forward_6m_pct IS NULL OR so.forward_3m_pct IS NULL OR so.forward_1m_pct IS NULL)
       AND (
         (so.action_taken = 'acted' AND so.entry_date IS NOT NULL)
         OR
         so.action_taken = 'skipped'
       )`
  );
}

export async function getAnalyticsStats() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT
       count(distinct se.id) as total,
       count(CASE WHEN so.action_taken = 'acted' THEN 1 END) as acted,
       count(CASE WHEN so.action_taken = 'skipped' THEN 1 END) as skipped,
       count(CASE WHEN so.action_taken = 'acted' AND so.forward_3m_pct > 0 THEN 1 END) as wins,
       avg(CASE WHEN so.action_taken = 'acted' AND so.forward_3m_pct IS NOT NULL THEN so.forward_3m_pct END) as avg_return
     FROM signal_events se
     LEFT JOIN signal_outcomes so ON so.signal_event_id = se.id`
  );
  const actedCount = row?.acted ?? 0;
  const winsCount = row?.wins ?? 0;
  return {
    total: row?.total ?? 0,
    acted: actedCount,
    skipped: row?.skipped ?? 0,
    wins: winsCount,
    avgReturn3m: row?.avg_return ?? null,
    winRate: actedCount > 0 ? (winsCount / actedCount) * 100 : null,
  };
}

// ──────────────────────────────────────────────────────────────
// Research memo trigger fields
// ──────────────────────────────────────────────────────────────

export async function updateResearchMemoTriggers(memoId, {
  buyTriggerPrice, buyTriggerAnchors, buyTriggerConfidence,
  minEarningsSurprisePct, sellTrimPrice,
  sellTriggerAnchors, sellTriggerConfidence,
}) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE research_memos SET
       buy_trigger_price = ?, buy_trigger_anchors = ?, buy_trigger_confidence = ?,
       min_earnings_surprise_pct = ?, sell_trim_price = ?,
       sell_trigger_anchors = ?, sell_trigger_confidence = ?
     WHERE id = ?`,
    [
      buyTriggerPrice ?? null,
      buyTriggerAnchors?.length ? JSON.stringify(buyTriggerAnchors) : null,
      buyTriggerConfidence ?? null,
      minEarningsSurprisePct ?? null,
      sellTrimPrice ?? null,
      sellTriggerAnchors?.length ? JSON.stringify(sellTriggerAnchors) : null,
      sellTriggerConfidence ?? null,
      memoId,
    ]
  );
}

export async function updateTriggerBacktest(memoId, backtestData) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE research_memos SET trigger_backtest = ? WHERE id = ?",
    [backtestData ? JSON.stringify(backtestData) : null, memoId]
  );
}

export async function confirmTrigger(memoId, direction, priceOverride = null) {
  const db = await getDb();
  if (direction === "buy") {
    await db.runAsync(
      "UPDATE research_memos SET buy_trigger_confirmed = 1, buy_trigger_price_override = ? WHERE id = ?",
      [priceOverride ?? null, memoId]
    );
  } else {
    await db.runAsync(
      "UPDATE research_memos SET sell_trim_confirmed = 1, sell_trim_price_override = ? WHERE id = ?",
      [priceOverride ?? null, memoId]
    );
  }
}

export async function stopTrigger(memoId, direction) {
  const db = await getDb();
  if (direction === "buy") {
    await db.runAsync(
      "UPDATE research_memos SET buy_trigger_confirmed = 0, buy_trigger_price_override = NULL WHERE id = ?",
      [memoId]
    );
  } else {
    await db.runAsync(
      "UPDATE research_memos SET sell_trim_confirmed = 0, sell_trim_price_override = NULL WHERE id = ?",
      [memoId]
    );
  }
}

export async function getMonitoredMemos() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM research_memos
     WHERE (buy_trigger_confirmed = 1 AND buy_trigger_price IS NOT NULL)
        OR (sell_trim_confirmed = 1 AND sell_trim_price IS NOT NULL)
     ORDER BY created_at DESC`
  );
  return rows.map(rowToResearchMemo);
}

// ──────────────────────────────────────────────────────────────
// rowToResearchMemo transformer (with new trigger fields)
// ──────────────────────────────────────────────────────────────

export function rowToResearchMemo(r) {
  return {
    id: r.id, ticker: r.ticker, exchange: r.exchange || null,
    companyName: r.company_name || null, currentVersionId: r.current_version_id || null,
    status: r.status || null, confidence: r.confidence || null,
    createdAt: r.created_at || null, lastReviewedAt: r.last_reviewed_at || null,
    nextReviewDate: r.next_review_date || null, holdingId: r.holding_id || null,
    buyTriggerPrice: r.buy_trigger_price ?? null,
    buyTriggerAnchors: safeJson(r.buy_trigger_anchors, []),
    buyTriggerConfidence: r.buy_trigger_confidence ?? null,
    buyTriggerConfirmed: r.buy_trigger_confirmed ?? 0,
    buyTriggerPriceOverride: r.buy_trigger_price_override ?? null,
    minEarningsSurprisePct: r.min_earnings_surprise_pct ?? null,
    lastCheckedEarningsPeriod: r.last_checked_earnings_period ?? null,
    sellTrimPrice: r.sell_trim_price ?? null,
    sellTriggerAnchors: safeJson(r.sell_trigger_anchors, []),
    sellTriggerConfidence: r.sell_trigger_confidence ?? null,
    sellTrimConfirmed: r.sell_trim_confirmed ?? 0,
    sellTrimPriceOverride: r.sell_trim_price_override ?? null,
    triggerBacktest: safeJson(r.trigger_backtest, null),
  };
}

// Import a full backup snapshot — runs inside a transaction to avoid partial state
export async function importAll(snapshot) {
  if (!snapshot || snapshot.version !== 1) throw new Error("Invalid backup format");
  const database = await getDb();
  await database.withTransactionAsync(async () => {
    // kv
    await database.runAsync("DELETE FROM kv");
    if (snapshot.kv) {
      for (const [key, value] of Object.entries(snapshot.kv)) {
        await database.runAsync(
          "INSERT INTO kv (key, value) VALUES (?,?)",
          [key, JSON.stringify(value)]
        );
      }
    }
    // trades
    await database.runAsync("DELETE FROM trades");
    for (const t of snapshot.trades || []) {
      await database.runAsync(
        `INSERT OR REPLACE INTO trades (id, date, action, stock, stock_name, reason, emotion, rules_checked, raw_input, feedback, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [t.id, t.date, t.action, t.stock, t.stockName || null, t.reason, t.emotion, JSON.stringify(t.rulesChecked || []), t.rawInput || null, JSON.stringify(t.feedback || []), t.createdAt || Date.now()]
      );
    }
    // thoughts
    await database.runAsync("DELETE FROM thoughts");
    for (const t of snapshot.thoughts || []) {
      await database.runAsync(
        `INSERT OR REPLACE INTO thoughts (id, date, content, raw_input, emotion, feedback, created_at) VALUES (?,?,?,?,?,?,?)`,
        [t.id, t.date, t.content, t.rawInput || null, t.emotion || null, JSON.stringify(t.feedback || []), t.createdAt || Date.now()]
      );
    }
    // holdings
    await database.runAsync("DELETE FROM holdings");
    for (const h of snapshot.holdings || []) {
      await database.runAsync(
        `INSERT OR REPLACE INTO holdings (id, symbol, display_name, shares, cost_basis, currency, buy_reason, notes, buy_date, added_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [h.id, h.symbol, h.displayName || null, h.shares, h.costBasis, h.currency || null, h.buyReason || null, h.notes || null, h.buyDate || null, h.addedAt || Date.now()]
      );
    }
    // weekly notes
    await database.runAsync("DELETE FROM weekly_notes");
    if (snapshot.weeklyNotes) {
      for (const [key, text] of Object.entries(snapshot.weeklyNotes)) {
        await database.runAsync(
          "INSERT INTO weekly_notes (week_key, text, updated_at) VALUES (?,?,?)",
          [key, text, Date.now()]
        );
      }
    }
    // monthly reviews
    await database.runAsync("DELETE FROM monthly_reviews");
    if (snapshot.monthlyReviews) {
      for (const [key, bullets] of Object.entries(snapshot.monthlyReviews)) {
        await database.runAsync(
          "INSERT INTO monthly_reviews (month_key, bullets, updated_at) VALUES (?,?,?)",
          [key, Array.isArray(bullets) ? JSON.stringify(bullets) : bullets, Date.now()]
        );
      }
    }
    // chat history
    await database.runAsync("DELETE FROM chat_history");
    for (const m of snapshot.chatHistory || []) {
      await database.runAsync(
        "INSERT INTO chat_history (role, content, master_id, created_at) VALUES (?,?,?,?)",
        [m.role, m.content, m.masterId || "default", m.createdAt || Date.now()]
      );
    }
    // roundtable sessions (includes meeting minutes stored inside session data)
    await database.runAsync("DELETE FROM roundtable_sessions");
    for (const s of snapshot.roundtableSessions || []) {
      await database.runAsync(
        "INSERT INTO roundtable_sessions (id, created_at, data) VALUES (?,?,?)",
        [s.id, s.createdAt || Date.now(), JSON.stringify(s)]
      );
    }
    // holding reviews (user-written notes per holding)
    await database.runAsync("DELETE FROM holding_reviews");
    for (const r of snapshot.holdingReviews || []) {
      await database.runAsync(
        "INSERT INTO holding_reviews (id, holding_id, date, content, created_at) VALUES (?,?,?,?,?)",
        [r.id, r.holdingId, r.date, r.content, r.createdAt || Date.now()]
      );
    }
    // monthly mentor cache (AI commentary per month/master — saves regeneration cost)
    await database.runAsync("DELETE FROM monthly_mentor_cache");
    for (const c of snapshot.monthlyMentorCache || []) {
      await database.runAsync(
        "INSERT INTO monthly_mentor_cache (month_key, master_id, text, created_at) VALUES (?,?,?,?)",
        [c.monthKey, c.masterId, c.text, c.createdAt || Date.now()]
      );
    }
  });
}
