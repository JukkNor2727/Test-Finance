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
          backgroundColor: c.income
        },
        {
          label: "รายจ่าย",
          data: expenses,
          backgroundColor: c.expense
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${toMoney(item.raw)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => toMoney(v)
          }
        }
      }
    }
  });

  applyChartTheme();
}

/** =========================
 *  7) Firestore realtime listeners
 *  ========================= */
let unsubscribeMonth = null;
let unsubscribeYear = null;
let currentUser = null;

function stopListeners() {
  if (unsubscribeMonth) {
    unsubscribeMonth();
    unsubscribeMonth = null;
  }
  if (unsubscribeYear) {
    unsubscribeYear();
    unsubscribeYear = null;
  }
}

function startMonthlyListener() {
  if (!currentUser) return;

  if (unsubscribeMonth) {
    unsubscribeMonth();
    unsubscribeMonth = null;
  }

  const dateKey = selectedDateKey();
  setMsg(appMsg, `กำลังโหลดข้อมูลเดือน ${dateKey}...`, "warn");

  const q = query(
    collection(db, "transactions"),
    where("uid", "==", currentUser.uid),
    where("dateKey", "==", dateKey),
    orderBy("createdAt", "desc")
  );

  unsubscribeMonth = onSnapshot(q, (snap) => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable(data);
    renderSummary(data);
    setMsg(appMsg, `อัปเดตแล้ว (${data.length} รายการ)`, "ok");
  }, (err) => {
    console.error(err);
    setMsg(appMsg, `โหลดไม่สำเร็จ: ${err.message}`, "err");
  });
}

function startYearlyListener() {
  if (!currentUser) return;

  if (unsubscribeYear) {
    unsubscribeYear();
    unsubscribeYear = null;
  }

  const year = Number(yearSelect.value);
  const keys = yearDateKeys(year);

  // Query ทั้งปี: uid == ... AND dateKey in [12 months]
  // ถ้าขึ้น "requires an index" ให้กดลิงก์ที่ Firebase ให้แล้วสร้าง index (ครั้งเดียวจบ)
  const q = query(
    collection(db, "transactions"),
    where("uid", "==", currentUser.uid),
    where("dateKey", "in", keys)
  );

  unsubscribeYear = onSnapshot(q, (snap) => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const labels = Array.from({ length: 12 }, (_, i) => `${i + 1}`);
    const incomes = Array(12).fill(0);
    const expenses = Array(12).fill(0);

    for (const it of all) {
      const dk = String(it.dateKey || "");
      const parts = dk.split("-");
      const m = Number(parts[1]); // 1..12
      if (!m || m < 1 || m > 12) continue;

      const a = Number(it.amount || 0);
      if (it.type === "income") incomes[m - 1] += a;
      else expenses[m - 1] += a;
    }

    buildYearlyChart(labels, incomes, expenses);
  }, (err) => {
    console.error(err);
    // ไม่ทำให้เว็บพัง แค่แจ้งเตือน
    setMsg(appMsg, `กราฟรายปีโหลดไม่ได้: ${err.message}`, "warn");
  });
}

/** =========================
 *  8) Render UI
 *  ========================= */
function renderTable(data) {
  if (!data.length) {
    rows.innerHTML = `
      <tr>
        <td colspan="5" class="muted">ยังไม่มีรายการในเดือนนี้</td>
      </tr>
    `;
    return;
  }

  rows.innerHTML = data.map(item => {
    const badgeClass = item.type === "income" ? "income" : "expense";
    const badgeText = item.type === "income" ? "รายรับ" : "รายจ่าย";

    return `
      <tr>
        <td>${formatTime(item.createdAt)}</td>
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
        <td class="right">${toMoney(item.amount)}</td>
        <td>${escapeHtml(item.note || "")}</td>
        <td class="right">
          <button class="btn ghost" data-del="${item.id}">ลบ</button>
        </td>
      </tr>
    `;
  }).join("");

  rows.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      await handleDelete(id);
    });
  });
}

function renderSummary(data) {
  const { inc, exp } = sumIncomeExpense(data);

  sumIncome.textContent = toMoney(inc);
  sumExpense.textContent = toMoney(exp);
  sumNet.textContent = toMoney(inc - exp);

  // Monthly chart uses same data
  buildMonthlyChart(inc, exp);
}

/** =========================
 *  9) CRUD
 *  ========================= */
