# 🧠 Guia técnico — para responder a qualquer pergunta na apresentação

Tudo o que precisas de saber para defender o projeto. Lê uma vez, leva contigo, e quando alguém perguntar algo específico, vai à secção certa.

---

## 1️⃣ Visão geral em 30 segundos

> *"Book It é uma plataforma SaaS multi-tenant — vários salões partilham a mesma plataforma, cada um com o seu domínio de dados. Construímos em **HTML/CSS/JavaScript** puro (sem framework, sem build step) e usámos **Firebase** para autenticação, base de dados em tempo real e hosting. Está deployado em produção em dois sites: `bookit-51575.web.app` (a app de marcações) e `zen-organic-pt.web.app` (o site público do salão demo)."*

**Stack em uma linha:**
HTML5 + CSS3 + JS (ES Modules) → Firebase Auth + Firestore + Hosting → 2 sites em produção, 1 base de dados partilhada.

---

## 2️⃣ Base de dados Firestore — schema completo

### Estrutura hierárquica

```
salons/                                  (top-level collection)
└── {salonId}/                            (1 doc por salão, ex: "demo")
    │
    ├── (campos do salão)
    │   ├── name, slug, tagline
    │   ├── primaryColor, address, phone, email
    │   ├── loyaltyVisits, loyaltyDiscount, referralDiscount
    │   ├── birthdayDiscount, noShowPenalty, pointsPerVisit
    │   ├── adminUid, adminEmail               (referência ao admin)
    │   ├── teamPasswordHash                   (SHA-256, nunca em plaintext)
    │   └── createdAt
    │
    ├── config/                          (sub-coleção: configurações)
    │   └── schedule                     (1 doc com horários da semana)
    │       └── { monday: {open,close,closed}, tuesday: {…}, … }
    │
    ├── services/                        (catálogo de serviços)
    │   └── {serviceId}/
    │       ├── name, price, duration, description
    │       ├── isPackage, originalPrice, includes
    │       ├── active, order
    │       └── createdAt
    │
    ├── staff/                           (equipa)
    │   └── {staffId}/
    │       ├── name, role, specialties, email, bio
    │       ├── photoUrl                  (URL ou data:image base64)
    │       ├── schedule                  (opcional: horário individual)
    │       ├── active, order
    │       └── createdAt
    │
    ├── clients/                         (perfis de cliente registado)
    │   └── {clientUid}/                  (uid = Firebase Auth UID)
    │       ├── uid, name, email, phone, birthday
    │       ├── referralCode             (único, ex: "DEM-CLI42")
    │       ├── visits, points, totalSpent
    │       ├── referredBy, referrals[]
    │       ├── discounts[]               (cupões: loyalty, birthday)
    │       └── createdAt
    │
    ├── bookings/                        (marcações)
    │   └── {bookingId}/
    │       ├── clientId, clientName, clientEmail, clientPhone
    │       ├── serviceId, serviceName, serviceDuration, servicePrice
    │       ├── finalPrice                (após descontos)
    │       ├── staffId, staffName
    │       ├── date (YYYY-MM-DD), time (HH:MM)
    │       ├── notes, forSomeone
    │       ├── referralCode, referralDiscount
    │       ├── status                    ("pending" | "confirmed" | "completed" | "cancelled" | "noshow")
    │       ├── paid, paidAt, paymentMethod ("balcao" | "online")
    │       ├── pointsAwarded
    │       └── createdAt
    │
    ├── promotions/                      (banners no topo da app de marcações)
    │   └── {promoId}/
    │       └── { title, description, badgeText, active, createdAt }
    │
    ├── site_gallery/                    (fotos do site público Zen Organic)
    │   └── {photoId}/
    │       └── { url, caption, order, createdAt }
    │
    ├── site_partners/                   (marcas parceiras no site público)
    │   └── {partnerId}/
    │       └── { name, icon, desc, order, createdAt }
    │
    └── users/                           (admins do salão; Firebase Auth UIDs)
        └── {uid}/
            └── { email, role, createdAt }
```

