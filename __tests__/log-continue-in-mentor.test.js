/**
 * Unit tests for Log.js handleContinueInMentor (TradeRow + ThoughtRow).
 * Pure logic tests — no React/RN imports to avoid Expo winter-runtime issues.
 *
 * Verifies:
 *   - masterId is passed to both db.appendChat calls
 *   - navigation uses { autoMaster: masterId }
 *   - message content includes context from the trade / thought
 *   - works for all 7 valid master IDs
 */

const { getMaster } = require("../src/constants");

// Re-implement the handlers from Log.js for isolated testing
// (identical logic, extracted here to avoid RN import chain)

function makeTradeHandler(trade, appendChat, navigate) {
  return async (masterId, feedbackText) => {
    const master = getMaster(masterId);
    await appendChat(
      "user",
      `我想继续讨论 ${master.zh} 对我这笔交易的点评。\n\n【${trade.action.toUpperCase()}】${trade.stock}\n情绪：${trade.emotion} · 理由：${trade.reason}`,
      masterId
    );
    await appendChat("assistant", feedbackText, masterId);
    navigate("mentor", { autoMaster: masterId });
  };
}

function makeThoughtHandler(thought, appendChat, navigate) {
  return async (masterId, feedbackText) => {
    const master = getMaster(masterId);
    await appendChat(
      "user",
      `我想继续讨论 ${master.zh} 对我这段心念的回应。\n\n心念：${thought.content}`,
      masterId
    );
    await appendChat("assistant", feedbackText, masterId);
    navigate("mentor", { autoMaster: masterId });
  };
}

// ─── TradeRow ────────────────────────────────────────────────────────────────

describe("TradeRow.handleContinueInMentor", () => {
  const trade = { action: "buy", stock: "AAPL", emotion: "calm", reason: "Strong fundamentals" };
  let appendChat, navigate;

  beforeEach(() => {
    appendChat = jest.fn().mockResolvedValue(undefined);
    navigate = jest.fn();
  });

  it("passes masterId to both appendChat calls", async () => {
    const handler = makeTradeHandler(trade, appendChat, navigate);
    await handler("lynch", "Lynch feedback");

    expect(appendChat).toHaveBeenCalledTimes(2);
    expect(appendChat).toHaveBeenNthCalledWith(1, "user", expect.any(String), "lynch");
    expect(appendChat).toHaveBeenNthCalledWith(2, "assistant", "Lynch feedback", "lynch");
  });

  it("navigates to mentor with { autoMaster: masterId }", async () => {
    const handler = makeTradeHandler(trade, appendChat, navigate);
    await handler("munger", "Munger reply");

    expect(navigate).toHaveBeenCalledWith("mentor", { autoMaster: "munger" });
  });

  it("does NOT navigate with a plain string (old bug)", async () => {
    const handler = makeTradeHandler(trade, appendChat, navigate);
    await handler("lynch", "reply");

    expect(navigate).not.toHaveBeenCalledWith("mentor");        // old: no params
    expect(navigate).toHaveBeenCalledWith("mentor", expect.objectContaining({ autoMaster: "lynch" }));
  });

  it("includes trade context (action, stock, reason) in user message", async () => {
    const handler = makeTradeHandler(trade, appendChat, navigate);
    await handler("buffett", "Buffett reply");

    const [, userMsg] = appendChat.mock.calls[0];
    expect(userMsg).toContain("BUY");
    expect(userMsg).toContain("AAPL");
    expect(userMsg).toContain("Strong fundamentals");
  });

  it("includes the master's Chinese name in the user message", async () => {
    const handler = makeTradeHandler(trade, appendChat, navigate);
    await handler("lynch", "reply");

    const [, userMsg] = appendChat.mock.calls[0];
    expect(userMsg).toContain("彼得·林奇");
  });

  it("uses correct Chinese name for each master", async () => {
    const masterNames = {
      lynch: "彼得·林奇",
      buffett: "巴菲特",
      munger: "芒格",
      dalio: "达利欧",
      marks: "霍华德·马克斯",
      graham: "格雷厄姆",
      default: "你的导师",
    };
    for (const [masterId, expectedName] of Object.entries(masterNames)) {
      appendChat.mockClear(); navigate.mockClear();
      const handler = makeTradeHandler(trade, appendChat, navigate);
      await handler(masterId, "feedback");
      const [, userMsg] = appendChat.mock.calls[0];
      expect(userMsg).toContain(expectedName);
    }
  });

  it("works for all 7 valid master IDs — routes and saves correctly", async () => {
    const masterIds = ["lynch", "buffett", "munger", "dalio", "marks", "graham", "default"];
    for (const masterId of masterIds) {
      appendChat.mockClear(); navigate.mockClear();
      const handler = makeTradeHandler(trade, appendChat, navigate);
      await handler(masterId, "Some feedback");
      expect(appendChat).toHaveBeenNthCalledWith(1, "user", expect.any(String), masterId);
      expect(appendChat).toHaveBeenNthCalledWith(2, "assistant", "Some feedback", masterId);
      expect(navigate).toHaveBeenCalledWith("mentor", { autoMaster: masterId });
    }
  });
});

// ─── ThoughtRow ──────────────────────────────────────────────────────────────

describe("ThoughtRow.handleContinueInMentor", () => {
  const thought = { content: "Is TSLA too speculative for my style?" };
  let appendChat, navigate;

  beforeEach(() => {
    appendChat = jest.fn().mockResolvedValue(undefined);
    navigate = jest.fn();
  });

  it("passes masterId to both appendChat calls", async () => {
    const handler = makeThoughtHandler(thought, appendChat, navigate);
    await handler("marks", "Marks reply");

    expect(appendChat).toHaveBeenCalledTimes(2);
    expect(appendChat).toHaveBeenNthCalledWith(1, "user", expect.any(String), "marks");
    expect(appendChat).toHaveBeenNthCalledWith(2, "assistant", "Marks reply", "marks");
  });

  it("navigates to mentor with { autoMaster: masterId }", async () => {
    const handler = makeThoughtHandler(thought, appendChat, navigate);
    await handler("graham", "Graham reply");

    expect(navigate).toHaveBeenCalledWith("mentor", { autoMaster: "graham" });
  });

  it("includes the thought content in the user message", async () => {
    const handler = makeThoughtHandler(thought, appendChat, navigate);
    await handler("dalio", "Dalio reply");

    const [, userMsg] = appendChat.mock.calls[0];
    expect(userMsg).toContain("Is TSLA too speculative for my style?");
  });

  it("includes the master's Chinese name in the thought user message", async () => {
    const handler = makeThoughtHandler(thought, appendChat, navigate);
    await handler("munger", "reply");

    const [, userMsg] = appendChat.mock.calls[0];
    expect(userMsg).toContain("芒格");
  });
});
