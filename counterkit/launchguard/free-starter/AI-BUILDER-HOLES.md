# The 12 Holes in (Almost) Every AI-Built Firebase App

AI builders — AI Studio, Bolt, Lovable, Cursor, v0, Replit agents — optimise for one thing: *the demo works*. Every hole below exists because closing it would have made the generated code fail once during generation, and the model chose "works now" over "safe later". They are not exotic. They are the same twelve, in roughly the order attackers find them.

For each: **the hole → how it's exploited → the fix (kit file)**.

---

### 1. Open rules: `allow read, write: if true`

**Hole:** The scaffold's rules grant the world full access; test-mode rules (`request.time < timestamp.date(...)`) are the same hole with a 30-day fuse.
**Exploit:** Firebase config is public by design. A scanner pastes it into a script, lists every collection, downloads or deletes everything. Automated scanners find new open databases in days.
**Fix:** Deploy an archetype from `rules/` today; if you can't map your app yet, deploy `rules/deny-all-starter.rules` and migrate per its footer. Verify with `checklists/LAUNCH-CHECKLIST.md` §1.

### 2. "Signed in" treated as "authorised": `if request.auth != null`

**Hole:** Rules check *that* a user exists, not *whose* data they touch. Any account reads/edits any document by ID.
**Exploit:** Attacker creates a free account, then iterates document IDs (or lists the collection) and reads/overwrites other users' data with their own legitimate token.
**Fix:** Ownership + role checks on every block — `isOwner()`, `isWorkspaceMember()`, `hasRole()` in all `rules/` archetypes. Audit Q4–Q5 in `checklists/SECURITY-AUDIT.md`.

### 3. Roles stored in Firestore documents

**Hole:** `users/{id}` contains `role: "user"`, and rules (or worse, only the UI) trust it. The user doc is user-writable — that's its job.
**Exploit:** One console write: `updateDoc(userRef, { role: "admin" })`. Instant self-promotion; every admin-gated rule falls.
**Fix:** Roles in **custom claims**, set only via Admin SDK — `guides/CUSTOM-CLAIMS.md` + `guides/set-custom-claims.js`. Remove role/plan fields from every client write allowlist (`rules/` `isValidCreate` blocks).

### 4. No field validation: clients write any field, any size

**Hole:** Rules (if any) check identity but not payload. Clients can add `credits: 999999`, `plan: "enterprise"`, a 10 MB string, or negative quantities.
**Exploit:** Whatever your app later *trusts* — balance, entitlement, quota fields — the attacker sets directly. Oversized docs also run up read/billing costs for everyone who loads them.
**Fix:** Field allowlists + type/size caps on every create/update — `isValidCreate`, `onlyUpdatesFields`, `isBoundedString` in `rules/` (all archetypes).

### 5. Client-set timestamps and IDs

**Hole:** `createdAt` taken from the client clock; ownership fields (`ownerId`, `authorId`, `customerId`) taken from the request body.
**Exploit:** Backdated content wins "earliest/first" logic and pollutes ordering; a forged `authorId` frames another user or plants content in their account; mismatched `customerId` reads orders across accounts where any rule trusts the field.
**Fix:** Require `field == request.auth.uid` for ownership fields and `field == request.time` for timestamps — see `isServerTime` usage throughout `rules/`.

### 6. Public/private data in the same document

**Hole:** One `users` doc holds display name *and* email, phone, address, Stripe ID. The app needs profiles public, so the doc becomes public.
**Exploit:** The "public profiles" endpoint/collection becomes a full PII dump — the most common Firebase breach headline.
**Fix:** Split collections: public profile doc (name/handle/avatar only) + private owner-only doc — `rules/public-content.rules` profiles block; `rules/saas-user-owned.rules` `/users` block. Audit Q29.

### 7. Client-declared payment success

**Hole:** Checkout flow: client pays (or doesn't), then writes `orders/{id}.status = "paid"` itself — or the "webhook" is a client callable with no signature check.
**Exploit:** Skip the payment step, write `paid` from the console, receive goods. Variant: set `status: "refunded"` after delivery and keep both.
**Fix:** Orders are born `pending`; `paid`/`refunded` are **Admin-SDK-only** transitions after server-side verification (and PSP signature checks) — `rules/ecommerce-orders.rules`. Audit Q15–Q19.

### 8. Client-supplied prices and totals

**Hole:** Cart/order docs carry `price`/`total` written by the client; the backend charges or fulfils against them as-is.
**Exploit:** Edit the total to $0.01 before checkout. If the PSP charges the doc's total, the shop honours it.
**Fix:** No price in the cart; server **recomputes** totals from `/products` at checkout — `rules/ecommerce-orders.rules` cart + orders blocks. Audit Q17–Q18 (integer cents, always).

### 9. No App Check — your API is everyone's API

**Hole:** Without App Check, anything with your (public) config can call Firestore/Auth from scripts, emulators, and bot farms — rules permitting or probing at scale.
**Exploit:** Credential-stuffing against Auth, quota/billing exhaustion via mass reads on public collections, scraping at machine speed.
**Fix:** Register + **enforce** App Check (monitor first) — `guides/APP-CHECK.md`. Rules are still required; App Check is the bouncer, rules are the locks.

### 10. Secrets and service accounts in the client (or the repo)

**Hole:** The AI puts an Admin SDK key, Stripe secret, or "server config" in the web bundle or commits it — because the generated code needed it *somewhere* and the client is where code lives.
**Exploit:** One view-source or GitHub search yields a service-account key = **total database control, bypassing all rules**. This is the worst hole on the list per minute of attacker effort.
**Fix:** Grep for it now (`checklists/SECURITY-AUDIT.md` Q27); move privileged work to Cloud Functions/a server with secrets in a manager; if a key ever shipped, **rotate it** — deleting the file does not un-leak it. `checklists/LAUNCH-CHECKLIST.md` §4.

### 11. Storage left wide open

**Hole:** Firestore gets attention; Storage rules stay at scaffold defaults (`allow read, write: if true` in test mode) — uploads, avatars, documents, backups.
**Exploit:** Free anonymous file hosting on your bucket (spam/malware distribution billed to you), or a full listing of users' private files.
**Fix:** Per-user Storage paths with owner checks + size/type limits — `checklists/LAUNCH-CHECKLIST.md` §9.

### 12. No backups, no budget alerts, no monitoring

**Hole:** The generated app ships with PITR off, no scheduled exports, no billing alerts, no error reporting — because none of that appears in a demo.
**Exploit:** Not an attack, an *outcome*: the first incident (holes 1–11, or your own bad deploy) becomes unrecoverable data loss or a four-figure surprise bill discovered weeks later.
**Fix:** `guides/BACKUPS.md` (PITR + scheduled exports + a rehearsed restore) and `checklists/LAUNCH-CHECKLIST.md` §§7–8 (budgets, kill-switch, monitoring).

---

## The pattern behind all twelve

Every hole is the same decision: **the client was trusted with something only a server may decide** — who you are, what you may touch, what a thing costs, whether money moved, what fields exist. LaunchGuard's whole method is moving each of those decisions behind rules, claims, and the Admin SDK. Run the audit (`checklists/SECURITY-AUDIT.md`), and when you find a thirteenth hole in your own app, ask the one question that found the other twelve: *"What is my client currently trusted to declare — and why do I believe it?"*
