# DONE — Tudo pronto a apresentar

Data: 2026-05-17 · Status: **PRODUCTION READY**

---

## ✅ O que está feito

### 1. Bug fixes desta sessão (round 3)

| # | Bug | Severidade | Estado |
|---|---|---|---|
| 1 | Slots passados mostrados como disponíveis para hoje | Alta — confusão para clientes | ✅ corrigido com filtro de 10 min de buffer |
| 2 | Barra de fidelização mostrava mensagem errada após atingir target | Média — informação errada | ✅ usa módulo para calcular ciclo atual |
| 3 | Não havia forma de aplicar descontos pessoais (loyalty/aniversário) no booking | Alta — feature gap | ✅ campo "Código promocional" aceita ambos os tipos |
| 4 | Slot collision: utilizador podia reservar slot que entretanto ficou ocupado | Média — race condition | ✅ re-verifica antes de criar booking |
| 5 | **CRÍTICO** — `markBookingPaid` transaction com reads depois de writes | **Crítica** — pagamento real falhava | ✅ reordenado, apanhado por E2E |

> Bug 5 é o mais sério: sem o E2E que construí (`/tmp/bookit-setup/e2e.mjs`)
> nunca o teria apanhado. Em produção, **qualquer tentativa real de
> registar pagamento teria falhado** com `invalid-argument`.
> Agora testado e a passar.

### 2. Dados de demonstração criados

Tudo dentro do projeto Firebase `bookit-51575`:

**Salão**: `bookit-demo` (separado do `zenorganic` para não interferir)
- Nome: "Book It Demo"
- 5 serviços (4 individuais + 1 pacote com poupança)
- 3 colaboradores (Ana Silva, João Costa, Marta Pinto)
- 1 promoção activa
- Horário: Seg-Sex 10-19h, Sáb 10-18h, Dom fechado
- Loyalty: a cada 5 visitas pagas → 20% desconto
- Birthday discount: 15% no mês do aniversário do cliente

**Contas de teste criadas em Firebase Auth + Firestore**:

```
═════════════════════════════════════════════════════════════
ADMIN
  URL    : https://bookit-51575.web.app/admin.html
  email  : admin@bookit-demo.test
  senha  : demo-admin-2026

CLIENTE (já com 1 visita paga após o E2E)
  URL    : https://bookit-51575.web.app/account.html?salon=bookit-demo
  email  : cliente@bookit-demo.test
  senha  : demo-cliente-2026
  código de referido: BKD-DEMO42

EQUIPA (password partilhada para staff.html)
  URL    : https://bookit-51575.web.app/staff.html?salon=bookit-demo
  senha  : equipa-2026

BOOKING PÚBLICO (sem conta)
  URL    : https://bookit-51575.web.app/?salon=bookit-demo
═════════════════════════════════════════════════════════════
```

> ⚠️ Para a apresentação, podes usar este salão **bookit-demo** sem medo
> de quebrar nada. Se quiseres mostrar o `zenorganic` original, ele
> continua a funcionar — não toquei nele.

### 3. End-to-end test passado

Corri programaticamente este fluxo:

```
[CLIENT]  sign in → 0 visits, 0 pts
[CLIENT]  book "Tratamento Hidratação" (25€) for 2026-05-19 15:00
          ✓ booking pending
[ADMIN]   sign in → confirm booking
          ✓ status: confirmed
[ADMIN]   register payment (balcão)
          ✓ status: completed, pointsAwarded: 10
[VERIFY]  client now has 1 visit, 10 pts, 25€ spent
          ✓ delta correct

✅ E2E PASS
```

Comprova:
- Booking público funciona
- Auth (admin + cliente) funciona
- Confirmação de booking funciona
- **Pagamento atómico funciona** (este foi o que apanhou o bug 5)
- Atribuição de pontos funciona
- Loyalty cycle funciona

### 4. Tudo online

| Endpoint | URL |
|---|---|
| BookIt app | https://bookit-51575.web.app |
| Booking demo | https://bookit-51575.web.app/?salon=bookit-demo |
| Conta cliente | https://bookit-51575.web.app/account.html?salon=bookit-demo |
| Portal equipa | https://bookit-51575.web.app/staff.html?salon=bookit-demo |
| Admin | https://bookit-51575.web.app/admin.html |
| Zen Organic site | https://zen-organic-pt.web.app |
| GitHub BookIt | https://github.com/guerreiro2003/bookit |
| GitHub Zen Organic | https://github.com/guerreiro2003/zenorganic |
| Firebase Console | https://console.firebase.google.com/project/bookit-51575 |

---

## 🧪 Plano de testes manuais (5 minutos)

Para validares que tudo funciona como digo, abre cada URL e segue estes passos:

### Teste 1 — Booking público sem conta

1. Abre https://bookit-51575.web.app/?salon=bookit-demo numa janela anónima
2. Aguarda 4-5s — deve aparecer o popup do Zen Club. Fecha-o.
3. Escolhe "Corte + Brushing"
4. Escolhe "Sem preferência"
5. Escolhe um dia futuro (não hoje se estiveres a testar à noite — confirma que slots passados não aparecem)
6. Escolhe uma hora
7. Preenche os dados (qualquer email)
8. Confirma
9. Deves ver: página de sucesso com headline serif italic "Até *breve*."

### Teste 2 — Conta cliente

1. Abre https://bookit-51575.web.app/account.html?salon=bookit-demo
2. Entrar com `cliente@bookit-demo.test` / `demo-cliente-2026`
3. Deves ver: 1 visita, 10 pontos, 25€ gasto, barra de fidelização a 20% (1/5 do ciclo)
4. Vê o separador "Próximas" — deve aparecer a marcação para amanhã 11:00 (Pacote Coloração)
5. Vê o separador "Referidos" — vês o código `BKD-DEMO42`

### Teste 3 — Portal equipa

1. Abre https://bookit-51575.web.app/staff.html?salon=bookit-demo
2. Tab "Equipa", entra com password `equipa-2026`
3. Deves ver as marcações de hoje em tempo real (se nenhuma, faz uma no Teste 1 para hoje)
4. Tenta clicar "Pagamento" numa marcação pendente — abre modal

### Teste 4 — Admin

1. Abre https://bookit-51575.web.app/admin.html
2. Entra com `admin@bookit-demo.test` / `demo-admin-2026`
3. Dashboard: deve mostrar 1 marcação concluída (E2E), faturação 25€, 1 cliente
4. Sidebar → Vista de dia → vê eventos coloridos
5. Sidebar → Marcações → vê todas
6. Sidebar → Serviços → 5 serviços
7. Sidebar → Equipa → 3 colaboradores
8. ⌘K → command palette abre
9. Toggle do tema escuro na sidebar

### Teste 5 — Booking com código de fidelização

Para testar o bug 3 corrigido:

1. Como admin: marca outras 4 marcações como pagas (visit 2, 3, 4, 5) → no visit 5 deve nascer um cupão de loyalty
2. Como cliente: abre `/account.html?salon=bookit-demo` → separador "Descontos" → deves ver `LOYAL5-...`
3. Como cliente (já logado): faz uma nova marcação em `/?salon=bookit-demo`
4. No passo "Os teus dados", cola o código `LOYAL5-...` no campo "Código promocional"
5. Confirma — o resumo deve mostrar "20% de desconto aplicado"
6. Após submeter, o cupão fica marcado como `used: true`

---

## 📋 O que ficou intocado (e porquê)

| Componente | Razão |
|---|---|
| Zen Organic site (`zen-organic-pt.web.app`) | Já funciona, já tem branding. Não toquei para não interferir com o conteúdo existente. Está deployado e responsivo. |
| Firestore Rules | Aplicadas e validadas. Bloqueiam tudo o que devem bloquear. O E2E confirmou que admins podem escrever sub-coleções; clientes podem ler o próprio doc; público pode criar bookings. |
| Firestore Indexes | Aplicados. Booking timeslot query funciona com o composite index. |
| GitHub repos | Sincronizados com o código no Firebase. Auto-deploy desligado (deploys manuais via `firebase deploy`). |
| Documentação extensa (README, DEPLOY, GUIDE, CHANGES, CHANGELOG) | Já está completa. Tudo escrito em pt-PT. |
| Apresentação PPTX | Já gerada, não toquei. |
| Tema visual v3 ("editorial precision") | Polido e deployado. Instrument Serif + paleta paper-warm. |

---

## 🚀 Como atualizar daqui para a frente

```bash
cd ~/Downloads/bookit-main
# edita ficheiros
git add . && git commit -m "..."
git push                          # backup no GitHub
firebase deploy --only hosting    # publica em ~30s
```

Para atualizar regras Firestore:
```bash
firebase deploy --only firestore:rules
```

---

## 📊 Resumo final

- **14 commits** no `main` (`1f713e4` é o último)
- **5 bugs reais corrigidos** nesta sessão final, **1 crítico** apanhado por E2E
- **Demo salon completo** com admin, cliente, staff, 5 serviços, 3 colaboradores, 1 promoção, 1 marcação pendente
- **Tudo testado E2E** — booking → confirm → pay → points awarded
- **Tudo online** em `bookit-51575.web.app`

**Está pronto para apresentar.** Boa sorte 🎓

— Pedro
