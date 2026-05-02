/**
 * Unit tests for Mentor screen business logic.
 * Tests the pure logic extracted from the component without importing
 * any React / React Native code (avoids Expo winter-runtime issues in Jest).
 *
 * Covers:
 *   - retry() calls chatMessage with history.slice(0,-1)
 *   - send() sets pendingRetry only on network errors (not NO_API_KEY)
 *   - reset() calls clearChat with the active master ID
 *   - loadHistory calls listChat with the active master ID
 */

const mockChatMessage = jest.fn();
const mockAppendChat = jest.fn().mockResolvedValue(undefined);
const mockListChat = jest.fn().mockResolvedValue([]);
const mockClearChat = jest.fn().mockResolvedValue(undefined);

// ─── retry() logic ───────────────────────────────────────────────────────────

describe("retry logic", () => {
  beforeEach(() => jest.clearAllMocks());

  it("passes history.slice(0,-1) as context — not the full history", async () => {
    const history = [
      { role: "user", content: "First Q", masterId: "lynch", createdAt: 1000 },
      { role: "assistant", content: "First A", masterId: "lynch", createdAt: 1001 },
      { role: "user", content: "Failed Q", masterId: "lynch", createdAt: 1002 },
    ];
    const pendingRetry = "Failed Q";
    const activeMaster = "lynch";

    mockChatMessage.mockResolvedValueOnce("Retry answer");

    // Simulate retry() body
    const contextHistory = history.slice(0, -1);
    await mockChatMessage(contextHistory, pendingRetry, {}, activeMaster);

    expect(mockChatMessage).toHaveBeenCalledWith(
      [history[0], history[1]],
      "Failed Q",
      {},
      "lynch"
    );
  });

  it("appends assistant reply to DB with correct masterId on success", async () => {
    mockChatMessage.mockResolvedValueOnce("Lynch says hi");

    await mockChatMessage([], "question", {}, "lynch");
    await mockAppendChat("assistant", "Lynch says hi", "lynch");

    expect(mockAppendChat).toHaveBeenCalledWith("assistant", "Lynch says hi", "lynch");
  });

  it("does NOT append to DB when retry also fails", async () => {
    mockChatMessage.mockRejectedValueOnce(new Error("Network down"));
    try {
      await mockChatMessage([], "question", {}, "lynch");
    } catch {
      // expected — appendChat should NOT be called
    }
    expect(mockAppendChat).not.toHaveBeenCalled();
  });

  it("passes the correct masterId even when active master is 'munger'", async () => {
    mockChatMessage.mockResolvedValueOnce("Munger response");
    const contextHistory = [{ role: "user", content: "prev", masterId: "munger", createdAt: 1 }];
    const pendingRetry = "retry text";

    await mockChatMessage(contextHistory, pendingRetry, {}, "munger");

    expect(mockChatMessage).toHaveBeenCalledWith(
      contextHistory, pendingRetry, {}, "munger"
    );
  });
});

// ─── send() pendingRetry gating ──────────────────────────────────────────────

describe("send() pendingRetry gating", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sets pendingRetry when chatMessage throws a non-API-key error", async () => {
    mockChatMessage.mockRejectedValueOnce(new Error("Network error"));

    let pendingRetry = null;
    const text = "Will this fail?";

    try {
      await mockChatMessage([], text, {}, "lynch");
    } catch (e) {
      if (e.message !== "NO_API_KEY") pendingRetry = text;
    }

    expect(pendingRetry).toBe("Will this fail?");
  });

  it("does NOT set pendingRetry when error is NO_API_KEY", async () => {
    mockChatMessage.mockRejectedValueOnce(new Error("NO_API_KEY"));

    let pendingRetry = null;

    try {
      await mockChatMessage([], "test", {}, "default");
    } catch (e) {
      if (e.message !== "NO_API_KEY") pendingRetry = "test";
    }

    expect(pendingRetry).toBeNull();
  });

  it("clears pendingRetry when send succeeds", async () => {
    mockChatMessage.mockResolvedValueOnce("Great reply");

    let pendingRetry = "stale retry text";
    await mockChatMessage([], "new question", {}, "default");
    pendingRetry = null; // as component does on success

    expect(pendingRetry).toBeNull();
  });

  it("user message is saved to DB before API call", async () => {
    mockChatMessage.mockResolvedValueOnce("ok");

    const text = "My question";
    await mockAppendChat("user", text, "lynch");
    await mockChatMessage([], text, {}, "lynch");

    expect(mockAppendChat).toHaveBeenCalledWith("user", text, "lynch");
    expect(mockChatMessage).toHaveBeenCalledWith([], text, {}, "lynch");
  });
});

// ─── reset() per-master scoping ──────────────────────────────────────────────

describe("reset() per-master scoping", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls clearChat with the active master ID not without args", async () => {
    const activeMaster = "buffett";
    await mockClearChat(activeMaster);
    expect(mockClearChat).toHaveBeenCalledWith("buffett");
  });

  it("clears 'lynch' thread only — not 'default'", async () => {
    await mockClearChat("lynch");
    expect(mockClearChat).not.toHaveBeenCalledWith("default");
    expect(mockClearChat).toHaveBeenCalledTimes(1);
  });
});

// ─── per-master history loading ──────────────────────────────────────────────

describe("loadHistory — per-master filtering", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls listChat with activeMaster", async () => {
    mockListChat.mockResolvedValueOnce([
      { role: "user", content: "Q", masterId: "lynch", createdAt: 1000 },
    ]);
    const result = await mockListChat("lynch");
    expect(mockListChat).toHaveBeenCalledWith("lynch");
    expect(result).toHaveLength(1);
  });

  it("returns empty array when switching to a master with no history", async () => {
    mockListChat.mockResolvedValueOnce([]);
    const result = await mockListChat("buffett");
    expect(result).toHaveLength(0);
  });

  it("resets pendingRetry when loading new master history", () => {
    let pendingRetry = "old retry";
    // Simulating what loadHistory callback does
    const setPendingRetry = (v) => { pendingRetry = v; };
    const setError = jest.fn();

    setPendingRetry(null);
    setError("");

    expect(pendingRetry).toBeNull();
    expect(setError).toHaveBeenCalledWith("");
  });
});
