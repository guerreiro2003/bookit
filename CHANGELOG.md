# Changelog

## 2.2.0 — 2026-09-16 · Movimento 2: clientes em risco → reativação → receita atribuída

- **`retention-core.js`** (puro, 11 testes): ritmo de cada cliente = mediana do intervalo entre as visitas dele; sem histórico próprio usa o ritmo do serviço, depois do salão. Estados: *saudável · em risco (1,25×) · perdido (2,5×) · inativo (>1 ano) · agendado*. Quem já tem marcação futura **nunca** é sugerido.
- **Identidade por telefone** em toda a retenção (bug corrigido: cliente que marcava como visitante e com conta contava como duas pessoas e partia a cadência ao meio).
- **Painel "Reativar"** no admin: cartões com explicação em português (*"Vinha a cada 5 semanas; já passaram 10 semanas desde julho"*), valor real gasto nos últimos 12 meses, botão **💬 Mensagem** (WhatsApp com texto pessoal + link de marcação com token de atribuição) e **Dispensar** (6 meses). Arrefecimento de 30 dias evita insistência.
- **Atribuição honesta**: a marcação feita pelo link guarda o token → `computeRecovered` separa *receita já paga* de *marcado por cobrar*, e mostra os *horários cancelados reocupados* como facto observado, **fora** da conta de receita recuperada.
- Painel **Negócio** ganha o cartão "Receita recuperada"; ocupação com uma casa decimal abaixo de 10%.
- Regras: coleção `reactivations` (PII, só equipa/admin), `reactivationToken` validado no create.
- Toque em mobile: botões pequenos passam a 40px de altura.
- Testes: `retention.e2e.mjs` (21, ciclo completo em produção), unit 33, rules 64, links 18, engine 33.

## 2.1.0 — 2026-09-15 · Movimento 1 (custo zero): rail de confirmação + origem

- **Links de capacidade** por marcação (`manageToken`, projeção sem PII em `bookingLinks/{token}`): o cliente confirma ou cancela em `m.html` sem conta; as regras validam o token e libertam o horário atomicamente (`getAfter`), respeitando a janela de cancelamento.
- **WhatsApp manual com mensagem pronta** (wa.me) no portal da equipa e no admin, com o link embebido; cartão "Por confirmar (hoje e amanhã)"; registo de `confirmRequestedAt` / `reminderSentAt` / `confirmedVia` para medir cobertura de confirmações.
- **Telefone como identidade**: `clientPhoneE164` normalizado, email opcional na marcação online (regras + formulário); clientes resolvidos por telefone antes de email ao registar pagamento.
- **Origem** de cada marcação (`channel` via `?src=`; o site do Zen envia `src=site`).
- Página de sucesso mostra o link de gestão. Testes: `tests/links.e2e.mjs` (17), unit 17, rules 61, engine 33.

## 2.0.0 — 2026-09-15 · Production hardening (commercial release)

### Motor de marcações
- **Agenda transacional por colaborador/dia** (`agenda/{staffId}__{date}`): impossível criar marcações sobrepostas, mesmo em concorrência. Considera duração real, horário do salão e do colaborador, pausas, férias/indisponibilidades, datas encerradas, antecedência mínima/máxima e fuso horário.
- "Sem preferência" atribui um colaborador real disponível.
- Reagendar (admin), cancelar com libertação atómica do horário, anular cancelamento com re-verificação.
- Máquina de estados aplicada no cliente e nas regras.
- Fuso horário do salão em todas as datas "hoje".

### Segurança / RBAC
- Conta de equipa real por salão (`teamUid`) em vez de hash SHA-256 público + Anonymous Auth (provider desativado).
- Marcações deixam de ser públicas; disponibilidade vem da agenda (sem dados pessoais).
- Preços ancorados ao catálogo nas regras; fidelização não forjável; campos de faturação bloqueados.
- Validação de tipos/tamanhos em todas as coleções; isolamento de tenants verificado por testes.
- CSP, HSTS, Permissions-Policy; `.git`, docs e scripts fora do hosting.

### Produto
- Marcação como visitante corrigida (não dependia de leitura de `clients`).
- Página de sucesso honesta (sem promessa de email) + .ics + Google Calendar.
- Política de cancelamento pelo cliente (janela configurável) aplicada no cliente e no servidor.
- Admin: horários livres reais ao criar marcação, pausas, datas encerradas, férias por colaborador, settings do motor, rotação da password da equipa, paginação de clientes, exportação JSON.
- Cliente: exportar dados, apagar conta anonimiza marcações (RGPD).
- Setup cria conta de equipa, defaults do motor e período de teste (plano).
- Subscrição (`plan`/`trialEndsAt`) com gate nas regras e script de operador.

