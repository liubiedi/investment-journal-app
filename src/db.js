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
  `);
  // Migrations for existing databases (idempotent — fails silently if column exists).
  try { await db.runAsync("ALTER TABLE holdings ADD COLUMN buy_reason TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE holdings ADD COLUMN buy_date TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE chat_history ADD COLUMN master_id TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE trades ADD COLUMN stock_name TEXT"); } catch {}
  try { await db.runAsync("ALTER TABLE thoughts ADD COLUMN emotion TEXT"); } catch {}
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

export async function updateTrade(id, fields) {
  const db = await getDb();
  const allowed = ["reason", "emotion", "stock", "action", "date"];
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
  };
}

// ---------- thoughts ----------
export async function listThoughts() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM thoughts ORDER BY date DESC");
  return rows.map(r => ({
    id: r.id, date: r.date, content: r.content,
    emotion: r.emotion || undefined,
    rawInput: r.raw_input || undefined,
    feedback: safeJson(r.feedback, []),
  }));
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
