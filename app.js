// app.js (ESM module) — Full file

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// Charts
import Chart from "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";

/** =========================
 *  1) ใส่ Firebase config ตรงนี้
 *  ========================= */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  // optional:
  // storageBucket: "...",
  // messagingSenderId: "...",
  // appId: "..."
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/** =========================
 *  2) DOM helpers
 *  ========================= */
const el = (id) => document.getElementById(id);

function setMsg(node, text, kind = "") {
  if (!node) return;
  node.textContent = text || "";
  node.className = "msg" + (kind ? ` ${kind}` : "");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString("th-TH");
}

function formatTime(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("th-TH", { hour12: false });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** =========================
 *  3) DOM nodes
 *  ========================= */
const authCard = el("authCard");
const appCard = el("appCard");

const email = el("email");
const password = el("password");

const btnSignIn = el("btnSignIn");
const btnSignUp = el("btnSignUp");
const btnSignOut = el("btnSignOut");
const btnTheme = el("btnTheme");

const authMsg = el("authMsg");
const appMsg = el("appMsg");
const userEmail = el("userEmail");

const yearSelect = el("yearSelect");
const monthSelect = el("monthSelect");

const typeSel = el("type");
const amount = el("amount");
const note = el("note");
const btnAdd = el("btnAdd");

const rows = el("rows");

const sumIncome = el("sumIncome");
const sumExpense = el("sumExpense");
const sumNet = el("sumNet");

// Charts canvas
const chartMonthlyEl = el("chartMonthly");
const chartYearlyEl = el("chartYearly");

/** =========================
 *  4) Theme (dark/light) + Chart theme sync
 *  ========================= */
function cssVar(name, fallback = "") {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function applyChartTheme() {
  // Sync chart text color to current theme
  Chart.defaults.color = cssVar("--text", "#e8eefc");
  Chart.defaults.borderColor = cssVar("--line", "#22304a");

  if (monthlyChart) monthlyChart.update();
  if (yearlyChart) yearlyChart.update();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  if (btnTheme) btnTheme.textContent = theme === "light" ? "☀️" : "🌙";
  // update chart theme after DOM applies CSS vars
  setTimeout(applyChartTheme, 0);
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  applyTheme(saved || "dark");
}

btnTheme?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
});

initTheme();

/** =========================
 *  5) Year/Month init
 *  ========================= */
function initYearMonth() {
  const now = new Date();
  const y = now.getFullYear();

  const years = [y - 2, y - 1, y, y + 1];
  yearSelect.innerHTML = years.map(v => `<option value="${v}">${v}</option>`).join("");

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  monthSelect.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join("");

  yearSelect.value = String(y);
  monthSelect.value = String(now.getMonth() + 1);
}

function selectedDateKey() {
  return `${yearSelect.value}-${pad2(Number(monthSelect.value))}`;
}

function yearDateKeys(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`);
}

/** =========================
 *  6) Charts (Monthly + Yearly)
 *  ========================= */
let monthlyChart = null;
let yearlyChart = null;

function chartPalette() {
  // Use CSS variables so it matches theme
  return {
    income: cssVar("--good", "#2ad19f"),
    expense: cssVar("--bad", "#ff6b6b"),
    muted: cssVar("--muted", "#9fb0d0"),
    line: cssVar("--line", "#22304a"),
    text: cssVar("--text", "#e8eefc")
  };
}

function sumIncomeExpense(list) {
  let inc = 0, exp = 0;
  for (const it of list) {
    const a = Number(it.amount || 0);
    if (it.type === "income") inc += a;
    else exp += a;
  }
  return { inc, exp };
}

function buildMonthlyChart(income, expense) {
  const ctx = chartMonthlyEl?.getContext("2d");
  if (!ctx) return;

  const c = chartPalette();

  if (monthlyChart) monthlyChart.destroy();

  monthlyChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["รายรับ", "รายจ่าย"],
      datasets: [{
        data: [income, expense],
        backgroundColor: [c.income, c.expense],
        borderColor: c.line,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (item) => `${item.label}: ${toMoney(item.raw)}`
          }
        }
      }
    }
  });

  applyChartTheme();
}

function buildYearlyChart(labels, incomes, expenses) {
  const ctx = chartYearlyEl?.getContext("2d");
  if (!ctx) return;

  const c = chartPalette();

  if (yearlyChart) yearlyChart.destroy();

  yearlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "รายรับ",
          data: incomes,