### Qualidade
- `booking-core.js` puro com testes unitários; testes de integração das regras; E2E do motor com o SDK real; stress de concorrência.
- Documentação: README, PRODUCTION_CHECKLIST, ADMIN_GUIDE, DISASTER_RECOVERY, functions/README.


Three-phase overhaul of Book It from prototype to production-grade SaaS.

## v2.0.0 — 2026-05-16

### Visual redesign

Reference bar: Linear, Cal.com, Stripe Dashboard, Vercel, Resend.
The old earth-tone / paper-texture / serif-accent aesthetic was replaced
entirely.

- **Typography**: Inter (font-feature `cv02/03/04/11`), JetBrains Mono for
  data/codes. 11-step scale from 11 px to 38 px with -0.011 em letter-spacing
  on headings.
- **Colour system**: neutral palette with one accent (the salon's brand
  colour, exposed both as `--brand` and `--brand-rgb` so we can build
  rgba()-based hover/glow effects).
- **Dark mode**: full dark theme via `[data-theme="dark"]`, respects
  `prefers-color-scheme` on first load, persisted in localStorage. Toggle in
  admin sidebar + staff header.
- **Spacing**: rigorous 4-pixel scale (`--s-1` … `--s-10`).
- **Radii**: tightened (6–14 px max; pill for buttons/badges).
- **Shadows**: subtle multi-layer (xs/sm/regular/lg/xl); rings for focus.
- **Motion**: `cubic-bezier(.16, 1, .3, 1)` easing, 12 ms / 200 ms / 400 ms
  buckets, `prefers-reduced-motion` honoured.
- **Components rebuilt**: `.btn`, `.card`, `.field`, `.tabs`, `.modal`,
  `.steps`, `.select-item`, `.timeslot`, `.calendar`, `.data-table`,
  `.row-card`, `.profile-card`, `.discount`, `.refcode-box`, `.bday`,
  `.method`, `.empty-state`, `.error-state`, `.loading-state`, `.spinner`,
  `.skeleton`, `.progress`, `.toast`, `.sidebar`, `.appbar`, `.statusbar`,
  `.search`, `.switch`, `.cmdk`, `.dayview`.
- **Inline SVG line icons** throughout the admin sidebar (replacing emoji).
- **Custom scrollbars** in light & dark.
- **Print styles** for staff/admin (hides chrome).
- **Page-by-page**: `index.html`, `account.html`, `admin.html`, `staff.html`,
  `login.html`, `setup.html`, `success.html` all rebuilt against the new
  system.

### New features

- **Real-time updates** (`onSnapshot`) for today's bookings on the admin
  dashboard and the staff "Hoje" tab. Admin stats refresh without reload.
- **Command palette (⌘K)** in admin with fuzzy navigation, client search,
  and quick actions (new booking, toggle theme).
- **Day-view calendar** — visual cronograma of any date with colour-coded
  events by status (pending/confirmed/completed/cancelled). Click an event
  to open the payment modal.
- **Manual booking modal** in admin: staff can register walk-ins or phone
  bookings. Includes conflict detection against the same staff member at
  the same time slot.
- **CSV export** for bookings (`marcacoes-YYYY-MM-DD.csv`) and clients
  (`clientes-YYYY-MM-DD.csv`). Native download with BOM for Excel.
- **Global search** in admin bookings (debounced, searches name / phone /
  service) and clients (name / email / referral code).
- **Undo toast** — cancelling a booking, removing a service, etc. shows
  a 6-second "Anular" affordance to revert.
- **Dark mode toggle** persisted across sessions.
- **Pending-bookings badge** in admin sidebar updates live.
- **Delete-account** flow in `account.html` — anonymises client record
  rather than hard-deleting (preserves booking history for accounting),
  then deletes the Auth user. Re-auth prompt for stale sessions.
- **Password visibility toggles** on every password field.
- **Focus trap** on every modal (Zen Club popup, payment, new booking,
  command palette) with restore-focus on close.
- **Auto-derive slug** from salon name in setup.

### Bug fixes

1. **Double-submit on "Confirmar marcação"** — wrapped `submit-booking` with
   `withLock('submit-booking', …)` to guarantee a single execution per
   click.
2. **Default salon ID mismatch** — `app.js` is now the single source of
   truth (`DEFAULT_SALON = 'zenorganic'`).
3. **XSS via `innerHTML` with Firestore data** — every dynamic value now
   passes through `escapeHTML()` via the `html` / `htmlMix` tagged
   templates. Trusted partial HTML is opt-in via `raw()`.
4. **Missing Firestore composite index** for the bookings timeslot query
   (date + staffId + status) — added a graceful fallback that fetches by
   date and filters client-side when the index is absent.
