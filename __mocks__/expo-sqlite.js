// In-memory SQLite mock for Jest.
// Supports INSERT / DELETE with optional WHERE col = ?, SELECT with optional WHERE col = ?.

const _store = {};
const _autoInc = {};

function resetStore() {
  Object.keys(_store).forEach((k) => delete _store[k]);
  Object.keys(_autoInc).forEach((k) => delete _autoInc[k]);
}

function makeDb() {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),

    async runAsync(sql, params = []) {
      const upper = sql.trim().toUpperCase();

      if (upper.startsWith("ALTER TABLE") || upper.startsWith("PRAGMA")) return;

      if (upper.startsWith("INSERT")) {
        const tableMatch = sql.match(/INTO\s+(\w+)\s*\(([^)]+)\)/i);
        if (!tableMatch) return;
        const table = tableMatch[1];
        const cols = tableMatch[2].split(",").map((c) => c.trim());
        if (!_store[table]) _store[table] = [];
        if (!_autoInc[table]) _autoInc[table] = 1;
        const row = { id: _autoInc[table]++ };
        cols.forEach((c, i) => { row[c] = params[i] ?? null; });
        _store[table].push(row);
        return;
      }

      if (upper.startsWith("DELETE")) {
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        if (!tableMatch) return;
        const table = tableMatch[1];
        if (!_store[table]) return;
        const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
        if (whereMatch && params.length > 0) {
          const col = whereMatch[1];
          _store[table] = _store[table].filter((r) => r[col] !== params[0]);
        } else {
          _store[table] = [];
        }
        return;
      }

      if (upper.startsWith("UPDATE")) {
        const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
        if (!tableMatch) return;
        const table = tableMatch[1];
        if (!_store[table]) return;
        const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
        const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
        if (setMatch && whereMatch) {
          const setCols = setMatch[1].split(",").map((s) => s.trim().replace(/\s*=\s*\?/, ""));
          const whereCol = whereMatch[1];
          const idVal = params[params.length - 1];
          _store[table] = _store[table].map((r) => {
            if (r[whereCol] !== idVal) return r;
            const updated = { ...r };
            setCols.forEach((c, i) => { updated[c] = params[i]; });
            return updated;
          });
        }
      }
    },

    async getAllAsync(sql, params = []) {
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      if (!tableMatch) return [];
      const table = tableMatch[1];
      if (!_store[table]) return [];
      let rows = [..._store[table]];
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (whereMatch && params.length > 0) {
        const col = whereMatch[1];
        rows = rows.filter((r) => r[col] === params[0]);
      }
      return rows;
    },

    async getFirstAsync(sql, params = []) {
      const rows = await this.getAllAsync(sql, params);
      return rows[0] ?? null;
    },

    async withTransactionAsync(fn) {
      await fn();
    },
  };
}

const _db = makeDb();

module.exports = {
  openDatabaseAsync: jest.fn().mockResolvedValue(_db),
  _store,
  _resetStore: resetStore,
  _db,
};
