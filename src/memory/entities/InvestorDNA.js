// InvestorDNA — pre-distilled behavioral profile, rebuilt weekly.
// Stored in HotCache (fast reads) + semantic_memory (persistent backup).
// Acts as the stable prompt prefix for all AI calls — enables DeepSeek server-side caching.

export class InvestorDNA {
  constructor(data) {
    Object.assign(this, data);
  }

  // Compact prompt block (~500-700 tokens) for inclusion in system prompts.
  // Ordering: most stable content first to maximize DeepSeek prefix cache hits.
  toPromptBlock() {
    const age = this.generatedAt
      ? Math.floor((Date.now() - this.generatedAt) / 86400000)
      : null;

    const rulesSection = (this.rules || [])
      .map((r, i) => {
        const audit = this.ruleAudit?.[i];
        const compliance = audit ? ` — compliance: ${audit}` : "";
        return `  ${i + 1}. ${r}${compliance}`;
      })
      .join("\n");

    const strengthsList = (this.keyStrengths || []).map(s => `  • ${s}`).join("\n");
    const blindSpotsList = (this.keyBlindSpots || []).map(s => `  • ${s}`).join("\n");

    return [
      `=== INVESTOR PROFILE (distilled from ${this.sourceEntries || "?"} journal entries${age !== null ? `, ${age}d ago` : ""}) ===`,
      "",
      `Philosophy: ${this.philosophy || "(not defined)"}`,
      "",
      "Rules:",
      rulesSection || "  (none defined)",
      "",
      "Behavioral Profile:",
      this.behavioralProfile || "  (insufficient data — needs more journal entries)",
      "",
      "Emotional Triggers:",
      this.emotionalTriggers || "  (insufficient data)",
      "",
      "Trading Patterns:",
      this.tradingPatterns || "  (insufficient data)",
      ...(strengthsList ? ["", "Key Strengths:", strengthsList] : []),
      ...(blindSpotsList ? ["", "Known Blind Spots:", blindSpotsList] : []),
    ]
      .join("\n")
      .trim();
  }

  isExpired() {
    if (!this.generatedAt) return true;
    return Date.now() - this.generatedAt > 7 * 86400000;
  }

  // Build and return an InvestorDNA from journal data.
  // callFlash: async (systemPrompt, userPrompt) => string  (injected to avoid circular imports)
  static async distill({ trades, weeklyNotes, monthlyReviews, philosophy, rules, callFlash }) {
    if (!trades || trades.length < 5) return null;

    const compressed = trades.slice(-50).map(t => ({
      d: t.date?.slice(0, 10),
      a: t.action,
      s: t.stock,
      e: t.emotion,
      r: t.reason?.slice(0, 90),
      rc: t.rulesChecked?.length ?? 0,
    }));

    const recentMonthly = Object.entries(monthlyReviews || {})
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .flatMap(([month, bullets]) =>
        (Array.isArray(bullets) ? bullets : []).map(b => `[${month}] ${b}`)
      )
      .join(" | ");

    const recentWeekly = Object.entries(weeklyNotes || {})
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 4)
      .map(([wk, text]) => `[${wk}] ${text?.slice(0, 100)}`)
      .join(" | ");

    const prompt = `Analyze an investor's journal to create a compact behavioral profile.

PHILOSOPHY: ${philosophy || "(not defined)"}
RULES: ${(rules || []).map((r, i) => `${i + 1}. ${r}`).join("; ")}
TRADES (last ${compressed.length}): ${JSON.stringify(compressed)}
MONTHLY REVIEWS (last 6): ${recentMonthly || "(none)"}
WEEKLY NOTES (last 4): ${recentWeekly || "(none)"}

Generate a compact profile as JSON. Be specific and evidence-based — cite actual patterns.
Reply ONLY with this JSON (no markdown, no extra text):
{
  "behavioralProfile": "2-3 sentences describing how this investor actually behaves vs. their stated rules",
  "emotionalTriggers": "When does emotion drive decisions? What emotion precedes regrettable trades?",
  "tradingPatterns": "Entry timing, hold duration, position sizing tendencies",
  "ruleAudit": ["high/medium/low compliance for each rule, in order"],
  "keyStrengths": ["evidence-based strength 1", "strength 2"],
  "keyBlindSpots": ["specific blindspot 1", "blindspot 2"]
}`;

    let raw = "";
    try {
      raw = await callFlash(prompt);
    } catch {
      return null;
    }

    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1) return null;

    try {
      const parsed = JSON.parse(clean.slice(start, end + 1));
      return new InvestorDNA({
        philosophy,
        rules,
        behavioralProfile: parsed.behavioralProfile || "",
        emotionalTriggers: parsed.emotionalTriggers || "",
        tradingPatterns: parsed.tradingPatterns || "",
        ruleAudit: Array.isArray(parsed.ruleAudit) ? parsed.ruleAudit : [],
        keyStrengths: Array.isArray(parsed.keyStrengths) ? parsed.keyStrengths : [],
        keyBlindSpots: Array.isArray(parsed.keyBlindSpots) ? parsed.keyBlindSpots : [],
        generatedAt: Date.now(),
        sourceEntries: trades.length,
        modelId: "deepseek-v4-flash",
      });
    } catch {
      return null;
    }
  }
}
