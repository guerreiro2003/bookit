# Changelog

## 2.6.0 — 2026-09-20 · Quem faz o quê, e App Check pronto a ligar

### Serviços por colaborador

Até agora o motor assumia que toda a gente fazia tudo — e marcava coloração a quem nunca tinha feito uma. Agora cada colaborador tem a sua lista.

- **Sem nada marcado, faz tudo.** É o que é verdade na maioria dos salões pequenos e o que todos os registos existentes já significam, por isso nada muda até o dono decidir restringir alguém.
- **No painel:** chips no formulário de colaborador e um botão **Serviços** em cada linha da lista. A lista mostra "Faz todos os serviços" ou "Só 2 · Corte Masculino · Barba".
- **No site do cliente:** o passo 2 só mostra quem faz o que foi escolhido. Verificado em produção — restringi o João (barbeiro) e ele desapareceu da coloração e manteve-se no corte masculino. Se ninguém fizer a combinação pedida, a página diz isso em vez de mostrar um calendário vazio.
- **Numa visita combinada é preciso fazer *todos* os serviços**, não só um: quem faz o corte mas não a cor não aparece em "corte + cor".
- **As regras fecham o caminho pelas traseiras.** O id de cada colaborador é público (a lista de equipa tem de ser), por isso um cliente podia forjar o pedido. `staffDoesTheWork()` valida contra o catálogo na criação online. O dono continua a poder atribuir quem quiser — cobrir um turno é legítimo, e o painel já o guia.
- `tests/staff-services.test.mjs` (6) e 4 testes novos na suite de abuso.

### App Check

O código está escrito e a CSP já permite o reCAPTCHA — falta **só colar a chave** em `firebase.js` (`RECAPTCHA_SITE_KEY`). Enquanto estiver vazia, não faz nada e a app corre como agora. Os três passos da consola estão comentados no ficheiro. `tests/_register.mjs` aceita `APPCHECK_DEBUG_TOKEN` para os testes continuarem a correr depois de ligares a imposição.

Testes: 60 unit · 74 regras · 29 abuso · 38 motor · 18 links · 21 retenção · 27 importação — **267, todos verdes**.

## 2.5.0 — 2026-09-20 · Fechar as falhas que a auditoria encontrou

A auditoria de 18 de setembro explorou duas falhas reais contra o projeto em produção. Estão fechadas, e agora há uma suite de testes que tenta atacá-las a cada corrida.

### Segurança

- **Uma entrada de agenda é a sombra de uma marcação, nunca uma coisa em si.** As regras validavam a *forma* do documento mas nunca verificavam que a entrada pertencia a uma marcação. Qualquer pessoa sem login podia marcar um colaborador como ocupado das 00:00 às 24:00 para uma marcação que não existia — fechando a agenda do salão enquanto a lista de marcações ficava vazia, o que tornava a coisa invisível. Agora a regra exige, via `getAfter()`, que a marcação exista no fim do pedido, seja desse colaborador nesse dia, esteja viva, e que os blocos caibam dentro da janela da própria marcação. Quem escreve declara qual é a marcação (`viaBookingId`), tal como já acontecia ao libertar.
- **Um email só prova identidade depois de ser aberto.** As regras confiavam em `request.auth.token.email` sem verificar `email_verified`, e o Firebase deixa registar qualquer endereço. Registar-se com o email de uma cliente dava acesso ao nome, telemóvel, histórico e às **notas privadas do salão** — que em cabeleireiro incluem alergias. Agora `ownsBooking()` e `ownsClientDoc()` exigem email verificado.
  - `account.html` ganhou o ecrã **"Confirma o teu email"**, com reenviar e "já confirmei". A ficha de cliente só é escrita no primeiro login verificado, e é aí que se liga a um registo de visitante que o salão já tivesse criado.
- **`bookingLinks` deixou de aceitar escrita arbitrária.** O id do documento é o token da própria marcação, e a regra exige agora que bata certo com o `manageToken` dela. Antes, qualquer pessoa sem login escrevia documentos sem limite — lixo permanente que o dono pagava.
- **`tests/abuse.e2e.mjs`** (25 testes): a suite que faltava. Não pergunta "quem tem direito consegue?" mas "quem não tem consegue por outro caminho?". Foi ela que apanhou, já depois da correção, que o teste do plano de subscrição era um falso positivo.

### Produto

