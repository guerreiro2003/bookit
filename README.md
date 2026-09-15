# Book It

Software de marcações online para cabeleireiros, barbearias e salões — multi-tenant (vários salões na mesma instalação), sem servidor próprio, alojado no Firebase.

- **App de marcações (cliente):** `index.html` — marca em 5 passos sem criar conta.
- **Área do cliente:** `account.html` — histórico, pontos, cupões, cancelar, exportar/apagar dados.
- **Portal da equipa:** `staff.html` — agenda do dia, confirmar, pagar, não-comparência.
- **Painel do dono:** `admin.html` — tudo: serviços, equipa, horários, pausas, férias, datas encerradas, marcações, reagendar, clientes, promoções, conteúdo do site, configurações.
- **Onboarding de um salão novo:** `setup.html`.

Produção atual: https://bookit-51575.web.app · Site do cliente-piloto: https://zen-organic-pt.web.app

---

## Stack

| Camada | Tecnologia | Notas |
|---|---|---|
| Frontend | HTML5 + CSS + JavaScript ES Modules | **Sem build step.** Cada página é um módulo; `app.js` tem os helpers partilhados; `booking-core.js` tem as regras de negócio puras (corre no browser e em Node). |
| Autenticação | Firebase Authentication (email/password) | 3 papéis por salão: **admin** (`salon.adminUid`), **equipa** (`salon.teamUid`, uma conta partilhada por salão), **cliente** (conta própria). |
| Base de dados | Cloud Firestore | Multi-tenant por caminho: `salons/{salonId}/…`. Regras de segurança em `firestore.rules` são o backend. |
| Hosting | Firebase Hosting (2 sites no mesmo projeto) | Headers de segurança (CSP, HSTS…) em `firebase.json`. |
| Notificações | *(preparado, não ativo)* `functions/` + extensão *Trigger Email* | Exige plano Blaze + SMTP — ver `functions/README.md`. |
| Pagamentos online | *(não implementado)* | O pagamento é registado no balcão pela equipa. Stripe/MB Way: ver "Questões externas" no fim. |

## Arquitetura de dados

```
salons/{salonId}                      ← doc do salão: nome, cor, settings do motor, adminUid, teamUid, plan…
  config/schedule                     ← horário semanal {monday:{open,close,closed,breakStart?,breakEnd?}…}
  services/{id}                       ← name, price, duration, active, order, isPackage…
  staff/{id}                          ← name, role, photoUrl, active, schedule? (override), timeOff[{from,to,reason}]
  agenda/{staffId}__{YYYY-MM-DD}      ← { intervals:[{start,end,bookingId}] } ← ocupação (minutos), SEM dados pessoais
  bookings/{id}                       ← a marcação (dados do cliente, serviço, preço, estado, startMin/endMin…)
  clients/{uid|id}                    ← perfil + fidelização (visits, points, totalSpent, discounts[])
  referrals/{CODE}                    ← { clientId } — lookup público de códigos de amigo, sem dados pessoais
  promotions/{id}, site_gallery/{id}, site_partners/{id}   ← conteúdo do site público
  users/{uid}                         ← registo do admin
```

### Motor de marcações (o que garante que não há sobreposições)

Toda a escrita que muda *quando* uma marcação acontece passa por uma **transação Firestore** que também lê e escreve o documento `agenda/{staffId}__{date}` desse colaborador. Como transações concorrentes sobre o mesmo documento serializam, duas pessoas a marcar o mesmo colaborador em horários sobrepostos **nunca conseguem ambas** — independentemente do que a interface lhes mostrou. A verificação considera: duração real do serviço, horário do salão, horário próprio do colaborador, pausas, férias/indisponibilidades, datas encerradas, antecedência mínima/máxima e o fuso horário do salão.

Funções (em `app.js`): `computeAvailability`, `createBooking`, `confirmBooking`, `cancelBooking`, `restoreBooking`, `rescheduleBooking`, `markBookingPaid`, `markBookingNoShow`. Regras puras em `booking-core.js` (`generateSlots`, `checkSlot`, `resolveDayWindow`, `canTransition`, `clientCanCancel`…).

### Máquina de estados

```
pending ──→ confirmed ──→ completed
   │            │
   ├──→ cancelled ←┘      (cancelled → pending/confirmed só via "anular", que re-verifica a agenda)
   └──→ noshow   ←┘
```
Transições inválidas são rejeitadas no cliente **e** nas regras Firestore.

