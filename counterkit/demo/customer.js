// CounterKit v1 — Customer ordering page logic
import { businessConfig } from "./firebase-config.js";
import { store, MODE, formatMoney, customerKeyFromName, orderTotalCents } from "./store.js";

const $ = (sel) => document.querySelector(sel);

const state = {
  menu: [],
  // cart lines keyed by itemId + sorted add-on names
  cart: new Map(),
  paymentType: "tab",
};

document.title = `${businessConfig.businessName} — Order`;
$("#businessName").textContent = businessConfig.businessName;
$("#tagline").textContent = businessConfig.tagline;
$("#tabPolicy").textContent = businessConfig.tabPolicyText;
$("#modeBadge").textContent = MODE === "demo" ? "Demo mode — local data only" : "Live";
$("#modeBadge").classList.add(MODE === "demo" ? "demo" : "live");
if (MODE === "demo") $("#demoNotice").classList.remove("hidden");

// ---------------------------------------------------------------- menu UI
function renderMenu() {
  const wrap = $("#menuWrap");
  wrap.innerHTML = "";
  const available = state.menu.filter((m) => m.available);
  if (available.length === 0) {
    wrap.innerHTML = `<div class="panel empty">The menu is empty right now. Check back soon.</div>`;
    return;
  }
  const categories = [...new Set(available.map((m) => m.category || "General"))];
  for (const cat of categories) {
    const h = document.createElement("h2");
    h.className = "category-title";
    h.textContent = cat;
    wrap.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "menu-grid";
    for (const item of available.filter((m) => (m.category || "General") === cat)) {
      grid.appendChild(menuCard(item));
    }
    wrap.appendChild(grid);
  }
}

function menuCard(item) {
  const card = document.createElement("article");
  card.className = "menu-card";
  const selectedAddOns = new Set();

  const title = document.createElement("h3");
  title.textContent = item.name;
  const desc = document.createElement("p");
  desc.textContent = item.description || "";
  const price = document.createElement("div");
  price.className = "price";
  price.textContent = formatMoney(item.priceCents, businessConfig.currency);

  card.append(title, desc, price);

  if ((item.addOns || []).length > 0) {
    const row = document.createElement("div");
    row.className = "addon-row";
    for (const addOn of item.addOns) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "addon-chip";
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = addOn.priceCents > 0
        ? `${addOn.name} +${formatMoney(addOn.priceCents, businessConfig.currency)}`
        : addOn.name;
      chip.addEventListener("click", () => {
        if (selectedAddOns.has(addOn.name)) selectedAddOns.delete(addOn.name);
        else selectedAddOns.add(addOn.name);
        chip.setAttribute("aria-pressed", selectedAddOns.has(addOn.name) ? "true" : "false");
      });
      row.appendChild(chip);
    }
    card.appendChild(row);
  }

  const addBtn = document.createElement("button");
  addBtn.className = "btn";
  addBtn.type = "button";
  addBtn.textContent = "Add to order";
  addBtn.addEventListener("click", () => {
    addToCart(item, [...selectedAddOns]);
    selectedAddOns.clear();
    card.querySelectorAll(".addon-chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
  });
  card.appendChild(addBtn);
  return card;
}

// ------------------------------------------------------------------- cart
function addToCart(item, selectedAddOnNames) {
  const addOns = (item.addOns || []).filter((a) => selectedAddOnNames.includes(a.name));
  const key = `${item.id}::${addOns.map((a) => a.name).sort().join("|")}`;
  const existing = state.cart.get(key);
  if (existing) existing.qty += 1;
  else state.cart.set(key, { itemId: item.id, name: item.name, priceCents: item.priceCents, qty: 1, addOns });
  renderCart();
}

