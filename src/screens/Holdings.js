// Holdings screen â€” positions, live prices from Yahoo, currency-grouped totals
import React, { useState, useMemo } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Plus, RefreshCw, Loader2, Wallet, Trash2, ChevronLeft,
} from "lucide-react-native";

import { colors, fonts } from "../theme";
import { useApp } from "../context";
import { fmtCurrency, ago } from "../utils";
import { fetchLivePrices } from "../api";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  PaperInput, FilledButton, OutlineButton, Masthead, FormHeader, Field,
} from "../components";

export default function HoldingsScreen() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const doRefresh = async () => {
    if (refreshing || app.holdings.length === 0) return;
    setRefreshing(true); setRefreshError("");
    try {
      const symbols = [...new Set(app.holdings.map((h) => h.symbol))];
      const map = await fetchLivePrices(symbols);
      await app.savePricesData(map);
    } catch {
      setRefreshError("åˆ·æ–°å¤±è´¥ï¼Œè¯·æ£€æŸ¥ç½‘ç»œ");
    } finally {
      setRefreshing(false);
    }
  };

  // Group totals by currency
  const totals = useMemo(() => {
    const byCcy = {};
    app.holdings.forEach((h) => {
      const p = app.prices?.data?.[h.symbol];
      const ccy = h.currency || p?.currency || "?";
      if (!byCcy[ccy]) byCcy[ccy] = { cost: 0, market: 0, hasLive: true };
      byCcy[ccy].cost += h.shares * h.costBasis;
      if (p) byCcy[ccy].market += h.shares * p.price;
      else { byCcy[ccy].market += h.shares * h.costBasis; byCcy[ccy].hasLive = false; }
    });
    return byCcy;
  }, [app.holdings, app.prices]);

  const freshness = ago(app.prices?.lastUpdated);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead
        kicker="HOLDINGS"
        title="å½“å‰æŒä»“"
        subtitle="What I own, at what cost, at what price."
        right={<Kicker style={{ fontSize: 9, letterSpacing: 3 }}>{app.holdings.length} POSITIONS</Kicker>}
      />

      {/* Refresh bar */}
      {app.holdings.length > 0 && (
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            padding: 12, backgroundColor: colors.bgCard,
            borderWidth: 1, borderColor: colors.dividerSoft,
          }}>
            <View style={{ flex: 1 }}>
              <Kicker>MARKET DATA</Kicker>
              <TSerif style={{ fontSize: 14, marginTop: 2 }}>
                {freshness ? <>æ›´æ–°äºŽ <TMono style={{ fontSize: 12 }}>{freshness}</TMono></> :
                  <TSerifItalic style={{ fontSize: 13 }}>å°šæœªèŽ·å–å®žæ—¶ä»·æ ¼</TSerifItalic>}
              </TSerif>
            </View>
            <Pressable onPress={doRefresh} disabled={refreshing}
              style={{
                flexDirection: "row", alignItems: "center", gap: 6,
                paddingHorizontal: 12, paddingVertical: 8,
                backgroundColor: colors.ink,
                opacity: refreshing ? 0.6 : 1,
              }}>
              {refreshing ? <Loader2 size={12} color={colors.bg} /> : <RefreshCw size={12} color={colors.bg} />}
              <TSerifBold style={{ color: colors.bg, fontSize: 12 }}>
                {refreshing ? "èŽ·å–ä¸­" : "åˆ·æ–°"}
              </TSerifBold>
            </Pressable>
          </View>
          {refreshError ? <TMono style={{ color: colors.bad, fontSize: 11, marginTop: 6 }}>{refreshError}</TMono> : null}
          {refreshing && <TSerifItalic style={{ fontSize: 10, marginTop: 6 }}>æ­£åœ¨æŠ“å–å…¨çƒå¸‚åœºè¡Œæƒ…â€¦</TSerifItalic>}
        </View>
      )}

      {/* Totals by currency */}
      {Object.keys(totals).length > 0 && (
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Kicker style={{ marginBottom: 8 }}>TOTALS Â· æ±‡æ€»</Kicker>
          {Object.entries(totals).map(([ccy, t]) => {
            const pnl = t.market - t.cost;
            const pnlPct = t.cost > 0 ? (pnl / t.cost) * 100 : 0;
            const pos = pnl >= 0;
            return (
              <View key={ccy} style={{
                flexDirection: "row", padding: 12, marginBottom: 8,
                borderWidth: 1, borderColor: colors.divider,
                backgroundColor: colors.bgElev,
              }}>
                <View style={{ flex: 1 }}>
                  <TMono style={{ fontSize: 10 }}>{ccy} Â· æˆæœ¬</TMono>
                  <TSerifBold style={{ fontSize: 17, marginTop: 2 }}>{fmtCurrency(t.cost, ccy)}</TSerifBold>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <TMono style={{ fontSize: 10 }}>å¸‚å€¼</TMono>
                  <TSerifBold style={{ fontSize: 17, marginTop: 2 }}>{fmtCurrency(t.market, ccy)}</TSerifBold>
                </View>
                {t.hasLive && (
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <TMono style={{ fontSize: 10 }}>æµ®ç›ˆäº</TMono>
                    <TSerifBold style={{ fontSize: 17, marginTop: 2, color: pos ? colors.good : colors.bad }}>
                      {pos ? "+" : ""}{pnlPct.toFixed(1)}%
                    </TSerifBold>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Add button */}
      {!adding && (
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <FilledButton onPress={() => setAdding(true)}>
            <Plus size={14} color={colors.bg} />
            <TSerifBold style={{ color: colors.bg, fontSize: 15 }}>æ–°å¢žæŒä»“</TSerifBold>
          </FilledButton>
        </View>
      )}

      {adding && (
        <HoldingForm
          onSave={async (h) => { await app.addHolding(h); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* List */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        {app.holdings.length === 0 && !adding && (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Wallet size={28} strokeWidth={1} color={colors.inkFaint} />
            <TSerifItalic style={{ fontSize: 13, marginTop: 12 }}>è¿˜æ²¡æœ‰è®°å½•ä»»ä½•æŒä»“</TSerifItalic>
            <TSerifItalic style={{ fontSize: 11, marginTop: 4 }}>æ·»åŠ åŽå¯¼å¸ˆå°±èƒ½çœ‹åˆ°ä½ å½“å‰çš„ä»“ä½</TSerifItalic>
          </View>
        )}
        {app.holdings.map((h) => (
          editingId === h.id ? (
            <HoldingForm
              key={h.id}
              initial={h}
              onSave={async (upd) => { await app.updateHoldingById(h.id, upd); setEditingId(null); }}
              onDelete={async () => { await app.deleteHoldingById(h.id); setEditingId(null); }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <HoldingRow key={h.id} holding={h} price={app.prices?.data?.[h.symbol]}
              onEdit={() => setEditingId(h.id)} />
          )
        ))}
      </View>
    </ScrollView>
  );
}

function HoldingRow({ holding, price, onEdit }) {
  const cost = holding.shares * holding.costBasis;
  const hasLive = !!price;
  const market = hasLive ? holding.shares * price.price : cost;
  const pnl = market - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const pos = pnl >= 0;
  const ccy = holding.currency || price?.currency || "";

  return (
    <Pressable onPress={onEdit}
      style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.dividerSoft }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <TSerifBold style={{ fontSize: 17 }}>{holding.symbol}</TSerifBold>
            {holding.displayName && holding.displayName !== holding.symbol && (
              <TSerif style={{ fontSize: 12, color: colors.inkMuted }}>{holding.displayName}</TSerif>
            )}
          </View>
          <TMono style={{ fontSize: 11, marginTop: 2, color: colors.inkMuted }}>
            {holding.shares} è‚¡ Â· æˆæœ¬ {fmtCurrency(holding.costBasis, ccy)}
          </TMono>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {hasLive ? (
            <>
              <TSerifBold style={{ fontSize: 17 }}>{fmtCurrency(price.price, price.currency)}</TSerifBold>
              <TMono style={{ fontSize: 10, marginTop: 2, color: price.changePercent >= 0 ? colors.good : colors.bad }}>
                ä»Šæ—¥ {price.changePercent >= 0 ? "+" : ""}{price.changePercent?.toFixed?.(2) ?? "?"}%
              </TMono>
            </>
          ) : (
            <TSerifItalic style={{ fontSize: 11 }}>æš‚æ— å®žæ—¶ä»·</TSerifItalic>
          )}
        </View>
      </View>

      {hasLive && (
        <View style={{
          marginTop: 8, paddingTop: 8,
          borderTopWidth: 1, borderStyle: "dashed", borderTopColor: colors.dividerSoft,
          flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <TMono style={{ fontSize: 9, letterSpacing: 1 }}>å¸‚å€¼</TMono>
            <TSerif style={{ fontSize: 13, fontFamily: fonts.serifBold }}>{fmtCurrency(market, ccy)}</TSerif>
          </View>
          <TSerifBold style={{ fontSize: 13, color: pos ? colors.good : colors.bad }}>
            {pos ? "+" : ""}{fmtCurrency(pnl, ccy)} ({pos ? "+" : ""}{pnlPct.toFixed(1)}%)
          </TSerifBold>
        </View>
      )}
      {price?.asOf && (
        <TMono style={{ fontSize: 9, marginTop: 4, color: colors.inkFaint }}>
          {price.asOf}{price.resolvedTicker && price.resolvedTicker !== holding.symbol ? ` Â· ${price.resolvedTicker}` : ""}
        </TMono>
      )}
    </Pressable>
  );
}

function HoldingForm({ initial, onSave, onCancel, onDelete }) {
  const [symbol, setSymbol] = useState(initial?.symbol || "");
  const [displayName, setDisplayName] = useState(initial?.displayName || "");
  const [shares, setShares] = useState(initial?.shares?.toString() || "");
  const [costBasis, setCostBasis] = useState(initial?.costBasis?.toString() || "");
  const [currency, setCurrency] = useState(initial?.currency || "USD");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [confirm, setConfirm] = useState(false);

  const canSave = symbol.trim() && parseFloat(shares) > 0 && parseFloat(costBasis) >= 0;

  const handleSave = () => {
    onSave({
      symbol: symbol.trim().toUpperCase(),
      displayName: displayName.trim() || symbol.trim().toUpperCase(),
      shares: parseFloat(shares),
      costBasis: parseFloat(costBasis),
      currency,
      notes: notes.trim(),
    });
  };

  return (
    <View style={{ padding: 20 }}>
      <FormHeader title={initial ? "EDIT POSITION" : "NEW POSITION"} onCancel={onCancel} />

      <Field label="SYMBOL Â· ä»£ç " hint="ç¾Žè‚¡ç”¨ä»£ç ï¼ˆAAPLï¼‰Â· æ¸¯è‚¡ xxxx.HK Â· A è‚¡ xxxxxx.SS/.SZ Â· åŠ å¯† BTC-USD">
        <PaperInput value={symbol} onChangeText={setSymbol} placeholder="AAPL / 0700.HK / BTC-USDâ€¦"
          autoFocus={!initial} style={{ fontSize: 17 }} />
      </Field>

      <Field label="DISPLAY NAME Â· æ˜¾ç¤ºåï¼ˆå¯é€‰ï¼‰">
        <PaperInput value={displayName} onChangeText={setDisplayName} placeholder="Apple / è…¾è®¯ / æ¯”ç‰¹å¸â€¦" />
      </Field>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="SHARES Â· æ•°é‡">
            <PaperInput value={shares} onChangeText={setShares} placeholder="200"
              keyboardType="decimal-pad" style={{ fontFamily: fonts.mono, fontSize: 15 }} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="COST Â· æˆæœ¬å•ä»·">
            <PaperInput value={costBasis} onChangeText={setCostBasis} placeholder="175.50"
              keyboardType="decimal-pad" style={{ fontFamily: fonts.mono, fontSize: 15 }} />
          </Field>
        </View>
      </View>

      <Field label="CURRENCY Â· å¸ç§">
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {["USD", "CNY", "HKD", "EUR", "JPY"].map((c) => (
            <Pressable key={c} onPress={() => setCurrency(c)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6,
                borderWidth: 1, borderColor: currency === c ? colors.ink : colors.divider,
                backgroundColor: currency === c ? colors.ink : "transparent",
              }}>
              <TMono style={{ fontSize: 12, color: currency === c ? colors.bg : colors.inkSoft }}>{c}</TMono>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="NOTES Â· å¤‡æ³¨ï¼ˆå¯é€‰ï¼‰">
        <PaperInput multiline value={notes} onChangeText={setNotes}
          placeholder="å»ºä»“æ—¶çš„ç®€çŸ­æ€è€ƒï¼Œæˆ–è€…æ­¢æŸ/æ­¢ç›ˆä½â€¦"
          style={{ minHeight: 60, fontSize: 14 }} />
      </Field>

      <FilledButton onPress={handleSave} disabled={!canSave} style={{ marginTop: 16 }}>
        {initial ? "ä¿å­˜ä¿®æ”¹" : "åŠ å…¥æŒä»“"}
      </FilledButton>

      {initial && onDelete && (
        <View style={{ marginTop: 16 }}>
          {confirm ? (
            <View style={{ flexDirection: "row", gap: 16, justifyContent: "center" }}>
              <Pressable onPress={onDelete}>
                <TMono style={{ color: colors.bad, fontSize: 11, fontWeight: "600" }}>ç¡®è®¤åˆ é™¤æ­¤æŒä»“</TMono>
              </Pressable>
              <Pressable onPress={() => setConfirm(false)}>
                <TMono style={{ fontSize: 11 }}>å–æ¶ˆ</TMono>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirm(true)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 }}>
              <Trash2 size={11} color={colors.inkFaint} />
              <TMono style={{ fontSize: 11 }}>åˆ é™¤æ­¤æŒä»“</TMono>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