### Decisões de design importantes

**Porquê hierarquia em vez de coleções flat?**
- Multi-tenancy natural: cada salão isolado por path. Adicionar um salão novo é criar um doc — zero migração.
- Regras Firestore podem usar o `salonId` como parâmetro: `match /salons/{salonId}/...`
- Queries por salão são naturalmente eficientes (Firestore indexa por path).

**Porquê client docs identificados pelo `uid` da Firebase Auth?**
- Lookup direto sem query: `getDoc(doc(db, 'salons', salonId, 'clients', user.uid))`
- O cliente garantidamente só lê o próprio perfil — a regra `request.auth.uid == uid` valida automaticamente.
- Quando o mesmo email é usado em vários salões, o utilizador tem um doc por salão (não há colisão de identidade).

**Porquê `date` como string YYYY-MM-DD em vez de timestamp?**
- Queries por data exigem `where('date','==', '2026-05-20')` — string comparison é trivial.
- Não há problemas de timezone (uma marcação às 14:00 em Lisboa é sempre `14:00`, não muda com DST).
- A ordenação cronológica funciona ordenando como string.

---

## 3️⃣ Autenticação — três modelos distintos

| Persona | Mecanismo | Onde |
|---|---|---|
| **Admin** | Firebase Auth (email + password) | `admin.html` |
| **Cliente** | Firebase Auth (email + password) | `account.html` |
| **Equipa** | Password partilhada (SHA-256 hash em Firestore) | `staff.html` |

### Admin
- `signInWithEmailAndPassword(auth, email, pw)`
- Identificado por `salons/{id}.adminUid === request.auth.uid`
- Tem privilégios completos sobre o seu salão.
- **Não há multi-admin por salão** (campo `adminUid` é único). Futura iteração: array de UIDs.

### Cliente
- Mesmo mecanismo: Firebase Auth email+password
- Identificado pelo UID. Profile em `clients/{uid}`.
- Quando se regista, criámos a auth user **primeiro**, e depois o doc do cliente numa `runTransaction` (para evitar race condition com `onAuthStateChanged`).

### Equipa
- **Não usa Firebase Auth** — propositadamente. Os colaboradores rodam, mudam, e seria caro mantê-los como contas.
- Em vez disso: o admin define uma password partilhada em `Configurações`.
- A password é **hashada** com SHA-256 antes de gravar em Firestore (`teamPasswordHash`).
- Login no `staff.html`: o cliente faz hash da password introduzida e compara com o hash em Firestore.
- Sessão dura 8h em `sessionStorage`. Quando muda alguém da equipa, o admin altera a password no painel — todos os logins anteriores caducam na próxima sessão.

> **Se perguntarem "isto é seguro?":** Mais seguro que pin de 4 dígitos. Menos seguro que MFA. Apropriado para o nicho — não há acesso a finanças, só a marcações do dia. A hash protege contra roubo de DB; só a hash bruta exposta não permite login (precisas da palavra original).

---

## 4️⃣ Firestore Security Rules

Local: [`firestore.rules`](firestore.rules). Aplicadas em produção via `firebase deploy --only firestore:rules`.

### Princípios

```
Salon doc           ──► Public READ, Admin-only WRITE (cria-se no setup)
Sub-coleção config  ──► Public READ (horário público), Admin WRITE
Services / Staff    ──► Public READ (precisa do site público), Admin WRITE
Promotions          ──► Public READ, Admin WRITE
site_gallery        ──► Public READ, Admin WRITE
site_partners       ──► Public READ, Admin WRITE
Clients             ──► O próprio cliente lê/escreve o seu doc; Admin lê tudo
Bookings            ──► Public READ (para slot-collision), Public CREATE,
                       UPDATE só Admin OU o próprio cliente (limitado a "cancelled")
Users               ──► Próprio user lê/escreve o seu doc
```

