# 🎤 Guia de Apresentação — Book It

Script completo para apresentar o projeto. Calcula-se **~18 minutos** de fala + 5-10 min de perguntas.

---

## 🎯 Antes de começar

### Estrutura geral

| # | Slide | Tempo | Foco |
|---|---|---|---|
| 1 | Capa | 0:30 | Apresentação pessoal + título |
| 2 | O Problema | 1:30 | Dor que justifica o projeto |
| 3 | A Solução | 1:30 | Visão geral do produto |
| 4 | Arquitetura · 3 portais | 1:30 | Estrutura técnica visual |
| 5 | Fluxo do Cliente | 2:00 | A funcionalidade-âncora |
| 6 | Zen Club | 1:30 | Diferenciação · fidelização |
| 7 | Portal da Equipa | 1:30 | Operação diária |
| 8 | Dashboard Admin | 1:30 | Controlo e dados |
| 9 | Stack Técnica | 1:30 | Decisões de engenharia |
| 10 | Design System | 1:30 | Cuidado visual |
| 11 | Em Números | 1:00 | Escala do projeto |
| 12 | Caso Demo | 1:00 | Ver na prática |
| 13 | Roadmap | 1:00 | Próximos passos |
| 14 | Q&A | 1:00 + perguntas | Convite a perguntas |

### Preparação 5 minutos antes

- ✅ Abrir a apresentação em modo **Slideshow** (`F5` no PowerPoint, `Cmd+Enter` no Keynote)
- ✅ Abrir **2 abas extra** no browser:
  - `bookit00.netlify.app/?salon=zenorganic` (para demo ao vivo)
  - `bookit00.netlify.app/admin.html` (já com sessão admin iniciada)
- ✅ Telemóvel pronto com a app aberta (mostrar versão mobile)
- ✅ Água perto
- ✅ Cronómetro a postos (~18 min)

### Tom

- 🎯 **Tom**: confiante, profissional, sem ler. Conhecem o produto melhor do que ninguém.
- 🤝 **Postura**: virados para a audiência, contacto visual.
- ⏱ **Ritmo**: pausas curtas entre slides. Não despachar.
- 🎭 **Alternar oradores**: 7 slides cada (sugestão: Pedro slides 1-7, Tomás 8-14). Combinem antes.

---

## 📑 Slide 1 — Capa

**⏱ 0:30**

### O que dizer

> "Bom dia/Boa tarde a todos.
>
> Sou o Pedro Guerreiro, e este é o Tomás Ramos. Hoje vimos apresentar o **Book It** — um sistema multi-tenant de marcações para salões de beleza, desenvolvido no contexto da cadeira de [nome da cadeira] do 4.º semestre da Licenciatura em Informática para a Gestão, no IADE.
>
> A apresentação dura cerca de 15 minutos, ficamos depois disponíveis para perguntas."

### Pontos-chave

- Nome do produto: **Book It**
- O que faz: marcações online para salões
- Quem somos: nomes, números, semestre, escola
- Multi-tenant: cada salão tem o seu "ambiente" no mesmo sistema

### ⚠️ Evitar

- Começar com "ok, então..."
- Pedir desculpa por algo
- Falar de tecnologia logo no início

### 💡 Tip

Se houver projetor em mau estado, **abrir a apresentação no portátil** e mostrar nele. Vale mais o slide bem visto do que mal projetado.

---

## 📑 Slide 2 — O Problema

**⏱ 1:30**

### O que dizer

> "Antes do produto, o problema.
>
> Quem já trabalhou num salão ou conhece alguém que tenha um sabe: o telefone **não para de tocar**. A cabeleireira está com tinta nas mãos e o telefone ferve. Os clientes ficam à espera, alguns desistem.
>
> A agenda costuma ser **em papel**. Risca-se, corrige-se, perde-se. Quando há um engano, perde-se um cliente.
>
> Não há forma de **fidelizar** — a memória do salão depende da memória da dona. Não há descontos automáticos, não há sistema de referidos, não há nada que faça o cliente sentir que é especial.
>
> E sobretudo: o gestor **não tem dados**. Quantos clientes vieram este mês? Quanto faturámos? Quem não compareceu? Tudo é sentido, nada é medido."

