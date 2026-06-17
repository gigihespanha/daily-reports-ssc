import React, { useState, useEffect, useMemo, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";
import {
  Target,
  Share2,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Clock,
  LayoutDashboard,
  Calendar,
  AlertCircle,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  LogOut,
  Lock,
  BarChart2,
  Copy,
  CheckCheck,
  Wifi,
  WifiOff,
  Settings,
  Save,
} from "lucide-react";
const firebaseConfig = {
  apiKey: "AIzaSyBtElUQBgyvtGKHcOuEYle7KsHN_RCbs-8",
  authDomain: "daily-reports-ssc.firebaseapp.com",
  projectId: "daily-reports-ssc",
  storageBucket: "daily-reports-ssc.firebasestorage.app",
  messagingSenderId: "478261631847",
  appId: "1:478261631847:web:cf3e7a138f64bb99602dc2",
  measurementId: "G-G1F67PW6V7",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "simply-spotless-production";
// Google Sheets CSV URL (Booking Koala tab) - UPDATED June 2026
const SHEETS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRoUnSQcVwZCmOZAz47LrVfNopfXi9nIvlUqz1ZCU_nS0vHYAquW9jZQiL3855RlkALKrMU-u3LFYNW/pub?gid=827331040&single=true&output=csv";
// Map Location Clean values from sheet → app location keys
const LOCATION_MAP: Record<string, string> = {
  // Booking Koala CSV export exact values
  "cincinnati and northern kentucky": "cincy",
  "Charlotte,NC": "charlotte",
  "Sarasota & Bradenton, FL": "srq",
  "Fort Myers & Naples, FL": "fortmyers",
  "Asheville, NC": "asheville",
  "Kansas City, MO": "kansascity",
  "Orlando, FL": "orlando",
  "Palm Beach, FL": "palmbeach",
  "Tampa & St. Pete, FL": "tampa",
  "The Villages & Ocala, FL": "villages",
  "The Villages & Ocalla, FL": "villages", // mantém a grafia antiga também, por segurança
  // Google Sheets Location Clean values
  "Cincinnati/NKY": "cincy",
  "Cincinnati": "cincy",
  "Charlotte": "charlotte",
  "Fort Myers": "fortmyers",
  "SRQ": "srq",
  "SRQ & Bradenton": "srq",
  "Sarasota": "srq",
  "Bradenton": "srq",
  "Asheville": "asheville",
  "Kansas City": "kansascity",
  "Orlando": "orlando",
  "Palm Beach": "palmbeach",
  "Tampa": "tampa",
  "The Villages": "villages",
  "Other": "srq",
};
const LOCATION_CONFIG: any = {
  cincy: { name: "Cincinnati/NKY", color: "bg-blue-500" },
  charlotte: { name: "Charlotte", color: "bg-purple-500" },
  srq: { name: "Sarasota & Bradenton", color: "bg-emerald-500" },
  fortmyers: { name: "Fort Myers", color: "bg-teal-500" },
  asheville: { name: "Asheville", color: "bg-orange-500" },
  kansascity: { name: "Kansas City", color: "bg-red-500" },
  orlando: { name: "Orlando", color: "bg-yellow-500" },
  palmbeach: { name: "Palm Beach", color: "bg-pink-500" },
  tampa: { name: "Tampa & St. Pete", color: "bg-indigo-500" },
  villages: { name: "The Villages & Ocala", color: "bg-cyan-500" },
};
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const vals: string[] = [];
    let cur = "", inQ = false;
    for (let ci = 0; ci < line.length; ci++) {
      const c = line[ci];
      if (c === '"') inQ = !inQ;
      else if (c === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    vals.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = vals[idx] || ""));
    rows.push(row);
  }
  return rows;
}
// Booking Koala/Zapier pode gravar mais de uma linha por reserva conforme o status
// muda (ex: Unassigned -> Upcoming -> Charged). Aqui mantemos só a linha mais
// recente de cada Booking ID, para não somar a mesma reserva mais de uma vez.
function dedupeByBookingId(rows: Record<string, string>[]): Record<string, string>[] {
  const seen = new Map<string, Record<string, string>>();
  const noId: Record<string, string>[] = [];
  rows.forEach((row) => {
    const id = (row["Booking ID"] || row["Booking Id"] || row["BookingID"] || "").trim();
    if (!id) {
      noId.push(row);
      return;
    }
    seen.set(id, row); // a última ocorrência sobrescreve as anteriores
  });
  return [...Array.from(seen.values()), ...noId];
}
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [activeView, setActiveView] = useState("manager");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState<"weekly" | "monthly">("monthly");
  const [copiedReport, setCopiedReport] = useState<string | null>(null);
  const [sheetRows, setSheetRows] = useState<Record<string, string>[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [sheetLastSync, setSheetLastSync] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState(false);
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [data, setData] = useState<any>({
    monthlyGoal: 45000,
    locationTargets: { cincy: 30000, charlotte: 5000, srq: 10000, fortmyers: 2000, asheville: 5000, kansascity: 5000, orlando: 5000, palmbeach: 5000, tampa: 5000, villages: 5000 },
    customLocations: {},
    hiddenLocations: [],
  });
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
    return () => unsub();
  }, []);
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch { setLoginError("Invalid email or password."); }
  };
  useEffect(() => {
    setLoading(true);
    const path = `${viewYear}_${MONTHS[viewMonth]}`;
    const docRef = doc(db, "artifacts", appId, "public", "data", "sales_ledger", path);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setData((prev: any) => ({ ...prev, ...snap.data() }));
      } else {
        const defaults = {
          monthlyGoal: 45000,
          locationTargets: { cincy: 30000, charlotte: 5000, srq: 10000, fortmyers: 2000, asheville: 5000, kansascity: 5000, orlando: 5000, palmbeach: 5000, tampa: 5000, villages: 5000 },
          customLocations: {},
          hiddenLocations: [],
        };
        setData(defaults);
        setDoc(docRef, defaults);
      }
      setLoading(false);
    }, () => { setToast("Firestore connection error."); setLoading(false); });
    return () => unsub();
  }, [viewMonth, viewYear]);
  const syncSheets = useCallback(async () => {
    setSheetSyncing(true);
    setSheetError(false);
    try {
      const res = await fetch(SHEETS_CSV_URL + "&t=" + Date.now());
      const text = await res.text();
      const rows = parseCSV(text);
      setSheetRows(rows);
      setSheetLastSync(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit", minute: "2-digit", timeZone: "America/New_York",
        })
      );
      setSheetError(false);
    } catch {
      setSheetError(true);
    } finally {
      setSheetSyncing(false);
    }
  }, []);
  useEffect(() => {
    syncSheets();
    const interval = setInterval(syncSheets, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [syncSheets]);
  const allLocations = useMemo(() => {
    const combined = { ...LOCATION_CONFIG };
    const customKeys = Object.keys(data.customLocations || {});
    for (let _i0 = 0; _i0 < customKeys.length; _i0++) { const k = customKeys[_i0]; combined[k] = data.customLocations[k]; }
    const _hl = data.hiddenLocations || []; for (let _i1 = 0; _i1 < _hl.length; _i1++) { const h = _hl[_i1]; delete combined[h]; }
    return combined;
  }, [data.customLocations, data.hiddenLocations]);
  const monthLabel = `${MONTH_SHORT[viewMonth]} ${viewYear}`;
  const metrics = useMemo(() => {
    const rawSourceRows = csvRows.length > 0 ? csvRows : sheetRows;
    const sourceRows = dedupeByBookingId(rawSourceRows);
    const monthRows = sourceRows.filter((r) => {
      const dateStr = (r["Date"] || "").trim();
      const st = (r["Booking status"] || r["Booking Status"] || "").trim().toLowerCase();
      const validStatus = st === "charged" || st === "completed" || st === "upcoming" || st === "unassigned";
      if (!dateStr || !validStatus) return false;
      let d: Date;
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      } else if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      } else {
        d = new Date(dateStr);
      }
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    });
    const totals: Record<string, number> = {};
    const locKeys = Object.keys(allLocations);
    locKeys.forEach((k) => { totals[k] = 0; });
    monthRows.forEach((row) => {
      const locRaw = (row["Location Clean"] || row["City"] || row["Location"] || "").trim();
      const locKey = LOCATION_MAP[locRaw];
      if (locKey && totals[locKey] !== undefined) {
        const amt = parseFloat((row["Final amount"] || row["Final Amount"] || "0").replace(/[$,]/g, "")) || 0;
        totals[locKey] += amt;
      }
    });
    const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();
    const isFutureMonth = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth > now.getMonth());
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    let currentDayOfMonth = 0;
    let daysRemaining = 0;
    if (isCurrentMonth) { currentDayOfMonth = now.getDate(); daysRemaining = Math.max(0, daysInMonth - now.getDate()); }
    else if (isFutureMonth) { currentDayOfMonth = 0; daysRemaining = daysInMonth; }
    else { currentDayOfMonth = daysInMonth; daysRemaining = 0; }
    const expectedProgressPct = (currentDayOfMonth / daysInMonth) * 100;
    const calcMetrics = (goal: number, booked: number) => {
      const remainingGoal = Math.max(0, goal - booked);
      const dailyTarget = daysRemaining > 0 ? remainingGoal / daysRemaining : 0;
      const expectedBooking = (goal / daysInMonth) * currentDayOfMonth;
      const actualProgressPct = goal > 0 ? (booked / goal) * 100 : 0;
      const performanceStatus = booked >= expectedBooking ? "🟢 ON TRACK" : "🔴 BEHIND";
      return { remainingGoal, dailyTarget, expectedBooking, actualProgressPct, performanceStatus };
    };
    const totalGoal = Number(data.monthlyGoal || 45000);
    const totalBooked = Object.values(totals).reduce((s, v) => s + v, 0);
    const totalM = calcMetrics(totalGoal, totalBooked);
    const cityMetrics: any = {};
    locKeys.forEach((key) => {
      const cityGoal = Number(data.locationTargets?.[key] || 0);
      cityMetrics[key] = { goal: cityGoal, booked: totals[key] || 0, ...calcMetrics(cityGoal, totals[key] || 0) };
    });
    return { totals, totalGoal, totalBooked, ...totalM, expectedProgressPct, daysInMonth, currentDayOfMonth, daysRemaining, cityMetrics };
  }, [sheetRows, csvRows, allLocations, data, viewMonth, viewYear]);
  const weeklyMetrics = useMemo(() => {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setDate(today.getDate() - today.getDay());
    startOfThisWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
    const endOfLastWeek = new Date(startOfThisWeek);
    endOfLastWeek.setMilliseconds(-1);
    const locKeys = Object.keys(allLocations);
    const thisWeek: any = {}, lastWeek: any = {};
    locKeys.forEach((k) => { thisWeek[k] = 0; lastWeek[k] = 0; });
    const _srcRaw = csvRows.length > 0 ? csvRows : sheetRows;
    const _src = dedupeByBookingId(_srcRaw);
    _src.forEach((row) => {
      const st = (row["Booking status"] || "").trim().toLowerCase();
      const validSt = st === "charged" || st === "completed" || st === "upcoming" || st === "unassigned";
      if (!validSt) return;
      const dateStr = row["Date"] || "";
      if (!dateStr) return;
      let logDate: Date;
      if (dateStr.includes('/')) {
        const p = dateStr.split('/');
        logDate = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
      } else if (dateStr.includes('-')) {
        const p = dateStr.split('-');
        logDate = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
      } else {
        logDate = new Date(dateStr);
      }
      const amt = parseFloat((row["Final amount"] || "0").replace(/[$,]/g, "")) || 0;
      const total = amt;
      const locRaw = (row["Location Clean"] || row["City"] || row["Location"] || "").trim();
      const locKey = LOCATION_MAP[locRaw];
      if (!locKey) return;
      if (logDate >= startOfThisWeek) { if (thisWeek[locKey] !== undefined) thisWeek[locKey] += total; }
      else if (logDate >= startOfLastWeek && logDate <= endOfLastWeek) { if (lastWeek[locKey] !== undefined) lastWeek[locKey] += total; }
    });
    let thisWeekTotal = 0, lastWeekTotal = 0;
    locKeys.forEach((k) => { thisWeekTotal += thisWeek[k]; lastWeekTotal += lastWeek[k]; });
    const weekLabel = (offset: number) => {
      const start = new Date(startOfThisWeek);
      start.setDate(start.getDate() + offset);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    };
    return { thisWeek, lastWeek, thisWeekTotal, lastWeekTotal, thisWeekLabel: weekLabel(0), lastWeekLabel: weekLabel(-7) };
  }, [sheetRows, csvRows, allLocations]);
  const handleRefresh = async () => {
    setSheetSyncing(true);
    await syncSheets();
    setToast("Data synced from Booking Koala ✓");
    setTimeout(() => setToast(null), 2500);
  };
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      const normalized = rows.map((r) => {
        const amtRaw = r["Final amount (USD)"] || r["Final amount"] || "0";
        const tipRaw = r["Tip (USD)"] || r["Tip"] || "0";
        const amt = parseFloat(String(amtRaw).replace(/[$,]/g, "")) || 0;
        const tip = parseFloat(String(tipRaw).replace(/[$,]/g, "")) || 0;
        return {
          "Date": r["Date"] || "",
          "Full name": r["Full name"] || "",
          "Location Clean": r["Location"] || r["Location Clean"] || "",
          "Location": r["Location"] || r["Location Clean"] || "",
          "Final amount": String(amt),
          "Tip": String(tip),
          "Booking status": r["Booking status"] || "",
          "Service": r["Service"] || r["Frequency"] || "",
          "Booking ID": r["Booking ID"] || r["Booking Id"] || r["BookingID"] || "",
        };
      });
      const valid = normalized.filter((r) => r["Booking status"].toLowerCase() !== "declined");
      setCsvRows(valid);
      setToast(`Loaded ${valid.length} bookings from CSV ✓`);
      setTimeout(() => setToast(null), 3000);
    };
    reader.readAsText(file);
  };
  const updateField = async (category: string, field: string, val: string) => {
    const num = parseInt(val.replace(/[^0-9]/g, "")) || 0;
    let newData: any;
    if (category === "goal") newData = { ...data, monthlyGoal: num };
    else newData = { ...data, locationTargets: { ...data.locationTargets, [field]: num } };
    const path = `${viewYear}_${MONTHS[viewMonth]}`;
    await setDoc(doc(db, "artifacts", appId, "public", "data", "sales_ledger", path), newData);
  };
  const formatMoney = (v: number) => "$" + Math.round(v || 0).toLocaleString("en-US");
  const copyMonthlyReport = () => {
    const ts = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const m = metrics;
    let text = `📊 ${MONTHS[viewMonth].toUpperCase()} PERFORMANCE UPDATE\n🕒 Exported: ${ts}\n━━━━━━━━━━━━━━━\n`;
    text += `🎯 Monthly Goal: ${formatMoney(m.totalGoal)}\n`;
    text += `📈 Actual Booked: ${formatMoney(m.totalBooked)}\n`;
    text += `💰 ACTUAL PROGRESS: ${m.actualProgressPct.toFixed(1)}%\n`;
    text += `📅 STATUS: ${m.performanceStatus}\n`;
    text += `⏳ Days Remaining: ${m.daysRemaining}\n━━━━━━━━━━━━━━━\n`;
    Object.keys(allLocations).forEach((key) => {
      const c = m.cityMetrics[key];
      text += `📍 ${allLocations[key].name}: ${formatMoney(c.booked)} / ${formatMoney(c.goal)} (${c.actualProgressPct.toFixed(0)}%) ${c.performanceStatus}\n`;
      if (c.dailyTarget > 0) text += `   → Need ${formatMoney(c.dailyTarget)}/day to hit goal\n`;
    });
    text += `━━━━━━━━━━━━━━━\n💡 Need ${formatMoney(m.dailyTarget)}/day across all locations`;
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    });
    setCopiedReport("monthly"); setToast("Monthly report copied! 📋");
    setTimeout(() => { setToast(null); setCopiedReport(null); }, 3000);
  };
  const copyWeeklyReport = () => {
    const ts = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const w = weeklyMetrics;
    let text = `📊 WEEKLY PERFORMANCE UPDATE\n🕒 Exported: ${ts}\n📅 Week: ${w.thisWeekLabel}\n━━━━━━━━━━━━━━━\n`;
    text += `THIS WEEK: ${formatMoney(w.thisWeekTotal)}\nLAST WEEK: ${formatMoney(w.lastWeekTotal)}\n`;
    const diff = w.thisWeekTotal - w.lastWeekTotal;
    text += `CHANGE: ${diff >= 0 ? "+" : ""}${formatMoney(diff)} vs last week\n━━━━━━━━━━━━━━━\n`;
    Object.keys(allLocations).forEach((key) => {
      const tw = w.thisWeek[key] || 0, lw = w.lastWeek[key] || 0, d = tw - lw;
      text += `📍 ${allLocations[key].name}: ${formatMoney(tw)} (last week: ${formatMoney(lw)}) ${d >= 0 ? "↑" : "↓"} ${formatMoney(Math.abs(d))}\n`;
    });
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    });
    setCopiedReport("weekly"); setToast("Weekly report copied! 📋");
    setTimeout(() => { setToast(null); setCopiedReport(null); }, 3000);
  };
  if (authLoading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-4">
        <RefreshCcw className="animate-spin text-blue-500" size={40} />
        <p className="font-black tracking-widest text-xs uppercase opacity-50">Authenticating Simply Spotless...</p>
      </div>
    );
  if (loading)
    return <div className="min-h-screen flex items-center justify-center">Loading Dashboard...</div>;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {toast && (
        <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl z-50">{toast}</div>
      )}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-blue-200">SS</div>
            <div className="hidden md:block">
              <h1 className="font-black text-xl tracking-tighter">Simply Spotless</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                {sheetError ? <WifiOff size={10} className="text-rose-400" /> : sheetSyncing ? <RefreshCcw size={10} className="text-blue-400 animate-spin" /> : <Wifi size={10} className="text-emerald-400" />}
                <span className="text-[10px] text-slate-400 font-bold">
                  {csvFileName ? `CSV: ${csvFileName}` : sheetError ? "Sync error" : sheetSyncing ? "Syncing..." : sheetLastSync ? `Synced ${sheetLastSync}` : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveView("manager")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeView === "manager" ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}>
              <LayoutDashboard size={14} /> MANAGER VIEW
            </button>
            <button onClick={() => setActiveView("reports")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeView === "reports" ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}>
              <BarChart2 size={14} /> REPORTS
            </button>
            <button onClick={() => setActiveView("targets")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeView === "targets" ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}>
              <Settings size={14} /> TARGETS
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(v => v - 1); }} className="p-2 hover:bg-white rounded-lg transition-all"><ChevronLeft size={18} /></button>
            <span className="px-4 font-black text-slate-700 uppercase text-xs min-w-[120px] text-center">{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(v => v + 1); }} className="p-2 hover:bg-white rounded-lg transition-all"><ChevronRight size={18} /></button>
          </div>
          <label className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl transition-all text-xs font-black" title="Upload CSV from Booking Koala">
            <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
            {csvFileName ? "✓ CSV" : "↑ CSV"}
          </label>
          <button onClick={handleRefresh} disabled={sheetSyncing}
            className="p-3 bg-slate-50 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all disabled:opacity-50" title="Sync from Booking Koala">
            <RefreshCcw size={18} className={sheetSyncing ? "animate-spin" : ""} />
          </button>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {activeView === "manager" && (
          <div className="space-y-8">
            <header className="bg-slate-900 rounded-[2.5rem] p-10 md:p-14 text-white shadow-2xl">
              <div className="flex items-center gap-4 mb-4">
                <span className="bg-blue-600 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Performance</span>
                <span className="text-slate-400 text-xs font-black uppercase tracking-widest">{MONTHS[viewMonth]} {viewYear}</span>
                {sheetRows.length > 0 && <span className="text-emerald-400 text-[10px] font-black uppercase">● Live from Booking Koala</span>}
              </div>
              <p className="text-blue-400 text-[10px] font-black uppercase mb-2">Remaining Goal</p>
              <h2 className="text-7xl md:text-9xl font-black tracking-tighter mb-8">{formatMoney(metrics.remainingGoal)}</h2>
              <div className="flex flex-wrap gap-8">
                <div><p className="text-[10px] font-black text-slate-400">Booked</p><p className="text-3xl font-black text-emerald-400">{formatMoney(metrics.totalBooked)}</p></div>
                <div><p className="text-[10px] font-black text-slate-400">Goal</p><p className="text-3xl font-black">{formatMoney(metrics.totalGoal)}</p></div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 mb-1">Monthly Goal ($)</p>
                  <input type="text" value={data.monthlyGoal?.toLocaleString() || "0"}
                    onChange={(e) => updateField("goal", "", e.target.value)}
                    className="bg-white/10 border border-white/20 text-white font-black text-lg px-3 py-1.5 rounded-xl outline-none w-32" />
                </div>
              </div>
            </header>
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-xs uppercase text-slate-400 flex items-center gap-2"><TrendingUp size={14} /> Monthly Progress Tracker</h3>
                <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black ${metrics.performanceStatus.includes("ON TRACK") ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
                  {metrics.performanceStatus.includes("ON TRACK") ? <ArrowUpCircle size={12} /> : <ArrowDownCircle size={12} />}
                  {metrics.performanceStatus.replace(/🟢 |🔴 /g, "")}
                </span>
              </div>
              <div className="mb-2">
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-1">
                  <span>Actual: {metrics.actualProgressPct.toFixed(1)}%</span>
                  <span>Expected pace: {metrics.expectedProgressPct.toFixed(1)}%</span>
                </div>
                <div className="relative h-8 bg-slate-100 rounded-2xl overflow-hidden">
                  <div className="absolute top-0 left-0 h-full bg-slate-200 rounded-2xl transition-all duration-700" style={{ width: `${Math.min(100, metrics.expectedProgressPct)}%` }} />
                  <div className={`absolute top-0 left-0 h-full rounded-2xl transition-all duration-1000 ${metrics.actualProgressPct >= metrics.expectedProgressPct ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${Math.min(100, metrics.actualProgressPct)}%` }} />
                  {metrics.expectedProgressPct > 0 && metrics.expectedProgressPct < 100 && (
                    <div className="absolute top-0 h-full w-1 bg-slate-700/40" style={{ left: `${metrics.expectedProgressPct}%` }} />
                  )}
                </div>
                <div className="flex justify-between text-[9px] font-bold text-slate-300 uppercase mt-1">
                  <span>{formatMoney(metrics.totalBooked)} booked</span>
                  <span>{formatMoney(metrics.totalGoal)} goal</span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 mb-1"><Calendar size={12} className="text-blue-500" /><p className="text-[9px] font-black text-slate-400 uppercase">Day of Month</p></div>
                  <p className="text-2xl font-black text-slate-800">{metrics.currentDayOfMonth}<span className="text-sm text-slate-400 font-bold"> / {metrics.daysInMonth}</span></p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 mb-1"><Clock size={12} className="text-orange-500" /><p className="text-[9px] font-black text-slate-400 uppercase">Days Remaining</p></div>
                  <p className="text-2xl font-black text-slate-800">{metrics.daysRemaining}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 mb-1"><Target size={12} className="text-purple-500" /><p className="text-[9px] font-black text-slate-400 uppercase">Daily Target</p></div>
                  <p className="text-2xl font-black text-slate-800">{formatMoney(metrics.dailyTarget)}</p>
                </div>
                <div className={`rounded-2xl p-4 border ${metrics.performanceStatus.includes("ON TRACK") ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle size={12} className={metrics.performanceStatus.includes("ON TRACK") ? "text-emerald-500" : "text-rose-500"} />
                    <p className="text-[9px] font-black text-slate-400 uppercase">vs Expected</p>
                  </div>
                  <p className={`text-2xl font-black ${metrics.totalBooked >= metrics.expectedBooking ? "text-emerald-600" : "text-rose-600"}`}>
                    {metrics.totalBooked >= metrics.expectedBooking ? "+" : ""}{formatMoney(metrics.totalBooked - metrics.expectedBooking)}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.keys(allLocations).map((key) => {
                const c = metrics.cityMetrics[key];
                const isOnTrack = c.performanceStatus.includes("ON TRACK");
                return (
                  <div key={key} className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                    <div className="flex justify-between mb-2">
                      <p className="font-black text-xs text-slate-400 uppercase">{allLocations[key].name}</p>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black ${isOnTrack ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
                        {isOnTrack ? <ArrowUpCircle size={10} /> : <ArrowDownCircle size={10} />}
                        {c.performanceStatus.replace(/🟢 |🔴 /g, "")}
                      </span>
                    </div>
                    <h4 className="text-3xl font-black mb-1">{formatMoney(c.booked)}</h4>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Goal:</p>
                      <input type="text" value={data.locationTargets?.[key]?.toLocaleString() || "0"}
                        onChange={(e) => updateField("locTarget", key, e.target.value)}
                        className="bg-slate-50 border border-slate-200 px-2 py-1 rounded w-20 text-right text-xs font-black" />
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${allLocations[key].color} transition-all duration-1000`} style={{ width: `${Math.min(100, c.actualProgressPct)}%` }} />
                    </div>
                    <div className="mt-3 flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                      <span>{c.actualProgressPct.toFixed(0)}% booked</span>
                      {c.dailyTarget > 0 && <span className="flex items-center gap-1"><Target size={9} />{formatMoney(c.dailyTarget)}/day</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {activeView === "reports" && (
          <div className="space-y-6">
            <div className="flex bg-white border border-slate-200 p-1 rounded-2xl w-fit shadow-sm">
              <button onClick={() => setReportTab("monthly")} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${reportTab === "monthly" ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-700"}`}>📅 MONTHLY REPORT</button>
              <button onClick={() => setReportTab("weekly")} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${reportTab === "weekly" ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-700"}`}>📆 WEEKLY REPORT</button>
            </div>
            {reportTab === "monthly" && (
              <div className="space-y-6">
                <div className="bg-slate-900 text-white rounded-[2.5rem] p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <p className="text-blue-400 text-[10px] font-black uppercase mb-1">Monthly Report — {MONTHS[viewMonth]} {viewYear}</p>
                    <h2 className="text-4xl font-black">{formatMoney(metrics.totalBooked)} <span className="text-slate-400 text-2xl font-bold">/ {formatMoney(metrics.totalGoal)}</span></h2>
                    <p className="text-slate-400 text-sm mt-2">{metrics.actualProgressPct.toFixed(1)}% of monthly goal · {metrics.daysRemaining} days remaining</p>
                  </div>
                  <button onClick={copyMonthlyReport} className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-xs uppercase transition-all ${copiedReport === "monthly" ? "bg-emerald-500 text-white" : "bg-white text-slate-900 hover:bg-slate-100"}`}>
                    {copiedReport === "monthly" ? <CheckCheck size={16} /> : <Copy size={16} />}
                    {copiedReport === "monthly" ? "Copied!" : "Copy for WhatsApp"}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {Object.keys(allLocations).map((key) => {
                    const c = metrics.cityMetrics[key];
                    const isOnTrack = c.performanceStatus.includes("ON TRACK");
                    const info = allLocations[key];
                    return (
                      <div key={key} className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">{info.name}</p>
                            <h3 className="text-2xl font-black mt-1">{formatMoney(c.booked)}</h3>
                            <p className="text-xs text-slate-400 font-bold">Goal: {formatMoney(c.goal)}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black ${isOnTrack ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {isOnTrack ? "ON TRACK" : "BEHIND"}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                          <div className={`h-full ${info.color} transition-all duration-1000`} style={{ width: `${Math.min(100, c.actualProgressPct)}%` }} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <div className="bg-slate-50 rounded-xl p-3"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">Progress</p><p className="text-lg font-black">{c.actualProgressPct.toFixed(0)}%</p></div>
                          <div className={`rounded-xl p-3 ${c.dailyTarget > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Need/day</p>
                            <p className={`text-lg font-black ${c.dailyTarget > 0 ? "text-amber-700" : "text-emerald-600"}`}>{c.dailyTarget > 0 ? formatMoney(c.dailyTarget) : "✓ Done"}</p>
                          </div>
                        </div>
                        <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Remaining to goal</p>
                          <p className="text-base font-black text-slate-700">{formatMoney(c.remainingGoal)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {reportTab === "weekly" && (
              <div className="space-y-6">
                <div className="bg-slate-900 text-white rounded-[2.5rem] p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <p className="text-blue-400 text-[10px] font-black uppercase mb-1">Weekly Report</p>
                    <h2 className="text-4xl font-black">{formatMoney(weeklyMetrics.thisWeekTotal)}</h2>
                    <p className="text-slate-400 text-sm mt-2">This week ({weeklyMetrics.thisWeekLabel})</p>
                    <div className="flex items-center gap-2 mt-2">
                      {weeklyMetrics.thisWeekTotal >= weeklyMetrics.lastWeekTotal ? <ArrowUpCircle size={16} className="text-emerald-400" /> : <ArrowDownCircle size={16} className="text-rose-400" />}
                      <span className={`text-sm font-black ${weeklyMetrics.thisWeekTotal >= weeklyMetrics.lastWeekTotal ? "text-emerald-400" : "text-rose-400"}`}>
                        {weeklyMetrics.thisWeekTotal >= weeklyMetrics.lastWeekTotal ? "+" : ""}{formatMoney(weeklyMetrics.thisWeekTotal - weeklyMetrics.lastWeekTotal)} vs last week
                      </span>
                    </div>
                  </div>
                  <button onClick={copyWeeklyReport} className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-xs uppercase transition-all ${copiedReport === "weekly" ? "bg-emerald-500 text-white" : "bg-white text-slate-900 hover:bg-slate-100"}`}>
                    {copiedReport === "weekly" ? <CheckCheck size={16} /> : <Copy size={16} />}
                    {copiedReport === "weekly" ? "Copied!" : "Copy for WhatsApp"}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-black text-xs uppercase text-slate-400 mb-1">This Week</h3>
                    <p className="text-[10px] text-slate-300 mb-4">{weeklyMetrics.thisWeekLabel}</p>
                    <div className="space-y-3">
                      {Object.keys(allLocations).map((key) => {
                        const info = allLocations[key];
                        const tw = weeklyMetrics.thisWeek[key] || 0;
                        const lw = weeklyMetrics.lastWeek[key] || 0;
                        const diff = tw - lw;
                        const maxVal = Math.max(tw, lw, 1);
                        return (
                          <div key={key}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-black text-slate-700">{info.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black">{formatMoney(tw)}</span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${diff >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{diff >= 0 ? "+" : ""}{formatMoney(diff)}</span>
                              </div>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full ${info.color} transition-all duration-700`} style={{ width: `${(tw / maxVal) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between">
                      <span className="text-xs font-black text-slate-400 uppercase">Total</span>
                      <span className="text-sm font-black">{formatMoney(weeklyMetrics.thisWeekTotal)}</span>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-[2rem] border border-slate-200 p-6">
                    <h3 className="font-black text-xs uppercase text-slate-400 mb-1">Last Week</h3>
                    <p className="text-[10px] text-slate-300 mb-4">{weeklyMetrics.lastWeekLabel}</p>
                    <div className="space-y-3">
                      {Object.keys(allLocations).map((key) => {
                        const info = allLocations[key];
                        const lw = weeklyMetrics.lastWeek[key] || 0;
                        const maxLW = Math.max(...Object.keys(allLocations).map((k) => weeklyMetrics.lastWeek[k] || 0), 1);
                        return (
                          <div key={key}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-black text-slate-500">{info.name}</span>
                              <span className="text-xs font-black text-slate-500">{formatMoney(lw)}</span>
                            </div>
                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-slate-400 transition-all duration-700" style={{ width: `${(lw / maxLW) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between">
                      <span className="text-xs font-black text-slate-400 uppercase">Total</span>
                      <span className="text-sm font-black text-slate-500">{formatMoney(weeklyMetrics.lastWeekTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {activeView === "targets" && (
          <div className="space-y-8 max-w-2xl mx-auto">
            <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white">
              <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-2">Monthly Targets</p>
              <h2 className="text-3xl font-black tracking-tighter">Set Goals for {MONTHS[viewMonth]} {viewYear}</h2>
              <p className="text-slate-400 text-sm mt-2">These targets are used to calculate performance across all views.</p>
            </div>
            <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm space-y-6">
              <h3 className="font-black text-xs uppercase text-slate-400 flex items-center gap-2"><Target size={14} /> Overall Monthly Goal</h3>
              <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Total Revenue Goal</p>
                  <p className="text-xs text-blue-400">Combined target across all locations</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-600 font-black text-lg">$</span>
                  <input type="text" value={data.monthlyGoal?.toLocaleString() || "0"}
                    onChange={(e) => updateField("goal", "", e.target.value)}
                    className="bg-white border border-blue-200 text-blue-900 font-black text-xl px-4 py-2 rounded-xl outline-none w-36 text-right focus:border-blue-500" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm space-y-4">
              <h3 className="font-black text-xs uppercase text-slate-400 flex items-center gap-2"><Settings size={14} /> Location Targets</h3>
              <p className="text-xs text-slate-400">Set individual revenue goals for each location.</p>
              <div className="space-y-3 mt-4">
                {Object.keys(allLocations).map((key) => {
                  const info = allLocations[key];
                  const booked = metrics.cityMetrics[key]?.booked || 0;
                  const goal = Number(data.locationTargets?.[key] || 0);
                  const pct = goal > 0 ? Math.min(100, (booked / goal) * 100) : 0;
                  return (
                    <div key={key} className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${info.color}`} />
                          <span className="font-black text-slate-800">{info.name}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Currently: ${Math.round(booked).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-black">$</span>
                          <input type="text" value={data.locationTargets?.[key]?.toLocaleString() || "0"}
                            onChange={(e) => updateField("locTarget", key, e.target.value)}
                            className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-right text-sm font-black outline-none w-28 focus:border-blue-400" />
                        </div>
                      </div>
                      <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                        <div className={`h-full ${info.color} transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-slate-400">
                        <span>{pct.toFixed(0)}% of target reached</span>
                        <span>${Math.max(0, goal - booked).toLocaleString()} remaining</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-[2rem] p-6 flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <Save size={18} className="text-white" />
              </div>
              <div>
                <p className="font-black text-emerald-800 text-sm">Auto-saved</p>
                <p className="text-emerald-600 text-xs">All changes are saved automatically to Firebase in real time.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
