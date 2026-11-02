// CounterKit v1 — Data layer
// ---------------------------------------------------------------------------
// One API, two backends:
//  * FIREBASE MODE  — when firebase-config.js contains a real config, data is
//                     stored in Cloud Firestore and shared live across devices.
//  * DEMO MODE      — otherwise, data is stored in localStorage and seeded
//                     with a sample menu, sample customers and sample orders
//                     so the whole kit can be previewed instantly.
//
// DATA MODEL (Firestore collections — mirrored 1:1 in demo mode):
//  menuItems/{itemId}
//    { name, description, category, priceCents, available, sortOrder,
//      addOns: [{ name, priceCents }], createdAt, updatedAt }
//  orders/{orderId}
//    { customerName, customerKey, note,
//      items: [{ itemId, name, priceCents, qty, addOns: [{name, priceCents}] }],
//      totalCents, paymentType: "tab" | "now",
//      paymentStatus: "on-tab" | "paid",
//      status: "pending" | "fulfilled" | "cancelled",
//      createdAt, fulfilledAt }
//  customers/{customerKey}            (customerKey = normalized name)
//    { displayName, balanceCents, lifetimeChargedCents, lifetimePaidCents,
//      createdAt, updatedAt }
//  customers/{customerKey}/transactions/{txId}
//    { type: "charge" | "payment", amountCents, orderId, note, createdAt }
//
// All money is integer cents. Never floats. Format with formatMoney().

import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

export const MODE = isFirebaseConfigured() ? "firebase" : "demo";

// ---------------------------------------------------------------- utilities
export function formatMoney(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((Number(cents) || 0) / 100);
}

export function customerKeyFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function uid(prefix = "id") {
  if (globalThis.crypto && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function orderTotalCents(items) {
  return (items || []).reduce((sum, line) => {
    const addOns = (line.addOns || []).reduce((s, a) => s + (Number(a.priceCents) || 0), 0);
    return sum + ((Number(line.priceCents) || 0) + addOns) * (Number(line.qty) || 0);
  }, 0);
}

// ------------------------------------------------------------ default menu
export const DEFAULT_MENU = [
  { id: "iced-coffee", name: "Iced Coffee", description: "Cold, strong, ready fast.", category: "Drinks", priceCents: 400, available: true, sortOrder: 10, addOns: [{ name: "Oat Milk", priceCents: 100 }, { name: "Classic Syrup", priceCents: 0 }, { name: "Extra Shot", priceCents: 100 }] },
  { id: "latte", name: "Latte", description: "Espresso and steamed milk.", category: "Drinks", priceCents: 500, available: true, sortOrder: 20, addOns: [{ name: "Oat Milk", priceCents: 100 }, { name: "Vanilla", priceCents: 50 }] },
  { id: "cappuccino", name: "Cappuccino", description: "Foamy and hot.", category: "Drinks", priceCents: 500, available: true, sortOrder: 30, addOns: [{ name: "Oat Milk", priceCents: 100 }] },
  { id: "hot-tea", name: "Hot Tea", description: "Selection at the counter.", category: "Drinks", priceCents: 300, available: true, sortOrder: 40, addOns: [] },
  { id: "muffin", name: "Muffin", description: "Baked fresh — flavour of the day.", category: "Snacks", priceCents: 350, available: true, sortOrder: 50, addOns: [] },
  { id: "cookie", name: "Cookie", description: "Big, soft, and hard to share.", category: "Snacks", priceCents: 250, available: true, sortOrder: 60, addOns: [] },
  { id: "bagel-cream-cheese", name: "Bagel + Cream Cheese", description: "Toasted to order.", category: "Snacks", priceCents: 450, available: true, sortOrder: 70, addOns: [{ name: "Extra Cream Cheese", priceCents: 75 }] },
];

// ============================================================ DEMO BACKEND
const LS_KEYS = {
  menu: "counterkit_v1_menu",
  orders: "counterkit_v1_orders",
  customers: "counterkit_v1_customers",
  seeded: "counterkit_v1_seeded",
};

function lsRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function lsWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function seedDemo() {
  if (localStorage.getItem(LS_KEYS.seeded)) return;
  const now = Date.now();
  lsWrite(LS_KEYS.menu, DEFAULT_MENU.map((m) => ({ ...m, createdAt: now, updatedAt: now })));
  const customers = {
    "sample sam": {
      customerKey: "sample sam", displayName: "Sample Sam",
      balanceCents: 900, lifetimeChargedCents: 1400, lifetimePaidCents: 500,
      createdAt: now - 86400000, updatedAt: now - 3600000,
      transactions: [
        { id: uid("tx"), type: "charge", amountCents: 1400, orderId: null, note: "Sample history", createdAt: now - 86400000 },
        { id: uid("tx"), type: "payment", amountCents: 500, orderId: null, note: "Cash payment (sample)", createdAt: now - 3600000 },
      ],
    },
  };
  lsWrite(LS_KEYS.customers, customers);
  lsWrite(LS_KEYS.orders, [
    {
      id: "DEMO-1001", customerName: "Sample Sam", customerKey: "sample sam", note: "",
      items: [{ itemId: "latte", name: "Latte", priceCents: 500, qty: 1, addOns: [{ name: "Oat Milk", priceCents: 100 }] }],
      totalCents: 600, paymentType: "tab", paymentStatus: "on-tab",
      status: "pending", createdAt: now - 1200000, fulfilledAt: null,
    },
  ]);
  localStorage.setItem(LS_KEYS.seeded, "1");
}

// A tiny event bus so demo subscribers get "live" updates in the same tab,
// and a storage listener so updates propagate across tabs of one browser.
const demoListeners = new Set();
function demoEmit() {
  demoListeners.forEach((fn) => { try { fn(); } catch { /* listener error */ } });
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (Object.values(LS_KEYS).includes(e.key)) demoEmit();
  });
}