function renderCart() {
  const linesEl = $("#cartLines");
  linesEl.innerHTML = "";
  const lines = [...state.cart.values()];
  $("#emptyCart").classList.toggle("hidden", lines.length > 0);

  for (const [key, line] of state.cart.entries()) {
    const row = document.createElement("div");
    row.className = "cart-line";
    const grow = document.createElement("div");
    grow.className = "grow";
    const nameEl = document.createElement("div");
    nameEl.innerHTML = `<strong></strong>`;
    nameEl.querySelector("strong").textContent = line.name;
    grow.appendChild(nameEl);
    if (line.addOns.length) {
      const a = document.createElement("div");
      a.className = "addons";
      a.textContent = line.addOns.map((x) => x.priceCents > 0 ? `${x.name} (+${formatMoney(x.priceCents, businessConfig.currency)})` : x.name).join(", ");
      grow.appendChild(a);
    }
    const unit = document.createElement("div");
    unit.className = "addons";
    unit.textContent = `${formatMoney(line.priceCents + line.addOns.reduce((s, a) => s + a.priceCents, 0), businessConfig.currency)} each`;
    grow.appendChild(unit);

    const qty = document.createElement("div");
    qty.className = "qty";
    const minus = document.createElement("button");
    minus.type = "button"; minus.textContent = "−"; minus.setAttribute("aria-label", "Decrease quantity");
    minus.addEventListener("click", () => {
      line.qty -= 1;
      if (line.qty <= 0) state.cart.delete(key);
      renderCart();
    });
    const count = document.createElement("span");
    count.textContent = String(line.qty);
    const plus = document.createElement("button");
    plus.type = "button"; plus.textContent = "+"; plus.setAttribute("aria-label", "Increase quantity");
    plus.addEventListener("click", () => { line.qty += 1; renderCart(); });
    qty.append(minus, count, plus);

    const lineTotal = document.createElement("div");
    lineTotal.className = "money";
    lineTotal.textContent = formatMoney((line.priceCents + line.addOns.reduce((s, a) => s + a.priceCents, 0)) * line.qty, businessConfig.currency);

    row.append(grow, qty, lineTotal);
    linesEl.appendChild(row);
  }
  const total = orderTotalCents(lines);
  $("#cartTotal").textContent = formatMoney(total, businessConfig.currency);
  $("#placeOrderBtn").disabled = lines.length === 0;
}

// --------------------------------------------------------------- checkout
function selectPayment(type) {
  state.paymentType = type;
  document.querySelectorAll(".radio-card").forEach((c) => {
    c.classList.toggle("selected", c.dataset.payment === type);
  });
  $("#tabPolicyWrap").classList.toggle("hidden", type !== "tab");
}
document.querySelectorAll(".radio-card").forEach((card) => {
  card.addEventListener("click", () => selectPayment(card.dataset.payment));
});

function showError(msg) {
  const el = $("#checkoutError");
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}

async function placeOrder() {
  showError("");
  const name = $("#customerName").value.trim();
  const note = $("#orderNote").value.trim();
  const lines = [...state.cart.values()];
  if (!name) { showError("Please enter your name so the counter knows whose order this is."); return; }
  if (lines.length === 0) { showError("Your order is empty — add something from the menu first."); return; }

  const btn = $("#placeOrderBtn");
  btn.disabled = true;
  btn.textContent = "Placing order…";
  try {
    const order = {
      customerName: name,
      customerKey: customerKeyFromName(name),
      note,
      items: lines.map((l) => ({ itemId: l.itemId, name: l.name, priceCents: l.priceCents, qty: l.qty, addOns: l.addOns })),
      totalCents: orderTotalCents(lines),
      paymentType: state.paymentType,
      paymentStatus: state.paymentType === "tab" ? "on-tab" : "paid",
      status: "pending",
    };
    const orderId = await store.createOrder(order);
    showConfirmation(orderId, order);
    state.cart.clear();
    renderCart();
  } catch (err) {
    console.error(err);
    showError("Something went wrong placing your order. Please try again, or order at the counter.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Place order";
  }
}
$("#placeOrderBtn").addEventListener("click", placeOrder);

function showConfirmation(orderId, order) {
  $("#shopView").classList.add("hidden");
  const view = $("#confirmationView");
  view.classList.remove("hidden");
  $("#confirmOrderNo").textContent = `#${String(orderId).slice(-6).toUpperCase()}`;
  $("#confirmName").textContent = order.customerName;
  $("#confirmTotal").textContent = formatMoney(order.totalCents, businessConfig.currency);
  $("#confirmPayment").textContent = order.paymentType === "tab"
    ? "It's on your tab now — settle at the counter."
    : "Pay at the counter when you pick up.";
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("#newOrderBtn").addEventListener("click", () => {
  $("#confirmationView").classList.add("hidden");
  $("#shopView").classList.remove("hidden");
  $("#customerName").value = "";
  $("#orderNote").value = "";
});

// ------------------------------------------------------------------- init
(async function init() {
  await store.init();
  if (MODE === "firebase" && typeof store.seedMenuIfEmpty === "function") {
    // First run on a fresh Firebase project: seed the sample menu so the
    // buyer sees a working store immediately, then edits it in Admin.
    try { await store.seedMenuIfEmpty(); } catch (e) { console.warn("Menu seed skipped:", e); }
  }
  store.subscribeMenu((menu) => { state.menu = menu; renderMenu(); });
  selectPayment("tab");
  renderCart();
})();