### Pontos-chave

- 4 dores: 📞 telefonemas · 📓 agenda papel · 👋 sem fidelização · 📊 sem dados
- Falar de **pessoas reais** (a cabeleireira com tinta nas mãos)
- Conectar com a audiência: "quem já viu isto?"

### 💡 Tip

Pausa pequena após cada dor. Deixa o problema "afundar" antes de seguir.

---

## 📑 Slide 3 — A Solução

**⏱ 1:30**

### O que dizer

> "A solução é o **Book It**. Uma plataforma web que pega nestas 4 dores e devolve uma experiência online.
>
> A nossa frase de bolso é simples: **o telefone deixa de tocar, o caderno desaparece, os dados aparecem**.
>
> Tem três portais sobre a mesma base de dados:
>
> - O **cliente** marca em 24/7 em 5 passos, acumula pontos, vê o seu histórico
> - A **equipa** vê o dia inteiro à vista, confirma marcações, regista pagamentos
> - O **gestor** tem um dashboard em tempo real, com todos os indicadores que precisa
>
> E tudo isto é **multi-tenant** — está pensado para suportar vários salões na mesma plataforma desde o dia zero."

### Pontos-chave

- Slogan fácil de lembrar (telefone / caderno / dados)
- 3 portais distintos com responsabilidades claras
- Multi-tenant = ponto comercial (escala)

---

## 📑 Slide 4 — Arquitetura

**⏱ 1:30**

### O que dizer

> "Estes três portais são três páginas web distintas, mas partilham tudo o que está por baixo: a mesma base de código JavaScript, o mesmo desenho, a mesma base de dados.
>
> O **cliente** entra em `/index.html` — não precisa de conta. Pode criar uma, e ganha pontos por isso, mas não é obrigatório.
>
> A **equipa** entra em `/staff.html` com uma password partilhada — não é Firebase Auth, é uma password configurada pelo gestor que pode mudar quando alguém sair da equipa.
>
> O **gestor** entra em `/admin.html` com email e password — Firebase Auth, recuperação por email, tudo o que se espera.
>
> Por baixo, todos os portais partilham um ficheiro `app.js` com utilitários comuns: templates seguros contra XSS, transações atómicas, gestão de tema, e mais."

### Pontos-chave

- URLs distintos = mental model claro
- Cada portal tem o seu sistema de auth apropriado
- Código partilhado evita duplicação

### 🔥 Demo opcional

Mostrar rapidamente os 3 URLs no browser (abrir as 3 abas previamente).

---

## 📑 Slide 5 — Fluxo do Cliente

**⏱ 2:00**

### O que dizer

> "Comecemos pelo cliente, que é o porquê do produto existir.
>
> A marcação são 5 passos, **menos de 90 segundos** em média.
>
> **Passo 1** — escolher o serviço. Cartões com nome, duração e preço. Suportamos também **pacotes**, com badge a indicar e poupança calculada automaticamente.
>
> **Passo 2** — escolher o colaborador. Opção 'sem preferência' sempre primeiro, para os clientes que não querem decidir.
>
> **Passo 3** — escolher data e hora. Calendário com dias passados e fechados desativados. As horas mostradas são apenas as **realmente disponíveis** — verificamos contra a Firestore em tempo real.
>
> **Passo 4** — dados. Nome, email, telefone. Se a pessoa já tem conta, está logada, vem tudo preenchido. Tem ainda um campo opcional 'esta marcação é para outra pessoa' — para quem marca para a filha, marido, etc.
>
> **Passo 5** — confirmar. Resumo da marcação e, no fim, o cliente recebe um **código de referido único** para partilhar com amigos. Se um amigo usar, ambos ganham desconto."

### Pontos-chave

