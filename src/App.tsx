import React, { useState, useEffect, useMemo } from "react";
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
  History,
  Plus,
  Trash2,
  Database,
  RefreshCcw,
  Clock,
  LayoutDashboard,
  Settings,
  Calendar,
  AlertCircle,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  MapPin,
  LogOut,
  Lock,
} from "lucide-react";

// --- 1. FIREBASE CONFIGURATION ---
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

const LOCATION_CONFIG: any = {
  cincy: { name: "Cincinnati", color: "bg-blue-500" },
  charlotte: { name: "Charlotte", color: "bg-purple-500" },
  srq: { name: "SRQ & Bradenton", color: "bg-emerald-500" },
  asheville: { name: "Asheville", color: "bg-orange-500" },
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function App() {
  // --- AUTH STATE ---
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // --- DASHBOARD STATE ---
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [activeView, setActiveView] = useState("admin");

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const [addAmounts, setAddAmounts] = useState<any>({
    cincy: "",
    charlotte: "",
    srq: "",
    asheville: "",
  });
  const [entryDate, setEntryDate] = useState(now.toISOString().split("T")[0]);
  const [isCancellation, setIsCancellation] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [deletingLoc, setDeletingLoc] = useState<string | null>(null);

  const [data, setData] = useState<any>({
    monthlyGoal: 45000,
    locationTargets: {
      cincy: 30000,
      charlotte: 5000,
      srq: 5000,
      asheville: 5000,
    },
    initialBookings: { cincy: 0, charlotte: 0, srq: 0, asheville: 0 },
    customLocations: {},
    hiddenLocations: [],
    logs: [],
  });

  // --- 2. AUTHENTICATION LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setLoginError("Invalid email or password.");
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  // --- 3. METRICS (OLD-SCHOOL SYNTAX TO FIX TS ERRORS) ---
  const allLocations = useMemo(() => {
    const combined = { ...LOCATION_CONFIG };
    // Replacement for entries/values using Object.keys
    const customKeys = Object.keys(data.customLocations || {});
    for (let i = 0; i < customKeys.length; i++) {
      const k = customKeys[i];
      combined[k] = data.customLocations[k];
    }

    const hidden = data.hiddenLocations || [];
    for (let j = 0; j < hidden.length; j++) {
      delete combined[hidden[j]];
    }
    return combined;
  }, [data.customLocations, data.hiddenLocations]);

  const metrics = useMemo(() => {
    const totals: any = {};
    const locKeys = Object.keys(allLocations);

    for (let i = 0; i < locKeys.length; i++) {
      const key = locKeys[i];
      totals[key] = Number(data.initialBookings?.[key] || 0);
    }

    (data.logs || []).forEach((log: any) => {
      if (totals[log.location] !== undefined) {
        const amt = Number(log.amount);
        if (log.type === "cancellation") totals[log.location] -= amt;
        else totals[log.location] += amt;
      }
    });

    const isCurrentMonth =
      viewMonth === now.getMonth() && viewYear === now.getFullYear();
    const isFutureMonth =
      viewYear > now.getFullYear() ||
      (viewYear === now.getFullYear() && viewMonth > now.getMonth());
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    let currentDayOfMonth = 0;
    let daysRemaining = 1;

    if (isCurrentMonth) {
      currentDayOfMonth = now.getDate();
      daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);
    } else if (isFutureMonth) {
      currentDayOfMonth = 0;
      daysRemaining = daysInMonth;
    } else {
      currentDayOfMonth = daysInMonth;
      daysRemaining = 0;
    }

    const expectedProgressPct = (currentDayOfMonth / daysInMonth) * 100;

    const calculateMetrics = (goal: number, booked: number) => {
      const remainingGoal = Math.max(0, goal - booked);
      const dailyTarget = daysRemaining > 0 ? remainingGoal / daysRemaining : 0;
      const expectedBooking = (goal / daysInMonth) * currentDayOfMonth;
      const actualProgressPct = goal > 0 ? (booked / goal) * 100 : 0;
      const performanceStatus =
        booked >= expectedBooking ? "🟢 ON TRACK" : "🔴 BEHIND";
      return {
        remainingGoal,
        dailyTarget,
        expectedBooking,
        actualProgressPct,
        performanceStatus,
      };
    };

    const totalGoal = Number(data.monthlyGoal || 45000);

    // Replacement for Object.values().reduce
    let totalBooked = 0;
    const totalKeys = Object.keys(totals);
    for (let k = 0; k < totalKeys.length; k++) {
      totalBooked += totals[totalKeys[k]];
    }

    const totalMetrics = calculateMetrics(totalGoal, totalBooked);
    const cityMetrics: any = {};

    for (let l = 0; l < locKeys.length; l++) {
      const key = locKeys[l];
      const cityGoal = Number(data.locationTargets?.[key] || 0);
      const cityBooked = totals[key] || 0;
      cityMetrics[key] = {
        goal: cityGoal,
        booked: cityBooked,
        ...calculateMetrics(cityGoal, cityBooked),
      };
    }

    return {
      totals,
      totalGoal,
      totalBooked,
      remainingGoal: totalMetrics.remainingGoal,
      dailyTarget: totalMetrics.dailyTarget,
      expectedBooking: totalMetrics.expectedBooking,
      actualProgressPct: totalMetrics.actualProgressPct,
      performanceStatus: totalMetrics.performanceStatus,
      expectedProgressPct,
      daysInMonth,
      currentDayOfMonth,
      daysRemaining,
      cityMetrics,
    };
  }, [data, viewMonth, viewYear, allLocations]);

  // --- 4. FIRESTORE FETCH (ONLY IF SIGNED IN) ---
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const path = `${viewYear}_${MONTHS[viewMonth]}`;
    const docRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "sales_ledger",
      path
    );

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setData((prev: any) => ({ ...prev, ...snap.data() }));
        } else {
          const defaults = {
            monthlyGoal: 45000,
            locationTargets: {
              cincy: 30000,
              charlotte: 5000,
              srq: 5000,
              asheville: 5000,
            },
            initialBookings: { cincy: 0, charlotte: 0, srq: 0, asheville: 0 },
            customLocations: {},
            hiddenLocations: [],
            logs: [],
          };
          setData(defaults);
          setDoc(docRef, defaults);
        }
        setLoading(false);
      },
      (error) => {
        setToast("Connection error. Check your sign-in.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [viewMonth, viewYear, user]);

  // --- 5. LOGIC ACTIONS ---
  const handleAddLocation = async () => {
    if (!newLocName.trim()) return;
    const key = newLocName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (allLocations[key]) {
      setToast("Location already exists!");
      return;
    }

    const colors = [
      "bg-teal-500",
      "bg-indigo-500",
      "bg-pink-500",
      "bg-yellow-500",
      "bg-cyan-500",
    ];
    const color =
      colors[Object.keys(data.customLocations || {}).length % colors.length];

    const newData = {
      ...data,
      customLocations: {
        ...(data.customLocations || {}),
        [key]: { name: newLocName.trim(), color },
      },
      locationTargets: { ...(data.locationTargets || {}), [key]: 5000 },
      initialBookings: { ...(data.initialBookings || {}), [key]: 0 },
    };

    const path = `${viewYear}_${MONTHS[viewMonth]}`;
    await setDoc(
      doc(db, "artifacts", appId, "public", "data", "sales_ledger", path),
      newData
    );
    setNewLocName("");
    setToast(`Added ${newLocName.trim()}!`);
  };

  const handleDeleteLocation = async (key: string) => {
    const newCustom = { ...(data.customLocations || {}) };
    if (newCustom[key]) delete newCustom[key];
    const newTargets = { ...(data.locationTargets || {}) };
    if (newTargets[key]) delete newTargets[key];
    const newInitials = { ...(data.initialBookings || {}) };
    if (newInitials[key]) delete newInitials[key];

    const newHidden = [...(data.hiddenLocations || [])];
    // REPLACEMENT for includes()
    if (LOCATION_CONFIG[key] && newHidden.indexOf(key) === -1) {
      newHidden.push(key);
    }

    const newData = {
      ...data,
      customLocations: newCustom,
      locationTargets: newTargets,
      initialBookings: newInitials,
      hiddenLocations: newHidden,
    };
    const path = `${viewYear}_${MONTHS[viewMonth]}`;
    await setDoc(
      doc(db, "artifacts", appId, "public", "data", "sales_ledger", path),
      newData
    );
    setDeletingLoc(null);
    setToast(`Location removed.`);
  };

  const handleAddBooking = async (location: string) => {
    const amount = parseInt(addAmounts[location]);
    if (isNaN(amount) || amount <= 0) return;
    const logDate = new Date(entryDate + "T12:00:00");

    const newLog = {
      id: Date.now().toString(),
      location,
      amount,
      type: isCancellation ? "cancellation" : "booking",
      timestamp: logDate.toISOString(),
      displayTime: isCancellation
        ? "N/A"
        : new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
      displayDate: logDate.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      }),
    };

    const newData = { ...data, logs: [newLog, ...(data.logs || [])] };
    const path = `${viewYear}_${MONTHS[viewMonth]}`;

    try {
      await setDoc(
        doc(db, "artifacts", appId, "public", "data", "sales_ledger", path),
        newData
      );
      setAddAmounts((prev: any) => ({ ...prev, [location]: "" }));
      setToast(
        `${
          isCancellation ? "Removed" : "Added"
        } $${amount.toLocaleString()} for ${allLocations[location].name}`
      );
      setIsCancellation(false);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast("Error. Are you signed in?");
    }
  };

  const deleteLog = async (logId: string) => {
    const newData = {
      ...data,
      logs: (data.logs || []).filter((l: any) => l.id !== logId),
    };
    const path = `${viewYear}_${MONTHS[viewMonth]}`;
    await setDoc(
      doc(db, "artifacts", appId, "public", "data", "sales_ledger", path),
      newData
    );
  };

  const updateField = async (category: string, field: string, val: string) => {
    const num = parseInt(val.replace(/[^0-9]/g, "")) || 0;
    let newData;
    if (category === "goal") newData = { ...data, monthlyGoal: num };
    else if (category === "locTarget")
      newData = {
        ...data,
        locationTargets: { ...data.locationTargets, [field]: num },
      };
    else
      newData = {
        ...data,
        initialBookings: { ...data.initialBookings, [field]: num },
      };

    const path = `${viewYear}_${MONTHS[viewMonth]}`;
    await setDoc(
      doc(db, "artifacts", appId, "public", "data", "sales_ledger", path),
      newData
    );
  };

  const copySummary = () => {
    const fullTimestamp = new Date().toLocaleString();
    let text = `📊 ${MONTHS[
      viewMonth
    ].toUpperCase()} PERFORMANCE UPDATE\n🕒 Exported: ${fullTimestamp}\n━━━━━━━━━━━━━━━\n`;
    text += `🎯 Monthly Goal: ${formatMoney(metrics.totalGoal)}\n`;
    text += `📈 Actual Booked: ${formatMoney(metrics.totalBooked)}\n`;
    text += `💰 ACTUAL PROGRESS: ${metrics.actualProgressPct.toFixed(1)}%\n`;
    text += `📅 STATUS: ${metrics.performanceStatus}\n━━━━━━━━━━━━━━━\n`;

    const locKeys = Object.keys(allLocations);
    for (let i = 0; i < locKeys.length; i++) {
      const key = locKeys[i];
      const info = allLocations[key];
      const c = metrics.cityMetrics[key];
      text += `${info.name}: ${formatMoney(c.booked)} / ${formatMoney(
        c.goal
      )} (${c.actualProgressPct.toFixed(0)}%) ${c.performanceStatus}\n`;
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    setToast("Summary Exported! 📋");
    setTimeout(() => setToast(null), 3000);
    document.body.removeChild(textArea);
  };

  const formatMoney = (v: number) =>
    "$" + Math.round(v || 0).toLocaleString("en-US");

  // --- RENDER LOGIC ---

  if (authLoading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-4">
        <RefreshCcw className="animate-spin text-blue-500" size={40} />
        <p className="font-black tracking-widest text-xs uppercase opacity-50">
          Authenticating Simply Spotless...
        </p>
      </div>
    );

  // 1. LOGIN VIEW
  if (!user)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans p-6">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 p-10 md:p-14">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black shadow-xl mb-6">
              SS
            </div>
            <h2 className="text-3xl font-black tracking-tighter text-slate-900">
              Simply Spotless
            </h2>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2">
              Sales Dashboard Access
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-4">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold"
                placeholder="your@email.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-4">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 font-bold"
                  placeholder="••••••••"
                />
                <Lock
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300"
                  size={18}
                />
              </div>
            </div>
            {loginError && (
              <div className="text-rose-600 text-xs font-bold text-center">
                {loginError}
              </div>
            )}
            <button
              type="submit"
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );

  // 2. DASHBOARD VIEW
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading Dashboard...
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {toast && (
        <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl z-50">
          {toast}
        </div>
      )}

      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-blue-200">
              SS
            </div>
            <h1 className="font-black text-xl tracking-tighter hidden md:block">
              Simply Spotless
            </h1>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveView("admin")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                activeView === "admin"
                  ? "bg-white shadow-sm text-blue-600"
                  : "text-slate-500"
              }`}
            >
              <Settings size={14} /> ENTRY & ADMIN
            </button>
            <button
              onClick={() => setActiveView("manager")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                activeView === "manager"
                  ? "bg-white shadow-sm text-blue-600"
                  : "text-slate-500"
              }`}
            >
              <LayoutDashboard size={14} /> MANAGER VIEW
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMonth((v) => (v - 1 + 12) % 12)}
              className="p-2 hover:bg-white rounded-lg transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-4 font-black text-slate-700 uppercase text-xs min-w-[120px] text-center">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              onClick={() => setViewMonth((v) => (v + 1) % 12)}
              className="p-2 hover:bg-white rounded-lg transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="p-3 bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {activeView === "admin" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <section className="lg:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                  <h3 className="font-black text-xl flex items-center gap-3">
                    <Plus className="text-blue-600" /> New Entry
                  </h3>
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <input
                      type="date"
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-[11px] font-black uppercase outline-none"
                    />
                    <button
                      onClick={() => setIsCancellation(!isCancellation)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black transition-all border ${
                        isCancellation
                          ? "bg-rose-50 border-rose-200 text-rose-600"
                          : "bg-slate-50 border-slate-200 text-slate-500"
                      }`}
                    >
                      {isCancellation ? "CANCELLATION" : "NEW BOOKING"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.keys(allLocations).map((key) => {
                    const info = allLocations[key];
                    return (
                      <div
                        key={key}
                        className={`p-6 rounded-[2rem] border flex items-center justify-between group transition-all ${
                          isCancellation
                            ? "bg-rose-50/30 border-rose-100"
                            : "bg-slate-50 border-slate-100 hover:border-blue-200"
                        }`}
                      >
                        <div>
                          <p className="font-black text-slate-800">
                            {info.name}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">
                            {formatMoney(metrics.totals[key])}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="0"
                            value={addAmounts[key] || ""}
                            onChange={(e) =>
                              setAddAmounts((prev: any) => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="w-24 bg-transparent text-right font-black outline-none text-xl border-b-2 mr-2"
                          />
                          <button
                            onClick={() => handleAddBooking(key)}
                            className={`${
                              isCancellation ? "bg-rose-600" : info.color
                            } p-3 rounded-xl text-white shadow-lg`}
                          >
                            <Plus size={20} strokeWidth={3} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200">
                  <h3 className="font-black text-xs uppercase text-slate-400 mb-6 flex items-center gap-2">
                    <Database size={14} /> Master Data
                  </h3>
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl mb-4">
                    <p className="text-[10px] font-black text-blue-600 uppercase mb-1">
                      Total Monthly Goal ($)
                    </p>
                    <input
                      type="text"
                      value={data.monthlyGoal?.toLocaleString() || "0"}
                      onChange={(e) => updateField("goal", "", e.target.value)}
                      className="bg-transparent font-black text-2xl outline-none w-full text-blue-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.keys(allLocations).map((key) => (
                      <div
                        key={`init-${key}`}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-100"
                      >
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">
                          {allLocations[key].name} Init
                        </p>
                        <input
                          type="text"
                          value={
                            data.initialBookings?.[key]?.toLocaleString() || "0"
                          }
                          onChange={(e) =>
                            updateField("initial", key, e.target.value)
                          }
                          className="bg-transparent font-black text-sm outline-none w-full"
                        />
                      </div>
                    ))}
                  </div>
                </section>
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200">
                  <h3 className="font-black text-xs uppercase text-slate-400 mb-6 flex items-center gap-2">
                    <MapPin size={14} /> Targets
                  </h3>
                  <div className="space-y-2">
                    {Object.keys(allLocations).map((key) => (
                      <div
                        key={`target-${key}`}
                        className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100"
                      >
                        <span className="text-xs font-black">
                          {allLocations[key].name}
                        </span>
                        <input
                          type="text"
                          value={
                            data.locationTargets?.[key]?.toLocaleString() || "0"
                          }
                          onChange={(e) =>
                            updateField("locTarget", key, e.target.value)
                          }
                          className="bg-white border border-slate-200 px-2 py-1 rounded w-20 text-right text-xs font-black"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <input
                      type="text"
                      placeholder="New City..."
                      value={newLocName}
                      onChange={(e) => setNewLocName(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 px-3 py-1 rounded-lg text-xs font-black outline-none"
                    />
                    <button
                      onClick={handleAddLocation}
                      className="bg-blue-600 text-white px-4 py-1 rounded-lg text-xs font-black"
                    >
                      ADD
                    </button>
                  </div>
                </section>
              </div>
            </section>
            <section className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl flex flex-col h-[700px]">
              <h3 className="font-black text-xs uppercase text-blue-400 mb-6 flex items-center gap-2">
                <History size={16} /> Activity Log
              </h3>
              <div className="flex-1 overflow-y-auto space-y-4">
                {(data.logs || []).map((log: any) => (
                  <div
                    key={log.id}
                    className="flex justify-between items-center bg-white/5 p-4 rounded-2xl"
                  >
                    <div>
                      <p className="text-[9px] font-black uppercase text-white/40">
                        {allLocations[log.location]?.name || log.location}
                      </p>
                      <p
                        className={`font-black text-lg ${
                          log.type === "cancellation"
                            ? "text-rose-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {log.type === "cancellation" ? "-" : "+"}
                        {formatMoney(log.amount)}
                      </p>
                      <p className="text-[9px] text-white/20">
                        {log.displayDate}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteLog(log.id)}
                      className="text-rose-500 opacity-20 hover:opacity-100 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-8">
            <header className="bg-slate-900 rounded-[2.5rem] p-10 md:p-14 text-white shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-4">
                  <span className="bg-blue-600 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                    Performance
                  </span>
                  <span className="text-slate-400 text-xs font-black uppercase tracking-widest">
                    {MONTHS[viewMonth]} {viewYear}
                  </span>
                </div>
                <p className="text-blue-400 text-[10px] font-black uppercase mb-2">
                  Remaining Goal
                </p>
                <h2 className="text-7xl md:text-9xl font-black tracking-tighter mb-8">
                  {formatMoney(metrics.remainingGoal)}
                </h2>
                <div className="flex flex-wrap gap-8">
                  <div>
                    <p className="text-[10px] font-black text-slate-400">
                      Booked
                    </p>
                    <p className="text-3xl font-black text-emerald-400">
                      {formatMoney(metrics.totalBooked)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400">
                      Goal
                    </p>
                    <p className="text-3xl font-black">
                      {formatMoney(metrics.totalGoal)}
                    </p>
                  </div>
                  <button
                    onClick={copySummary}
                    className="bg-white text-slate-900 px-6 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-2"
                  >
                    <Share2 size={16} /> Copy Report
                  </button>
                </div>
              </div>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.keys(allLocations).map((key) => {
                const c = metrics.cityMetrics[key];
                return (
                  <div
                    key={`loc-${key}`}
                    className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm"
                  >
                    <div className="flex justify-between mb-4">
                      <p className="font-black text-xs text-slate-400 uppercase">
                        {allLocations[key].name}
                      </p>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                          c.performanceStatus.includes("ON TRACK")
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-rose-100 text-rose-600"
                        }`}
                      >
                        {c.performanceStatus.replace(/🟢 |🔴 /g, "")}
                      </span>
                    </div>
                    <h4 className="text-3xl font-black mb-1">
                      {formatMoney(c.booked)}
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">
                      Goal: {formatMoney(c.goal)}
                    </p>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${allLocations[key].color} transition-all duration-1000`}
                        style={{
                          width: `${Math.min(100, c.actualProgressPct)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
