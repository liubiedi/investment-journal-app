// Shared utilities for dates, currency, formatting

export const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

export const monthKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (key) => {
  const [y, m] = key.split("-");
  return `${y}.${m}`;
};

export const weekKey = (iso) => {
  const d = new Date(iso);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - yearStart) / 86400000);
  const week = Math.ceil((days + yearStart.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
};

export const weekRange = (key) => {
  const [y, w] = key.split("-W");
  const simple = new Date(parseInt(y, 10), 0, 1 + (parseInt(w, 10) - 1) * 7);
  const dow = simple.getDay();
  const monday = new Date(simple);
  monday.setDate(simple.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.getMonth() + 1}.${monday.getDate()} – ${sunday.getMonth() + 1}.${sunday.getDate()}`;
};

export const isLastWeekOfMonth = () => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return last.getDate() - now.getDate() <= 6;
};

export const fmtCurrency = (value, ccy) => {
  const sym = { USD: "$", CNY: "¥", HKD: "HK$", EUR: "€", GBP: "£", JPY: "¥" }[ccy] || "";
  const abs = Math.abs(value);
  let str;
  if (abs >= 1e6) str = (value / 1e6).toFixed(2) + "M";
  else if (abs >= 1e4) str = (value / 1e3).toFixed(1) + "K";
  else str = value.toFixed(2);
  return sym + str;
};

export const ago = (ts) => {
  if (!ts) return null;
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  return `${Math.floor(hrs / 24)} 天前`;
};