- 5 passos · 90 segundos · sem fricção
- Verificação real-time de horários (não há *double booking*)
- Pacotes como diferencial
- Pré-preenchimento para utilizadores logados
- Código de referido único por cliente

### 🔥 Demo opcional

Se tiverem tempo (2-3 min extra), mostrar **uma marcação real** no browser. Funciona muito bem em apresentação.

---

## 📑 Slide 6 — Zen Club

**⏱ 1:30**

### O que dizer

> "A grande inovação do Book It não é a marcação — isso é o mínimo. É o **Zen Club**, um sistema de fidelização com 4 mecânicas que se complementam.
>
> ⭐ **Pontos**: cada visita paga vale +10 pontos. Não é por aparecer — é por **pagar**. Isto força a equipa a fechar o ciclo (registar pagamento) e dá ao cliente uma razão para preferir o salão.
>
> 🎁 **Descontos automáticos**: à 10.ª visita (configurável pelo gestor), o sistema cria automaticamente um cupão de 20%. Aparece na conta do cliente sem ele pedir.
>
> 🔗 **Código de referido**: cada cliente recebe um código único como `ZEN-PEDR42`. Quando um amigo usa esse código numa marcação, **ambos ganham 10%**. Cria viralidade.
>
> 🎂 **Aniversário**: se o cliente puser a data no perfil, no mês do aniversário tem um desconto automático. Cria uma associação positiva forte com o salão.
>
> O gestor configura tudo isto na admin — número de visitas, percentagem de cada desconto. Está pronto a adaptar a cada salão."

### Pontos-chave

- "Pontos por pagar, não por aparecer" — força o ciclo de pagamento
- Cupões nascem sozinhos (não há trabalho manual)
- Referidos = viralidade
- Aniversário = ligação emocional
- Tudo configurável pelo gestor

---

## 📑 Slide 7 — Portal da Equipa

**⏱ 1:30**

### O que dizer

> "Para a equipa, o portal é minimalista — não precisamos que percam tempo a aprender uma ferramenta. A página principal mostra **o dia**.
>
> No topo: 4 indicadores grandes — total de marcações, pendentes, confirmadas e faturação atual. Atualizam-se **em tempo real**: se um cliente marcar agora, o número sobe sem ninguém tocar em nada.
>
> Em baixo: a lista de marcações de hoje, ordenadas por hora.
>
> Para cada uma, 4 botões — desenhados para um clique:
>
> - ✅ **Confirmar** marcações pendentes
> - 💰 **Registar pagamento** (ação crítica, abre um popup com 2 métodos: balcão ou online)
> - ⚪ **Não compareceu**, que deduz 5 pontos automaticamente
> - ❌ **Cancelar**, sem penalização
>
> O ponto importante: o **registo de pagamento** é uma **transação atómica** — atualiza a marcação, atribui os pontos ao cliente, e cria o cupão de fidelização se atingir o target — tudo numa só escrita. Se falhar, nada fica meio-feito."

### Pontos-chave

- Operação simples = adoção fácil
- Real-time elimina conflitos entre staff
- Pagamento é o "momento crítico" — onde os pontos nascem
- Transação atómica = sem estados inconsistentes

### 🔥 Demo opcional

Mostrar a abertura do popup de pagamento na admin (mais fácil que no staff). Selecionar método, confirmar.

---

## 📑 Slide 8 — Dashboard Admin

**⏱ 1:30**

### O que dizer

> "Para o gestor, a admin é onde vive o dia-a-dia. O dashboard dá-lhe os 5 indicadores que ele precisa **assim que entra**:
>
> marcações hoje, pendentes, confirmadas, faturação, total de clientes.
>
> Para além disto, temos 4 funcionalidades que distinguem o Book It de uma agenda online qualquer:
>
> 🔍 **Pesquisa global com `Cmd+K`** — um command palette ao estilo Linear, salta entre painéis e clientes com o teclado.
>
> 📅 **Vista de dia** — cronograma visual com os eventos coloridos por estado. Permite ver buracos no horário de relance.
>
> 📥 **Exportação CSV** — todas as listas (marcações, clientes) exportam para Excel num clique. Para o contabilista, para campanhas de marketing.
>
> ⏪ **Anular ação** — quando se cancela uma marcação ou se apaga um serviço, aparece um botão 'Anular' durante 6 segundos. Reduz erros operacionais.
>
> Tudo o resto está nos painéis da esquerda: gestão de serviços, equipa, horários, promoções, fidelização, configurações."

