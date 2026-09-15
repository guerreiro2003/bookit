# Disaster recovery

Cenário: "o projeto Firebase desapareceu / foi corrompido / alguém apagou dados". O que existe e como se recupera.

## O que tem de estar guardado fora do projeto
| Item | Onde | Como recuperar |
|---|---|---|
| Código (todas as páginas, regras, índices, scripts) | Repositório Git (`github.com/guerreiro2003/bookit`, `…/zenorganic`) | `git clone` + `firebase deploy` |
| Dados (salões, serviços, equipa, clientes, marcações, agenda…) | **Backups** — ver abaixo | `scripts/backup-restore.mjs` ou Firestore import |
| Contas de autenticação (emails/passwords hash) | Não são exportadas pelos backups lógicos | `firebase auth:export users.json` (Firebase CLI) — agendar junto com o backup |
| Configuração do projeto (Auth providers, domínios autorizados, API key restrictions) | Este documento + `PRODUCTION_CHECKLIST.md` | Refazer manualmente na consola (≈15 min) |

## Backups

### Opção A — Backup lógico (funciona no plano gratuito)
```bash
node scripts/backup-export.mjs backups            # todos os salões → backups/bookit-<timestamp>.json
node scripts/backup-export.mjs backups demo       # só um salão
firebase auth:export backups/auth-$(date +%F).json --format=json
```
Agendar (cron diário numa máquina do operador ou GitHub Actions com um token de CI — `firebase login:ci`). Guardar os ficheiros **fora** do Google Cloud (ex.: disco cifrado + armazenamento de objetos noutro fornecedor). Retenção sugerida: diários 30 dias, mensais 12 meses. Os ficheiros contêm dados pessoais → cifrar em repouso e restringir acesso.

### Opção B — Backups geridos do Firestore (recomendado em produção; plano Blaze)
Consola Firebase → Firestore → *Disaster recovery*: ativar **Point-in-time recovery (7 dias)** e **Scheduled backups** (diários, retenção até 14 semanas). Restauro para uma base nova via `gcloud firestore restore`.

## Restauro

### Um salão, a partir do backup lógico
```bash
node scripts/backup-restore.mjs backups/bookit-2026-09-15.json demo        # dry-run: mostra contagens
node scripts/backup-restore.mjs backups/bookit-2026-09-15.json demo --yes  # escreve (sobrepõe docs com o mesmo id)
```
Depois: `node scripts/set-plan.mjs demo active` se necessário e verificar o login do admin e da equipa (`firebase auth:import` se as contas também se perderam).

### Projeto inteiro perdido
1. Criar projeto Firebase novo (região UE); ativar Auth Email/Password; criar site(s) de Hosting.
2. Atualizar `firebase.js` (config), `.firebaserc` (projeto/targets) e `firebase.json` (site).
3. `npm run deploy` (regras + índices + hosting). Esperar os índices ficarem *Enabled*.
4. `firebase auth:import backups/auth-<data>.json --hash-algo=SCRYPT …` (parâmetros de hash vêm de Authentication → Users → ⋮ → *Password hash parameters* do projeto antigo — **guardar esses parâmetros junto do backup**).
5. Restaurar cada salão com `backup-restore.mjs`.
6. Reconfigurar: domínios autorizados, restrições da API key, App Check, extensão de email.
7. Testar o fluxo completo (checklist secção 3).

## RPO / RTO indicativos
- Backup lógico diário: perda máxima de 24h de dados; restauro de um salão ≈ 10 min; projeto inteiro ≈ 1–2 h.
- PITR: perda máxima de ~1 min; restauro ≈ 30 min.

## Segredos e acessos necessários para recuperar
- Conta Google dona do projeto (com 2FA e recuperação configuradas) — **guardar códigos de recuperação offline**.
- `firebase login` de um operador com papel *Owner/Editor*.
- Parâmetros de hash das passwords (ver ponto 4) e os ficheiros de backup cifrados.
