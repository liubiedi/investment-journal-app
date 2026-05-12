// DreamJob — memory consolidation and forgetting.
//
// Runs silently in the foreground when the app resumes and ≥10 new entries
// have accumulated since the last dream session. Does three things:
//
//   1. CONSOLIDATE: identifies patterns in recent entries using deepseek-v4-flash,
//      stores findings as a dream_session in semantic_memory.
//
//   2. FORGET (weighted decay): reduces relevance_weight for entries older than
//      30 days (−5% per cycle, floor 0.1). Reinforces entries that matched
//      recurring patterns (↑0.2, cap 2.0).
//
//   3. REINFORCE DNA: triggers InvestorDNA.distill() so the behavioral profile
//      reflects the newly consolidated patterns.

import * as db from "../../db";
import { InvestorDNA } from "../entities/InvestorDNA";
import { setDNA } from "../HotCache";

const DREAM_THRESHOLD = 10; // min new entries to trigger a dream session

export class DreamJob {
  async shouldRun() {
    const lastDream = await db.kvGet("last_dream_at", 0);
    const count = await db.countEntriesSince(lastDream);
    return count >= DREAM_THRESHOLD;
  }

  // callFlash: async (userPrompt) => string  (injected from api.js to avoid circular import)
  async run({ philosophy, rules, trades, weeklyNotes, monthlyReviews, callFlash }) {
    const lastDream = await db.kvGet("last_dream_at", 0);
    const [newTrades, newThoughts] = await Promise.all([
      db.listTradesSince(lastDream),
      db.listThoughtsSince(lastDream),
    ]);

    const allNew = [...newTrades, ...newThoughts];
    if (allNew.length < DREAM_THRESHOLD) return null;

    // Compress new entries for the flash model prompt
    const compressed = allNew.slice(0, 30).map(e => ({
      type: e.action ? "trade" : "thought",
      date: e.date?.slice(0, 10),
      stock: e.stock || null,
      emotion: e.emotion,
      text: (e.reason || e.content)?.slice(0, 80),
    }));

    // Load recent prior insights for context (so model can confirm or contradict)
    const priorInsights = await db.listSemanticMemory("mentor_insight");
    const insightSnippets = priorInsights.slice(0, 5)
      .map(i => `- [${i.scope || "general"}] ${i.content?.slice(0, 80)}`)
      .join("\n");

    const dreamPrompt = `You are consolidating an investor's recent journal entries into lasting insights.

Rules: ${(rules || []).map((r, i) => `${i + 1}. ${r}`).join("; ") || "(none)"}

Recent entries (${allNew.length} total, showing first ${compressed.length}):
${JSON.stringify(compressed)}

${insightSnippets ? `Prior mentor insights:\n${insightSnippets}` : ""}

Identify:
1. Patterns appearing multiple times (emotion-action correlations, recurring tickers, timing patterns)
2. Which prior insights are confirmed or contradicted by new data
3. Any new pattern not seen before

Reply ONLY with this JSON (no markdown):
{
  "patternsConfirmed": ["confirmed pattern description"],
  "patternsNew": ["new pattern description"],
  "stocksReinforced": ["TICKER"],
  "dreamSummary": "2-3 sentence synthesis of what this period reveals about the investor",
  "relevanceBoosts": [{"entryId": "trade_xxx_yyy", "reason": "why this entry is significant"}]
}`;

    let dreamResult = {};
    try {
      const raw = await callFlash(dreamPrompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
      if (s !== -1) dreamResult = JSON.parse(clean.slice(s, e + 1));
    } catch { /* dream result stays empty — forgetting still runs */ }

    // Apply decay to all old entries
    await db.applyRelevanceDecay();

    // Reinforce entries the model identified as significant
    for (const boost of (dreamResult.relevanceBoosts || [])) {
      if (boost.entryId) await db.reinforceEntry(boost.entryId);
    }

    // Persist dream session as semantic memory
    const dreamContent = [
      dreamResult.dreamSummary || "",
      ...(dreamResult.patternsNew || []).map(p => `• New: ${p}`),
      ...(dreamResult.patternsConfirmed || []).map(p => `• Confirmed: ${p}`),
    ].filter(Boolean).join("\n");

    if (dreamContent) {
      const sessionDate = new Date().toISOString().slice(0, 10);
      await db.setSemanticMemory("dream_session", sessionDate, {
        content: dreamContent,
        structured: dreamResult,
        sourceEntries: allNew.length,
        modelId: "deepseek-v4-flash",
      });
    }

    // Update last_dream_at before triggering DNA distillation (which reads trades)
    await db.kvSet("last_dream_at", Date.now());

    // Re-distill InvestorDNA with enriched data
    try {
      const freshDNA = await InvestorDNA.distill({
        trades,
        weeklyNotes,
        monthlyReviews,
        philosophy,
        rules,
        callFlash,
      });
      if (freshDNA) {
        setDNA(freshDNA);
        await db.setSemanticMemory("investor_dna", null, {
          content: freshDNA.toPromptBlock(),
          structured: freshDNA,
          sourceEntries: freshDNA.sourceEntries,
          modelId: freshDNA.modelId,
        });
      }
    } catch { /* DNA distillation failure is non-fatal */ }

    return dreamResult;
  }
}

export const dreamJob = new DreamJob();
