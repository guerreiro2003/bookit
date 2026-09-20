# Estado do projeto

**Atualizado:** 2026-09-20 · contas individuais de equipa
**Fase atual:** PHASE 3 — PRODUCTION HARDENING (ver [ROADMAP](ROADMAP.md))

## Em uma frase

O software funciona e está em produção. O que falta para o vender não é código de produto — é operação (backups automáticos, monitorização), contratos, e as últimas correções de segurança da auditoria.

## Estado real, verificado

| Área | Estado | Evidência |
|---|---|---|
| Motor de marcações | ✅ Sólido | 38 testes E2E + stress de concorrência contra produção |
| Isolamento entre salões | ✅ Verificado | Suite de abuso: leitura e escrita cross-tenant negadas |
| Integridade de preços | ✅ Verificado | Forjar preço → `permission-denied` |
| Agenda à prova de sabotagem | ✅ Corrigido 20/09 | Era explorável; ver [DECISIONS](DECISIONS.md#d-001) |
| Identidade por email | ✅ Corrigido 20/09 | Exige `email_verified`; ver [DECISIONS](DECISIONS.md#d-002) |
| Serviços por colaborador | ✅ Feito 20/09 | Verificado em produção no site do cliente |
| Importador CSV | ✅ Feito | 27 testes E2E, reimportação não duplica |
| Retenção / reativação | ✅ Feito | 21 testes E2E, receita atribuída |
| App Check | 🟡 Código pronto | Falta a chave reCAPTCHA (consola) |
| Backups | 🟡 Restauro testado | Workflow pronto; faltam 2 segredos (KI-012) |
| Contas individuais de equipa | ✅ Feito 20/09 | 26 testes E2E; rasto de quem fez o quê |
| Notificações por email | ❌ Escritas, não lançadas | Exige Blaze |
| Cobrança a salões | ❌ Não existe | `plan` muda por script |
| Termos + contrato RGPD | ❌ Não existem | **Bloqueador de venda** |
| Domínio próprio | ❌ Não existe | `bookit-51575.web.app` |

## Testes

`npm run test:all` — **300 a passar**, zero a falhar.

| Suite | N.º | O que cobre |
|---|---|---|
| unit (`*.test.mjs`) | 60 | Lógica pura: horários, cadência, métricas, CSV, quem-faz-o-quê |
| `rules.integration` | 74 | Autorização e validação, via REST, contra produção |
| `engine.e2e` | 38 | Ciclo completo de marcação |
| `links.e2e` | 18 | Confirmar/cancelar por token |
| `retention.e2e` | 21 | Reativação e atribuição |
| `import.e2e` | 27 | CSV → clientes → histórico → cadência |
| `team-access.e2e` | 26 | Conceder, entrar, registar quem fez, revogar |
| `abuse.e2e` (atualizada) | 36 | +7 sobre o que o documento público pode levar |
| `concurrency.stress` | — | Marcações concorrentes no mesmo horário |

## Último trabalho

1. **Auditoria completa** (18/09) — 4 críticos, 7 graves, 13 médios. Duas falhas exploradas contra produção.
2. **Correções críticas** (20/09, `0cea10d`) — agenda, email verificado, bookingLinks, aviso de reagendamento, apagar serviços, desconto 50%, guarda nas Functions.
3. **Serviços por colaborador + App Check** (20/09, `2048e4d`).
4. **Limpeza de tenants** (20/09) — 7 salões → 2. Ver [KNOWN_ISSUES](KNOWN_ISSUES.md#ki-001).
5. **Contas individuais de equipa** (20/09) — fecha KI-002 e o último "grave" da auditoria.

## Próximo trabalho

1. Rastreio de erros (Sentry) + monitor de uptime ← **a seguir**, ambos gratuitos
2. Falhar depressa quando o cliente está offline (KI-007)
3. Vista de calendário semanal — um dono de salão pensa em semanas
4. Fila de espera por cancelamento
5. Termos de Serviço + contrato de subcontratação (precisa de advogado)

## Bloqueadores

| # | Bloqueador | Precisa de |
|---|---|---|
| B1 | Chave reCAPTCHA para App Check | Consola Firebase (Pedro) |
| B2 | Decisão `demo` vs `zen-organic` | Pedro — ver [KNOWN_ISSUES](KNOWN_ISSUES.md#ki-001) |
| B3 | Termos + DPA | Advogado |
| B4 | Domínio | Compra (~15–25 €/ano) |
| B5 | PITR / backups geridos | Blaze — ver [DECISIONS](DECISIONS.md#d-004) |

## Credenciais de desenvolvimento

Salão `demo` · admin `admin@bookit.demo` / `Demo2026!` · password de equipa `equipa2026`.
Os testes usam estas por omissão; sobrepõe com `SALON_ID`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `TEAM_PASSWORD`.
