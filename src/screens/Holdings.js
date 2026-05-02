// Holdings screen — positions, live prices from Yahoo, currency-grouped totals
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { View, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import {
  Plus, RefreshCw, Loader2, Wallet, Trash2, ChevronLeft, Calendar, MessageCircle,
} from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import { colors, fonts } from "../theme";
import { useApp } from "../context";
import { fmtCurrency, ago } from "../utils";
import { fetchLivePrices } from "../api";
import * as db from "../db";
import {
  TSerif, TSerifBold, TSerifItalic, TMono, Kicker,
  PaperInput, StockSearchInput, FilledButton, OutlineButton, Masthead, FormHeader, Field,
} from "../components";

export default function HoldingsScreen() {
  const app = useApp();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const askMentor = async (h, price) => {
    const ccy = h.currency || price?.currency || "";
    const lines = [`我想聊聊持仓中的 ${h.displayName || h.symbol}（${h.symbol}）：`];
    lines.push(`• 持有 ${h.shares} 股，成本 ${fmtCurrency(h.costBasis, ccy)}`);
    if (price) lines.push(`• 当前价 ${fmtCurrency(price.price, price.currency)}，今日 ${price.changePercent >= 0 ? "+" : ""}${price.changePercent?.toFixed(2) ?? "?"}%`);
    if (h.buyDate) lines.push(`• 买入时间：${h.buyDate}`);
    if (h.buyReason) lines.push(`• 买入理由：${h.buyReason}`);
    lines.push("请帮我分析一下这个持仓的现状，值得继续持有吗？");
    const masterId = app.defaultMaster || "default";
    await db.appendChat("user", lines.join("\n"), masterId);
    nav.navigate("mentor", { autoMaster: masterId, autoReplyTs: Date.now() });
  };
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
      setRefreshError("刷新失败，请检查网络");
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
    >
      <Masthead
        kicker="HOLDINGS"
        title="当前持仓"
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
                {freshness ? <>更新于 <TMono style={{ fontSize: 12 }}>{freshness}</TMono></> :
                  <TSerifItalic style={{ fontSize: 13 }}>尚未获取实时价格</TSerifItalic>}
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
                {refreshing ? "获取中" : "刷新"}
              </TSerifBold>
            </Pressable>
          </View>
          {refreshError ? <TMono style={{ color: colors.bad, fontSize: 11, marginTop: 6 }}>{refreshError}</TMono> : null}
          {refreshing && <TSerifItalic style={{ fontSize: 10, marginTop: 6 }}>正在抓取全球市场行情…</TSerifItalic>}
        </View>
      )}

      {/* Totals by currency */}
      {Object.keys(totals).length > 0 && (
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Kicker style={{ marginBottom: 8 }}>TOTALS · 汇总</Kicker>
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
                  <TMono style={{ fontSize: 10 }}>{ccy} · 成本</TMono>
                  <TSerifBold style={{ fontSize: 17, marginTop: 2 }}>{fmtCurrency(t.cost, ccy)}</TSerifBold>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <TMono style={{ fontSize: 10 }}>市值</TMono>
                  <TSerifBold style={{ fontSize: 17, marginTop: 2 }}>{fmtCurrency(t.market, ccy)}</TSerifBold>
                </View>
                {t.hasLive && (
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <TMono style={{ fontSize: 10 }}>浮盈亏</TMono>
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
            <TSerifBold style={{ color: colors.bg, fontSize: 15 }}>新增持仓</TSerifBold>
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
            <TSerifItalic style={{ fontSize: 13, marginTop: 12 }}>还没有记录任何持仓</TSerifItalic>
            <TSerifItalic style={{ fontSize: 11, marginTop: 4 }}>添加后导师就能看到你当前的仓位</TSerifItalic>
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
              onEdit={() => setEditingId(h.id)}
              onAskMentor={() => askMentor(h, app.prices?.data?.[h.symbol])} />
          )
        ))}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtBuyDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${y}.${m}.${d}`;
}

function HoldingRow({ holding, price, onEdit, onAskMentor }) {
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
            {holding.shares} 股 · 成本 {fmtCurrency(holding.costBasis, ccy)}
          </TMono>
          {holding.buyDate && (
            <TMono style={{ fontSize: 10, marginTop: 1, color: colors.inkFaint }}>
              买入 {fmtBuyDate(holding.buyDate)}
            </TMono>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {hasLive ? (
            <>
              <TSerifBold style={{ fontSize: 17 }}>{fmtCurrency(price.price, price.currency)}</TSerifBold>
              <TMono style={{ fontSize: 10, marginTop: 2, color: price.changePercent >= 0 ? colors.good : colors.bad }}>
                今日 {price.changePercent >= 0 ? "+" : ""}{price.changePercent?.toFixed?.(2) ?? "?"}%
              </TMono>
            </>
          ) : (
            <TSerifItalic style={{ fontSize: 11 }}>暂无实时价</TSerifItalic>
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
            <TMono style={{ fontSize: 9, letterSpacing: 1 }}>市值</TMono>
            <TSerif style={{ fontSize: 13, fontFamily: fonts.serifBold }}>{fmtCurrency(market, ccy)}</TSerif>
          </View>
          <TSerifBold style={{ fontSize: 13, color: pos ? colors.good : colors.bad }}>
            {pos ? "+" : ""}{fmtCurrency(pnl, ccy)} ({pos ? "+" : ""}{pnlPct.toFixed(1)}%)
          </TSerifBold>
        </View>
      )}
      {price?.asOf && (
        <TMono style={{ fontSize: 9, marginTop: 4, color: colors.inkFaint }}>
          {price.asOf}{price.resolvedTicker && price.resolvedTicker !== holding.symbol ? ` · ${price.resolvedTicker}` : ""}
        </TMono>
      )}
      <Pressable onPress={() => onAskMentor?.()}
        style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" }}>
        <MessageCircle size={11} color={colors.accent} strokeWidth={1.5} />
        <TMono style={{ fontSize: 10, color: colors.accent }}>带入问道 ↗</TMono>
      </Pressable>
    </Pressable>
  );
}

function HoldingForm({ initial, onSave, onCancel, onDelete }) {
  const [symbol, setSymbol] = useState(initial?.symbol || "");
  const [displayName, setDisplayName] = useState(initial?.displayName || "");
  const [shares, setShares] = useState(initial?.shares?.toString() || "");
  const [costBasis, setCostBasis] = useState(initial?.costBasis?.toString() || "");
  const [currency, setCurrency] = useState(initial?.currency || "USD");
  const [buyReason, setBuyReason] = useState(initial?.buyReason || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [confirm, setConfirm] = useState(false);
  const [buyDate, setBuyDate] = useState(initial?.buyDate || todayISO());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Review log state (only when editing an existing holding)
  const [reviews, setReviews] = useState([]);
  const [reviewText, setReviewText] = useState("");
  const [reviewDate, setReviewDate] = useState(todayISO());
  const [showReviewDatePicker, setShowReviewDatePicker] = useState(false);
  const [addingReview, setAddingReview] = useState(false);

  const loadReviews = useCallback(async () => {
    if (!initial?.id) return;
    const list = await db.listHoldingReviews(initial.id);
    setReviews(list);
  }, [initial?.id]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const canSave = symbol.trim() && parseFloat(shares) > 0 && parseFloat(costBasis) >= 0;

  const handleSave = () => {
    onSave({
      symbol: symbol.trim().toUpperCase(),
      displayName: displayName.trim() || symbol.trim().toUpperCase(),
      shares: parseFloat(shares),
      costBasis: parseFloat(costBasis),
      currency,
      buyReason: buyReason.trim(),
      notes: notes.trim(),
      buyDate,
    });
  };

  return (
    <View style={{ padding: 20 }}>
      <FormHeader title={initial ? "EDIT POSITION" : "NEW POSITION"} onCancel={onCancel} />

      <Field label="SYMBOL · 代码" hint="输入名称或代码搜索 · 美股 AAPL · 港股 xxxx.HK · 加密 BTC-USD">
        {initial ? (
          <PaperInput value={symbol} onChangeText={setSymbol} placeholder="AAPL / 0700.HK / BTC-USD…"
            style={{ fontSize: 17 }} />
        ) : (
          <StockSearchInput
            value={symbol}
            onChangeText={(t) => setSymbol(t.toUpperCase())}
            onSelect={(sym, name) => { setSymbol(sym); setDisplayName(name); }}
            placeholder="搜索名称或代码 · AAPL / 腾讯 / BTC…"
            style={{ fontSize: 17 }}
          />
        )}
      </Field>

      <Field label="DISPLAY NAME · 显示名（可选）">
        <PaperInput value={displayName} onChangeText={setDisplayName} placeholder="Apple / 腾讯 / 比特币…" />
      </Field>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="SHARES · 数量">
            <PaperInput value={shares} onChangeText={setShares} placeholder="200"
              keyboardType="decimal-pad" style={{ fontFamily: fonts.mono, fontSize: 15 }} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="COST · 成本单价">
            <PaperInput value={costBasis} onChangeText={setCostBasis} placeholder="175.50"
              keyboardType="decimal-pad" style={{ fontFamily: fonts.mono, fontSize: 15 }} />
          </Field>
        </View>
      </View>

      <Field label="CURRENCY · 币种">
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {["USD", "CNY", "HKD", "SGD", "EUR", "JPY"].map((c) => (
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

      <Field label="BUY DATE · 买入时间">
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={{
            flexDirection: "row", alignItems: "center", gap: 10,
            paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider,
          }}
        >
          <Calendar size={14} color={colors.accent} strokeWidth={1.5} />
          <TSerif style={{ fontSize: 16, color: colors.ink }}>{fmtBuyDate(buyDate)}</TSerif>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={new Date(buyDate + "T12:00:00")}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "calendar"}
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (event.type === "set" && selectedDate) {
                const d = selectedDate;
                setBuyDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
              }
            }}
          />
        )}
      </Field>

      <Field label="REASON TO BUY · 购买原因（可选）">
        <PaperInput multiline value={buyReason} onChangeText={setBuyReason}
          placeholder="为什么买入这个标的？投资逻辑、核心论点…"
          style={{ minHeight: 60, fontSize: 14 }} />
      </Field>

      <Field label="NOTES · 备注（可选）">
        <PaperInput multiline value={notes} onChangeText={setNotes}
          placeholder="建仓时的简短思考，或者止损/止盈位…"
          style={{ minHeight: 60, fontSize: 14 }} />
      </Field>

      {initial?.id && (
        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Kicker>REVIEW LOG · 复盘记录</Kicker>
            <Pressable onPress={() => setAddingReview(!addingReview)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Plus size={11} color={colors.accent} />
              <TMono style={{ fontSize: 10, color: colors.accent }}>添加复盘</TMono>
            </Pressable>
          </View>

          {addingReview && (
            <View style={{ marginBottom: 12, padding: 12, backgroundColor: colors.bgElev, borderWidth: 1, borderColor: colors.divider }}>
              <Pressable onPress={() => setShowReviewDatePicker(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Calendar size={12} color={colors.accent} strokeWidth={1.5} />
                <TMono style={{ fontSize: 12 }}>{reviewDate}</TMono>
              </Pressable>
              {showReviewDatePicker && (
                <DateTimePicker
                  value={new Date(reviewDate + "T12:00:00")}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "calendar"}
                  onChange={(event, selectedDate) => {
                    setShowReviewDatePicker(false);
                    if (event.type === "set" && selectedDate) {
                      const d = selectedDate;
                      setReviewDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                    }
                  }}
                />
              )}
              <PaperInput multiline value={reviewText} onChangeText={setReviewText}
                placeholder="持仓复盘内容：基本面变化、论点验证、是否继续持有…"
                style={{ minHeight: 80, fontSize: 13, marginBottom: 8 }} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={async () => {
                    if (!reviewText.trim()) return;
                    await db.addHoldingReview(initial.id, reviewDate, reviewText.trim());
                    setReviewText(""); setAddingReview(false);
                    loadReviews();
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.ink }}>
                  <TMono style={{ fontSize: 10, color: colors.bg, fontWeight: "600" }}>保存</TMono>
                </Pressable>
                <Pressable onPress={() => { setReviewText(""); setAddingReview(false); }}>
                  <TMono style={{ fontSize: 10, marginTop: 7 }}>取消</TMono>
                </Pressable>
              </View>
            </View>
          )}

          {reviews.length === 0 && !addingReview ? (
            <TSerifItalic style={{ fontSize: 12, color: colors.inkFaint }}>还没有复盘记录</TSerifItalic>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.dividerSoft }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <TMono style={{ fontSize: 10, color: colors.inkMuted }}>{r.date}</TMono>
                  <Pressable onPress={async () => { await db.deleteHoldingReview(r.id); loadReviews(); }}>
                    <Trash2 size={10} color={colors.inkFaint} />
                  </Pressable>
                </View>
                <TSerif style={{ fontSize: 13, lineHeight: 20 }}>{r.content}</TSerif>
              </View>
            ))
          )}
        </View>
      )}

      <FilledButton onPress={handleSave} disabled={!canSave} style={{ marginTop: 16 }}>
        {initial ? "保存修改" : "加入持仓"}
      </FilledButton>

      {initial && onDelete && (
        <View style={{ marginTop: 16 }}>
          {confirm ? (
            <View style={{ flexDirection: "row", gap: 16, justifyContent: "center" }}>
              <Pressable onPress={onDelete}>
                <TMono style={{ color: colors.bad, fontSize: 11, fontWeight: "600" }}>确认删除此持仓</TMono>
              </Pressable>
              <Pressable onPress={() => setConfirm(false)}>
                <TMono style={{ fontSize: 11 }}>取消</TMono>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirm(true)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 }}>
              <Trash2 size={11} color={colors.inkFaint} />
              <TMono style={{ fontSize: 11 }}>删除此持仓</TMono>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
