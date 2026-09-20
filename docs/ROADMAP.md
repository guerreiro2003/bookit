# Roadmap

Uma fase só se fecha quando não tiver bloqueadores reais. Ver [PROJECT_STATUS](PROJECT_STATUS.md) para o estado de hoje.

---

## PHASE 0 — AUDIT ✅ concluída

Auditoria completa a 2026-09-18: 4 críticos, 7 graves, 13 médios. Duas falhas exploradas contra produção. Relatório entregue.

---

## PHASE 1 — CRITICAL FIXES ✅ concluída (2026-09-20)

| | Tarefa | Evidência |
|---|---|---|
| ✅ | Agenda à prova de sabotagem | `abuse.e2e` — 5 ataques recusados |
| ✅ | Email verificado exigido | `abuse.e2e` — 4 ataques recusados |
| ✅ | `bookingLinks` ligado a uma marcação real | `abuse.e2e` |
| ✅ | Functions ignoram histórico importado | `functions/index.js` |
| ✅ | Primeiro backup alguma vez feito | `backups/` |
| ✅ | Tenants duplicados limpos | 7 → 2 salões |

---

## PHASE 2 — CORE PRODUCT 🟡 quase

| | Tarefa | Notas |
|---|---|---|
| ✅ | Motor transacional, tempo de espera, vários serviços | |
| ✅ | Importador CSV/Excel | Desbloqueia quem vem de outro software |
| ✅ | Retenção e reativação com receita atribuída | A diferenciação real |
| ✅ | Aviso ao cliente no reagendamento | |
| ✅ | Serviços por colaborador | |
| ✅ | Contas individuais de equipa + rasto de quem fez o quê | 26 testes E2E |
| ❌ | Vista de calendário semanal | Um dono de salão pensa em semanas |
| ❌ | Fila de espera por cancelamento | Receita que hoje se perde em silêncio |
| ❌ | Pesquisa de clientes que procura todos | Hoje filtra só os 200 carregados |

---

## PHASE 3 — PRODUCTION HARDENING 🔄 a decorrer

| | Tarefa | Bloqueado por |
|---|---|---|
| 🟡 | App Check | Chave reCAPTCHA (consola) |
| ❌ | Backups automáticos fora da máquina do Pedro | Decisão Blaze vs GitHub Actions |
| ❌ | Rastreio de erros (Sentry) e uptime | Nada — gratuitos |
| ❌ | Tirar emails de administração do documento público | Nada |
| ❌ | CI: testes a correr a cada push | Nada |
| ❌ | Restauro de backup testado a sério | Nada |
| ❌ | Falhar depressa quando o cliente está offline | Nada |

---

## PHASE 4 — FIRST CUSTOMER ❌

| | Tarefa | Notas |
|---|---|---|
| ❌ | **Termos de Serviço + contrato de subcontratação (art. 28.º)** | Precisa de advogado. Item de maior prazo — começar cedo |
| ❌ | Domínio próprio | `bookit-51575.web.app` não se vende |
| ❌ | Notificações por email lançadas | Exige Blaze |
| ❌ | Registo de atividades de tratamento (art. 30.º) | |
| ❌ | Procedimento de resposta a violações de dados | |
| ❌ | Processo de cobrança (fatura manual chega) + atividade aberta | |
| ❌ | Decidir `demo` vs `zen-organic` | Ver KI-001 |

---

## PHASE 5 — COMMERCIALIZATION ❌

| | Tarefa |
|---|---|
| ❌ | Integração de faturação (Vendus / InvoiceXpress) — a objeção n.º 1 do mercado |
| ❌ | Stripe + registo self-serve |
| ❌ | Onboarding que não precisa do Pedro presente |
| ❌ | Comissões por colaborador |
| ❌ | Marcações recorrentes, categorias de serviço |
| ❌ | Períodos personalizados nas métricas |

---

## PHASE 6 — SCALE ❌

| | Tarefa | Gatilho |
|---|---|---|
| ❌ | Fotos em Cloud Storage | ~50 salões |
| ❌ | Agregados pré-calculados em vez de recalcular do histórico | ~50 salões |
| ❌ | Extrair JS do HTML, remover `unsafe-inline` | Quando o admin ficar difícil de manter |
| ❌ | Repensar a função de lembretes (varre todos os salões de hora a hora) | ~200 salões |

---

## O que NÃO vamos fazer

Decisões tomadas, não esquecimentos:

- **Faturação certificada própria** — integramos, não construímos ([D-005](DECISIONS.md#d-005)).
- **App móvel** — o site funciona bem no telemóvel; os clientes vão pedir menos do que se pensa.
- **Marketplace** — não trazemos clientes novos ao salão, e fingir que sim seria vender o que não temos.
- **Freemium** — precisa de volume e de self-serve, e não temos nenhum dos dois. Utilizadores grátis custam o tempo que devia ser gasto a vender.
