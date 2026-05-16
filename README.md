# Book It

Multi-tenant salon booking SaaS built with plain HTML / CSS / JS and
Firebase (Auth + Firestore). No build step. Hosted as a static site.

> **🌐 Production:** [https://bookit-51575.web.app](https://bookit-51575.web.app) (Firebase Hosting)
> **📦 Source:** [github.com/guerreiro2003/bookit](https://github.com/guerreiro2003/bookit)
>
> Production v2 — fully redesigned (Linear / Stripe / Cal.com aesthetic),
> dark-mode-first, real-time, with command palette and atomic transactions.
> See [CHANGELOG.md](CHANGELOG.md) for the full diff from v1.

## Files

| File           | Purpose                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `index.html`   | Booking wizard (5 steps, public).                                            |
| `account.html` | Client area: próximas, histórico, descontos, referidos, dados, delete-acc.   |
| `staff.html`   | Staff portal: today (real-time), all bookings, services, clients (admin).   |
| `admin.html`   | Admin: dashboard (live), bookings, day view, clients, services, staff…       |
| `login.html`   | Admin sign-in.                                                               |
| `setup.html`   | First-time tenant setup (atomic via `writeBatch`).                           |
| `success.html` | Post-booking confirmation.                                                   |
| `styles.css`   | Design system: tokens, components, dark mode, responsive.                    |
| `app.js`       | Shared utilities (templating, dates, validation, transactions, theme, CSV…). |
| `firebase.js`  | Firebase SDK config + curated exports.                                       |
| `CHANGELOG.md` | What changed and why.                                                        |

## Run locally

```bash
cd bookit-main
python3 -m http.server 8000
# open http://localhost:8000/?salon=zenorganic
```

## Architecture

### Tenancy

A salon lives at `salons/{salonId}` with all sub-data nested. Selected via
`?salon=…` (default `zenorganic`).

```
salons/{salonId}
  ├ config/schedule
  ├ services/{id}
  ├ staff/{id}
  ├ promotions/{id}
  ├ clients/{id}
  └ bookings/{id}
```

### Auth

- **Admin**: Firebase Auth email/password. Matched by `salons/{id}.adminUid`.
- **Client**: Firebase Auth email/password. Profile at `salons/{id}/clients/{uid}`.
- **Staff**: shared `teamPasswordHash` (SHA-256) on the salon doc. 8-hour
  sessionStorage session. Admin can enter the same portal with their own
  credentials.

### Booking state machine

```
pending ─→ confirmed ─→ completed
   │           │
   └──→ cancelled  noshow
```

Side effects of `completed` via `markBookingPaid()` (atomic):

- Booking flagged `paid`, `pointsAwarded`, `paymentMethod`.
- Client gains `pointsPerVisit` (default 10).
- If `visits % loyaltyVisits === 0`, a loyalty discount is appended to the
  client's `discounts` array.

Side effects of `noshow` via `markBookingNoShow()` (atomic):

- Booking flagged `noshow`.
- Client `points` decremented by `noShowPenalty` (default 5).

### Per-salon branding

The salon doc carries `primaryColor`. On boot, `applySalonBranding()` sets
`--brand` and `--brand-rgb` as CSS custom properties — no rebuild, no theme
switching code.

## Conventions

### XSS-safe templating

```js
import { html, htmlMix, raw, escapeHTML } from './app.js';

// Auto-escapes all interpolations:
el.innerHTML = html`<div>${untrusted}</div>`;

// Mix trusted partial HTML with untrusted values:
el.innerHTML = htmlMix`<a href="${url}">${name}${raw('<br>')}${notes}</a>`;
```

### Event delegation

Buttons declare an action via `data-action="some-name"`; a single delegated
listener dispatches. No inline `onclick=`.

```js
import { on } from './app.js';

on('cancel-booking', async (el) => {
  await updateDoc(doc(db, 'salons', salonId, 'bookings', el.dataset.id),
    { status: 'cancelled' });
});
```

### Atomic writes

Multi-document operations use `runTransaction` or `writeBatch`. Setup
creates the salon, schedule, admin user record, and seed services in a
single batched commit. Payment + points happen in a single transaction.

### Theme

Light/dark via `[data-theme]` on `<html>`. Tokens flip; per-salon brand
colour stays. Honours `prefers-color-scheme` initially, then persists user
choice in localStorage. Toggle button in admin sidebar + staff header.

### Keyboard shortcuts

- `⌘K` / `Ctrl+K` — command palette (admin)
- `Esc` — close any modal / popup
- `Enter` / `Space` — activate `[role="button"]` elements

## Roadmap

Documented in `guia_bookit_v3.docx` plus internal notes:

- **Firestore rules** — must be written before production. Suggested:
  read salon doc public-readable, but writes admin-only; clients
  read/write own doc only; bookings read by salon staff (admin uid OR
  active staff record); etc.
- **MB Way / Stripe** — payment modal currently records the method
  string; actual processing is offline.
- **Multi-admin per salon** — currently single `adminUid`.
- **Push notifications** to staff for new pending bookings.
- **Pagination cursor** for admin booking list past 500 entries.

## Project

Pedro Guerreiro 20221080 · Tomás Ramos 20210834
L-IG · 4.º Semestre · IADE · Universidade Europeia · 2025-2026