const demoStore = {
  mode: "demo",
  async init() { seedDemo(); },

  subscribeMenu(cb) {
    const emit = () => cb([...lsRead(LS_KEYS.menu, [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    demoListeners.add(emit); emit();
    return () => demoListeners.delete(emit);
  },
  async saveMenuItem(item) {
    const menu = lsRead(LS_KEYS.menu, []);
    const now = Date.now();
    const clean = sanitizeMenuItem(item);
    const idx = menu.findIndex((m) => m.id === clean.id);
    if (idx >= 0) menu[idx] = { ...menu[idx], ...clean, updatedAt: now };
    else menu.push({ ...clean, createdAt: now, updatedAt: now });
    lsWrite(LS_KEYS.menu, menu); demoEmit();
    return clean.id;
  },
  async deleteMenuItem(id) {
    lsWrite(LS_KEYS.menu, lsRead(LS_KEYS.menu, []).filter((m) => m.id !== id));
    demoEmit();
  },

  subscribeOrders(cb) {
    const emit = () => cb([...lsRead(LS_KEYS.orders, [])].sort((a, b) => b.createdAt - a.createdAt));
    demoListeners.add(emit); emit();
    return () => demoListeners.delete(emit);
  },
  async createOrder(order) {
    const orders = lsRead(LS_KEYS.orders, []);
    const customers = lsRead(LS_KEYS.customers, {});
    const id = order.id || uid("ord").slice(4, 12).toUpperCase();
    const full = { ...order, id, createdAt: Date.now(), fulfilledAt: null };
    orders.push(full);
    if (order.paymentType === "tab") {
      const key = order.customerKey;
      const c = customers[key] || {
        customerKey: key, displayName: order.customerName, balanceCents: 0,
        lifetimeChargedCents: 0, lifetimePaidCents: 0, createdAt: Date.now(), transactions: [],
      };
      c.balanceCents += order.totalCents;
      c.lifetimeChargedCents += order.totalCents;
      c.displayName = order.customerName;
      c.updatedAt = Date.now();
      c.transactions = c.transactions || [];
      c.transactions.push({ id: uid("tx"), type: "charge", amountCents: order.totalCents, orderId: id, note: "Tab order", createdAt: Date.now() });
      customers[key] = c;
      lsWrite(LS_KEYS.customers, customers);
    }
    lsWrite(LS_KEYS.orders, orders); demoEmit();
    return id;
  },
  async updateOrderStatus(id, status) {
    const orders = lsRead(LS_KEYS.orders, []);
    const o = orders.find((x) => x.id === id);
    if (!o) throw new Error("Order not found");
    o.status = status;
    if (status === "fulfilled") o.fulfilledAt = Date.now();
    lsWrite(LS_KEYS.orders, orders); demoEmit();
  },

  subscribeCustomers(cb) {
    const emit = () => {
      const map = lsRead(LS_KEYS.customers, {});
      cb(Object.values(map).sort((a, b) => a.displayName.localeCompare(b.displayName)));
    };
    demoListeners.add(emit); emit();
    return () => demoListeners.delete(emit);
  },
  async getCustomerTransactions(customerKey) {
    const c = lsRead(LS_KEYS.customers, {})[customerKey];
    return [...((c && c.transactions) || [])].sort((a, b) => b.createdAt - a.createdAt);
  },
  async recordPayment(customerKey, amountCents, note = "Payment") {
    const customers = lsRead(LS_KEYS.customers, {});
    const c = customers[customerKey];
    if (!c) throw new Error("Customer not found");
    const amount = Math.max(0, Math.min(Number(amountCents) || 0, c.balanceCents));
    if (amount <= 0) throw new Error("Enter an amount greater than zero.");
    c.balanceCents -= amount;
    c.lifetimePaidCents += amount;
    c.updatedAt = Date.now();
    c.transactions = c.transactions || [];
    c.transactions.push({ id: uid("tx"), type: "payment", amountCents: amount, orderId: null, note, createdAt: Date.now() });
    // Orders stay historically "on-tab"; settlement is tracked on the ledger.
    customers[customerKey] = c;
    lsWrite(LS_KEYS.customers, customers); demoEmit();
    return amount;
  },
  async resetDemo() {
    Object.values(LS_KEYS).forEach((k) => localStorage.removeItem(k));
    seedDemo(); demoEmit();
  },
};

// ========================================================= FIREBASE BACKEND
let fb = null; // lazily loaded SDK handles

async function loadFirebase() {
  if (fb) return fb;
  const base = "https://www.gstatic.com/firebasejs/10.12.2";
  const [appMod, fsMod, authMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
    import(`${base}/firebase-auth.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  fb = {
    app,
    db: fsMod.getFirestore(app),
    auth: authMod.getAuth(app),
    fs: fsMod,
    authApi: authMod,
  };
  return fb;
}

function tsToMs(v) {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  return Date.now();
}
function docToObj(snap) {
  const d = snap.data() || {};
  return {
    ...d,
    id: snap.id,
    createdAt: tsToMs(d.createdAt),
    updatedAt: d.updatedAt ? tsToMs(d.updatedAt) : undefined,
    fulfilledAt: d.fulfilledAt ? tsToMs(d.fulfilledAt) : null,
  };
}

const firebaseStore = {
  mode: "firebase",
  async init() { await loadFirebase(); },

  subscribeMenu(cb) {
    let unsub = () => {};
    let cancelled = false;
    loadFirebase().then(({ db, fs }) => {
      if (cancelled) return;
      const q = fs.query(fs.collection(db, "menuItems"), fs.orderBy("sortOrder", "asc"));
      unsub = fs.onSnapshot(q, (snap) => cb(snap.docs.map(docToObj)), (err) => console.error(err));
    });
    return () => { cancelled = true; unsub(); };
  },
  async saveMenuItem(item) {
    const { db, fs } = await loadFirebase();
    const clean = sanitizeMenuItem(item);
    const ref = fs.doc(db, "menuItems", clean.id);
    await fs.setDoc(ref, { ...clean, updatedAt: fs.serverTimestamp() }, { merge: true });
    return clean.id;
  },
  async deleteMenuItem(id) {
    const { db, fs } = await loadFirebase();
    await fs.deleteDoc(fs.doc(db, "menuItems", id));
  },
  async seedMenuIfEmpty() {
    const { db, fs } = await loadFirebase();
    const snap = await fs.getDocs(fs.collection(db, "menuItems"));
    if (!snap.empty) return false;
    for (const item of DEFAULT_MENU) await this.saveMenuItem(item);
    return true;
  },

  subscribeOrders(cb) {
    let unsub = () => {};
    let cancelled = false;
    loadFirebase().then(({ db, fs }) => {
      if (cancelled) return;
      const q = fs.query(fs.collection(db, "orders"), fs.orderBy("createdAt", "desc"), fs.limit(200));
      unsub = fs.onSnapshot(q, (snap) => cb(snap.docs.map(docToObj)), (err) => console.error(err));
    });
    return () => { cancelled = true; unsub(); };
  },
  async createOrder(order) {
    const { db, fs } = await loadFirebase();
    const ref = fs.doc(fs.collection(db, "orders"));
    const payload = {
      ...order,
      status: "pending",
      paymentStatus: order.paymentType === "tab" ? "on-tab" : "paid",
      createdAt: fs.serverTimestamp(),
      fulfilledAt: null,
    };
    if (order.paymentType === "tab") {
      const custRef = fs.doc(db, "customers", order.customerKey);
      await fs.runTransaction(db, async (tx) => {
        const snap = await tx.get(custRef);
        const cur = snap.exists() ? snap.data() : {
          displayName: order.customerName, balanceCents: 0,
          lifetimeChargedCents: 0, lifetimePaidCents: 0, createdAt: fs.serverTimestamp(),
        };
        tx.set(ref, payload);
        tx.set(custRef, {
          ...cur,
          displayName: order.customerName,
          balanceCents: (cur.balanceCents || 0) + order.totalCents,
          lifetimeChargedCents: (cur.lifetimeChargedCents || 0) + order.totalCents,
          updatedAt: fs.serverTimestamp(),
        }, { merge: true });
        const txRef = fs.doc(fs.collection(db, "customers", order.customerKey, "transactions"));
        tx.set(txRef, { type: "charge", amountCents: order.totalCents, orderId: ref.id, note: "Tab order", createdAt: fs.serverTimestamp() });
      });
    } else {
      await fs.setDoc(ref, payload);
    }
    return ref.id;
  },
  async updateOrderStatus(id, status) {
    const { db, fs } = await loadFirebase();
    const patch = { status };
    if (status === "fulfilled") patch.fulfilledAt = fs.serverTimestamp();
    await fs.updateDoc(fs.doc(db, "orders", id), patch);
  },

  subscribeCustomers(cb) {
    let unsub = () => {};
    let cancelled = false;
    loadFirebase().then(({ db, fs }) => {
      if (cancelled) return;
      const q = fs.query(fs.collection(db, "customers"), fs.orderBy("displayName", "asc"));
      unsub = fs.onSnapshot(q, (snap) => cb(snap.docs.map((s) => ({ customerKey: s.id, ...docToObj(s) }))), (err) => console.error(err));
    });
    return () => { cancelled = true; unsub(); };
  },
  async getCustomerTransactions(customerKey) {
    const { db, fs } = await loadFirebase();
    const q = fs.query(
      fs.collection(db, "customers", customerKey, "transactions"),
      fs.orderBy("createdAt", "desc"), fs.limit(100)
    );
    const snap = await fs.getDocs(q);
    return snap.docs.map(docToObj);
  },
  async recordPayment(customerKey, amountCents, note = "Payment") {
    const { db, fs } = await loadFirebase();
    const custRef = fs.doc(db, "customers", customerKey);
    let applied = 0;
    await fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(custRef);
      if (!snap.exists()) throw new Error("Customer not found");
      const cur = snap.data();
      applied = Math.max(0, Math.min(Number(amountCents) || 0, cur.balanceCents || 0));
      if (applied <= 0) throw new Error("Enter an amount greater than zero.");
      tx.update(custRef, {
        balanceCents: (cur.balanceCents || 0) - applied,
        lifetimePaidCents: (cur.lifetimePaidCents || 0) + applied,
        updatedAt: fs.serverTimestamp(),
      });
      const txRef = fs.doc(fs.collection(db, "customers", customerKey, "transactions"));
      tx.set(txRef, { type: "payment", amountCents: applied, orderId: null, note, createdAt: fs.serverTimestamp() });
    });
    return applied;
  },

  // ---- Admin auth (Firebase mode): used by admin.js
  async signIn(email, password) {
    const { auth, authApi } = await loadFirebase();
    const cred = await authApi.signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },
  async signOut() {
    const { auth, authApi } = await loadFirebase();
    await authApi.signOut(auth);
  },
  onAuth(cb) {
    let unsub = () => {};
    let cancelled = false;
    loadFirebase().then(({ auth, authApi }) => {
      if (cancelled) return;
      unsub = authApi.onAuthStateChanged(auth, cb);
    });
    return () => { cancelled = true; unsub(); };
  },
};

// ------------------------------------------------------------- validation
export function sanitizeMenuItem(item) {
  const name = String(item.name || "").trim();
  if (!name) throw new Error("Menu item needs a name.");
  const priceCents = Math.round(Number(item.priceCents));
  if (!Number.isFinite(priceCents) || priceCents < 0) throw new Error("Price must be zero or more.");
  const addOns = (item.addOns || [])
    .filter((a) => a && String(a.name || "").trim())
    .map((a) => ({ name: String(a.name).trim(), priceCents: Math.max(0, Math.round(Number(a.priceCents) || 0)) }));
  return {
    id: item.id ? String(item.id) : uid("item"),
    name,
    description: String(item.description || "").trim(),
    category: String(item.category || "General").trim() || "General",
    priceCents,
    available: item.available !== false,
    sortOrder: Number(item.sortOrder) || 0,
    addOns,
  };
}

export const store = MODE === "firebase" ? firebaseStore : demoStore;
