// /api/report — chamado pelo Zapier (Webhooks by Zapier, GET) toda noite.
// Calcula o relatório do mês a partir da planilha (mesma lógica do App.tsx:
// dedupe por Booking ID, sem gorjeta) e devolve um texto formatado pro Slack.

const SHEETS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRoUnSQcVwZCmOZAz47LrVfNopfXi9nIvlUqz1ZCU_nS0vHYAquW9jZQiL3855RlkALKrMU-u3LFYNW/pub?gid=827331040&single=true&output=csv";

const FIRESTORE_PROJECT_ID = "daily-reports-ssc";
const FIRESTORE_APP_ID = "simply-spotless-production";

const DEFAULT_GOALS = {
  monthlyGoal: 100000,
  locationTargets: {
    cincy: 40000, charlotte: 15000, srq: 20000, fortmyers: 10000,
    asheville: 10000, kansascity: 10000, orlando: 10000, palmbeach: 10000,
    tampa: 10000, villages: 10000,
  },
};

const LOCATION_MAP = {
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
  "The Villages & Ocalla, FL": "villages",
  "Cincinnati/NKY": "cincy", "Cincinnati": "cincy", "Charlotte": "charlotte",
  "Fort Myers": "fortmyers", "SRQ": "srq", "SRQ & Bradenton": "srq",
  "Sarasota": "srq", "Bradenton": "srq", "Asheville": "asheville",
  "Kansas City": "kansascity", "Orlando": "orlando", "Palm Beach": "palmbeach",
  "Tampa": "tampa", "The Villages": "villages", "Other": "srq",
};

const LOCATION_NAMES = {
  cincy: "Cincinnati/NKY", charlotte: "Charlotte", srq: "Sarasota & Bradenton",
  fortmyers: "Fort Myers", asheville: "Asheville", kansascity: "Kansas City",
  orlando: "Orlando", palmbeach: "Palm Beach", tampa: "Tampa & St. Pete",
  villages: "The Villages & Ocala",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function parseCSV(text) {
  const allRows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\r") { /* ignore */ }
      else if (c === "\n") { row.push(cur); cur = ""; allRows.push(row); row = []; }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); allRows.push(row); }
  if (allRows.length < 2) return [];
  const headers = allRows[0].map((h) => h.replace(/^"|"$/g, "").trim());
  const rows = [];
  for (let i = 1; i < allRows.length; i++) {
    const vals = allRows[i];
    if (vals.length === 1 && vals[0].trim() === "") continue;
    const r = {};
    headers.forEach((h, idx) => (r[h] = (vals[idx] || "").trim()));
    rows.push(r);
  }
  return rows;
}

function dedupeByBookingId(rows) {
  const seen = new Map();
  const noId = [];
  rows.forEach((row) => {
    const id = (row["Booking ID"] || row["Booking Id"] || row["Booking id"] || "").trim();
    if (!id) { noId.push(row); return; }
    seen.set(id, row);
  });
  return [...Array.from(seen.values()), ...noId];
}

function money(v) {
  return "$" + Math.round(v || 0).toLocaleString("en-US");
}

function firestoreNumber(field) {
  if (!field) return undefined;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return Number(field.doubleValue);
  return undefined;
}

