// Catches missing imports in src/ JS files before the app boots.
// Scans for uses of known project symbols (utils, db, api, context, etc.)
// and verifies each is actually imported in that file.
//
// Usage:
//   node scripts/check-imports.mjs          # check all src/**/*.js
//   node scripts/check-imports.mjs src/screens/Research.js
//
// Exit code 0 = clean, 1 = missing imports found.

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname, resolve } from "path";
import { fileURLToPath } from "url";

// ── Symbol → source-module map ────────────────────────────────────────────────
// { symbol: { src: canonicalSourceFile (relative to src/), kind: "fn"|"obj" } }
//   kind "fn"  → detected by call pattern: sym(
//   kind "obj" → detected by member access pattern: sym.
// Extend this whenever you export something new from a shared module.
const SYMBOL_MAP = {
  // src/utils.js — React hooks
  useTransientMessage: { src: "utils.js", kind: "fn" },
  // src/utils.js  — all functions
  todayIso:    { src: "utils.js",   kind: "fn" },
  addMonths:   { src: "utils.js",   kind: "fn" },
  fmtDate:     { src: "utils.js",   kind: "fn" },
  monthKey:    { src: "utils.js",   kind: "fn" },
  weekKey:     { src: "utils.js",   kind: "fn" },
  weekRange:   { src: "utils.js",   kind: "fn" },
  fmtCurrency: { src: "utils.js",   kind: "fn" },
  ago:         { src: "utils.js",   kind: "fn" },

  // src/db.js  — all functions
  newId:         { src: "db.js", kind: "fn" },
  openDb:        { src: "db.js", kind: "fn" },
  runMigrations: { src: "db.js", kind: "fn" },

  // src/api.js  — all functions
  preWarmYFCrumb:       { src: "api.js", kind: "fn" },
  fetchYahooSnapshot:   { src: "api.js", kind: "fn" },
  generateResearchMemo: { src: "api.js", kind: "fn" },
  callLLMStream:        { src: "api.js", kind: "fn" },
  fetchPEGRatios:       { src: "api.js", kind: "fn" },
  runSynthesis:         { src: "api.js", kind: "fn" },

  // src/context.js
  useApp: { src: "context.js", kind: "fn" },  // hook call
  AppCtx: { src: "context.js", kind: "obj" }, // React.createContext value

  // src/theme.js  — plain objects
  colors:  { src: "theme.js", kind: "obj" },
  fonts:   { src: "theme.js", kind: "obj" },
  spacing: { src: "theme.js", kind: "obj" },

  // src/research/pipeline.js  — all functions
  startResearchGeneration: { src: "research/pipeline.js", kind: "fn" },
  buildPlaceholder:        { src: "research/pipeline.js", kind: "fn" },
  resumeOrphanedMemos:     { src: "research/pipeline.js", kind: "fn" },

  // src/marketSignals.js
  fetchMarketSignals:           { src: "marketSignals.js", kind: "fn" },
  buildSignalsBlock:            { src: "marketSignals.js", kind: "fn" },
  computeTriggerBacktest:       { src: "marketSignals.js", kind: "fn" },
  getFinnhubKey:                { src: "marketSignals.js", kind: "fn" },
  setFinnhubKey:                { src: "marketSignals.js", kind: "fn" },
  clearFinnhubKey:              { src: "marketSignals.js", kind: "fn" },

  // src/signalMonitor.js
  checkAllSignals:              { src: "signalMonitor.js", kind: "fn" },
  registerSignalMonitorTask:    { src: "signalMonitor.js", kind: "fn" },
  generateSignalDebrief:        { src: "signalMonitor.js", kind: "fn" },
  computePendingForwardReturns: { src: "signalMonitor.js", kind: "fn" },

  // src/db.js — signal/monitoring additions
  getCachedMarketSignals:       { src: "db.js", kind: "fn" },
  saveMarketSignalsCache:       { src: "db.js", kind: "fn" },
  getRecentSignalEvent:         { src: "db.js", kind: "fn" },
  saveSignalEvent:              { src: "db.js", kind: "fn" },
  getUnacknowledgedSignals:     { src: "db.js", kind: "fn" },
  acknowledgeSignal:            { src: "db.js", kind: "fn" },
  confirmTrigger:               { src: "db.js", kind: "fn" },
  updateResearchMemoTriggers:   { src: "db.js", kind: "fn" },
  updateTriggerBacktest:        { src: "db.js", kind: "fn" },
  saveSignalOutcome:            { src: "db.js", kind: "fn" },
  updateSignalOutcome:          { src: "db.js", kind: "fn" },
  getSignalOutcome:             { src: "db.js", kind: "fn" },
  getSignalOutcomesForMemo:     { src: "db.js", kind: "fn" },
  getAllSignalOutcomes:          { src: "db.js", kind: "fn" },
  getPendingForwardReturns:     { src: "db.js", kind: "fn" },
  getAnalyticsStats:            { src: "db.js", kind: "fn" },
  getSignalEventsForMemo:       { src: "db.js", kind: "fn" },
  getMonitoredMemos:            { src: "db.js", kind: "fn" },
};