### Pontos-chave

- 5 KPIs visíveis imediatamente
- `⌘K` é o sinal de qualidade SaaS
- Vista de dia ajuda a otimizar a agenda
- CSV = profissional (não fica preso à ferramenta)
- Anular = reduz pânico

### 🔥 Demo opcional

Premir `Cmd+K` ao vivo, escrever "marcações", saltar para a vista de dia. Impacto visual grande.

---

## 📑 Slide 9 — Stack Técnica

**⏱ 1:30**

### O que dizer

> "Para os mais técnicos: o stack é deliberadamente **minimalista**.
>
> **Frontend** é HTML, CSS, JavaScript puro com ES Modules. **Não há React, não há build step, não há transpilação**. Cada página carrega menos de 30 KB.
>
> O **estilo** é um sistema próprio com 1607 linhas — tokens semânticos, dark mode, totalmente responsivo. Inspirado em sistemas tipo Linear ou Stripe.
>
> O **backend** é Firebase: Auth para login, Firestore para os dados. Multi-tenant feito por **estrutura de documento** — cada salão é um doc com sub-coleções.
>
> O **hosting** é Netlify. Drag-and-drop ou deploy automático via GitHub. Configurámos headers de segurança, página 404 personalizada, sitemap.
>
> E o detalhe que poucos pensam: **pagamentos + pontos + cupões** acontecem numa **transação atómica** com `runTransaction` da Firestore. Se uma parte falhar, nada se grava — nunca há estados inconsistentes."

### Pontos-chave

- Tecnologia escolhida pela manutenibilidade, não pela moda
- Zero dependências = zero risco de supply chain
- Firebase paga o serverless por nós
- Atomicidade = profissionalismo

### Possíveis perguntas

**P: Porquê não React?**
> Porque a complexidade não justifica. 7 páginas isoladas, sem app única. Vanilla JS é mais rápido, mais simples de debug e tem zero superfície de ataque por dependências.

**P: E se quiserem escalar para 1000 salões?**
> A arquitetura suporta — cada salão é um documento isolado. O bottleneck seria Firestore, e tem auto-scaling. O custo cresce linearmente.

---

## 📑 Slide 10 — Design System

**⏱ 1:30**

### O que dizer

> "Cuidámos do design como se fosse um produto SaaS de uma startup. A referência foi a Linear, a Stripe e a Cal.com.
>
> A **paleta de cores** é construída em tokens semânticos: brand, fg, muted, border, e estados (success, warn, danger, info). Cada salão pode sobrescrever a cor brand sem mexer em mais nada — basta colocar uma hex no documento do salão na Firestore.
>
> A **tipografia** é Inter, em 11 tamanhos modulares, com letter-spacing rigoroso e features tipográficas avançadas ligadas.
>
> 4 princípios que aplicámos em todo o lado:
>
> - **Dark + Light**: toggle persistido por utilizador, respeita `prefers-color-scheme` na primeira visita
> - **Mobile-first**: drawer no admin, modais a 100% do écrã no telemóvel
> - **Acessível**: focus-visible em todos os botões, ARIA roles corretos, `prefers-reduced-motion` respeitado
> - **Sem build**: cada página carrega menos de 30 KB"

### Pontos-chave

- Sistema, não folha de estilos
- Brand sobrescrível por salão = white-label
- Acessibilidade pensada, não improvisada

### 🔥 Demo opcional

Trocar o tema no admin (botão na sidebar) — efeito imediato e visualmente impressionante.

---

## 📑 Slide 11 — Em Números

**⏱ 1:00**

### O que dizer

