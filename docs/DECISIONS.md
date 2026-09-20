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
