// EpisodicMemoryRetriever — FTS5 BM25 relevance-ranked journal retrieval.
// Combines FTS5's BM25 score with the entry's relevance_weight (decayed by DreamJob)
// to surface both textually relevant AND historically significant entries.

import { getDb } from "../../db";

export class EpisodicMemoryRetriever {
  constructor() {
    this._db = null;
  }

  async _getDb() {
    if (!this._db) this._db = await getDb();
    return this._db;
  }

  /**
   * Retrieve journal entries relevant to a ticker and/or query.
   *
   * @param {string|null} ticker  - Primary ticker (e.g. "AAPL"); searched in ticker_mentions
   * @param {string}      query   - Additional free-text (user message, question keywords)
   * @param {object}      opts
   * @param {number}        opts.limit       - Max results after dedup (default: 10)
   * @param {number}        opts.daysBack    - How far back to search (default: 90; 0 = unlimited)
   * @param {string[]}      opts.sourceTypes - Which types to include
   * @returns {Promise<Array>} Sorted by combined relevance (highest first)
   */
  async retrieve(ticker, query = "", opts = {}) {
    const {
      limit = 10,
      daysBack = 90,
      sourceTypes = ["trade", "thought", "weekly"],
    } = opts;

    const db = await this._getDb();

    // Build FTS5 MATCH expression.
    // Ticker is treated as a phrase to avoid spurious matches (e.g. "A" matching everything).
    // Query terms are added with OR so any match counts.
    const terms = [];
    if (ticker && ticker.length >= 2) terms.push(ticker);
    if (query && query.trim()) {
      // Split into tokens; use only meaningful ones (≥2 chars)
      const tokens = query.trim().split(/\s+/).filter(t => t.length >= 2).slice(0, 8);
      terms.push(...tokens);
    }
    if (terms.length === 0) return [];

    const ftsQuery = terms.join(" OR ");

    const typeFilter = sourceTypes.map(t => `'${t}'`).join(", ");

    let dateSql = "";
    const params = [ftsQuery];
    if (daysBack > 0) {
      const cutoff = new Date(Date.now() - daysBack * 86400000)
        .toISOString()
        .slice(0, 10);
      dateSql = "AND f.entry_date >= ?";
      params.push(cutoff);
    }
    params.push(limit * 3); // over-fetch to allow weight re-sorting

    const ftsRows = await db.getAllAsync(
      `SELECT f.source_type, f.source_id, f.entry_date, f.emotion,
              bm25(journal_fts) AS bm25_score
       FROM journal_fts f
       WHERE journal_fts MATCH ? ${dateSql}
         AND f.source_type IN (${typeFilter})
       ORDER BY bm25_score
       LIMIT ?`,
      params
    );

    if (ftsRows.length === 0) return [];

    // Hydrate full records and apply relevance_weight
    const hydrated = await Promise.all(ftsRows.map(row => this._hydrate(row)));
    const valid = hydrated.filter(Boolean);

    // Final score: BM25 is negative (more negative = more relevant), weight amplifies it
    valid.forEach(item => {
      item.finalScore = item.bm25Score * (item.relevanceWeight || 1.0);
    });

    return valid
      .sort((a, b) => a.finalScore - b.finalScore) // most negative first
      .slice(0, limit);
  }

  async _hydrate(row) {
    const db = await this._getDb();
    try {
      switch (row.source_type) {
        case "trade": {
          const t = await db.getFirstAsync(
            "SELECT id, date, action, stock, reason, emotion, rules_checked, feedback, relevance_weight FROM trades WHERE id = ?",
            [row.source_id]
          );
          if (!t) return null;
          return {
            type: "trade",
            bm25Score: row.bm25_score,
            relevanceWeight: t.relevance_weight ?? 1.0,
            id: t.id,
            date: t.date,
            action: t.action,
            stock: t.stock,
            emotion: t.emotion,
            reason: t.reason,
          };
        }
        case "thought": {
          const th = await db.getFirstAsync(
            "SELECT id, date, content, emotion, relevance_weight FROM thoughts WHERE id = ?",
            [row.source_id]
          );
          if (!th) return null;
          return {
            type: "thought",
            bm25Score: row.bm25_score,
            relevanceWeight: th.relevance_weight ?? 1.0,
            id: th.id,
            date: th.date,
            content: th.content,
            emotion: th.emotion,
          };
        }
        case "weekly": {
          const w = await db.getFirstAsync(
            "SELECT week_key, text FROM weekly_notes WHERE week_key = ?",
            [row.source_id]
          );
          if (!w) return null;
          return {
            type: "weekly",
            bm25Score: row.bm25_score,
            relevanceWeight: 1.0,
            week: w.week_key,
            text: w.text,
            date: row.entry_date,
          };
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}

export const episodicRetriever = new EpisodicMemoryRetriever();