async function fetchGoals(year, monthName) {
  try {
    const path = `artifacts/${FIRESTORE_APP_ID}/public/data/sales_ledger/${year}_${monthName}`;
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${path}`;
    const res = await fetch(url);
    if (!res.ok) return DEFAULT_GOALS;
    const data = await res.json();
    const fields = data.fields || {};
    const monthlyGoal = firestoreNumber(fields.monthlyGoal) ?? DEFAULT_GOALS.monthlyGoal;
    const locationTargets = { ...DEFAULT_GOALS.locationTargets };
    const ltFields = fields.locationTargets && fields.locationTargets.mapValue && fields.locationTargets.mapValue.fields;
    if (ltFields) {
      Object.keys(ltFields).forEach((k) => {
        const n = firestoreNumber(ltFields[k]);
        if (n !== undefined) locationTargets[k] = n;
      });
    }
    return { monthlyGoal, locationTargets };
  } catch {
    return DEFAULT_GOALS;
  }
}

module.exports = async (req, res) => {
  try {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const year = now.getFullYear();
    const monthIdx = now.getMonth();
    const monthName = MONTHS[monthIdx];

    const csvRes = await fetch(SHEETS_CSV_URL + "&t=" + Date.now());
    const csvText = await csvRes.text();
    const rawRows = parseCSV(csvText);
    const rows = dedupeByBookingId(rawRows);

    const goals = await fetchGoals(year, monthName);

    const totals = {};
    Object.keys(LOCATION_NAMES).forEach((k) => (totals[k] = 0));

    rows.forEach((r) => {
      const dateStr = (r["Date"] || "").trim();
      const st = (r["Booking status"] || "").trim().toLowerCase();
      const validStatus = ["charged", "completed", "upcoming", "unassigned"].includes(st);
      if (!dateStr || !validStatus) return;
      let d;
      if (dateStr.includes("/")) {
        const p = dateStr.split("/");
        d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
      } else if (dateStr.includes("-")) {
        const p = dateStr.split("-");
        d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
      } else {
        d = new Date(dateStr);
      }
      if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== monthIdx) return;
      const locRaw = (r["Location Clean"] || r["Location"] || "").trim();
      const locKey = LOCATION_MAP[locRaw];
      if (!locKey || totals[locKey] === undefined) return;
      const amt = parseFloat((r["Final amount"] || r["Final amount (USD)"] || "0").replace(/[$,]/g, "")) || 0;
      totals[locKey] += amt;
    });

    const totalBooked = Object.values(totals).reduce((s, v) => s + v, 0);
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const daysRemaining = Math.max(0, daysInMonth - now.getDate());
    const calcMetrics = (goal, booked, currentDayOfMonth, daysRemaining) => {
      const remainingGoal = Math.max(0, goal - booked);
      const dailyTarget = daysRemaining > 0 ? remainingGoal / daysRemaining : 0;
      const expectedBooking = (goal / daysInMonth) * currentDayOfMonth;
      const actualProgressPct = goal > 0 ? (booked / goal) * 100 : 0;
      const performanceStatus = booked >= expectedBooking ? "🟢 ON TRACK" : "🔴 BEHIND";
      return { remainingGoal, dailyTarget, expectedBooking, actualProgressPct, performanceStatus };
    };
    const currentDayOfMonth = now.getDate();
    const totalM = calcMetrics(goals.monthlyGoal, totalBooked, currentDayOfMonth, daysRemaining);

    const ts = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    let message = `📊 ${monthName.toUpperCase()} PERFORMANCE UPDATE\n🕒 Exported: ${ts}\n━━━━━━━━━━━━━━━\n`;
    message += `🎯 Monthly Goal: ${money(goals.monthlyGoal)}\n`;
    message += `📈 Actual Booked: ${money(totalBooked)}\n`;
    message += `💰 ACTUAL PROGRESS: ${totalM.actualProgressPct.toFixed(1)}%\n`;
    message += `📅 STATUS: ${totalM.performanceStatus}\n`;
    message += `⏳ Days Remaining: ${daysRemaining}\n━━━━━━━━━━━━━━━\n`;
    Object.keys(LOCATION_NAMES).forEach((key) => {
      const goal = goals.locationTargets[key] || 0;
      const booked = totals[key] || 0;
      const c = calcMetrics(goal, booked, currentDayOfMonth, daysRemaining);
      message += `📍 ${LOCATION_NAMES[key]}: ${money(booked)} / ${money(goal)} (${c.actualProgressPct.toFixed(0)}%) ${c.performanceStatus}\n`;
      if (c.dailyTarget > 0) message += `   → Need ${money(c.dailyTarget)}/day to hit goal\n`;
    });
    message += `━━━━━━━━━━━━━━━\n💡 Need ${money(totalM.dailyTarget)}/day across all locations`;

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ message, totalBooked, monthlyGoal: goals.monthlyGoal });
  } catch (err) {
    res.status(500).json({ message: "Erro ao gerar relatório: " + (err && err.message) });
  }
};