async function handleAdd() {
  if (!currentUser) return;

  const t = typeSel.value;
  const a = Number(amount.value);

  if (!Number.isFinite(a) || a <= 0) {
    setMsg(appMsg, "กรุณากรอกจำนวนเงินให้ถูกต้อง (มากกว่า 0)", "err");
    return;
  }

  const payload = {
    uid: currentUser.uid,
    type: t,
    amount: a,
    note: (note.value || "").trim(),
    dateKey: selectedDateKey(),
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "transactions"), payload);
    amount.value = "";
    note.value = "";
    setMsg(appMsg, "บันทึกแล้ว", "ok");
  } catch (err) {
    console.error(err);
    setMsg(appMsg, `บันทึกไม่สำเร็จ: ${err.message}`, "err");
  }
}

async function handleDelete(id) {
  if (!currentUser) return;

  try {
    await deleteDoc(doc(db, "transactions", id));
    setMsg(appMsg, "ลบแล้ว", "ok");
  } catch (err) {
    console.error(err);
    setMsg(appMsg, `ลบไม่สำเร็จ: ${err.message}`, "err");
  }
}

/** =========================
 *  10) Auth handlers
 *  ========================= */
btnSignIn?.addEventListener("click", async () => {
  setMsg(authMsg, "", "");
  const e = (email.value || "").trim();
  const p = password.value || "";

  if (!e.includes("@") || !e.includes(".")) {
    setMsg(authMsg, "กรุณากรอกอีเมลให้ถูกต้อง", "err");
    return;
  }
  if (p.length < 6) {
    setMsg(authMsg, "รหัสผ่านต้องอย่างน้อย 6 ตัว", "err");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, e, p);
    setMsg(authMsg, "เข้าสู่ระบบสำเร็จ", "ok");
  } catch (err) {
    console.error(err);
    setMsg(authMsg, `เข้าสู่ระบบไม่สำเร็จ: ${err.message}`, "err");
  }
});

btnSignUp?.addEventListener("click", async () => {
  setMsg(authMsg, "", "");
  const e = (email.value || "").trim();
  const p = password.value || "";

  if (!e.includes("@") || !e.includes(".")) {
    setMsg(authMsg, "กรุณากรอกอีเมลให้ถูกต้อง", "err");
    return;
  }
  if (p.length < 6) {
    setMsg(authMsg, "รหัสผ่านต้องอย่างน้อย 6 ตัว", "err");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, e, p);
    setMsg(authMsg, "สมัครสมาชิกสำเร็จ (เข้าสู่ระบบแล้ว)", "ok");
  } catch (err) {
    console.error(err);
    setMsg(authMsg, `สมัครไม่สำเร็จ: ${err.message}`, "err");
  }
});

btnSignOut?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
  }
});

/** =========================
 *  11) Month/Year change listeners + Mobile UX
 *  ========================= */
yearSelect?.addEventListener("change", () => {
  startMonthlyListener();
  startYearlyListener();
});

monthSelect?.addEventListener("change", () => {
  startMonthlyListener();
});

btnAdd?.addEventListener("click", handleAdd);

// กด Enter ในช่องจำนวนเงิน/หมายเหตุเพื่อบันทึก (มือถือใช้ง่ายขึ้น)
amount?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleAdd();
});
note?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleAdd();
});

/** =========================
 *  12) Auth state -> show/hide app
 *  ========================= */
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;

  if (user) {
    userEmail.textContent = user.email || "Signed in";
    btnSignOut.disabled = false;

    authCard?.classList.add("hidden");
    appCard?.classList.remove("hidden");

    // init selectors every login
    initYearMonth();
    startMonthlyListener();
    startYearlyListener();
  } else {
    userEmail.textContent = "ยังไม่ได้ล็อกอิน";
    btnSignOut.disabled = true;

    authCard?.classList.remove("hidden");
    appCard?.classList.add("hidden");

    stopListeners();

    // reset charts (optional)
    if (monthlyChart) {
      monthlyChart.destroy();
      monthlyChart = null;
    }
    if (yearlyChart) {
      yearlyChart.destroy();
      yearlyChart = null;
    }

    // clear table/summary
    rows.innerHTML = `
      <tr>
        <td colspan="5" class="muted">กรุณาเข้าสู่ระบบเพื่อดูรายการ</td>
      </tr>
    `;
    sumIncome.textContent = "0";
    sumExpense.textContent = "0";
    sumNet.textContent = "0";
  }
});

// In case cached auth login happens fast, ensure selects exist
initYearMonth();
