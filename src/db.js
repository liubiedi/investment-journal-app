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
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

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
  `);
  // Migrations for existing databases (idempotent — fails silently if column exists).
  try { await db.runAsync("ALTER TABLE holdings ADD COLUMN buy_reason TEXT"); } catch {}
}

const newId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
    `INSERT INTO trades (id, date, action, stock, reason, emotion, rules_checked, raw_input, feedback, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, t.date, t.action, t.stock, t.reason, t.emotion,
      JSON.stringify(t.rulesChecked || []),
      t.rawInput || null,
      JSON.stringify([]),
      now,
    ]
  );
  return { ...t, id, feedback: [] };
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
    reason: r.reason, emotion: r.emotion,
    rulesChecked: safeJson(r.rules_checked, []),
    rawInput: r.raw_input || undefined,
    feedback: safeJson(r.feedback, []),
  };
}

// ---------- thoughts ----------
export async function listThoughts() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM thoughts ORDER BY date DESC");
  return rows.map(r => ({
    id: r.id, date: r.date, content: r.content,
    rawInput: r.raw_input || undefined,
    feedback: safeJson(r.feedback, []),
  }));
}

export async function addThought(content, rawInput) {
  const db = await getDb();
  const id = newId("thought");
  const now = Date.now();
  const date = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO thoughts (id, date, content, raw_input, feedback, created_at) VALUES (?,?,?,?,?,?)`,
    [id, date, content, rawInput || null, JSON.stringify([]), now]
  );
  return { id, date, content, rawInput, feedback: [] };
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
    currency: r.currency, buyReason: r.buy_reason, notes: r.notes, addedAt: r.added_at,
  }));
}

export async function addHolding(h) {
  const db = await getDb();
  const id = newId("holding");
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO holdings (id, symbol, display_name, shares, cost_basis, currency, buy_reason, notes, added_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, h.symbol, h.displayName || null, h.shares, h.costBasis, h.currency || null, h.buyReason || null, h.notes || null, now]
  );
  return { ...h, id, addedAt: now };
}

export async function updateHolding(id, updates) {
  const db = await getDb();
  const fields = [], vals = [];
  const map = { symbol: "symbol", displayName: "display_name", shares: "shares", costBasis: "cost_basis", currency: "currency", buyReason: "buy_reason", notes: "notes" };
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
export async function listChat() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT role, content FROM chat_history ORDER BY id ASC");
  return rows;
}

export async function appendChat(role, content) {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO chat_history (role, content, created_at) VALUES (?,?,?)",
    [role, content, Date.now()]
  );
}

export async function clearChat() {
  const db = await getDb();
  await db.runAsync("DELETE FROM chat_history");
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

// ---------- helpers ----------
function safeJson(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

// Export all app data as a single JSON for backup
export async function exportAll() {
  const [kvRows, trades, thoughts, holdings, weekly, monthly, chat, prices] = await Promise.all([
    (async () => {
      const db = await getDb();
      return db.getAllAsync("SELECT * FROM kv");
    })(),
    listTrades(), listThoughts(), listHoldings(),
    listWeeklyNotes(), listMonthlyReviews(), listChat(), getPricesCache(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    kv: Object.fromEntries(kvRows.map(r => [r.key, safeJson(r.value, r.value)])),
    trades, thoughts, holdings, weeklyNotes: weekly, monthlyReviews: monthly,
    chatHistory: chat, prices,
  };
}
