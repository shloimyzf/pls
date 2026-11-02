// CounterKit v1 — Firebase configuration
// ---------------------------------------------------------------------------
// HOW TO USE (buyer):
// 1. Create a Firebase project at https://console.firebase.google.com
// 2. Add a Web App in Project Settings and copy its config values below.
// 3. Replace every "YOUR_..." value with the real value from your project.
//
// If any value still starts with "YOUR_", CounterKit automatically runs in
// DEMO MODE instead: all data is kept in the browser's localStorage, the
// default menu is seeded, and both the customer page and the admin page work
// end-to-end with no Firebase project at all. Demo mode is for previewing and
// evaluating the kit only — demo data lives in ONE browser and is not shared
// between devices.
//
// See README.md ("15-minute setup") for the full walkthrough.

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Business identity shown on both pages. Change these, redeploy, done.
export const businessConfig = {
  businessName: "My Counter",
  tagline: "Order ahead. Put it on your tab.",
  currency: "USD",
  // Tab policy shown to customers at checkout.
  tabPolicyText:
    "Tabs are settled with the counter. By choosing 'Put it on my tab' you agree your balance will be recorded under your name.",
  // In demo mode the admin page asks for this passcode (change it before any
  // real demo you share). In Firebase mode, real security is Firebase Auth
  // plus firestore.rules — this passcode is NOT used.
  demoAdminPasscode: "counter-admin",
};

export function isFirebaseConfigured(config = firebaseConfig) {
  if (!config || typeof config !== "object") return false;
  return Object.values(config).every(
    (v) => typeof v === "string" && v.length > 0 && !v.startsWith("YOUR_")
  );
}
