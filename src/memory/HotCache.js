// HotCache — in-memory Tier 1 store for hot-path reads.
// Replaces MMKV (which requires New Architecture, disabled for iOS 26 stability).
// Populated at bootstrap, updated on every save handler and after distillation.
// Provides sync reads: after initHotCache() completes, all getters are ~0ms.

const _cache = {
  philosophy: "",
  rules: [],
  defaultMaster: "default",
  investorDNA: null, // InvestorDNA structured data or null
};

export function initHotCache(data) {
  Object.assign(_cache, data);
}

export function updateHotCache(key, value) {
  _cache[key] = value;
}

export function getHotCache() {
  return _cache;
}

// DNA-specific helpers with TTL check (7 days)
export function getDNA() {
  const dna = _cache.investorDNA;
  if (!dna) return null;
  if (Date.now() - (dna.generatedAt || 0) > 7 * 86400000) return null;
  return dna;
}

export function setDNA(dna) {
  _cache.investorDNA = { ...dna, generatedAt: dna.generatedAt || Date.now() };
}

export function clearDNA() {
  _cache.investorDNA = null;
}
