# Decisões

Porquê, não o quê. Cada entrada existe para que daqui a seis meses ninguém desfaça uma decisão sem perceber o que a motivou.

---

## D-001 · Uma entrada de agenda é a sombra de uma marcação {#d-001}

**2026-09-20** · substitui a validação por contagem

As regras validavam a *forma* de um documento de agenda — `staffId` é texto, data válida, o id bate certo — e que a escrita mexia em exatamente uma chave. Nunca verificavam que a chave correspondia a uma marcação real.

Resultado, explorado contra produção: qualquer pessoa sem login escrevia `byBooking: { 'NAO-EXISTE': { blocks: [{start:0, end:1440}] } }` e fechava a agenda de um colaborador. Invisível, porque a lista de marcações do dono ficava vazia.

**Decisão:** a regra exige, via `getAfter()`, que a marcação exista no fim do pedido, seja desse colaborador nesse dia, esteja viva, e que os blocos caibam dentro de `[startMin, endMin]` dela. Quem escreve declara qual é a marcação em `viaBookingId` — o mesmo padrão que a libertação já usava.

**Alternativa rejeitada:** validar só o tamanho dos blocos. Não chega — um atacante escolheria blocos pequenos mas espalhados, e continuava a não existir marcação nenhuma por trás.

**Custo:** um `getAfter()` por escrita de agenda.

---

## D-002 · Um email só prova identidade depois de ser aberto {#d-002}

**2026-09-20**

`ownsBooking()` e `ownsClientDoc()` comparavam `request.auth.token.email`. O Firebase Auth deixa criar conta com qualquer endereço sem confirmar nada, por isso registar-se com o email de uma cliente dava o nome, o telemóvel, o histórico e as notas do salão — que em cabeleireiro incluem alergias, ou seja dados de saúde.

**Decisão:** exigir `email_verified == true` no ramo de email das duas funções.

**Consequência assumida:** a ficha de cliente passa a ser escrita só no primeiro login verificado. É também aí que se liga a um registo de visitante que o salão já tivesse — antes isso era feito no registo, e deixou de ser possível porque a consulta precisa de leitura que a conta ainda não tem. O ecrã "Confirma o teu email" existe por causa desta decisão.

---

## D-003 · Sem lista de serviços, um colaborador faz tudo {#d-003}

**2026-09-20**

Ao dar a cada colaborador uma lista de serviços, a pergunta era o que fazer com os registos existentes, que não têm lista nenhuma.

**Decisão:** lista vazia ou ausente = faz tudo.

**Porquê:** é o que já é verdade em todos os registos atuais, por isso a funcionalidade entra sem migração e sem partir nada. E é o que é verdade na maioria dos salões pequenos — só interessa restringir quando o dono decide restringir.

**A regra é aplicada só no caminho público.** O dono pode atribuir quem quiser: cobrir um turno é legítimo, e o painel já o guia para as pessoas certas. O que se fecha é o cliente forjar o pedido, já que o id de cada colaborador é público.

---

## D-004 · Backups: ainda não gastamos dinheiro {#d-004}

**2026-09-20** · a rever quando houver o primeiro cliente pago

PITR e backups geridos do Firestore exigem plano Blaze. A regra do projeto é não gastar antes de haver clientes.

**Decisão por agora:** backup lógico (`npm run backup`), que exporta todos os salões e subcoleções para JSON. Funciona, é gratuito, e foi corrido pela primeira vez a 2026-09-20.

**O que isto não cobre:** só há cópia quando alguém se lembra de a correr, e só na máquina do Pedro. Um apagamento acidental às 11h com backup das 9h perde duas horas de marcações.

**Gatilho para rever:** o primeiro cliente pago. Nessa altura o Blaze passa a ser preciso de qualquer forma (notificações por email), e o PITR vem quase de borla ao lado disso.

---

## D-005 · Não construímos faturação certificada {#d-005}

**2026-09** · ver `FATURACAO.md`

Um salão português precisa de faturas certificadas pela AT. Construir certificação é caro, lento e fora do nosso âmbito.

**Decisão:** integrar com quem já a tem (Vendus, InvoiceXpress, Moloni) quando houver receita que o justifique. Até lá o Book It coexiste com o software de faturação do salão.

**Consequência comercial:** enquanto isto não existir somos complemento, não substituto — e um complemento vale menos e cancela-se mais facilmente. É a objeção n.º 1 que vamos ouvir à porta.

---

## D-006 · Sem backend próprio, as regras são o backend {#d-006}

**2026-05** · a rever

O frontend fala diretamente com o Firestore; as regras de segurança fazem autorização, validação de forma e regras de negócio.

**Porquê:** custo quase zero, sem servidores para manter, e as regras são testáveis (74 testes).

**O teto, que é preciso conhecer:** as regras não sabem contar, por isso não há limitação de taxa — é daí que vem a necessidade de App Check. Não há sítio para guardar segredos, por isso qualquer integração com chave privada (faturação, Stripe, WhatsApp API) obriga a um backend. E nada acontece sem alguém com o browser aberto.

---

## D-007 · O telemóvel é a identidade, não o email {#d-007}

**2026-09**

Em Portugal um salão tem o número de toda a gente e o email de quase ninguém. O email é opcional na marcação; o telemóvel é obrigatório e normalizado para E.164.

