# Production checklist

Verificar **tudo** antes de entregar uma instalação a um salão. Marca cada item.

## 1. Projeto Firebase
- [ ] Projeto criado (ou reutilizado) e faturação configurada — plano **Spark** chega para hosting/auth/firestore; **Blaze** é necessário para `functions/` (emails) e para exports agendados.
- [ ] Authentication → Sign-in method: **Email/Password ativado**; **Anonymous desativado**.
- [ ] Authentication → Settings → Authorized domains: contém o(s) domínio(s) de produção.
- [ ] Authentication → Templates: email de recuperação de password traduzido/personalizado; remetente com nome do produto.
- [ ] Firestore criado em região da UE (ex.: `europe-west1` / `eur3`).
- [ ] `firestore.rules` e `firestore.indexes.json` deployados (`npm run deploy:rules`); estado dos índices = *Enabled* na consola.
- [ ] Google Cloud → Credentials: a API key web está **restringida por HTTP referrer** aos domínios de produção.
- [ ] App Check (reCAPTCHA v3/Enterprise) — recomendado para limitar abuso nas escritas públicas (marcações). *Configuração externa; ver secção 7.*

## 2. Código e configuração
- [ ] `firebase.js` aponta para o projeto certo (`projectId`, `apiKey`, `authDomain`).
- [ ] `firebase.json`: `ignore` exclui `tests/`, `scripts/`, `functions/`, `*.md`, `*.docx`, `.git/**`; headers de segurança presentes (CSP/HSTS).
- [ ] `npm test` passa (172 testes puros, sem rede).
- [ ] `npm run test:emul` passa (9 suites contra os emuladores locais, regras incluídas). Precisa de Java 21 — confirma com `npm run check:emul`.
- [ ] **A partir do primeiro cliente pagante:** `BOOKIT_TARGET=real npm run test:all` passa contra o projeto real, com `SERVICE_ID`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `CLIENT_EMAIL`/`CLIENT_PASSWORD`, `TEAM_PASSWORD` e `OTHER_SALON_ID` no ambiente (ver [DEPLOY.md](DEPLOY.md)). O emulador não exige índices compostos; só esta corrida apanha uma query a que falta um índice.
- [ ] Sem ficheiros de desenvolvimento a serem servidos: `curl -I https://<dominio>/package.json` → 404; `/.git/config` → 404.

## 3. Salão
- [ ] Salão criado via `setup.html` (fica em `plan: trial`, 30 dias) **ou** migrado com `scripts/migrate-salon.mjs`.
- [ ] Subscrição ativada: `node scripts/set-plan.mjs <salonId> active`.
- [ ] Admin consegue entrar em `admin.html`; onboarding concluído (serviços, equipa, horário, password da equipa).
- [ ] Fuso horário do salão correto (Configurações → Marcações online).
- [ ] Antecedência mínima/máxima e janela de cancelamento definidas.
- [ ] Datas encerradas / feriados do ano introduzidos.
- [ ] Horários individuais e férias dos colaboradores definidos, se aplicável.
- [ ] Teste real: marcação como visitante → aparece no `staff.html` → confirmar → registar pagamento → pontos atribuídos → cancelar/reagendar.

## 4. Domínio e HTTPS
- [ ] Domínio próprio ligado no Firebase Hosting (certificado automático) e adicionado aos *Authorized domains* do Auth.
- [ ] Links do site institucional apontam para o domínio final com `?salon=<salonId>` correto.
- [ ] `robots.txt`/`sitemap.xml` do site institucional atualizados com o domínio final.

## 5. Privacidade / RGPD
- [ ] `privacidade.html` revista por responsável jurídico (**LEGAL REVIEW REQUIRED**) e preenchida com a identidade do responsável pelo tratamento.
- [ ] Contrato de subcontratação com o salão (o salão é o responsável; o operador do Book It é subcontratante) — *legal*.
- [ ] Localização de dados na UE confirmada (região Firestore).
- [ ] Testado: exportar dados na área do cliente; apagar conta (anonimiza marcações e perfil).

## 6. Operação
- [ ] Backups: `scripts/backup-export.mjs` agendado (cron/CI) **ou** Firestore *Scheduled backups/PITR* ativados (ver `DISASTER_RECOVERY.md`).
- [ ] Alertas de faturação no Google Cloud (orçamento) configurados.
- [ ] Monitorização: Firebase Console → Firestore usage / Auth; opcionalmente Google Cloud Monitoring uptime check ao URL público.
- [ ] Contacto de suporte definido para o salão (para quem eles ligam quando algo falha).

## 7. Configurações externas ainda em aberto (por instalação)
- **Emails de confirmação/lembrete** — deploy de `functions/` + extensão *Trigger Email* + credenciais SMTP (ver `functions/README.md`).
- **App Check** — criar site key reCAPTCHA v3 na consola Firebase e adicionar `initializeAppCheck` em `firebase.js`.
- **Pagamentos online (Stripe/MB Way)** — exige Cloud Functions (webhooks) — decisão de produto.
- **Faturação SaaS do próprio Book It** (Stripe Billing) — hoje a subscrição é gerida pelo operador com `set-plan.mjs`.