> "Para terminar com escala: o projeto tem hoje **6411 linhas de código**, espalhadas por **20 ficheiros** — código e documentação.
>
> São **8 páginas web** funcionais (cliente, staff, admin, setup, login, success, 404), **1 salão demonstração** já em produção.
>
> Em termos de qualidade, fizemos uma auditoria interna que identificou **65 issues**. Corrigimos **19 bugs** críticos — incluindo um XSS, race conditions, falta de atomicidade. Adicionámos **8 funcionalidades novas** na revisão final.
>
> Tudo está em **6 commits Git documentados**, com changelog completo."

### Pontos-chave

- Números reais (não inflados)
- "65 issues identificados, 19 críticos corrigidos" = rigor profissional
- Git history limpo = engenharia profissional

---

## 📑 Slide 12 — Caso Demo

**⏱ 1:00**

### O que dizer

> "Para ver isto em prática, criámos o caso **Zen Organic Hair Concept**, um cabeleireiro fictício em Telheiras.
>
> Tem o site institucional em `zenorganic00.netlify.app` — galeria, equipa, parcerias, programa Zen Club, mapa, formulário de contacto. E o botão 'Marcar Agora' abre o Book It já configurado para este salão.
>
> O branding é consistente nos dois lados — a cor sage `#6B7C5A` aparece tanto no site institucional como na app de marcações.
>
> E o site institucional tem o seu próprio painel para o gestor editar conteúdo (fotos, equipa, parcerias) sem precisar de tocar no código."

### Pontos-chave

- Caso real, com URL público
- Branding consistente entre site e app
- Painel de conteúdo separado da admin operacional

### 🔥 Demo opcional

Abrir `zenorganic00.netlify.app` ao vivo, fazer scroll, mostrar o popup do Zen Club, clicar "Marcar Agora" → abre o Book It.

---

## 📑 Slide 13 — Roadmap

**⏱ 1:00**

### O que dizer

> "Onde vamos a seguir?
>
> A versão atual (**v2.1**) está em produção e é o que demonstrámos.
>
> No **Q3 2026**, queremos integrar pagamentos online — Stripe ou MB Way — no portal cliente. Hoje o método de pagamento é registado pela equipa, mas o pagamento em si ainda é offline.
>
> No **Q4 2026**, notificações: emails automáticos de confirmação, SMS de lembrete antes da hora, e Web Push para a equipa quando uma marcação chega.
>
> Em **2027**, multi-admin por salão (hoje só há um) e uma API REST pública para integrações com PoS, contabilidade, marketing.
>
> Há uma **limitação importante** que reconhecemos: as Firestore Security Rules ainda não estão em produção. Estão escritas e documentadas no DEPLOY.md — só não foram publicadas no ambiente live. É a primeira coisa a fazer antes de abrir a salões reais."

### Pontos-chave

- Honestidade sobre limitações = credibilidade
- Roadmap realista (não promessas vagas)
- Datas concretas

### Possíveis perguntas

**P: Quanto custaria isto a um salão real?**
> Para um salão com até 50 marcações/dia, o custo de Firebase fica abaixo de €5/mês. Hosting Netlify é grátis. O modelo comercial seria uma fee fixa mensal (sugerimos €29/mês) que paga tudo isto e dá lucro.

**P: Como diferenciar de Booksy, Fresha?**
> Esses são generalistas. O Book It é desenhado para **microempresas em Portugal** — interface em PT, fidelização Zen Club, painel próprio, sem fee por marcação.

---

## 📑 Slide 14 — Obrigado / Q&A

**⏱ 1:00 + perguntas**

### O que dizer

> "É tudo. Em resumo: pegámos numa dor real de microempresas — gerir marcações sem ferramentas — e construímos uma plataforma multi-tenant, acessível, em tempo real, com fidelização incorporada e cuidada ao detalhe.
>
> Os links estão no slide:
> - **`bookit00.netlify.app`** é a app
> - **`zenorganic00.netlify.app`** é o caso demo
> - GitHub tem o código
> - E temos três documentos: README com a arquitetura, DEPLOY com o guia passo a passo, GUIDE com a navegação por persona
>
> Obrigado pela atenção. Estamos à vossa disposição para perguntas."

