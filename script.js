// app.js (ESM module)

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

/** =========================
 *  1) ใส่ Firebase config ตรงนี้
 *  ========================= */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  // (optional) storageBucket, messagingSenderId, appId
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/** =========================
 *  2) DOM
 *  ========================= */
const el = (id) => document.getElementById(id);

const authCard = el("authCard");
const appCard = el("appCard");

const email = el("email");
const password = el("password");

const btnSignIn = el("btnSignIn");
const btnSignUp = el("btnSignUp");
const btnSignOut = el("btnSignOut");

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

/** =========================
 *  3) Helpers
 *  ========================= */
function setMsg(node, text, kind = "") {
  node.textContent = text || "";
  node.className = "msg" + (kind ? ` ${kind}` : "");
}

function toMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString("th-TH");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function currentDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function selectedDateKey() {
  return `${yearSelect.value}-${pad2(Number(monthSelect.value))}`;
}

function formatTime(ts) {
  if (!ts) return "-";
  // Firestore Timestamp -> Date
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("th-TH", { hour12: false });
}

/** =========================
 *  4) Year/Month init
 *  ========================= */
function initYearMonth() {
  const now = new Date();
  const y = now.getFullYear();

  // years: current-2 .. current+1
  const years = [y - 2, y - 1, y, y + 1];
  yearSelect.innerHTML = years.map(v => `<option value="${v}">${v}</option>`).join("");

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  monthSelect.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join("");

  yearSelect.value = String(y);
  monthSelect.value = String(now.getMonth() + 1);
}

/** =========================
 *  5) Firestore realtime listener
 *  ========================= */
let unsubscribe = null;
let currentUser = null;

function startListener() {
  if (!currentUser) return;

  // stop previous
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  const dateKey = selectedDateKey();
  setMsg(appMsg, `กำลังโหลดข้อมูลเดือน ${dateKey}...`, "warn");

  const q = query(
    collection(db, "transactions"),
    where("uid", "==", currentUser.uid),
    where("dateKey", "==", dateKey),
    orderBy("createdAt", "desc")
  );

  unsubscribe = onSnapshot(q, (snap) => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable(data);
    renderSummary(data);
    setMsg(appMsg, `อัปเดตแล้ว (${data.length} รายการ)`, "ok");
  }, (err) => {
    console.error(err);
    setMsg(appMsg, `โหลดไม่สำเร็จ: ${err.message}`, "err");
  });
}

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

  // bind delete
  rows.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      await handleDelete(id);
    });
  });
}

function renderSummary(data) {
  let inc = 0;
  let exp = 0;

  for (const it of data) {
    const a = Number(it.amount || 0);
    if (it.type === "income") inc += a;
    else exp += a;
  }

  sumIncome.textContent = toMoney(inc);
  sumExpense.textContent = toMoney(exp);
  sumNet.textContent = toMoney(inc - exp);
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
 *  6) CRUD
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
    createdAt: serverTimestamp(),
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
 *  7) Auth handlers
 *  ========================= */
btnSignIn.addEventListener("click", async () => {
  setMsg(authMsg, "", "");
  try {
    await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
    setMsg(authMsg, "เข้าสู่ระบบสำเร็จ", "ok");
  } catch (err) {
    console.error(err);
    setMsg(authMsg, `เข้าสู่ระบบไม่สำเร็จ: ${err.message}`, "err");
  }
});

btnSignUp.addEventListener("click", async () => {
  setMsg(authMsg, "", "");
  try {
    await createUserWithEmailAndPassword(auth, email.value.trim(), password.value);
    setMsg(authMsg, "สมัครสมาชิกสำเร็จ (เข้าสู่ระบบแล้ว)", "ok");
  } catch (err) {
    console.error(err);
    setMsg(authMsg, `สมัครไม่สำเร็จ: ${err.message}`, "err");
  }
});

btnSignOut.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
  }
});

/** =========================
 *  8) Auth state
 *  ========================= */
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;

  if (user) {
    userEmail.textContent = user.email || "Signed in";
    btnSignOut.disabled = false;

    authCard.classList.add("hidden");
    appCard.classList.remove("hidden");

    initYearMonth();
    startListener();
  } else {
    userEmail.textContent = "ยังไม่ได้ล็อกอิน";
    btnSignOut.disabled = true;

    authCard.classList.remove("hidden");
    appCard.classList.add("hidden");

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }
});

/** =========================
 *  9) Month change listener
 *  ========================= */
yearSelect.addEventListener("change", startListener);
monthSelect.addEventListener("change", startListener);
btnAdd.addEventListener("click", handleAdd);

// set default (in case auth already cached)
initYearMonth();