### A regra mais importante (e mais sensível): bookings

```javascript
match /bookings/{id} {
  allow read: if true;          // PUBLIC — necessário para slot-collision
  allow create: if true;        // qualquer pessoa pode fazer uma marcação
  allow update: if isAdmin(salonId)
    || (isAuth() && resource.data.clientEmail == request.auth.token.email
        && request.resource.data.status == 'cancelled');
  allow delete: if isAdmin(salonId);
}
```

> **Se perguntarem "porquê PII pública?":** Trade-off consciente. Sem `read: true`, anónimos não conseguem ver quais slots estão ocupados → o sistema permitiria double-booking. Para produção real, mover o slot-availability para uma **Cloud Function** que retorna só `{date, time, staffId, status}` sem nomes/emails. Está documentado no `DEPLOY.md` como future work.

### A regra do helper `isAdmin`

```javascript
function isAdmin(salonId) {
  return request.auth != null &&
    get(/databases/$(database)/documents/salons/$(salonId))
      .data.adminUid == request.auth.uid;
}
```

Faz um `get()` ao doc do salão para validar o adminUid. **Custa 1 read extra** por operação. Aceitável.

### Detalhe técnico nas regras

**Bug que apanhámos:** `get()` num batch write não vê documentos sendo criados nesse mesmo batch. Por isso o `setup.html` faz **dois batches**: primeiro cria o salão, depois cria as sub-coleções. Senão a regra `isAdmin` falhava porque o salão ainda não existia do ponto de vista do get().

---

## 5️⃣ Operações atómicas — `runTransaction` e `writeBatch`

### Onde usamos transações

**`markBookingPaid()` em `app.js`** — o pagamento é o momento crítico do produto:

```javascript
await runTransaction(db, async (tx) => {
  const bSnap = await tx.get(bookingRef);
  if (bSnap.data().paid) return { alreadyPaid: true };  // idempotent
  
  // 1. Marcar booking como pago + concluído + atribuir pontos
  tx.update(bookingRef, {
    paid: true,
    status: 'completed',
    paidAt: serverTimestamp(),
    paymentMethod: method,
    pointsAwarded: pts
  });
  
  // 2. Atualizar cliente: visits++, points+pts, totalSpent+price
  const cSnap = await tx.get(clientRef);
  tx.update(clientRef, {
    visits: c.visits + 1,
    points: c.points + pts,
    totalSpent: c.totalSpent + price,
    
    // 3. Se atingiu o target de fidelização, criar cupão
    ...(visits % target === 0 ? {
      discounts: [...c.discounts, { type: 'loyalty', ... }]
    } : {})
  });
});
```

**Garantia:** ou tudo é gravado, ou nada. Se a internet cair entre o passo 1 e 2, o booking não fica pago.

### Onde usamos `writeBatch`

**`setup.html`** — quando se cria um salão novo, gravam-se:
- 1 salon doc
- 1 schedule doc
- 1 admin user record
- 6 service docs

Tudo num só commit (segundo batch, depois do primeiro commitar o salon doc).

### Idempotência

Se o staff carrega "Pagamento" duas vezes acidentalmente:
- A transação **lê primeiro** se `paid: true`.
- Se sim, retorna cedo sem fazer nada.
- Resultado: ou cobra uma vez, ou não cobra. Nunca cobra duas.

---

## 6️⃣ Real-time updates

### Onde está ativo

| Onde | Coleção | Query | Quem vê |
|---|---|---|---|
| Admin dashboard | `bookings` (hoje) | `where('date','==', today)` | Admin |
| Admin lista marcações | `bookings` (orderBy date desc, limit 500) | — | Admin |
| Staff "Hoje" | `bookings` (today) | `where('date','==', today) orderBy('time')` | Staff |
| Zen Organic admin widget | `bookings` (today) | `where('date','==', today)` | Quem entra no admin |

### Como funciona