// The import alias each consumer file uses (for error messages).
const IMPORT_ALIAS = {
  "utils.js":              "../utils",
  "db.js":                 "../db",
  "api.js":                "../api",
  "context.js":            "../context",
  "theme.js":              "../theme",
  "research/pipeline.js":  "../research/pipeline",
  "marketSignals.js":      "../marketSignals",
  "signalMonitor.js":      "../signalMonitor",
};

// Detect actual usage of a symbol (not inside import/require lines).
//   kind "fn"  → looks for `sym(` (function call)
//   kind "obj" → looks for `sym.` (member access)
// This avoids false positives from parameter names and string literals.
function usesSymbol(lines, sym, kind) {
  const importRe = /^\s*(import|require)\b/;
  const pattern = kind === "fn"
    ? new RegExp(`\\b${sym}\\s*\\(`)   // sym(  — function call
    : new RegExp(`\\b${sym}\\.`);       // sym.  — member access
  return lines.some(l => !importRe.test(l) && pattern.test(l));
}

// Regex to check if symbol is actually imported
function hasImport(source, sym) {
  // Covers:  import { sym }  |  import { sym as X }  |  import sym
  return new RegExp(`import[^'"]+\\b${sym}\\b`).test(source);
}

// ── File collection ────────────────────────────────────────────────────────────
function collectFiles(root) {
  const out = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const st = statSync(full);
    if (st.isDirectory() && !["node_modules", ".git"].includes(entry)) {
      out.push(...collectFiles(full));
    } else if (entry.endsWith(".js") || entry.endsWith(".mjs")) {
      out.push(full);
    }
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "../src");

let files;
if (args.length > 0) {
  files = args;
} else {
  files = collectFiles(root);
}

let totalIssues = 0;

for (const file of files) {
  let source;
  try { source = readFileSync(file, "utf8"); } catch { continue; }

  // Canonical path relative to src/ — used to skip the definition file itself
  const relToSrc = relative(root, file).replace(/\\/g, "/");

  const lines = source.split("\n");
  const issues = [];

  for (const [sym, { src: srcFile, kind }] of Object.entries(SYMBOL_MAP)) {
    // Don't flag the file that *defines* the symbol
    if (relToSrc === srcFile) continue;

    if (usesSymbol(lines, sym, kind) && !hasImport(source, sym)) {
      const mod = IMPORT_ALIAS[srcFile] ?? srcFile;
      issues.push(`  missing import: { ${sym} } from "${mod}"`);
    }
  }

  if (issues.length > 0) {
    console.log(`\n${relative(root + "/..", file)}`);
    for (const i of issues) console.log(i);
    totalIssues += issues.length;
  }
}

if (totalIssues === 0) {
  console.log("✓ No missing imports detected.");
  process.exit(0);
} else {
  console.log(`\n✗ ${totalIssues} missing import(s) found.`);
  process.exit(1);
}
