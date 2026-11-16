# LaunchGuard — Pre-Launch Checklist (Firebase)

Work top to bottom. Every item is a checkbox, an exact console path, and the reason it matters. Budget: 60–90 minutes if your rules are already deployed from `rules/`. Items marked 🔴 are launch blockers — do not ship with one unchecked.

---

## 1. Firestore security rules 🔴

- [ ] 🔴 **No open rules anywhere.** Console → Firestore Database → Rules. Search the deployed rules for `if true` and `request.time <` — zero hits. (Test-mode expiry rules count as open until they expire, then they count as an outage.)
- [ ] 🔴 **Catch-all deny is the last block:** `match /{document=**} { allow read, write: if false; }`
- [ ] 🔴 **Rules tests pass** against the emulator (`testing/RUN.md`) and cover, per sensitive collection: owner can, stranger can't, signed-out can't, forbidden-field write can't.
- [ ] **Rules are in source control** (`firestore.rules` in your repo) and deployed with `firebase deploy --only firestore:rules` — not hand-edited in the console, where they can drift with no history.
- [ ] **Rules Playground spot-check:** Console → Firestore → Rules → Rules Playground. Run one unauthenticated read against a private collection → expect **denied**. Run one owner-read simulation → expect **allowed**.
- [ ] **No rule depends on a client-writable field for authorization** (e.g. `resource.data.role`, a `users/{id}.isAdmin` flag the user can edit). Roles come from custom claims — see `guides/CUSTOM-CLAIMS.md`.

## 2. App Check 🔴 (for public/web & mobile launches)

Full setup: `guides/APP-CHECK.md`. Order matters — monitor first, enforce after real traffic is attested.

- [ ] 🔴 **App Check registered** for every platform you ship: web (reCAPTCHA v3 or Enterprise), Android (Play Integrity), iOS (App Attest).
- [ ] **Debug tokens** created for local dev/CI only — and never committed to the repo.
- [ ] **Monitor mode observed** for at least a few days of real traffic; unverified-request share understood (old app versions? bots?).
- [ ] 🔴 **Enforcement ON** for Firestore (then Realtime Database / Storage / Functions as you use them): Console → App Check → APIs → Enforce.
- [ ] **No API key restrictions bypass:** App Check is not a substitute for rules — both layers on.

## 3. Authentication settings

- [ ] 🔴 **Only the sign-in providers you actually use are enabled.** Console → Authentication → Sign-in method. Every enabled provider is attack surface; AI scaffolds often enable everything.
- [ ] 🔴 **Anonymous auth disabled** unless your product deliberately uses anonymous-then-upgrade. Anonymous + `request.auth != null` rules = open database with extra steps.
- [ ] **Email enumeration protection enabled** (Console → Authentication → Settings) so attackers can't probe which emails have accounts.
- [ ] **Password policy set** (minimum length / complexity) if you use email+password; **authorized domains** pruned to your real domains only (remove leftover `localhost` is fine to keep for dev — remove staging domains you no longer control).
- [ ] **Account actions locked down:** decide whether users can change email/password without re-authentication in your UI; require recent login for sensitive changes.
- [ ] **Custom claims, not client docs, carry roles**, and the account that can set claims (Admin SDK service account) exists only on your server — see `guides/set-custom-claims.js`.
- [ ] **Multi-factor / blocking functions** considered if you handle payments or sensitive data (Identity Platform, Blaze plan).

## 4. API keys & config

- [ ] **Web API key restricted** in Google Cloud Console → APIs & Services → Credentials: application restrictions (HTTP referrers = your domains) and API restrictions (only the APIs your app uses). The Firebase config being public is normal; an *unrestricted key* is the problem (quota theft, billing abuse).
- [ ] **No service-account JSON, Admin SDK key, or secret anywhere in the client bundle or public repo.** Grep to prove it: `grep -R "private_key\|serviceAccount\|BEGIN PRIVATE" .` → zero hits outside your server/secrets store.
- [ ] **Separate Firebase projects for dev / staging / production.** Never point a test build at the production database. (AI tools love hard-coding the one project they were given.)

## 5. Backups & recovery 🔴

Full setup: `guides/BACKUPS.md`.

