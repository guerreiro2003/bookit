# Book It

Multi-tenant salon booking SaaS built with plain HTML / CSS / JS and Firebase
(Auth + Firestore). Hosted as a static site; the salon-specific tenant is
selected from the `?salon=…` URL parameter.

## Files

| File           | Purpose                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `index.html`   | Booking wizard (5 steps · public).                                       |
| `account.html` | Client area: próximas, histórico, descontos, referidos, dados, password. |
| `staff.html`   | Staff portal: today, all bookings, services, clients (admin only).       |
| `admin.html`   | Admin dashboard: bookings, clients, services, staff, schedule, settings. |
| `login.html`   | Admin sign-in.                                                           |
| `setup.html`   | First-time tenant setup (creates salon + admin in one transaction).      |
| `success.html` | Post-booking confirmation page.                                          |
| `styles.css`   | Single design system: tokens, components, layout, responsive.            |
| `app.js`       | Shared utilities: XSS-safe templating, toast, dates, auth errors.        |
| `firebase.js`  | Firebase SDK config + curated exports.                                   |

## Architecture

### Tenancy

A salon is a Firestore document at `salons/{salonId}`. All sub-data is nested:

```
salons/{salonId}
  ├ config/schedule         # weekly opening hours
  ├ services/{id}           # service catalog (incl. packages)
  ├ staff/{id}              # team members + per-staff schedule
  ├ promotions/{id}         # active promo banners
  ├ clients/{id}            # client profiles, points, discounts
  └ bookings/{id}           # all bookings
```

The salon is selected by `?salon=…` (default `zenorganic`). Every page reads
this once at boot and uses it as the prefix for all Firestore paths.

### Auth & roles

- **Admin** signs in with email/password (Firebase Auth). Identified by
  `salons/{salonId}.adminUid` matching the user's UID.
- **Client** signs in with email/password (Firebase Auth). Profile lives in
  `salons/{salonId}/clients/{uid}`.
- **Staff** signs in with a shared `teamPassword` stored in
  `salons/{salonId}.teamPassword` (kept server-side; never visible in source).
  Session expires after 8 h (sessionStorage). The admin can also enter the
  staff portal through the same login screen using their own credentials.

### Booking state machine

`pending → confirmed → completed`. Side branches: `cancelled` and `noshow`.
Points (`pointsPerVisit`, default 10) are awarded on `completed`. Loyalty
discounts are created automatically every `loyaltyVisits` (default 10).
No-show deducts `noShowPenalty` points (default 5).

### Per-salon branding

The salon document carries `primaryColor` (+ optional `primaryColorDark`,
`primaryColorLight`). On boot, `applySalonBranding()` sets these as CSS custom
properties — no rebuild, no theme switching code.

## Design system

All styling is in `styles.css` using CSS custom properties for tokens:

- **Colours:** `--brand`, `--brand-dark`, `--brand-light`, `--bg`, `--text`,
  `--muted`, status colours (`--success/--warn/--danger/--info`).
- **Spacing:** 8-pixel scale `--s-1..--s-9`.
- **Radii:** `--r-xs/--r-sm/--r/--r-lg/--r-xl/--r-pill`.
- **Shadows:** `--shadow-sm/--shadow/--shadow-lg/--shadow-focus`.

Components (one source of truth):

`.btn` (+`--primary/--ghost/--outline/--danger/--success`, `--full/--lg/--sm`),
`.card`, `.field`, `.input`, `.option-list`/`.option-item`, `.tabs`/`.tab`,
`.stats-grid`/`.stat-card`, `.data-table`, `.badge`, `.loyalty-bar`,
`.profile-header`, `.list-row`, `.discount-card`, `.modal-overlay`/`.modal`,
`.pay-methods`/`.pay-method`, `.empty-state`, `.error-state`, `.skeleton`,
`.spinner`, `#toast`.

Accessibility:

- Visible focus ring (`:focus-visible` 2 px brand outline).
- `prefers-reduced-motion` collapses animations to 1 ms.
- All interactive non-button elements have `role="button"` + keyboard handler.
- Forms use `<label for>` associations and `aria-live` regions for errors.
- Toasts use `role="status"` + `aria-live="polite"`.

## JS conventions

### Event delegation

No inline `onclick=` anywhere. Buttons declare an action via
`data-action="some-name"` and a single delegated listener in `app.js` dispatches
to handlers registered with `on('some-name', handler)`. This makes the markup
CSP-compatible and keeps handlers in one place.

```js
import { on } from './app.js';
on('cancel-booking', async (el) => { /* el.dataset.id */ });
```

### XSS-safe templating

User-supplied data (service names, notes, client names, promo titles…) is
escaped before insertion. Use the tagged templates from `app.js`:

```js
import { html, htmlMix, raw } from './app.js';

el.innerHTML = html`<div class="name">${untrustedName}</div>`;
// Need to mix trusted HTML and untrusted values?
el.innerHTML = htmlMix`<div>${untrustedName}${raw('<br>')}${untrustedNotes}</div>`;
```

`escapeHTML()` is exported for ad-hoc use.

### Firestore writes

- `setup.html` uses `writeBatch` to create the salon document, schedule, admin
  user record, and seed services in a single atomic commit.
- All `updateDoc` calls are wrapped in try/catch with a toast for the user.

## Local development

There's no build step. Serve the folder:

```bash
cd bookit-main
python3 -m http.server 8000
# open http://localhost:8000/index.html?salon=zenorganic
```

Firebase config is in `firebase.js`. The Firestore project is `bookit-51575`.
Web API keys are public by design — security must be enforced via Firestore
rules (write these separately).

## Deployment

Drop the folder onto Netlify, Vercel, or any static host. Set the production
salon as the default in `app.js` (`DEFAULT_SALON`) if you want `/` to point at a
specific tenant without `?salon=…`.

## Roadmap

Documented in `guia_bookit_v3.docx`:

- MB Way / Stripe payment integration (currently only `balcao` / `online`
  labels — actual processing is offline).
- Firestore security rules (write before going to production).
- Multi-admin per salon (currently single `adminUid`).
- Push notifications to staff for new bookings.

## Project

Pedro Guerreiro 20221080 · Tomás Ramos 20210834
L-IG · 4.º Semestre · IADE · Universidade Europeia · 2025-2026
