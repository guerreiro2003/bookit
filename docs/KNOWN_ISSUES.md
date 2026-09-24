# Problemas conhecidos

Coisas que sabemos que estão mal e ainda não corrigimos. Um problema só sai desta lista quando estiver corrigido **e** tiver um teste que impeça o regresso.

---

## KI-001 · Dois salões de teste, e o slug bonito está no errado {#ki-001}

**Gravidade:** baixa · **Estado:** à espera de decisão do Pedro (B2)

**Não há clientes reais.** Os dois tenants são dados de teste — o que está escrito noutras versões desta secção, sobre "os dados reais" e "o que um cliente real vê", estava errado.

| Salão | Nome | Plano | Clientes | Marcações | O que é |
|---|---|---|---|---|---|
| `demo` | Zen Organic Hair Concept | **active** | 8 | 27 (nov/25 → ago/26) | Dados de teste, mas **é o que está ligado**: o site público, o healthcheck e as suites E2E apontam todos para aqui |
| `zen-organic` | Zen Organic Hair concept | — | 5 (`jkeke`, `ffff`…) | 4 (abr/26) | Tentativa antiga, dados de teste, sem nada ligado |

O incómodo é de nomes, não de dados: o slug apresentável (`zen-organic`) está no tenant abandonado e o tenant em uso chama-se `demo`. Enquanto não houver contrato, ninguém vê nenhum dos dois.

**Não apagar nem renomear o `demo` sem mudar o que aponta para ele** — o site público e o healthcheck de 30 em 30 minutos partem-se juntos.

**Opções:** (a) manter como está; (b) migrar o `demo` para o slug `zen-organic` (precisa de um script novo — `migrate-salon.mjs` faz upgrade no lugar, não muda o id); (c) criar o tenant definitivo de raiz quando houver contrato — a mais provável, agora que se sabe que não há dados a salvar.

**Risco de não decidir:** baixo. Trabalhar no tenant errado por distração, e nada mais.

---

## ~~KI-002 · Password de equipa partilhada, sem rasto de quem fez o quê~~ ✅ resolvido 2026-09-20

Cada pessoa passou a ter a sua conta (`staffAuth/{uid}`), e confirmar/cancelar/falta/pagamento/reagendar gravam quem fez. A password partilhada continua a funcionar para ninguém ficar fechado de fora durante a migração — **remover essa via é um passo a dar quando todos os salões ativos tiverem contas individuais.** Coberto por `tests/team-access.e2e.mjs` (26).

---

## KI-003 · O documento público do salão ainda expõe o email da equipa

**Gravidade:** média (era alta) · **Estado:** parcialmente resolvido 2026-09-20

`adminEmail`, `subscriptionStatus` e `planUpdatedAt` passaram para `salons/{id}/private/billing`, que só o dono lê. Coberto por 7 testes na suite de abuso.

**O que falta:** `teamEmail` continua público, porque o login por password partilhada precisa dele **sem ninguém estar autenticado** — é inerente a essa funcionalidade. Vale metade de uma credencial de uma conta partilhada, num domínio que não recebe correio, com limitação de tentativas do Firebase do outro lado.

