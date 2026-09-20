# Problemas conhecidos

Coisas que sabemos que estão mal e ainda não corrigimos. Um problema só sai desta lista quando estiver corrigido **e** tiver um teste que impeça o regresso.

---

## KI-001 · Dois salões, e o "a sério" tem o slug errado {#ki-001}

**Gravidade:** média · **Estado:** à espera de decisão do Pedro (B2)

Restam dois tenants, e estão trocados em relação ao que seria de esperar:

| Salão | Nome | Plano | Clientes | Marcações | O que é |
|---|---|---|---|---|---|
| `demo` | Zen Organic Hair Concept | **active** | 8 | 27 (nov/25 → ago/26) | O que está vivo: site, testes, demo |
| `zen-organic` | Zen Organic Hair concept | — | 5 (`jkeke`, `ffff`…) | 4 (abr/26) | Tentativa antiga, dados de teste |

O salão com os dados reais e o plano ativo é o `demo`; o slug bonito (`zen-organic`) está no que tem lixo. O URL que um cliente real vê é `?salon=demo`, o que não se vende.

**Opções:** (a) manter como está; (b) migrar o `demo` para o slug `zen-organic` (precisa de um script novo — `migrate-salon.mjs` faz upgrade no lugar, não muda o id); (c) criar o tenant definitivo de raiz quando houver contrato.

**Risco de não decidir:** trabalhar no tenant errado, ou entregar ao cliente um URL com "demo".

---

## ~~KI-002 · Password de equipa partilhada, sem rasto de quem fez o quê~~ ✅ resolvido 2026-09-20

Cada pessoa passou a ter a sua conta (`staffAuth/{uid}`), e confirmar/cancelar/falta/pagamento/reagendar gravam quem fez. A password partilhada continua a funcionar para ninguém ficar fechado de fora durante a migração — **remover essa via é um passo a dar quando todos os salões ativos tiverem contas individuais.** Coberto por `tests/team-access.e2e.mjs` (26).

---

## KI-003 · O documento público do salão expõe emails de administração

**Gravidade:** alta · **Estado:** por corrigir

`salons/{id}` é de leitura pública (a página de marcação precisa). Leva consigo `adminEmail`, `teamEmail`, `adminUid`, `teamUid`, `plan` e `subscriptionStatus`. O `adminEmail` controla toda a carteira de clientes do salão e está à vista de qualquer pessoa.

**Solução:** mover as definições públicas para `salons/{id}/config/public` e fechar o documento do salão a staff.

---

## KI-004 · Leituras sem limite em três painéis

**Gravidade:** média · **Estado:** por corrigir

`loadRetention()` lê **540 dias de marcações** por cada abertura do painel Reativar. O painel Negócio lê todo o intervalo. O exportador JSON lê coleções inteiras. Um salão com 3 000 marcações em 18 meses faz 3 000 leituras por abertura — é o maior consumidor de quota do produto.

**Solução:** manter contadores por cliente na escrita (`lastVisitDate`, `visits`, `totalSpent` já existem) em vez de recalcular do histórico.

---

## KI-005 · Fotografias em base64 dentro do Firestore

**Gravidade:** média · **Estado:** adiado (precisa de Blaze)

`photoUrl` até 400 000 caracteres, e os documentos de equipa são de leitura pública: cada visita à página de marcação descarrega as fotos todas como parte do JSON. Limite de 1 MiB por documento.

---

## KI-006 · Sem monitorização nem rastreio de erros

**Gravidade:** alta · **Estado:** por corrigir

Se o site cair às 9h de segunda, ficamos a saber quando o salão ligar. Os erros dos clientes finais são invisíveis — só existe `console.error` no browser deles. Sentry e um monitor de uptime são gratuitos nos escalões que precisamos.

---

## KI-007 · Marcação fica em fila quando o cliente perde a internet

**Gravidade:** média · **Estado:** por corrigir

A persistência offline do Firestore põe a escrita em fila. A marcação pode entrar horas depois, quando o cliente já foi a outro lado. Na criação de marcações queremos falhar depressa, não em silêncio.

---

## KI-008 · Reagendar para o passado é permitido ao staff

**Gravidade:** baixa · **Estado:** por corrigir

`rescheduleBooking` passa `notBefore: null`. Útil para corrigir registos, mas corrompe as métricas de faltas sem aviso nenhum.

---

## KI-009 · Dois utilizadores a editar ao mesmo tempo, última escrita ganha

**Gravidade:** baixa · **Estado:** aceite por agora

Dois funcionários a editar a mesma ficha de cliente perdem o trabalho um do outro, sem aviso. Aceitável nesta escala; a rever quando houver salões com equipas grandes.

---

## KI-010 · CSP com `unsafe-inline`

**Gravidade:** média · **Estado:** adiado

Todo o código vive em `<script type="module">` dentro do HTML, por isso a CSP tem de permitir inline — o que anula grande parte da proteção contra XSS. Hoje o escape é consistente (`htmlMix`/`raw`), por isso é risco latente. Extrair o JS para ficheiros resolve as duas coisas.

---

## KI-011 · CI parcial

**Gravidade:** baixa · **Estado:** parcialmente resolvido 2026-09-20

Os testes unitários e a verificação de sintaxe passaram a correr a cada push (`.github/workflows/tests.yml`). **As suites E2E continuam de fora**, porque escrevem no projeto real — correm-se à mão com `npm run test:all` antes de um deploy. O deploy também continua manual.


---

## KI-012 · Backup automático à espera de dois segredos

**Gravidade:** alta · **Estado:** código pronto, falta configuração

`.github/workflows/backup.yml` está escrito, cifra os dados antes de os guardar e confirma que o ficheiro volta a abrir. Falta o Pedro criar `GOOGLE_SERVICE_ACCOUNT_JSON` e `BACKUP_PASSPHRASE` nos segredos do repositório — instruções no cabeçalho do workflow e em `DISASTER_RECOVERY.md`.

Até lá, o único backup é o que se corre à mão, e só existe no portátil dele.

---

## KI-013 · Sem PITR nem proteção contra apagar a base de dados

**Gravidade:** média · **Estado:** decisão de negócio ([D-004](DECISIONS.md#d-004))

Ambos exigem plano Blaze. Sem PITR, a granularidade de recuperação é o último backup — perde-se até 24 horas. Sem proteção contra apagar, alguém com acesso ao projeto pode destruir o Firestore inteiro de uma vez.