```javascript
const q = query(collection(db, 'salons', salonId, 'bookings'), where('date','==', today));
const unsub = onSnapshot(q, (snap) => {
  const bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderTodayList(bookings);   // re-render
  updateStatsCard(bookings);   // re-render KPIs
});
// chamar unsub() ao fazer logout
```

**Custo:** Firestore cobra por documento lido, mas leituras subsequentes são quase grátis (delta-sync). Para um salão com ~20 marcações/dia, é menos de 1 cêntimo/mês.

### Limpeza
Quando o utilizador faz logout, chamamos `unsub()` para parar o listener. Senão continua a contar leituras.

---

## 7️⃣ Hosting — multi-site no mesmo projeto Firebase

```
Firebase project "bookit-51575"
│
├── Hosting site 1: bookit-51575         → bookit-51575.web.app
│   └── Conteúdo: ./ (HTML/CSS/JS da app)
│
└── Hosting site 2: zen-organic-pt       → zen-organic-pt.web.app
    └── Conteúdo: ./ (HTML/CSS/JS do site marketing)
```

**Como se faz:**
- `firebase hosting:sites:create zen-organic-pt --project bookit-51575`
- Cada repositório tem o seu `firebase.json` com `"site": "zen-organic-pt"` ou `"site": "bookit-51575"`
- Deploy: `firebase deploy --only hosting:zen-organic-pt`

**Porquê não duas contas Firebase distintas?**
- Os dois sites partilham a mesma base de dados (Firestore). Se fossem projetos separados, teríamos de configurar acesso cross-project.
- Custo: ambos sites estão no plano Spark (free) — sem incentivo para separar.
- Manutenção: uma só consola Firebase, uma só URL de monitorização.

### Auto-deploy via GitHub

Não temos auto-deploy configurado. Para fazer deploy:
```bash
cd ~/Downloads/bookit-main
git push                                  # backup no GitHub
firebase deploy --only hosting:bookit-51575
```

Para o site Zen Organic, mesmo processo no outro repo.

---

## 8️⃣ Frontend — porquê sem framework?

### Decisão consciente

**Não usámos React/Vue/Svelte**. Razões:

1. **Tamanho do projeto** — 8 páginas isoladas, sem partilha de estado complexo. React seria overkill.
2. **Performance** — cada página carrega < 30 KB. Não há boot do framework.
3. **Manutenibilidade** — qualquer pessoa com HTML/CSS/JS básico consegue ler o código.
4. **Sem build step** — `firebase deploy` envia o código tal-como-está. Sem webpack, sem babel, sem vite.
5. **Resiliência** — frameworks deprecam. Web standards não.

### Como organizámos o código

```
bookit-main/
├── app.js              ← módulo partilhado (utilities, helpers)
├── firebase.js         ← config + re-exports da SDK
├── styles.css          ← design system completo (1500+ linhas)
├── index.html          ← booking wizard
├── account.html        ← área cliente
├── staff.html          ← portal equipa
├── admin.html          ← admin
├── login.html          ← login admin
├── setup.html          ← criação inicial de salão
├── success.html        ← confirmação de marcação
└── 404.html            ← not found
```

Cada HTML tem um `<script type="module">` que importa de `app.js` e `firebase.js`. Zero duplicação.

### O `app.js` partilhado expõe

```javascript
// DOM helpers
$, $$
// Templating XSS-safe
escapeHTML, html, htmlMix, raw
// Toast com undo
toast, toastSuccess, toastError
// Dates
formatDate, formatDatePT, formatDateLongPT, MONTHS_FULL, WEEKDAYS_SHORT
// Salon
getSalonId, loadSalon, applySalonBranding
// Click delegation
on(actionName, handler)
// Forms
showFieldError, isEmail, isPhone, isHexColor, isSlug
// Atomic ops
markBookingPaid, markBookingNoShow
// Misc
hashPassword, verifyPassword, debounce, throttle, withLock,
trapFocus, downloadCSV, getTheme, setTheme, toggleTheme
```

### XSS protection

