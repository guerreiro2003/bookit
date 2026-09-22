# Bookit — regras para o Claude Code

SaaS de marcações para salões. Frontend estático (HTML, CSS e JS com ES modules, sem build) sobre Firebase, projeto `bookit-51575`: Firestore, Auth e Hosting. Não há backend: as Firestore Rules são toda a segurança.

## Dados
- Não há clientes reais. Os salões `demo` e `zen-organic` são dados de teste. Não os apagues nem os alteres sem o Pedro pedir: o site público e o healthcheck apontam para o `demo`.
- Os scripts em `scripts/` usam o login do Firebase CLI e passam por cima das regras de segurança. Correr qualquer um deles é uma operação no projeto real `bookit-51575`.
- `npm test` é puro e seguro (sem rede, sem Firebase). As suites E2E (`npm run test:all`, `test:rules`, `test:abuse`), o `health` e os scripts de `scripts/` escrevem no projeto real: só quando o Pedro pedir na tarefa atual.
- Restauros só com `--as <id-descartável>`, e a cópia é apagada na mesma tarefa.

## Git e deploy
- Nunca faças `git push` nem deploy. O Pedro faz ambos depois de rever.
- Uma tarefa, um commit. Não mistures alterações de tarefas diferentes.
- Nunca faças commit de `backups/`, `.env*`, exports, CSV ou Excel com dados.
- O Firebase Hosting publica a raiz do repositório (ver `firebase.json`). Não cries na raiz nem em `docs/` ficheiros que não possam ser públicos.

## Código
- As subcoleções de um salão estão todas em `TENANT_COLLECTIONS` (`scripts/_lib.mjs`). Uma coleção nova nas regras tem de entrar nessa lista.
- Não mudes de stack, nem acrescentes dependências ou ferramentas, sem o Pedro aprovar. Vanilla JS sem build é uma decisão, não um acidente.

## Forma de trabalhar
- Se uma tarefa exigir sair dos limites definidos, para e pergunta.
- Relatórios com evidência: outputs reais de comandos, não resumos. Nada é "pronto" sem um teste que o prove.
- A documentação descreve o código. Factos sobre o negócio — clientes, contratos, planos, quem paga — só entram na documentação depois de o Pedro os confirmar.
