// CounterKit v1 — Admin / counter page logic
// Sections: live order queue, customer tabs & ledger, menu editor.
// Firebase mode: protected by Firebase Auth (email + password).
// Demo mode: protected by the demo passcode in firebase-config.js
//            (default "counter-admin") — demo only, not real security.
import { businessConfig } from "./firebase-config.js";
import { store, MODE, formatMoney, uid } from "./store.js";

const $ = (sel) => document.querySelector(sel);
const money = (c) => formatMoney(c, businessConfig.currency);

const state = { orders: [], customers: [], menu: [], authed: false };

document.title = `${businessConfig.businessName} — Counter Admin`;
$("#businessName").textContent = `${businessConfig.businessName} — Admin`;
$("#modeBadge").textContent = MODE === "demo" ? "Demo mode — local data only" : "Live (Firebase)";
$("#modeBadge").classList.add(MODE === "demo" ? "demo" : "live");

// ------------------------------------------------------------------- auth
function showAdmin() {
  state.authed = true;
  $("#gate").classList.add("hidden");
  $("#adminApp").classList.remove("hidden");
  startSubscriptions();
}
function showGate() {
  state.authed = false;
  $("#adminApp").classList.add("hidden");
  $("#gate").classList.remove("hidden");
  if (MODE === "demo") {
    $("#firebaseLogin").classList.add("hidden");
    $("#demoLogin").classList.remove("hidden");
  } else {
    $("#demoLogin").classList.add("hidden");
    $("#firebaseLogin").classList.remove("hidden");
  }
}

$("#demoLoginBtn").addEventListener("click", () => {
  const entered = $("#demoPasscode").value;
  if (entered === businessConfig.demoAdminPasscode) {
    sessionStorage.setItem("counterkit_demo_admin", "1");
    showAdmin();
  } else {
    $("#gateError").textContent = "Wrong passcode. In demo mode the default is in firebase-config.js (demoAdminPasscode).";
    $("#gateError").classList.remove("hidden");
  }
});