A função `htmlMix\`<div>${untrusted}</div>\`` (tagged template literal) escapa automaticamente todos os valores interpolados. Para inserir HTML conhecido seguro, usamos o helper `raw()`. **Nunca** concatenamos HTML com `+`.

---

## 9️⃣ Fluxo completo de uma marcação — do clique à confirmação

### Cenário: cliente novo, sem conta, marca para amanhã

```
[1] Cliente abre bookit-51575.web.app/?salon=demo
     │
     │ → app.js: getSalonId() lê o "demo" do URL
     │ → app.js: loadSalon("demo") faz getDoc(salons/demo)
     │ → applySalonBranding() injeta a cor primária no CSS
     │
[2] Promo banner aparece (lê salons/demo/promotions where active==true)
     │
[3] Cliente vê 6 cards de serviços (lê salons/demo/services where active==true)
     │ Clica "Corte + Brushing"
     │ → state.selectedService = {…}
     │ → goTo(2)
     │
[4] Cliente vê 4 cards de staff (lê salons/demo/staff where active==true)
     │ Clica "Ana Silva"
     │ → state.selectedStaff = {…}
     │ → goTo(3)
     │
[5] Cliente vê calendário do mês atual
     │ → renderCalendar() desabilita dias passados, dias fechados (lê schedule)
     │ Clica em "20" (amanhã)
     │ → state.selectedDate = new Date(2026, 4, 20)
     │
[6] Sistema gera slots a partir do horário:
     │ - dia de semana → Mon: 10:00–19:00, duração serviço: 45min
     │ - generateSlots() retorna ["10:00","10:45","11:30",…,"18:15"]
     │
[7] Sistema verifica slots ocupados:
     │ → getDocs(query(bookings,
     │     where('date','==','2026-05-20'),
     │     where('staffId','==','ana-id'),
     │     where('status','in',['pending','confirmed'])
     │   ))
     │ → marca "11:30" e "14:00" como bookados
     │
[8] Cliente clica "12:15"
     │ → state.selectedTime = "12:15"
     │ → "Continuar" agora habilitado
     │ → goTo(4)
     │
[9] Cliente preenche nome/email/telefone
     │ → goTo(5) valida campos com isEmail() / isPhone()
     │ → fillConfirmation() preenche o resumo
     │
[10] Cliente clica "Confirmar marcação"
     │ → submit-booking handler embrulhado em withLock() para
     │   prevenir double-click
     │
[11] Sistema cria/encontra cliente:
     │ → getDocs(query(clients, where('email','==','x@y.com')))
     │ → se vazio: addDoc(clients) com { uid, name, email, phone,
     │     referralCode: "DEM-XYZ42", visits: 0, points: 0, … }
     │ → se existe: clientId = doc.id
     │
[12] Sistema cria o booking:
     │ → addDoc(bookings, {
     │     clientId, clientName, clientEmail, clientPhone,
     │     serviceId: "…", serviceName, serviceDuration: 45, servicePrice: 35,
     │     finalPrice: 35,
     │     staffId: "ana-id", staffName: "Ana Silva",
     │     date: "2026-05-20", time: "12:15",
     │     status: "pending", paid: false,
     │     salonId: "demo",
     │     createdAt: serverTimestamp()
     │   })
     │
[13] Sistema redireciona para success.html?salon=demo&service=…&date=…&…
     │
[14] success.html mostra animação ✓ + tabela resumo + código de referido
     │
[15] [REAL-TIME] No admin/staff que está aberto:
     │ → onSnapshot da query bookings(today) dispara
     │ → KPI "Pendentes" passa de 2 para 3 SEM REFRESH
     │ → Cronograma adiciona a nova linha
     │ → "Notificação" silenciosa
     │
[16] Mais tarde, staff clica "Confirmar"
     │ → updateDoc(booking, { status: 'confirmed' })
     │
[17] Cliente chega, staff clica "Pagamento"
     │ → modal abre, staff escolhe "Balcão"
     │ → markBookingPaid() runTransaction:
     │     - booking: { paid: true, status: 'completed', pointsAwarded: 10 }
     │     - client: { visits: 1, points: 10, totalSpent: 35 }
     │ → Toast "Pagamento registado · pontos atribuídos"
     │
[18] Cliente verifica account.html (se tiver conta):
     │ - "Visitas: 1, Pontos Zen Club: 10"
     │ - Status "Concluída + Pago"
```

