/**
 * Unit tests for src/db.js — chat_history functions.
 * Covers: listChat filtering, appendChat masterId, clearChat scoping.
 */

// Import at the top level — the mock and db module share the same _store reference.
const SQLiteMock = require("expo-sqlite");
const db = require("../src/db");

// Reset only the in-memory store between tests, NOT the module registry.
// jest.resetModules() would cause the mock to be re-instantiated, breaking
// the _store reference shared between SQLiteMock and db.js's cached connection.
beforeEach(() => {
  SQLiteMock._resetStore();
});

// ─── appendChat ──────────────────────────────────────────────────────────────

describe("appendChat", () => {
  it("saves role and content with the given masterId", async () => {
    await db.appendChat("user", "Hello Lynch", "lynch");
    const store = SQLiteMock._store["chat_history"] ?? [];
    expect(store).toHaveLength(1);
    expect(store[0].role).toBe("user");
    expect(store[0].content).toBe("Hello Lynch");
    expect(store[0].master_id).toBe("lynch");
  });

  it("defaults masterId to 'default' when not provided", async () => {
    await db.appendChat("assistant", "Reply text");
    const store = SQLiteMock._store["chat_history"] ?? [];
    expect(store).toHaveLength(1);
    expect(store[0].master_id).toBe("default");
  });

  it("saves multiple messages from different masters", async () => {
    await db.appendChat("user", "Q for Lynch", "lynch");
    await db.appendChat("assistant", "Lynch reply", "lynch");
    await db.appendChat("user", "Q for Munger", "munger");
    await db.appendChat("assistant", "Munger reply", "munger");
    const store = SQLiteMock._store["chat_history"] ?? [];
    expect(store).toHaveLength(4);
  });
});

// ─── listChat ────────────────────────────────────────────────────────────────

describe("listChat", () => {
  async function seed() {
    await db.appendChat("user", "Q for Lynch", "lynch");
    await db.appendChat("assistant", "Lynch reply", "lynch");
    await db.appendChat("user", "Q for Munger", "munger");
    await db.appendChat("assistant", "Munger reply", "munger");
    await db.appendChat("user", "Q for default", "default");
  }

  it("returns all messages when no masterId given", async () => {
    await seed();
    const all = await db.listChat();
    expect(all).toHaveLength(5);
  });

  it("returns only lynch messages when masterId='lynch'", async () => {
    await seed();
    const lynch = await db.listChat("lynch");
    expect(lynch).toHaveLength(2);
    lynch.forEach((m) => expect(m.masterId).toBe("lynch"));
  });

  it("returns only munger messages when masterId='munger'", async () => {
    await seed();
    const munger = await db.listChat("munger");
    expect(munger).toHaveLength(2);
    munger.forEach((m) => expect(m.masterId).toBe("munger"));
  });

  it("returns only default messages when masterId='default'", async () => {
    await seed();
    const def = await db.listChat("default");
    expect(def).toHaveLength(1);
    expect(def[0].content).toBe("Q for default");
  });

  it("returns empty array for a master with no messages", async () => {
    await seed();
    const none = await db.listChat("buffett");
    expect(none).toHaveLength(0);
  });

  it("maps snake_case columns to camelCase fields", async () => {
    await db.appendChat("user", "Test", "lynch");
    const [msg] = await db.listChat("lynch");
    expect(msg).toHaveProperty("role");
    expect(msg).toHaveProperty("content");
    expect(msg).toHaveProperty("masterId", "lynch");
    expect(msg).toHaveProperty("createdAt");
  });

  it("falls back to 'default' masterId for legacy rows without master_id", async () => {
    // Directly insert a row simulating pre-migration data (master_id = null)
    const store = SQLiteMock._store;
    if (!store["chat_history"]) store["chat_history"] = [];
    store["chat_history"].push({ id: 999, role: "user", content: "legacy", master_id: null, created_at: 1000 });
    const rows = await db.listChat();
    const legacy = rows.find((r) => r.content === "legacy");
    expect(legacy?.masterId).toBe("default");
  });
});

// ─── clearChat ───────────────────────────────────────────────────────────────

describe("clearChat", () => {
  async function seed() {
    await db.appendChat("user", "Q for Lynch", "lynch");
    await db.appendChat("assistant", "Lynch reply", "lynch");
    await db.appendChat("user", "Q for Munger", "munger");
    await db.appendChat("assistant", "Munger reply", "munger");
  }

  it("clears only the specified master's messages when masterId provided", async () => {
    await seed();
    await db.clearChat("lynch");
    const lynch = await db.listChat("lynch");
    const munger = await db.listChat("munger");
    expect(lynch).toHaveLength(0);
    expect(munger).toHaveLength(2);
  });

  it("clears all messages when called with no argument", async () => {
    await seed();
    await db.clearChat();
    const all = await db.listChat();
    expect(all).toHaveLength(0);
  });

  it("clears all messages when called with null", async () => {
    await seed();
    await db.clearChat(null);
    const all = await db.listChat();
    expect(all).toHaveLength(0);
  });

  it("is idempotent — clearing an already-empty master does not throw", async () => {
    await seed();
    await expect(db.clearChat("buffett")).resolves.not.toThrow();
    // Other masters untouched
    const all = await db.listChat();
    expect(all).toHaveLength(4);
  });
});
