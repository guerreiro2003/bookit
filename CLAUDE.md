# Bookit — regras para o Claude Code

SaaS de marcações para salões. Frontend estático (HTML, CSS e JS com ES modules, sem build) sobre Firebase, projeto `bookit-51575`: Firestore, Auth e Hosting. Não há backend: as Firestore Rules são toda a segurança.

## Dados
- Não há clientes reais. Os salões `demo` e `zen-organic` são dados de teste. Não os apagues nem os alteres sem o Pedro pedir: o site público e o healthcheck apontam para o `demo`.
- **O alvo é `BOOKIT_TARGET`.** `emulator` (omissão dos testes) ou `real` (omissão dos scripts de operação). É o único interruptor, e um valor não reconhecido atira erro em vez de cair para produção.
- **Seguro e para correr à vontade:** `npm test` (puro, sem rede) e `npm run test:emul` (nove suites contra os emuladores locais, num projeto `demo-bookit` que só existe nesta máquina). Precisa de Java 21 — `npm run check:emul` diz se está tudo lá. Em modo emulador há uma guarda que aborta a corrida se alguma coisa tentar sair para fora do localhost.
- **Só quando o Pedro pedir na tarefa atual:** qualquer coisa com `BOOKIT_TARGET=real`, o `npm run test:all`, o `health`, e os scripts de `scripts/` — que usam o login do Firebase CLI e passam por cima das regras. Cada um desses é uma operação no projeto real `bookit-51575`.
- Restauros só com `--as <id-descartável>`, e a cópia é apagada na mesma tarefa.

## Git e deploy
- Nunca faças `git push` nem deploy. O Pedro faz ambos depois de rever.
- Uma tarefa, um commit. Não mistures alterações de tarefas diferentes.
- Nunca faças commit de `backups/`, `.env*`, exports, CSV ou Excel com dados.
- O Firebase Hosting publica a raiz do repositório (ver `firebase.json`). Não cries na raiz nem em `docs/` ficheiros que não possam ser públicos.

## Código
- As subcoleções de um salão estão todas em `TENANT_COLLECTIONS` (`scripts/_lib.mjs`). Uma coleção nova nas regras tem de entrar nessa lista.
- **Endpoints e ids de produção nunca se escrevem à mão nos testes.** Vêm do `scripts/_lib.mjs` (`FS`, `IDENTITY`, `API_KEY`, `PROJECT`) e do `tests/_target.mjs` (`SALON`, `OTHER_SALON`, `SERVICE_ID`, contas). Já apanhámos três linhas assim — um `https://identitytoolkit.googleapis.com` e dois auto-ids de serviços — que em modo emulador teriam ido ao projeto real na mesma.
- Não mudes de stack, nem acrescentes dependências ou ferramentas, sem o Pedro aprovar. Vanilla JS sem build é uma decisão, não um acidente.

## Forma de trabalhar
- Se uma tarefa exigir sair dos limites definidos, para e pergunta.
- Relatórios com evidência: outputs reais de comandos, não resumos. Nada é "pronto" sem um teste que o prove.
- **Uma verificação compara conteúdo, não quantidades — e só conta depois de ter sido vista a falhar.** Contar documentos, ficheiros ou linhas é confirmar o que é fácil de contar em vez do que interessa. Já custou quatro vezes: coleções em falta nos backups que davam "✓", testes cross-tenant a passar contra um salão inexistente, um passo de CI que devolvia 0 sempre, e um restauro que devolvia todas as datas como texto e imprimia "tudo bate certo" porque 17 documentos entraram e 17 saíram. Depois de escrever uma verificação, estraga de propósito aquilo que ela devia apanhar e confirma que fica vermelha. E atenção à régua: uma comparação feita com o mesmo codificador dos dois lados não consegue ver um defeito nesse codificador — foi preciso ler a API em cru para apanhar o das datas.
- **Mexeste em algo partilhado? Corre tudo o que o usa — workflows incluídos.** Um ficheiro que vários pontos de entrada importam (`tests/_register.mjs`, `scripts/_lib.mjs`, `firebase.js`, `app.js`) não se valida com a suite que se tinha à frente. Faz a lista dos que o usam — `grep -rn "<ficheiro>" . --exclude-dir=node_modules` chega, e não te esqueças do `package.json` e do `.github/workflows/` — e passa por cada um. O que custou: na T5 o `_register.mjs` passou a pôr `BOOKIT_TARGET=emulator` por omissão e a selar a rede, o que está certo para as suites; o `scripts/healthcheck.mjs` corre com o mesmo `--import` e ficou a vigiar um emulador que no GitHub não existe. Durante dias o workflow "Está de pé?" abriu issues a dizer que o site estava em baixo com o site de pé — um alarme partido é pior do que não ter alarme, e os testes estavam todos verdes porque nenhum deles era o healthcheck.
- A documentação descreve o código. Factos sobre o negócio — clientes, contratos, planos, quem paga — só entram na documentação depois de o Pedro os confirmar.