$("#firebaseLoginBtn").addEventListener("click", async () => {
  $("#gateError").classList.add("hidden");
  try {
    await store.signIn($("#adminEmail").value.trim(), $("#adminPassword").value);
    // onAuth listener calls showAdmin()
  } catch (e) {
    console.error(e);
    $("#gateError").textContent = "Sign-in failed. Check the email/password of the admin user you created in Firebase Authentication.";
    $("#gateError").classList.remove("hidden");
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  if (MODE === "firebase") await store.signOut();
  sessionStorage.removeItem("counterkit_demo_admin");
  showGate();
});

// ------------------------------------------------------------ subscriptions
let started = false;
function startSubscriptions() {
  if (started) return;
  started = true;
  store.subscribeOrders((orders) => { state.orders = orders; renderOrders(); renderStats(); });
  store.subscribeCustomers((customers) => { state.customers = customers; renderCustomers(); renderStats(); });
  store.subscribeMenu((menu) => { state.menu = menu; renderMenuEditor(); });
}

function renderStats() {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const todays = state.orders.filter((o) => o.createdAt >= startOfDay.getTime() && o.status !== "cancelled");
  $("#statOrdersToday").textContent = String(todays.length);
  $("#statRevenueToday").textContent = money(todays.reduce((s, o) => s + o.totalCents, 0));
  $("#statOutstanding").textContent = money(state.customers.reduce((s, c) => s + (c.balanceCents || 0), 0));
  $("#statPending").textContent = String(state.orders.filter((o) => o.status === "pending").length);
}

// ------------------------------------------------------------------ orders
function renderOrders() {
  const wrap = $("#orderQueue");
  wrap.innerHTML = "";
  const queue = state.orders.filter((o) => o.status === "pending");
  const done = state.orders.filter((o) => o.status !== "pending").slice(0, 10);
  if (queue.length === 0) wrap.innerHTML = `<div class="empty">No open orders. 🎉</div>`;
  for (const o of queue) wrap.appendChild(orderCard(o, true));
  if (done.length) {
    const h = document.createElement("h3");
    h.textContent = "Recent history";
    wrap.appendChild(h);
    for (const o of done) wrap.appendChild(orderCard(o, false));
  }
}

function orderCard(order, actionable) {
  const el = document.createElement("div");
  el.className = "order-card";
  const when = new Date(order.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  el.innerHTML = `
    <div class="row-between">
      <strong></strong>
      <span class="badge status-${order.status}">${order.status}</span>
    </div>
    <div class="help"></div>
    <ul></ul>
    <div class="row-between"><span class="money"></span><span class="help"></span></div>
  `;
  el.querySelector("strong").textContent = `${order.customerName} · #${String(order.id).slice(-6).toUpperCase()}`;
  el.querySelector(".help").textContent = `${when}${order.note ? ` · Note: ${order.note}` : ""}`;
  const ul = el.querySelector("ul");
  for (const line of order.items || []) {
    const li = document.createElement("li");
    const addOns = (line.addOns || []).map((a) => a.name).join(", ");
    li.textContent = `${line.qty} × ${line.name}${addOns ? ` (${addOns})` : ""}`;
    ul.appendChild(li);
  }
  el.querySelector(".money").textContent = money(order.totalCents);
  el.querySelectorAll(".help")[1].textContent =
    order.paymentType === "tab" ? "On tab" : order.paymentStatus === "paid" ? "Pay at pickup" : "";

  if (actionable) {
    const actions = document.createElement("div");
    actions.className = "row-between";
    actions.style.marginTop = "10px";
    const fulfill = document.createElement("button");
    fulfill.className = "btn small"; fulfill.textContent = "Mark fulfilled";
    fulfill.addEventListener("click", async () => { fulfill.disabled = true; await store.updateOrderStatus(order.id, "fulfilled"); });
    const cancel = document.createElement("button");
    cancel.className = "btn small secondary"; cancel.textContent = "Cancel";
    cancel.addEventListener("click", async () => {
      if (confirm(`Cancel ${order.customerName}'s order? (Tab balances are NOT automatically refunded — adjust in the Tabs panel if needed.)`)) {
        await store.updateOrderStatus(order.id, "cancelled");
      }
    });
    actions.append(fulfill, cancel);
    el.appendChild(actions);
  }
  return el;
}

// --------------------------------------------------------------- customers
function renderCustomers() {
  const wrap = $("#customerList");
  wrap.innerHTML = "";
  if (state.customers.length === 0) {
    wrap.innerHTML = `<div class="empty">No customers yet. Tabs appear here after the first tab order.</div>`;
    return;
  }
  for (const c of state.customers) wrap.appendChild(customerRow(c));
}

function customerRow(c) {
  const el = document.createElement("div");
  el.className = "customer-row";
  el.innerHTML = `
    <div class="row-between"><strong></strong><span class="money ${c.balanceCents > 0 ? "owed" : ""}"></span></div>
    <div class="help"></div>
    <div class="row-between" style="margin-top:8px;">
      <span>
        <input type="number" min="0" step="0.01" placeholder="Payment $" style="width:120px;display:inline-block;" />
        <button class="btn small">Mark paid</button>
      </span>
      <button class="btn small secondary">History</button>
    </div>
    <div class="tx-list hidden"></div>
  `;
  el.querySelector("strong").textContent = c.displayName;
  el.querySelector(".money").textContent = c.balanceCents > 0 ? `Owes ${money(c.balanceCents)}` : "Settled up";
  el.querySelector(".help").textContent =
    `Lifetime charged ${money(c.lifetimeChargedCents || 0)} · Lifetime paid ${money(c.lifetimePaidCents || 0)}`;

  const input = el.querySelector("input");
  input.value = c.balanceCents > 0 ? (c.balanceCents / 100).toFixed(2) : "";
  const payBtn = el.querySelectorAll("button")[0];
  payBtn.addEventListener("click", async () => {
    const cents = Math.round(parseFloat(input.value || "0") * 100);
    if (!cents || cents <= 0) { alert("Enter a payment amount first."); return; }
    payBtn.disabled = true;
    try {
      await store.recordPayment(c.customerKey, cents, "Payment at counter");
    } catch (e) { alert(e.message); }
    payBtn.disabled = false;
  });

  const histBtn = el.querySelectorAll("button")[1];
  const txEl = el.querySelector(".tx-list");
  histBtn.addEventListener("click", async () => {
    if (!txEl.classList.contains("hidden")) { txEl.classList.add("hidden"); return; }
    const txs = await store.getCustomerTransactions(c.customerKey);
    txEl.innerHTML = txs.length ? "" : "<div>No transactions yet.</div>";
    for (const t of txs) {
      const row = document.createElement("div");
      const d = new Date(t.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
      row.innerHTML = `<span></span><span></span>`;
      row.children[0].textContent = `${d} · ${t.type === "charge" ? "Charge" : "Payment"}${t.note ? ` — ${t.note}` : ""}`;
      row.children[1].textContent = `${t.type === "charge" ? "+" : "−"}${money(t.amountCents)}`;
      txEl.appendChild(row);
    }
    txEl.classList.remove("hidden");
  });
  return el;
}

// ------------------------------------------------------------- menu editor
function renderMenuEditor() {
  const wrap = $("#menuEditorList");
  wrap.innerHTML = "";
  if (state.menu.length === 0) wrap.innerHTML = `<div class="empty">No menu items yet — add your first one below.</div>`;
  for (const item of state.menu) {
    const row = document.createElement("div");
    row.className = "menu-row";
    row.innerHTML = `
      <div class="row-between"><strong></strong><span class="money"></span></div>
      <div class="help"></div>
      <div class="row-between" style="margin-top:6px;">
        <span class="badge">${item.available ? "Available" : "Hidden"}</span>
        <span>
          <button class="btn small secondary" data-act="edit">Edit</button>
          <button class="btn small secondary" data-act="toggle">${item.available ? "Hide" : "Show"}</button>
          <button class="btn small danger" data-act="delete">Delete</button>
        </span>
      </div>`;
    row.querySelector("strong").textContent = item.name;
    row.querySelector(".money").textContent = money(item.priceCents);
    row.querySelector(".help").textContent = `${item.category || "General"}${item.description ? ` · ${item.description}` : ""}${(item.addOns || []).length ? ` · Add-ons: ${item.addOns.map((a) => a.name).join(", ")}` : ""}`;
    row.querySelector('[data-act="edit"]').addEventListener("click", () => fillMenuForm(item));
    row.querySelector('[data-act="toggle"]').addEventListener("click", async () => {
      await store.saveMenuItem({ ...item, available: !item.available });
    });
    row.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      if (confirm(`Delete "${item.name}" from the menu?`)) await store.deleteMenuItem(item.id);
    });
    wrap.appendChild(row);
  }
}

function fillMenuForm(item) {
  $("#menuItemId").value = item.id || "";
  $("#miName").value = item.name || "";
  $("#miPrice").value = item.priceCents != null ? (item.priceCents / 100).toFixed(2) : "";
  $("#miCategory").value = item.category || "";
  $("#miSort").value = item.sortOrder ?? "";
  $("#miDesc").value = item.description || "";
  $("#miAvailable").checked = item.available !== false;
  $("#miAddOns").value = (item.addOns || []).map((a) => `${a.name}:${(a.priceCents / 100).toFixed(2)}`).join(", ");
  $("#menuFormTitle").textContent = item.id ? `Editing: ${item.name}` : "Add a menu item";
  $("#miName").focus();
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}
$("#clearMenuFormBtn").addEventListener("click", () => {
  fillMenuForm({});
  $("#menuItemId").value = "";
  $("#menuFormTitle").textContent = "Add a menu item";
});

$("#menuForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#menuFormError").classList.add("hidden");
  const addOns = $("#miAddOns").value.split(",").map((s) => s.trim()).filter(Boolean).map((pair) => {
    const [name, price] = pair.split(":");
    return { name: (name || "").trim(), priceCents: Math.round(parseFloat(price || "0") * 100) || 0 };
  });
  try {
    await store.saveMenuItem({
      id: $("#menuItemId").value || uid("item"),
      name: $("#miName").value,
      priceCents: Math.round(parseFloat($("#miPrice").value || "0") * 100),
      category: $("#miCategory").value,
      sortOrder: parseInt($("#miSort").value || "0", 10),
      description: $("#miDesc").value,
      available: $("#miAvailable").checked,
      addOns,
    });
    fillMenuForm({}); $("#menuItemId").value = "";
    $("#menuFormTitle").textContent = "Add a menu item";
  } catch (err) {
    $("#menuFormError").textContent = err.message;
    $("#menuFormError").classList.remove("hidden");
  }
});

// --------------------------------------------------------------- demo tools
if (MODE === "demo") {
  $("#demoTools").classList.remove("hidden");
  $("#resetDemoBtn").addEventListener("click", async () => {
    if (confirm("Reset all demo data back to the sample menu, customer and order?")) {
      await store.resetDemo();
    }
  });
}

// --------------------------------------------------------------------- init
(async function init() {
  await store.init();
  if (MODE === "demo") {
    if (sessionStorage.getItem("counterkit_demo_admin") === "1") showAdmin();
    else showGate();
  } else {
    showGate();
    store.onAuth((user) => { if (user) showAdmin(); else showGate(); });
  }
})();