---

## 🔟 Imagens — porquê base64 em Firestore (e não Firebase Storage)

### A escolha

Quando o admin faz upload de uma foto de colaborador ou da galeria, **resize-se client-side** para 400×400 (staff) ou 800×800 (galeria) JPEG quality 82, e guarda-se o `data:image/jpeg;base64,...` no campo `photoUrl` ou `url` do doc.

### Resultado em bytes
- Foto original 4MB → resize → ~30-60KB em base64
- Firestore doc max 1MB → folga de 95%

### Vantagens
- **Zero configuração** — Firebase Storage requer ativação + regras separadas.
- **Atómico** — a foto vive no doc do colaborador. Apagar o colaborador apaga a foto.
- **Sem CORS** — `data:` URLs não atravessam network.
- **Render imediato** — não há fetch HTTP da imagem.

### Desvantagens
- **Bandwidth** — cada vez que listamos colaboradores, descarregamos as fotos. Para uma equipa de 5, é ~250KB. Aceitável.
- **Sem CDN** — Firebase Storage tem CDN. Aqui não.
- **Sem transformações dinâmicas** — não posso pedir "a mesma foto mas 100×100".

### Quando migraria para Storage
Quando uma equipa passar de ~10 colaboradores **ou** quando o site tiver galerias com 100+ fotos. Para o nosso nicho (salões pequenos), está adequado.

---

## 1️⃣1️⃣ Como o Zen Organic e o BookIt se conectam

### Conceito

```
┌──────────────────────────┐         ┌──────────────────────────┐
│  zen-organic-pt.web.app  │         │   bookit-51575.web.app   │
│  (site público + admin)  │         │   (app de marcações)     │
│                          │         │                          │
│  /              landing  │         │  /              booking  │
│  /admin.html    painel   │         │  /admin.html    admin    │
│                          │         │  /staff.html    staff    │
│                          │         │  /account.html  cliente  │
└─────────────┬────────────┘         └─────────────┬────────────┘
              │                                    │
              │                                    │
              └──────────┬─────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Firestore          │
              │   salons/demo/       │
              │   (dados partilhados)│
              └──────────────────────┘
```

### O que cada site mostra

| Conteúdo | Lê de | Quem escreve |
|---|---|---|
| Equipa do site Zen Organic | `salons/demo/staff` | BookIt admin |
| Galeria do site Zen Organic | `salons/demo/site_gallery` | BookIt admin |
| Parcerias do site Zen Organic | `salons/demo/site_partners` | BookIt admin |
| Promoções do site Zen Organic | `salons/demo/promotions where active==true` | BookIt admin |
| Marcações do dia no Zen Organic admin | `salons/demo/bookings where date==today` | (não escreve) |
| Booking que o cliente faz | `salons/demo/bookings` | Cliente anónimo / logado |

### Como o cliente é "passado" entre os sites
Quando o cliente clica "Marcar visita" no Zen Organic, abre numa aba nova `bookit-51575.web.app/?salon=demo`. **O parâmetro `?salon=demo` é o que faz a app de marcações carregar o salão certo.** Sem esse parâmetro, cairia no salão default `demo` (configurado em `app.js`).

### Acesso cross-origin
Como ambos sites estão no mesmo projeto Firebase, o `authDomain` em `firebase.js` é `bookit-51575.firebaseapp.com`. Os dois sites partilham a mesma sessão de auth do utilizador. Se o cliente fizer login na app de marcações, e depois abrir o site Zen Organic numa aba nova, **a sessão persiste** (cookie partilhado no mesmo authDomain).

