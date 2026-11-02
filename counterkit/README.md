# CounterKit — The House Tab, Perfected

**A self-hosted ordering page and house-tab ledger for independent counters** — cafés, bakeries, delis, and boutique food counters whose regulars order by name.

- 🏪 **Store / full details:** https://shloimyzf.github.io/pls/counterkit/
- 🧪 **Live demo (actual customer + admin code, sample data):** https://shloimyzf.github.io/pls/counterkit/demo/
- 💵 **Pricing:** one-time purchase — $149 Single-Business · $349 Multi-Location. No subscription, no commission, no middleman.

## What it does

- **Guests order simply** — your menu, your add-ons, their name, done. No account, no password, nothing to install; runs in any phone browser.
- **House tabs keep themselves** — a "put it on my tab" charge lands automatically in a per-customer ledger: balances to the cent, lifetime totals, full charge/payment history, partial settlements.
- **You conduct the counter** — one private admin page: real-time order queue, mark fulfilled/cancelled with a tap, menu editor with live changes, at-a-glance vitals (open orders, revenue today, outstanding tabs).

## Tech

- Plain **HTML/CSS/JS** — no build step, no framework
- **Firebase / Cloud Firestore** backend with a ready-to-publish security-rules file: guests can create orders and add tab charges but can **never lower a balance or read another guest's tab**
- All money in **integer cents** — no floating-point drift
- **Demo mode included** — runs the entire system on sample data (localStorage) before you connect Firebase
- Runs on Firebase's free Spark tier for a typical counter; ~15-minute setup, click-by-click guide included

## Made for

Independent cafés and espresso bars · bakeries, delis, juice bars · food trucks and pop-ups · members' counters, program canteens, and school shops that run house accounts for regulars.

## Ordering

Sold directly, by email, payment in Bitcoin — no accounts, no checkout cart, no platform in the middle:

1. Email **shloimyf33107+counterkit@gmail.com** with the tier you want
2. Get a reply with your exact BTC amount at the live rate and the payment address
3. Send it; when it confirms on-chain, `CounterKit-v1.zip` arrives by email with setup guidance

Covered by a 14-day "Running Counter" guarantee: set it up within fourteen days; if it doesn't run your counter's ordering and house tabs as described and we can't make it right by email, full refund.