5. **Client creation race in account.html** — registration now runs inside
   `runTransaction` so two concurrent tabs can't create duplicate client
   documents for the same email.
6. **Non-atomic payment** — extracted to `markBookingPaid()` in `app.js`
   which uses `runTransaction` to update booking + client + create
   loyalty discount in one commit.
7. **Non-atomic no-show** — extracted to `markBookingNoShow()` (same
   transaction guarantee).
8. **Team password stored in plaintext** — now hashed (SHA-256) before
   write. `verifyPassword()` supports a legacy plaintext fallback so
   existing salons keep working until the admin saves a new password.
9. **Loose phone regex** (`/^\+?[0-9\s]{6,}$/` accepted "      ") — replaced
   with `isPhone()` helper that requires 6–15 actual digits.
10. **Staff closed-day not honoured** in slot generation — explicit check
    before falling back to salon schedule.
11. **Slug normalisation regex** — uses explicit `̀-ͯ` Unicode
    range instead of literal combining marks that some editors mangle.
12. **Stale staff schedule selector on first admin load** — `loadStaff()`
    is now part of the initial boot sequence.
13. **Phone validation in manual booking** — full `isPhone()` check.
14. **Admin booking list unbounded read** — query is `limit(500)` and
    further refined client-side; future work: pagination cursor.
15. **Empty referral code triggering meaningless query** — guarded with
    `'__none__'` sentinel.
16. **Auth state observer didn't reset staff session on sign-out** — fixed
    in `staff.html` onAuthStateChanged handler.
17. **Login button stuck in loading state after Firebase rejects** —
    `setLoading(false)` in the catch.
18. **Toast not stacking on rapid fires** — `void t.offsetWidth` forces
    a reflow so the animation replays.
19. **`event.currentTarget` global** removed throughout; replaced with
    delegated `data-action` clicks.

### Code quality

- Shared `app.js` consolidates: `escapeHTML`, `html`/`htmlMix`/`raw`,
  `toast` with undo, date helpers, `isEmail`/`isPhone`/`isHexColor`/
  `isSlug`, `hashPassword`/`verifyPassword`, `debounce`/`throttle`,
  `markBookingPaid`/`markBookingNoShow`, `downloadCSV`, `subscribe`,
  `withLock`, `trapFocus`, `getTheme`/`setTheme`/`toggleTheme`,
  `getSalonId`/`salonQS`/`loadSalon`/`applySalonBranding`,
  `STATUS_LABELS`/`statusBadge`, `generateReferralCode`,
  `formatDate`/`formatDatePT`/`formatDateLongPT`/`todayISO`/
  `relativeDay`/`formatPrice`/`formatRelativeTime`.
- `firebase.js` exports expanded with `runTransaction`, `limit`,
  `startAfter`, `endBefore`, `updateProfile`, `deleteUser`.
- All inline `onclick=` removed — single delegated listener on
  `[data-action]` (CSP-friendly).
- All inline `style=""` collapsed to utility classes or component classes
  where it duplicates.
- 7 distinct page scripts but only one shared module (`app.js`).

### Accessibility & SEO

- `:focus-visible` rings everywhere with 3 px brand-coloured outline.
- ARIA roles on all interactive widgets (`role="dialog"`/`"tab"`/
  `"tabpanel"`/`"option"`/`"grid"`/`"gridcell"`).
- `aria-live` regions on toasts and error messages.
- Skip-to-content not added (single column layouts; revisit if site grows).
- `<meta name="theme-color">` for both light and dark schemes.
- Semantic landmarks (`<header>`, `<main>`, `<aside>`, `<nav>`).
- Reduced-motion media query collapses all animations.
- Form labels properly associated; password autocomplete attributes
  correct.

### Performance

- Lazy-loaded fonts via `@import` with `display=swap`.
- Booking caches invalidated only when mutated.
- Search debounced (200 ms).
- Color picker drag debounced (80 ms).
- `onSnapshot` instead of polling; unsubscribed on logout.
- CSV export streamed as Blob; no extra dependencies.

---

## v1.1.0 — 2026-05-15 (initial refactor)

- Unified design tokens in `styles.css`.
- Created `app.js` with shared utilities.
- Added missing `staff.html` from the product guide.
- Atomic `writeBatch` for `setup.html`.
- Added payment modal, no-show flow, service packages,
  "for someone" booking field, manual prefill from logged-in user.
- Added Próximas tab + client-side cancel in `account.html`.
- Hash-protected team password in admin settings.
- Removed XSS-prone `innerHTML` patterns.
- Made the zenorganic popup accessible.

## v1.0.0 — 2025-04-20 (prototype)

- Initial Firebase + HTML/CSS/JS prototype.
- Booking wizard, admin panel, client area, success page.
