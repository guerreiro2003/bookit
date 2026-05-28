# Book It

Plataforma web multi-tenant de marcações para salões de cabeleireiro.
Feita em HTML / CSS / JavaScript puro (ES Modules, sem build step) com
Firebase (Authentication + Cloud Firestore). Alojada como site estático no
Firebase Hosting.

**Projeto académico** — Projeto de Desenvolvimento de Software, 4.º Semestre,
Licenciatura em Informática de Gestão (L-IG), IADE · Universidade Europeia,
2025/2026.

Autores: **Pedro Guerreiro** (20221080) · **Tomás Ramos** (20210834) ·
**Alberto Zumbi** (50036118)
Coordenador: Professor António Travanca Lopes

---

## ✅ Como testar (para avaliação)

Está tudo em produção, com dados reais. Não é preciso instalar nada — basta
abrir os links e usar as credenciais abaixo.

### Links de produção

| O quê | Link |
| ----- | ---- |
| **App de marcações** (cliente) | https://bookit-51575.web.app/?salon=demo |
| **Área pessoal / Zen Club** (cliente) | https://bookit-51575.web.app/account.html?salon=demo |
| **Portal da equipa** | https://bookit-51575.web.app/staff.html?salon=demo |
| **Painel de administração** | https://bookit-51575.web.app/admin.html |
| **Setup de novo salão** | https://bookit-51575.web.app/setup.html |
| **Site institucional Zen Organic** | https://zen-organic-pt.web.app |
| **Admin de conteúdo Zen Organic** | https://zen-organic-pt.web.app/admin.html |

### Credenciais de teste

| Papel | Email / Identificador | Password |
| ----- | --------------------- | -------- |
| **Admin** (Book It) | `admin@bookit.demo` | `Demo2026!` |
| **Equipa** (staff.html) | *(sem email; password partilhada)* | `equipa2026` |
| **Cliente** (account.html) | `cliente@bookit.demo` | `Cliente2026!` |
| **Admin de conteúdo** (Zen Organic) | *(password local)* | `zen2025` |

### Sugestão de percurso de teste

1. **Marcar como visitante** — abrir a app de marcações, escolher serviço →
   colaborador → data → hora → preencher dados → confirmar.
2. **Equipa** — entrar no portal da equipa com `equipa2026`, ver a marcação a
   aparecer no separador "Hoje", confirmar e registar pagamento (atribui pontos
   automaticamente).
3. **Cliente** — entrar em account.html com `cliente@bookit.demo` para ver
   pontos, histórico e cupões.
4. **Admin** — entrar em admin.html para ver o dashboard em tempo real, a vista
   de dia, clientes, serviços, equipa, e gerir o conteúdo do site (galeria,
   parcerias) que reflete no site do Zen Organic em tempo real.

> O salão de demonstração (`?salon=demo`) está populado com 6 serviços, 3
> colaboradores, marcações de exemplo e uma promoção ativa.

---

## 📄 Relatórios do projeto

| Entrega | Ficheiro |
| ------- | -------- |
| Milestone 1 (proposta) | `Milestone1_BookIt_Relatorio.docx` |
| Milestone 2 (protótipo) | `Milestone2_BookIt_Relatorio.docx` |
| Milestone 3 (final) | `Milestone3_BookIt_RelatorioFinal.docx` |

Documentação de apoio: `GUIA_DEMO_AO_VIVO.md` (guião de apresentação),
`GUIA_TECNICO_QA.md` (perguntas técnicas), `CHANGELOG.md`, `DEPLOY.md`.
Apresentação: `Apresentacao_BookIt.pptx`.

---

## Ficheiros do código