- [ ] 🔴 **Point-in-Time Recovery (PITR) enabled** on the production database (7-day continuous recovery window) — Console → Firestore → Backups / Disaster recovery. Rules stop attackers; PITR saves you from the ones who got in before the rules, and from your own bad deploy.
- [ ] 🔴 **Scheduled exports running** (daily export to a Cloud Storage bucket, 30-day retention minimum) and **one restore actually rehearsed** into a scratch project. An untested backup is a hope, not a backup.
- [ ] **Bucket locked down:** the export bucket is in the same/controlled project, not public, with lifecycle rules so old exports expire instead of accumulating cost.

## 6. Indexes & query health

- [ ] **Composite indexes deployed from `firestore.indexes.json`**, not clicked into existence one error at a time. Console → Firestore → Indexes shows zero "building" stragglers on launch day.
- [ ] **Every list query in the app matches its rules** (queries carry the filters the rules require — e.g. `where('customerId','==',uid)`). A rule/query mismatch shows up as "works in dev, PERMISSION_DENIED in prod".
- [ ] **No unbounded collection scans** in client code (`get()` on a whole collection with no limit). Add `limit()` everywhere a feed/list loads.

## 7. Quotas, budgets & alerts 🔴

- [ ] 🔴 **Billing account budget + alerts set** (Google Cloud Console → Billing → Budgets & alerts): alerts at 50% / 90% / 100% of a monthly budget you choose, emailed to an address you actually read. Firestore abuse usually announces itself as a bill.
- [ ] 🔴 **Blaze-plan awareness:** if you're on Blaze, there is no hard spend cap by default — set a **billing kill-switch** (budget → Pub/Sub → Cloud Function that disables billing) or accept the risk knowingly. Instructions: cloud.google.com/billing/docs/how-to/notify (Programmatic budget notifications).
- [ ] **Firebase usage alerts** reviewed: Console → Project settings / Usage and billing. Know your Spark/Blaze limits for reads/writes/auth MAUs before launch traffic finds them for you.
- [ ] **Rate/abuse tripwires:** App Check enforced (§2) + rules size caps (`isBoundedString`, item-count caps in `rules/`) are your first line; a sudden read spike alert via Cloud Monitoring is the second.

## 8. Error monitoring & logging

- [ ] **Crashlytics** (mobile) and/or **Sentry** (web) wired into the production build, with a test crash verified in the dashboard. Launch day without error visibility is flying blind.
- [ ] **Structured logging for backend flows** (Cloud Functions / server): payment transitions, claim grants, admin actions — logged with actor + target + timestamp. If an order says `refunded`, you must be able to answer "by whom, from where".
- [ ] **Firestore denied-request monitoring:** after launch, check Console → Firestore → Monitor/Usage for PERMISSION_DENIED spikes daily for the first week — that's either an attack probing you (good: rules working) or a broken legitimate flow (fix fast).
- [ ] **Uptime check** on the app + a status path you trust (Cloud Monitoring uptime check or your host's), alerting to the same inbox as billing alerts.

## 9. Storage (if you use Firebase Storage)

- [ ] **Storage rules are NOT the scaffold default.** Per-user paths (`/users/{uid}/...`), owner-only read/write, content-type and size limits enforced in rules (`request.resource.size < 5 * 1024 * 1024`, `contentType.matches('image/.*')`).
- [ ] **No public-write bucket path** (`allow write: if true` on uploads is the image-host equivalent of open Firestore rules).

## 10. Final 15 minutes

- [ ] **Fresh-eyes pass with `checklists/SECURITY-AUDIT.md`** — answer all 40 out loud; every "no" has a fix file named next to it.
- [ ] **`checklists/AI-BUILDER-HOLES.md` grep pass** done against the current codebase (not the version from last month).
- [ ] **One real-device, signed-out session:** open the app logged out, open devtools, try to read a private collection from the console with your public config. Expect PERMISSION_DENIED. This is the attacker's first move — make it yours first.
- [ ] **Rollback noted:** previous rules file saved (`firestore.rules.bak` in the repo / previous commit) so a bad rules deploy can be reverted in one command.

**All 🔴 items checked = launch-safe by the standard this kit promises.** Ship it — and put a weekly 10-minute rules/usage review on the calendar for the first month.