Isto foi corrigido depois de um bug real: a cadência de retenção partia-se ao meio porque a mesma pessoa, ora visitante ora com conta, contava como duas.

---

## D-008 · O emulador é um projeto `demo-`, não o nosso {#d-008}

**2026-09-24**

Os emuladores correm com o project id `demo-bookit`. O prefixo `demo-` é convenção do Firebase: a ferramenta trata um projeto assim como existindo só no emulador, não pede login, e **não há nada do outro lado** se alguma configuração se enganar.

Foi por isso, e não por gosto no nome. Um emulador a correr com `bookit-51575` também funciona — testei, e sem credenciais, só com um aviso — mas nesse caso os URLs passam a nomear o projeto real, e uma má resolução de host aponta para produção. O `demo-` torna esse acidente impossível em vez de improvável.

Custo: mais um nome parecido. `demo-bookit` é um **projeto** que só existe no emulador; `demo` é um **salão** dentro dele, e também dentro do projeto real. Está comentado no `scripts/_lib.mjs`, onde a constante vive.

---

## D-009 · Os testes vão ao emulador por omissão; produção exige um ato deliberado {#d-009}

**2026-09-24**

`BOOKIT_TARGET=real|emulator` decide, e é o único interruptor. A omissão depende de quem pergunta: os **scripts** de operação apontam para o projeto real (um backup tem de copiar o que existe), os **testes** apontam para o emulador.

A razão é a assimetria do engano. Um teste que vai a produção por distração escreve num salão vivo; um teste que vai ao emulador por distração não faz mal a ninguém. Um valor não reconhecido atira erro em vez de cair para "real": um `BOOKIT_TARGET=emulador` mal escrito não pode ser lido como produção.

**O que isto custa, e é preciso saber:** as suites deixaram de ser um smoke test de produção. Verificar o que está no ar é `BOOKIT_TARGET=real npm run test:all`, com `SERVICE_ID` e as contas no ambiente — e o emulador **não exige índices compostos**, por isso uma query que passa lá pode falhar em produção a pedir um. Ver [DEPLOY.md](../DEPLOY.md).

---

## D-010 · O `projectId` é reescrito no carregamento, e o `firebase.js` não se toca {#d-010}

**2026-09-24**

O emulador do Firestore guarda uma base de dados **separada por project id**, e o `connectFirestoreEmulator()` muda o host mas não o projeto. Como o `firebase.js` fixa `projectId: "bookit-51575"`, as suites do SDK liam uma base vazia enquanto as suites REST escreviam noutra, dentro do mesmo emulador.

Três saídas: correr o emulador como `bookit-51575` (perde-se a garantia do `demo-`, ver [D-008](#d-008)); alterar o `firebase.js` para ler o projeto de fora; ou reescrever o valor **à leitura do ficheiro**, só nos testes. Ficou a terceira.

`tests/_node-firebase-loader.mjs` já traduzia os imports do gstatic; ganhou um passo que troca o `projectId` quando o alvo é o emulador. O ficheiro em disco não muda, e é o mesmo que vai para o browser. Cobre também o `getSecondaryAuth()`, que constrói a segunda app a partir do mesmo objeto de configuração.

**O preço:** é uma segunda cópia da forma do `firebase.js`, fora dele. Por isso a substituição tem de encontrar **exatamente uma** ocorrência, ou lança — se o ficheiro mudar de forma queremos saber, não correr contra o projeto errado. Coberto por `tests/loader-rewrite.test.mjs`. No dia em que o `projectId` puder vir de fora, isto desaparece.

---

## D-011 · Backups do emulador: bloqueados só na direção de produção {#d-011}

**2026-09-24**

Um export do emulador tem a mesma forma, os mesmos ids de salão e o mesmo "✓" que um de produção, e as pessoas lá dentro são inventadas. O ficheiro passou a dizer de onde veio (`source: { target, project }`), e restaurá-lo **contra o projeto real** é recusado antes de qualquer pedido de rede.

A direção contrária fica aberta de propósito: restaurar **dentro** do emulador é o ensaio, e é o que `tests/restore.e2e.mjs` faz a cada corrida.

Um ficheiro sem estampa conta como produção — até 2026-09-24 não havia outro sítio de onde tirar um backup, e adivinhar ao contrário deixaria passar em silêncio todos os ficheiros antigos. Uma estampa ilegível também: lê-la como "emulador" bloquearia um restauro verdadeiro numa emergência verdadeira.

---

## D-012 · As regras de bloqueio vivem no ficheiro global {#d-012}

**2026-09-24**

O `.claude/settings.json` do projeto só se aplica quando a sessão foi aberta nessa pasta. Abrir a app noutro sítio e navegar até aqui não carrega esse ficheiro — e as regras que interessam (`git push`, `firebase deploy`, `firestore:delete`) são precisamente as que não podem depender de por onde a sessão entrou.

Por isso estão no `~/.claude/settings.json`, que vale sempre, **e** repetidas no do projeto, que viaja com o repositório e documenta a intenção para quem o clonar. Duplicação deliberada: uma para valer, outra para explicar.

O `.claude/settings.local.json` — permissões desta máquina — está no `.gitignore` do repositório desde 2026-09-24. Estava protegido só pelo gitignore global do Pedro, o que é o mesmo que não estar protegido em mais nenhum sítio.