- **Reagendar avisa a cliente.** Havia código morto — `? {} : {}` — com um comentário a dizer que a marcação teria de ser reconfirmada. Nunca foi implementado, e a cliente aparecia à hora antiga. Agora mover uma marcação **larga a confirmação** (volta a *pendente*), limpa lembretes já enviados, e o painel oferece o botão **💬 Avisar** com a mensagem de WhatsApp pronta.
- **Apagar um serviço já usado passou a desativá-lo.** Era um `deleteDoc` com um `confirm()`, e deixava as marcações a apontar para nada. Agora conta as marcações que o usam: se houver alguma, desativa (o histórico e a faturação ficam certos) e explica porquê; só apaga mesmo os serviços que nunca foram usados.
- **Desconto máximo de 50%,** na interface e nas regras. As definições aceitavam até 100% mas o motor de preços recusa abaixo de metade — um salão que configurasse 60% via os clientes com cupão a receber "sem permissão" sem explicação possível.
- **As Cloud Functions ignoram histórico importado.** Estavam prontas a enviar email a *todas* as marcações criadas: lançá-las depois de importar 2 000 visitas antigas mandaria 2 000 emails a clientes reais sobre marcações de há dois anos.

### Operação

- **Primeiro backup real alguma vez feito** (`npm run backup`) — 142 KB, os 7 salões. Revelou que os dados do Zen Organic estão espalhados por três tenants.
- `npm run test:all` corre tudo de uma vez.

Testes: 54 unit · 74 regras · 25 abuso · 38 motor · 18 links · 21 retenção · 27 importação · stress de concorrência — **257, todos verdes**.

## 2.4.0 — 2026-09-18 · Importador: trazer os clientes e o histórico do software antigo

Um salão que já trabalha há anos não começa do zero. O importador lê o ficheiro que ele consegue exportar do software atual (ou do Excel) e transforma-o em clientes e histórico — que é o que dá matéria ao painel *Reativar* logo no primeiro dia.

- **`import-core.js`** (puro, 9 testes): deteção do separador (`;` do Excel português), parser CSV com aspas e quebras de linha, reconhecimento automático das colunas por nome (*Nome · Telemóvel · Email · Aniversário · Data · Hora · Serviço · Valor · Profissional*), datas `dd/mm/aaaa`, valores `35,00 €`, horas `9h30`.
- **Dois formatos, detetados sozinho**: lista de clientes ou histórico de visitas (tem coluna de data).
- **Nada é gravado antes de ser visto**: o painel mostra o que vai acontecer — quantos clientes novos, quantos já existem, quantas linhas têm problemas e porquê, que serviços não existem no catálogo, e a faturação histórica que o ficheiro representa.
- **Reimportar não duplica**: cada visita recebe um id determinístico (`imp_<hash>` de cliente+data+hora+serviço) e os clientes são casados por telemóvel e email. O mesmo ficheiro outra vez atualiza, não duplica (testado).
- **O histórico não ocupa a agenda** — é passado, não bloqueia horários.
- Contadores (visitas, total gasto, última visita) reconstruídos a partir do histórico, para a fidelização e o risco refletirem a realidade.
- Regras: `validImport()` — só admin, só `status: completed` com data **no passado**, preço dentro dos limites e marcado `imported: true`. Um "import" com data futura é recusado (testado), e um visitante não autenticado não importa nada.
- Correção de rotulagem apanhada na verificação em browser: num histórico, a mesma cliente a repetir-se são visitas dela, não linhas duplicadas.
- Testes: `import.e2e.mjs` (27, ciclo completo em produção: CSV → clientes → histórico → cadência → candidata a reativação), unit 54, regras 70, motor 33, links 18, retenção 21.

## 2.3.0 — 2026-09-18 · Vários serviços por marcação e tempo de espera

**O dono define os tempos.** Cada serviço tem a duração que o dono decidir e, opcionalmente, fases: *trabalho inicial · espera · trabalho final* (ex.: coloração 20+30+25).

- **Tempo de espera liberta o colaborador.** Durante a espera da cor, a agenda considera o colaborador livre e **outra cliente cabe lá dentro** — verificado em produção: coloração às 10:00 e corte às 10:20 com o mesmo colaborador.
- **Encaixe exato**: o gerador de horários passou a oferecer o início de cada buraco (antes, uma pausa de 30 min entre 10:20 e 10:50 era inutilizável porque a grelha só dava 10:15 e 10:30).
- **Até 3 serviços por marcação** (corte + cor + tratamento): duração e preço somam-se, a agenda bloqueia só os blocos de trabalho. Cliente escolhe vários no passo 1; admin idem na marcação nova.
- **Agenda reestruturada por marcação** (`byBooking`) — fecha uma falha real: as regras validavam pelo *número* de intervalos, por isso era possível reescrever a agenda do dia inteiro desde que a contagem batesse. Agora uma escrita só pode tocar na sua própria marcação (testado).
- `scripts/migrate-agenda.mjs` migra o formato antigo (32 documentos migrados no demo).
- Regras: preço e duração validados contra a soma real do catálogo (1 a 3 serviços); mais de 3 é recusado.
- Correção: `cancelBooking` não identificava a marcação ao libertar a agenda, o que passou a ser exigido pelas novas regras.
- Correção: identidade por telefone nos testes (vários visitantes partilhavam o mesmo número).
- `FATURACAO.md` — posição sobre faturação certificada e caminho de integração.
- Testes: unit 45, regras 70, motor 33, links 18, retenção 21, concorrência OK.

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