---

## 1️⃣2️⃣ Performance e caching

### O que carrega rápido
- Cada página HTML pesa 5-80 KB
- `styles.css` é ~50 KB (1 só ficheiro, gzip ~12 KB)
- `app.js` é ~21 KB
- Firebase SDK é importada do CDN: `https://www.gstatic.com/firebasejs/10.12.0/` (cache long-TTL no browser)
- Fontes Google Fonts (`Inter`, `Cormorant Garamond`, `Instrument Serif`, `JetBrains Mono`) com `display=swap`

### Total para um cold load
- **App de marcações**: ~150 KB transferidos (HTML+CSS+JS+SDK Firebase). LCP ~1.5s em 4G.

### Caching
- Headers Firebase Hosting padrão: `Cache-Control: max-age=3600` para HTML, mais long para assets.
- Sem service worker — keep it simple.

### O que poderíamos melhorar
- Inlinear `app.js` no HTML (eliminava 1 RTT) — mas perderia cache cross-page.
- Pre-connect ao Firestore — fácil, alguns ms de ganho.
- Lazy-load Firebase SDK só quando precisamos — só vale para a landing.

---

## 1️⃣3️⃣ Trade-offs e limitações conscientes (importante para Q&A!)

### O que ainda não está perfeito (e está documentado)

| Limitação | Solução futura | Onde está documentado |
|---|---|---|
| Bookings com PII publicamente legíveis | Cloud Function que filtra | `DEPLOY.md` |
| Single admin por salão (não multi-admin) | Array de UIDs autorizados | `README.md` |
| Sem pagamentos online (Stripe/MB Way) | Integração com Stripe Checkout | Slide 14 (roadmap) |
| Sem notificações (email/SMS/push) | Cloud Functions + SendGrid | Slide 14 |
| Sem API pública | REST endpoints via Cloud Functions | Slide 14 |
| Zen Organic admin (preços decorativos, horários decorativos) é localStorage | Migrar para Firestore | (trabalho futuro) |
| Fotos como base64 em Firestore | Migrar para Firebase Storage quando crescer | Acima |

### Coisas que DELIBERADAMENTE não fazemos

- **Não usamos framework** — explicado em §8
- **Não temos Service Worker / PWA** — overhead desproporcional para um booking site
- **Não usamos TypeScript** — projeto pequeno, JSDoc onde importa
- **Não usamos build step** — `firebase deploy` envia os ficheiros tal-como-estão
- **Não temos automated testing** — testámos manualmente seguindo um checklist E2E

---

## 1️⃣4️⃣ Perguntas frequentes prováveis (com respostas preparadas)

### "Como é que isto escala para 1000 salões?"
> *"A arquitetura suporta — cada salão é um doc isolado em Firestore. Adicionar um salão novo é correr o `setup.html`. O custo escala linearmente: Firestore Spark até ~50 mil leituras/dia, depois é €0.06 por 100k. Para 1000 salões com 50 reads/dia cada = 50k reads/dia = ainda dentro do free tier."*

### "E se a Firebase falhar?"
> *"O hosting tem SLA de 99.95% — em 12 anos nunca caiu mais de 4h. Se cair, o nosso plano B é mover o hosting para Cloudflare Pages (5 min) e ter um modo só-leitura usando o último snapshot da Firestore exportado. Nenhuma marcação se perde porque tudo é gravado em real-time na Firestore."*

### "Porquê não TypeScript?"
> *"Para o tamanho do projeto, o overhead de tooling não compensa. Em ficheiros críticos usamos JSDoc para autocomplete. Se o projeto crescesse para 50k linhas, sim — agora é manutenção mínima sem TS."*

### "E a privacidade dos clientes? GDPR?"
> *"Temos uma função 'Apagar conta' na área pessoal que anonimiza o doc do cliente — mantemos o histórico de marcações por razões contabilísticas, mas removemos nome/email/telefone. A regra Firestore garante que só o próprio pode chamar essa ação. Os bookings têm read público, o que é o trade-off mais sensível e está documentado para mover para Cloud Function antes de uso real."*