### Segurança (resumo)

- Preços não são forjáveis: nas regras, `servicePrice` tem de ser o preço real do serviço e `finalPrice` fica entre 50% e 100% dele.
- Clientes não conseguem inflacionar pontos nem criar cupões; só o admin/equipa (através das transações) altera fidelização.
- Marcações não são legíveis publicamente; a disponibilidade vem de `agenda` (sem dados pessoais).
- Isolamento de tenants: `isAdmin/isTeam` são avaliados contra o documento **desse** salão.
- Campos de faturação (`plan`, `trialEndsAt`, `adminUid`) nunca são editáveis pela app.
- Validação de tipos/tamanhos em todas as coleções escritas pelo admin.

## Desenvolvimento

```bash
npm install            # só para testes (firebase SDK em Node)
npm run serve          # http://localhost:8000/?salon=demo  (site estático)
npm test               # unit tests do motor (node --test)
npm run test:rules     # integração das regras Firestore contra o projeto (cria e limpa docs de teste)
node --import ./tests/_register.mjs tests/engine.e2e.mjs   # E2E do motor com o SDK real (concorrência, reagendar, pagar…)
```

Os testes de integração/E2E correm contra o projeto configurado (por omissão o salão `demo`). Para CI, aponta `FIREBASE_PROJECT`/`FIREBASE_API_KEY` para um projeto de teste ou para o emulador (`npm run emulators`).

Variáveis de ambiente usadas pelos scripts/testes (todas opcionais): `FIREBASE_PROJECT`, `FIREBASE_API_KEY`, `SALON_ID`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TEAM_PASSWORD`, `CLIENT_EMAIL`, `CLIENT_PASSWORD`. A app em si **não tem segredos**: a config do Firebase em `firebase.js` é pública por desenho; a proteção está nas regras.

## Deploy

```bash
firebase login
npm run deploy          # hosting (bookit) + regras + índices
npm run deploy:rules    # só regras + índices
cd ../zenorganic-main && firebase deploy --only hosting:zen-organic-pt   # site do cliente-piloto
```
Ver `PRODUCTION_CHECKLIST.md` antes de qualquer instalação nova e `DISASTER_RECOVERY.md` para backups.

## Scripts de operador (`scripts/`)

| Script | Para quê |
|---|---|
| `migrate-salon.mjs <salonId> <adminEmail> <adminPw> [teamPw]` | Migra um salão antigo para o motor v2 (conta de equipa, agenda, referrals). Idempotente. |
| `set-plan.mjs <salonId> active\|trial\|suspended [dias]` | Ativa/suspende a subscrição (só o operador; a app não pode). |
| `backup-export.mjs [dir] [salonId]` | Backup lógico completo em JSON. |
| `backup-restore.mjs <ficheiro> <salonId> --yes` | Restaura um salão a partir do backup. |

Os scripts de operador usam a sessão do Firebase CLI (`firebase login`) e **ignoram as regras de segurança** — não os distribuas a clientes.

## Documentação

- `ADMIN_GUIDE.md` — como configurar um salão novo (para o dono do salão / suporte).
- `PRODUCTION_CHECKLIST.md` — o que verificar antes de pôr uma instalação em produção.
- `DISASTER_RECOVERY.md` — backups, retenção, restauro.
- `functions/README.md` — notificações por email (o que falta configurar).
- `privacidade.html` — modelo de política de privacidade (**carece de revisão jurídica**).

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| "Sem permissão para esta ação" na equipa | Password da equipa não definida ou sessão expirada | Admin → Configurações → definir password da equipa; sair e entrar de novo em `staff.html`. |
| Horário não aparece para um colaborador | Horário próprio com "Folga" ou férias registadas | Admin → Equipa → horário individual / indisponibilidades. |
| "Esse horário acabou de ser ocupado" | Outra pessoa marcou primeiro | Comportamento correto — escolher outro horário. |
| Marcações online bloqueadas (banner vermelho) | Subscrição em `trial` expirada ou `suspended` | `node scripts/set-plan.mjs <salonId> active`. |
| Query falha com "index required" | Índice composto em falta | `npm run deploy:rules` (deploya `firestore.indexes.json`). |
| Consola: violação de CSP | Recurso externo não permitido | Ajustar `Content-Security-Policy` em `firebase.json`. |