**A solução é retirar o login partilhado**, agora que existem contas individuais ([KI-002](#ki-002)). Fica por fazer quando todos os salões ativos tiverem migrado.

`adminUid`/`teamUid` continuam públicos e isso é aceitável: um uid não é credencial nem serve para autenticar.

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

## KI-006 · Monitorização · ✅ maioritariamente resolvido 2026-09-21

**O site:** `.github/workflows/healthcheck.yml` corre de 30 em 30 minutos e percorre o caminho de um cliente real — a página carrega, o salão está configurado, há horários livres nos próximos 14 dias — e re-verifica duas propriedades de segurança que não podem desfazer-se em silêncio. Quando falha abre um issue; quando recupera, fecha-o. Não precisa de segredo nenhum.

**Os erros:** `installErrorReporting()` apanha erros não tratados e promessas rejeitadas, que antes desapareciam sem deixar rasto. Numa sessão de salão autenticada são gravados em `_errors` — um documento por erro distinto, com contador — e lêem-se com `npm run errors`. Emails e telemóveis são limpos antes de sair do browser.

**O que falta:** erros da **página pública de marcação**. Gravá-los exigiria uma porta de escrita que qualquer pessoa podia encher — exatamente o buraco que este projeto já teve de fechar duas vezes. Precisam do Sentry: o código está escrito, falta colar um DSN em `SENTRY_DSN` no `firebase.js` e acrescentar o host ao `connect-src`.

---

## ~~KI-007 · Marcação sem resposta quando a ligação é má~~ ✅ resolvido 2026-09-20

A marcação passou a ter prazo (20 s). Passado esse tempo o cliente não fica a olhar para um spinner: o código vai **procurar** a marcação, porque o `manageToken` é gerado antes da transação e a projeção `bookingLinks/{token}` é legível publicamente — dá para saber se entrou sem estar autenticado. Se entrou, segue para a página de sucesso como sempre; se ao fim de três tentativas continuar sem se saber, o botão **fica desativado** (marcar outra vez criaria uma segunda marcação à mesma pessoa) e a página manda ligar ao salão.

Coberto por `tests/timeout.test.mjs` (5), incluindo o facto de a escrita **não** ser cancelada — é por isso que é preciso ir confirmar em vez de dizer que falhou.

**Nota sobre a descrição original:** falava em "fila offline". As transações do Firestore precisam de ligação e não são postas em fila, ao contrário de um `updateDoc` simples — o problema real era a espera sem fim, não a fila.

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


---

## KI-014 · Backups anteriores a 2026-09-21 são incompletos

**Gravidade:** média · **Estado:** corrigido daqui para a frente; os ficheiros antigos ficam como estão

O exportador, o eliminador e as regras mantinham cada um a sua lista de subcoleções, e as listas divergiram: `staffAuth` e `waitlist` foram acrescentadas à aplicação e ninguém as acrescentou ao backup. Os exports continuaram a dizer "✓" por tudo o que liam, por isso nada parecia errado.

**O que isso significava:** restaurar a partir de um desses ficheiros trazia o salão de volta com **todos os colaboradores sem conseguir entrar** (o `staffAuth` é o índice de autorização) e sem a fila de espera. E o `delete-salon.mjs` deixava a `waitlist` órfã depois de um apagamento "bem-sucedido".

**Correção:** uma lista única em `scripts/_lib.mjs` (`TENANT_COLLECTIONS`), usada pelos três. O export passa a declarar no ficheiro que coleções percorreu, e o verificador compara-as com essa lista — se voltarem a divergir, o backup falha em vez de mentir.

**Testado desde 2026-09-23** (22 testes em `npm test`, sem rede):

- `tests/verify-backup.test.mjs` (12) — a lógica do verificador saiu para `scripts/verify-backup-core.mjs`, uma função pura, e corre contra backups partidos de propósito: formato antigo sem `collections`, coleção em falta, `staffAuth` vazio com colaboradores que têm conta, export sem salões, salão sem serviços. O que interessa num verificador é o **não**, e agora há provas de que ele o diz.
- `tests/rules-collections.test.mjs` (10) — compara `TENANT_COLLECTIONS` com o que está em `firestore.rules`, que é a única fonte independente do que um salão tem. Uma lista comparada consigo própria concorda para sempre; foi assim que isto aconteceu da primeira vez. Tira-se `waitlist` da lista e o teste falha a dizer o nome. O parser (`tests/_rules-paths.mjs`) conta chavetas a sério — ignora comentários e o interior das strings, onde os `{4}` das expressões regulares estragariam a contagem — e falha também se aparecer uma subcoleção de **segundo nível**, que o export não percorreria.

**A exceção que fica por cobrir:** uma coleção que exista só no código da aplicação e nunca chegue às regras é invisível para este teste — mas também é invisível para os utilizadores, porque sem regra ninguém lhe toca. E `config` e `private` usam `{document=**}`: se alguém lá guardar documentos a dois níveis, o export leva o primeiro e deixa o resto. O teste congela esse conjunto em dois, para um wildcard novo obrigar a olhar.

**Os 4 ficheiros de 20 de setembro continuam incompletos** e o verificador rejeita-os. Não vale a pena "arranjá-los": há backups novos e completos.

---

## KI-015 · Os testes cross-tenant podem estar a testar um salão que não existe

**Gravidade:** média · **Estado:** por corrigir (encontrado 2026-09-23)

`tests/rules.integration.mjs` escolhe os dois salões por omissão:

```js
const SALON = E.SALON_ID || 'demo';
const OTHER = E.OTHER_SALON_ID || 'zenorganic';
```

O segundo **não existe**: o salão chama-se `zen-organic`, com hífen ([KI-001](#ki-001)). As cinco asserções de isolamento (linhas 186–190) pedem `salons/zenorganic/...` e esperam 403 — e recebem 403, porque as regras chamam `get()` no documento do salão, não o encontram, e negam. **O teste passa pela razão errada:** prova que não se lê um salão inexistente, não que não se lê o salão do vizinho. A propriedade que interessa — dois tenants com dados a sério, um não vê o outro — nunca chega a ser exercida.

Corrigir é mudar o valor por omissão para `zen-organic`. Vale a pena confirmar primeiro que o `zen-organic` tem marcações e clientes que sirvam de alvo, senão a correção troca um falso positivo por outro.

`SALON` por omissão é `demo`, o que está certo hoje, mas prende a suite a um tenant escolhido em 2025 — se o `demo` for renomeado ([KI-001](#ki-001)), estes testes vão dizer que está tudo bem sobre um salão que já não existe.

---

## KI-016 · O passo das regras no CI nunca falha

**Gravidade:** média · **Estado:** por corrigir (encontrado 2026-09-23)

Em `.github/workflows/tests.yml`, o passo *As regras compilam* acaba em:

```
  || echo "aviso - verificação de regras precisa de credenciais, ignorado"
```

O `|| echo` devolve 0 **sempre**. Regras com erro de sintaxe, ficheiro apagado, `firebase-tools` que nem arranca: o passo fica verde na mesma. O objetivo era não partir o CI em forks sem credenciais, mas o efeito é que a única verificação automática das regras — o ficheiro que **é** toda a segurança deste produto — não verifica nada.

Distinguir os dois casos: falta de credenciais (ignorar) de regras inválidas (falhar). O `firestore:rules:check` devolve códigos diferentes, ou corre-se a validação com o emulador, que não precisa de login.

---

## ~~KI-017 · O restauro sem `--as` nunca chega a correr~~ ✅ resolvido 2026-09-24

**Encontrado 2026-09-23 · corrigido 2026-09-24**

`scripts/backup-restore.mjs` separava argumentos assim:

```js
const asIdx = args.indexOf('--as');
const [file, salonId] = args.filter((a, i) => !a.startsWith('--') && i !== asIdx + 1);
```

Sem `--as`, `indexOf` devolve `-1` e a condição passa a ser `i !== 0`: **descarta o primeiro argumento posicional, que é o ficheiro de backup.** `salonId` fica `undefined` e o script imprime o `usage` e sai com 1.

```
$ node scripts/backup-restore.mjs <backup>.json ensaio
usage: node scripts/backup-restore.mjs <backup.json> <salonId> [--as <novoId>] [--yes]
```

Com `--as` funcionava, porque aí `asIdx + 1` apontava mesmo para o id novo. Ou seja: **o ensaio corria, a recuperação a sério não** — e é a recuperação a sério que se vai tentar usar no dia em que um salão desaparecer.

**Correção:** a leitura dos argumentos saiu para `scripts/restore-args.mjs` (`parseRestoreArgs`), uma função pura que percorre os argumentos um a um em vez de adivinhar posições. Flags desconhecidas passam a ser recusadas em vez de ignoradas, e isso é uma decisão de segurança: um `--as` mal escrito deixava `target` a nulo, o destino caía no id original e um `--yes` a seguir escrevia o ensaio **por cima do salão vivo**. Um erro de escrita tem de parar o script, não mudar que salão é sobrescrito.

**Impede o regresso:** `tests/restore-args.test.mjs` (15 testes, sem rede). O primeiro — *"no flags: a dry run over the salon itself"* — é exatamente o comando que nunca corria. Repor a linha antiga faz falhar **8 dos 15**, e o CLI volta a imprimir o `usage`.

**Encontrado ao corrigir, e também corrigido:** os comandos do `DISASTER_RECOVERY.md` estavam na forma `npm run restore … --as … --yes`, e o npm **não passa flags ao script sem um `--` à frente** (confirmado com npm 10.8.2: o script recebia `["ficheiro","salão","ensaio"]`, sem `--as` e sem `--yes`). Nem com o código antigo nem com o novo essa forma restaurava o que dizia restaurar. A página passou a invocar `node scripts/backup-restore.mjs` diretamente. Com o parser novo, essa forma partida falha alto (`✗ argumentos a mais: ensaio`) em vez de restaurar para o sítio errado.

**O que continua por provar:** o caminho de escrita sem `--as` — o que faz `PATCH` por cima de um salão vivo — continua sem nunca ter corrido contra uma base de dados. A correção prova que os argumentos chegam ao sítio certo e que a simulação imprime o plano certo; não prova que a escrita funciona. Provava-se com os emuladores do Firebase (`npm run emulators`), que não tocam em produção, ou com um `--as` para um id descartável seguido de um `delete-salon` — que exercita o mesmo código de escrita, só que noutro destino.
