# Deploy Book It — guia passo a passo

Tempo total: ~15 minutos.

---

## 1. Pré-requisitos

- Conta Google com acesso ao projeto Firebase **bookit-51575** (já existente).
- Conta Netlify (ou qualquer host estático: Vercel, GitHub Pages…).
- Conta na consola da Firestore (mesma do projeto Firebase).

---

## 2. Firestore security rules (CRÍTICO)

Abre a [consola da Firestore](https://console.firebase.google.com/project/bookit-51575/firestore/rules) → **Rules** → cola exatamente isto e clica **Publish**:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: utilizador autenticado
    function isAuth() { return request.auth != null; }

    // Helper: é admin deste salão
    function isAdmin(salonId) {
      return isAuth() &&
        get(/databases/$(database)/documents/salons/$(salonId)).data.adminUid == request.auth.uid;
    }

    // ── Salão (doc principal) ──
    match /salons/{salonId} {
      // Qualquer pessoa lê os dados do salão (nome, cor, etc.) para o site público
      allow read: if true;
      // Só o admin (Firebase Auth) consegue alterar
      allow update: if isAdmin(salonId);
      // Criar: apenas via setup.html, qualquer um pode (mas só se o slug ainda não existir).
      // A regra abaixo permite a criação atómica via writeBatch.
      allow create: if isAuth() && request.resource.data.adminUid == request.auth.uid;
      allow delete: if false;

      // Config (horário do salão)
      match /config/{document=**} {
        allow read: if true;
        allow write: if isAdmin(salonId);
      }

      // Utilizadores admin do salão
      match /users/{uid} {
        allow read: if isAuth() && request.auth.uid == uid;
        allow write: if isAdmin(salonId) || request.auth.uid == uid;
      }

      // Serviços, equipa, promoções: leitura pública (para o site), escrita só admin
      match /services/{id} {
        allow read: if true;
        allow write: if isAdmin(salonId);
      }
      match /staff/{id} {
        allow read: if true;
        allow write: if isAdmin(salonId);
      }
      match /promotions/{id} {
        allow read: if true;
        allow write: if isAdmin(salonId);
      }

      // Clientes
      match /clients/{clientId} {
        // Cliente lê o próprio perfil; admin lê todos
        allow read: if isAdmin(salonId)
                    || (isAuth() && resource.data.uid == request.auth.uid)
                    || (isAuth() && resource.data.email == request.auth.token.email);
        // Cliente atualiza o próprio; admin atualiza qualquer um
        allow update: if isAdmin(salonId)
                      || (isAuth() && resource.data.uid == request.auth.uid)
                      || (isAuth() && resource.data.email == request.auth.token.email);
        // Criar: qualquer pessoa (durante checkout sem conta, criamos um cliente novo)
        allow create: if true;
        allow delete: if isAdmin(salonId);
      }

      // Marcações
      match /bookings/{id} {
        // Cliente lê as próprias; admin lê todas
        allow read: if isAdmin(salonId)
                    || (isAuth() && resource.data.clientEmail == request.auth.token.email);
        // Criar marcação: qualquer pessoa (booking público, sem conta)
        allow create: if true;
        // Atualizar marcação: admin sempre; cliente só pode cancelar a própria
        allow update: if isAdmin(salonId)
                      || (isAuth() && resource.data.clientEmail == request.auth.token.email
                          && request.resource.data.status == 'cancelled');
        allow delete: if isAdmin(salonId);
      }
    }
  }
}
```

> Estas regras são **um ponto de partida sensato**. Permitem o booking público funcionar, mantêm os dados do cliente privados, e dão controlo total ao admin. Antes de produção, revê-as e adapta-as à tua tolerância de risco.

---

## 3. Composite indexes da Firestore

Quando alguém escolher um colaborador específico e abrir um dia no calendário, a query precisa deste índice. O código tem **fallback** para funcionar sem o índice, mas é lento. Para criar:

Abre a [consola → Indexes](https://console.firebase.google.com/project/bookit-51575/firestore/indexes) → **Add index**:

| Collection group | Field 1 | Field 2 | Field 3 | Query scopes |
| ---------------- | ------- | ------- | ------- | ------------ |
| `bookings` | `date` (Asc) | `staffId` (Asc) | `status` (Asc) | Collection group |

Clica **Create**. Demora 1-2 minutos a indexar.

Se aparecer um erro no browser tipo "The query requires an index", clica no link do erro — a Firestore gera o índice exato automaticamente.

---

## 4. Migração de dados (se já tens o salão "zenorganic")

Se já tinhas o salão criado no v1, abre uma vez o admin e:

1. Vai a **Configurações** → escreve uma nova password da equipa → **Guardar**.
   - Isto grava o hash em `teamPasswordHash` e o login da equipa em `staff.html` passa a usar o hash. O campo antigo `teamPassword` em plaintext continua a funcionar como fallback até guardares uma nova.
2. Vai a **Fidelização** → confirma `noShowPenalty: 5` (ou outro valor).
3. Vai a **Serviços** → edita um serviço que seja pacote → muda **Tipo** para "Pacote" → preenche **Preço original** e **Inclui**.

Os campos novos têm valores por defeito no código (`pointsPerVisit: 10`, etc.), portanto nada parte se ainda não os tiveres definido.

---

## 5. Deploy no Netlify

### Opção A — Drag & drop (mais rápido)

1. Vai a [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrasta a pasta **bookit-main** (descomprimida) para o quadrado.
3. Pronto. URL gerado automaticamente.
4. Se já tens `bookit00.netlify.app`: **Deploys** → arrasta a pasta para fazer overwrite.

### Opção B — Git

1. Faz push da pasta `bookit-main` para um repo GitHub.
2. Netlify → **Add new site** → **Import existing project** → seleciona o repo.
3. Build command: deixar vazio. Publish directory: `/` (root) ou `bookit-main`.

### URLs a usar depois do deploy

- Marcações: `https://bookit00.netlify.app/?salon=zenorganic`
- Conta cliente: `https://bookit00.netlify.app/account.html?salon=zenorganic`
- Portal equipa: `https://bookit00.netlify.app/staff.html?salon=zenorganic`
- Admin: `https://bookit00.netlify.app/admin.html` *(sem `?salon=`)*
- Setup novo salão: `https://bookit00.netlify.app/setup.html`