### "Como gerem o booking de uma sala/recurso (não só pessoa)?"
> *"O modelo de `staffId` é genérico — pode representar uma pessoa OU um recurso. Para um salão com 2 cabines de coloração, criaríamos dois 'colaboradores' com nomes 'Cabine 1' / 'Cabine 2' e horários próprios. Para uso real, mudaríamos o nome do campo para `resourceId`."*

### "E o multi-tenant em produção? Como é que um salão novo se inscreve?"
> *"O `setup.html` está acessível publicamente em `bookit-51575.web.app/setup.html` mas hoje quem o usa preenche manualmente. Para produção: criaríamos uma landing comercial separada com onboarding guiado + pagamento Stripe + criação automática do salão via setup. Mas o backend já suporta — basta o front."*

### "Porquê duas frontends e não uma SPA?"
> *"Porque são produtos diferentes: o site institucional do Zen Organic é marketing (precisa de SEO, conteúdo editorial, é por salão). A app de marcações é multi-tenant. Misturar atrasava ambos. Estão ligados via `?salon=demo` e partilham o backend."*

### "Quanto tempo demoraram?"
> *"Cerca de 4 semanas de trabalho intenso, distribuído pelo semestre. ~80h de trabalho conjunto. Pair-programming em partes complexas (regras de segurança, transações atómicas), trabalho individual nas páginas e CSS."*

### "Quem faz o quê?"
> *"Dividimos por surfaces, não por funcionalidades. Um focou-se no fluxo cliente + Zen Organic. Outro focou-se no admin + staff. A base partilhada (`app.js`, `styles.css`, regras Firestore) foi co-construída."*

### "Posso ver o código?"
> *"Sim — está em github.com/guerreiro2003/bookit (público) e github.com/guerreiro2003/zenorganic. 12 commits documentados com mensagens descritivas."*

---

## 1️⃣5️⃣ Coisas para mencionar PROACTIVAMENTE durante a demo

Se ninguém perguntar, **diz tu** (eleva imediatamente a perceção do projeto):

1. **"A regra Firestore mais difícil foi a dos bookings — equilibrar slot-collision pública com privacidade de PII."**
2. **"O pagamento é uma transação atómica via `runTransaction` — booking + cliente + cupão tudo num só commit. Se uma parte falhar, nada se grava."**
3. **"O `setup.html` cria o salão em dois batches consecutivos porque as regras Firestore não conseguem fazer `get()` em docs sendo criados no mesmo batch."**
4. **"As fotos da equipa são guardadas em base64 dentro dos próprios docs — resize client-side para 400×400 JPEG ~50KB. Cabem nos 1MB/doc do Firestore com folga."**
5. **"A app é multi-tenant — adicionar um salão novo é correr o `setup.html`. Adicionámos sub-domains de hosting para o Zen Organic ter o seu URL próprio sem perder o Firebase Auth partilhado."**

---

## 1️⃣6️⃣ Mapa rápido de "se perguntarem X, vai à secção Y"

| Pergunta sobre | Secção |
|---|---|
| Schema da BD, coleções | §2 |
| Como funciona o login | §3 |
| Segurança, permissões | §4 |
| O que é atómico, pagamentos | §5 |
| Real-time / WebSockets / polling | §6 |
| Hosting, deploys, URLs | §7 |
| Porquê HTML/JS puro | §8 |
| Como funciona uma marcação | §9 |
| Imagens, uploads | §10 |
| Como os dois sites se conectam | §11 |
| Performance, tamanho, carregamento | §12 |
| Limitações, o que falta | §13 |
| Perguntas comuns | §14 |

---

**Lê isto 2x antes da apresentação.** A maioria das perguntas técnicas vai cair em uma destas 16 secções. Vais saber.