| Ficheiro | Função |
| -------- | ------ |
| `index.html` | Wizard de marcação (5 passos, público). |
| `account.html` | Área do cliente: próximas, histórico, descontos, referidos, dados. |
| `staff.html` | Portal da equipa: hoje (tempo real), todas as marcações, serviços, clientes. |
| `admin.html` | Admin: dashboard, marcações, vista de dia, clientes, serviços, equipa, galeria, parcerias… |
| `login.html` | Login do admin. |
| `setup.html` | Criação inicial de salão (atómica, via `writeBatch`). |
| `success.html` | Confirmação pós-marcação. |
| `styles.css` | Design system: tokens, componentes, dark mode, responsivo. |
| `app.js` | Utilitários partilhados (templating anti-XSS, datas, validação, transações, tema, CSV…). |
| `firebase.js` | Config do SDK Firebase + exports. |
| `firestore.rules` | Regras de segurança Firestore (deployadas em produção). |
| `firestore.indexes.json` | Índices compostos. |

## Correr localmente

```bash
cd bookit-main
python3 -m http.server 8000
# abrir http://localhost:8000/?salon=demo
```

## Arquitetura

### Multi-tenant

Cada salão vive em `salons/{salonId}` com todos os subdados aninhados.
Selecionado via `?salon=…` (default `demo`).

```
salons/{salonId}
  ├ config/schedule
  ├ services/{id}
  ├ staff/{id}
  ├ promotions/{id}
  ├ clients/{uid}
  ├ bookings/{id}
  ├ site_gallery/{id}
  └ site_partners/{id}
```

### Autenticação

- **Admin**: Firebase Auth email/password. Identificado por `salons/{id}.adminUid`.
- **Cliente**: Firebase Auth email/password. Perfil em `salons/{id}/clients/{uid}`.
- **Equipa**: `teamPasswordHash` partilhada (SHA-256) no documento do salão.
  Sessão de 8 horas em sessionStorage. O admin pode entrar no mesmo portal com
  as suas próprias credenciais.

### Máquina de estados das marcações

```
pending ─→ confirmed ─→ completed
   │           │
   └──→ cancelled  noshow
```

Efeitos de `completed` via `markBookingPaid()` (transação atómica):

- Marcação fica `paid`, `pointsAwarded`, `paymentMethod`.
- Cliente ganha `pointsPerVisit` (default 10).
- Se `visits % loyaltyVisits === 0`, é adicionado um cupão de fidelização ao
  array `discounts` do cliente.

Efeitos de `noshow` via `markBookingNoShow()` (transação atómica):

- Marcação fica `noshow`.
- `points` do cliente decrementados por `noShowPenalty` (default 5).

### Branding por salão

O documento do salão tem `primaryColor`. No arranque, `applySalonBranding()`
define `--brand` e `--brand-rgb` como CSS custom properties — sem rebuild.

## Convenções

### Templating anti-XSS

```js
import { html, htmlMix, raw, escapeHTML } from './app.js';

// Escapa automaticamente todas as interpolações:
el.innerHTML = html`<div>${untrusted}</div>`;
```

### Event delegation

Botões declaram a ação via `data-action="some-name"`; um único listener
delegado despacha. Sem `onclick=` inline.

### Escritas atómicas

Operações multi-documento usam `runTransaction` ou `writeBatch`. O setup cria
o salão, horário, registo de admin e serviços de exemplo (em dois batches,
porque as regras precisam do documento do salão existir primeiro). Pagamento +
pontos acontecem numa só transação.

### Tema

Light/dark via `[data-theme]` no `<html>`. Por defeito light; a escolha do
utilizador persiste em localStorage. Botão de toggle na sidebar do admin e no
header da equipa.

### Atalhos de teclado

- `⌘K` / `Ctrl+K` — command palette (admin)
- `Esc` — fechar qualquer modal / popup

## Trabalho futuro

- **Notificações por email / SMS** — requerem Cloud Functions (SendGrid / Twilio).
- **Pagamento online (MB Way / Stripe)** — o modal regista o método; o
  processamento real fica por integrar.
- **Cloud Function para slots** — para não expor a leitura pública de bookings.
- **Multi-admin por salão** — atualmente um único `adminUid`.

---

Pedro Guerreiro 20221080 · Tomás Ramos 20210834 · Alberto Zumbi 50036118
L-IG · 4.º Semestre · IADE · Universidade Europeia · 2025-2026