---

## 6. Testar tudo (checklist em 5 min)

Em janela anónima (`Cmd+Shift+N`):

1. **Booking público** — `bookit00.netlify.app/?salon=zenorganic`.
   - Pop-up Zen Club aparece ao fim de 4 s? ✓
   - Fluxo 1→5 passos funciona? ✓
   - Confirmação cria entrada na Firestore? ✓

2. **Cliente registado** — `account.html?salon=zenorganic`.
   - Cria conta nova. Verifica próximas / histórico vazio. ✓
   - Faz uma marcação a partir do `index.html` enquanto logado → vê em "Próximas". ✓
   - Cancela e vê "Anular" no toast por 6 s. ✓

3. **Admin** — `admin.html`.
   - Login. Dashboard mostra estatísticas. Real-time funciona (cria booking noutra aba → aparece no dashboard sem refresh). ✓
   - `⌘K` abre command palette. ✓
   - Cria nova marcação manualmente. ✓
   - Vista de dia mostra eventos coloridos. ✓
   - Exporta CSV de marcações. ✓
   - Configurações → guarda nova password da equipa. ✓
   - Toggle dark mode na sidebar. ✓

4. **Staff** — `staff.html?salon=zenorganic`.
   - Login com password da equipa. ✓
   - "Hoje" atualiza-se em tempo real quando o cliente faz booking. ✓
   - Registar pagamento → atribui pontos atomicamente. ✓
   - Não compareceu → desconta pontos. ✓

5. **Mobile** — abre admin no telemóvel.
   - Burger menu funciona. ✓
   - Tabelas com scroll horizontal. ✓
   - Modais a 100% do écrã. ✓

---

## 7. Problemas comuns

- **"Permission denied" na Firestore** — verifica regras (passo 2). Mais comum: tentaste apagar um cliente sendo cliente (só admin pode).
- **"The query requires an index"** — clica no link do erro; a Firestore gera o índice automaticamente, ou cria manualmente (passo 3).
- **Pop-up aparece sempre** — limpa o localStorage do browser; a chave é `bookit:club_dismissed`.
- **Admin não vê o salão** — o `adminUid` da Firestore não bate certo com o teu UID atual. Cria um novo admin em `setup.html` com um slug novo, ou edita o documento `salons/{salonId}` na consola e mete o teu UID atual em `adminUid`.
- **Dark mode não persiste** — verifica se o navegador permite localStorage para o domínio.

---

## 8. Próximos passos opcionais

- Domínio personalizado no Netlify: **Domain settings** → **Add custom domain**.
- Backups: ativa o **Firestore Backup** na Google Cloud Console.
- Analytics: Google Analytics ou Plausible no `<head>` de cada página.
- Reset de "agora não" do popup: muda o `POPUP_KEY` em `index.html` para forçar nova exibição.

Boa sorte.