### Postura nas perguntas

- 🎯 **Repete a pergunta** antes de responder (dá tempo a pensar e a audiência ouve)
- 🤝 **Divide as respostas** entre os dois — quem domina cada parte responde
- ❓ **Se não souberem**: "Não temos essa resposta agora, mas é uma boa pergunta para investigar" — vale mais do que inventar
- ⏱ **Respostas curtas** (1 min cada). Se for complexo, dizer "podemos falar no fim com mais detalhe"

---

## ❓ Perguntas frequentes preparadas

### Sobre o produto

**Como protegem os dados dos clientes?**
> A Firestore tem Security Rules que restringem acesso por utilizador autenticado. Os dados sensíveis (telefone, email) nunca aparecem em URLs ou no código-fonte. A password da equipa é hashada com SHA-256 antes de gravar.

**E se a conta Firebase ficar offline?**
> A app continua a carregar (HTML+CSS estão na CDN da Netlify) mas as marcações ficam paradas. Em produção real, monitorizaríamos o status com Firebase Status Page e teríamos um plano B (modo só leitura).

**Funciona em telemóveis antigos?**
> Sim, suportamos browsers dos últimos 4 anos (Safari 14+, Chrome 80+, Firefox 78+). Não usamos features experimentais.

### Sobre tecnologia

**Porquê Firebase e não Postgres ou Mongo?**
> Firebase resolve auth + realtime + hosting num só pacote. Para a escala MVP (até 100 salões), é a opção mais simples. Se crescer muito, migra-se para Postgres + serverless functions.

**Porquê não TypeScript?**
> Para o tamanho do projeto, TypeScript adicionava overhead de tooling sem grande benefício. Usamos JSDoc onde o tipo é importante.

**Vão abrir o código?**
> Atualmente está num repo privado do GitHub. Decidiremos quando lançar comercialmente — provavelmente algumas partes ficam open-source (o sistema de design, por exemplo).

### Sobre o modelo de negócio

**Quanto pagaria um salão?**
> Modelo SaaS — sugerimos €29/mês para o tier base (até 200 marcações/mês) e €59/mês para ilimitado, sem fee por marcação. Diferencia-nos da Booksy que cobra 10% por cada cliente novo.

**Como vão atrair os primeiros salões?**
> Início com 3-5 salões no círculo próximo (incluindo o Zen Organic) com 6 meses grátis em troca de feedback intensivo. Daí, marketing local (Instagram, Google Ads geo-localizado).

**Quem é o concorrente real?**
> Booksy é o maior (internacional). Em Portugal, principalmente caderno + telefone. Nicho não está saturado.

### Sobre o projeto académico

**Quanto tempo demorou?**
> 4 semanas de desenvolvimento ativo, distribuídas pelo semestre. ~80h de trabalho conjunto.

**Como dividiram o trabalho?**
> Frontend / backend de forma fluida — fazíamos pair programming nas partes mais complexas. Documentação foi escrita em conjunto.

**O que aprenderam?**
> Que produto não é só código — é UX, design, decisões de arquitetura, dívida técnica controlada. E que a documentação vale tanto como o código.

---

## 🔄 Plano B (se falhar a internet)

- A apresentação **funciona offline** depois de carregada. Não há demos ao vivo, mas o conteúdo está todo nos slides.
- Se a internet for instável, **decidir antes** de começar: não tentar demos ao vivo, apoiar-se nos slides.

---

## ✅ Checklist final 1 minuto antes

- [ ] Apresentação em modo Slideshow
- [ ] Abas extras prontas no browser
- [ ] Telemóvel acessível (se quiseres mostrar mobile)
- [ ] Garrafa de água
- [ ] Combinação visual: roupa que combine com o sage do projeto (cinza, verde escuro, branco)
- [ ] Sorrir 🙂

**Boa sorte. O produto fala por si.**
