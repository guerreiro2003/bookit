# Guia de administração — configurar um salão novo

Público: operador do Book It (quem vende/instala) e dono do salão.

## A. Criar o salão (operador ou dono)
1. Abre `https://<dominio>/setup.html`.
2. Preenche: nome, *slug* (fica no link de marcações: `/?salon=<slug>` — não muda depois), morada, telefone, email, cor.
3. Conta admin: email + password (mín. 8). **Password da equipa** (mín. 8, diferente da do admin) — é a que os colaboradores usam no portal.
4. Horário semanal inicial.
5. Criar → entras diretamente no painel. O salão fica em **período de teste (30 dias)**.

**Operador:** para ativar a subscrição, `node scripts/set-plan.mjs <slug> active`. Para suspender (o cliente deixa de receber marcações online), `suspended`.

## B. Primeiro dia no painel (`admin.html`)
O cartão de onboarding guia os 4 passos:
1. **Serviços & preços** — nome, preço e **duração: és tu que decides quanto tempo leva cada coisa**. A duração é o que bloqueia a agenda.
   - **Tem tempo de espera**: para coloração, permanente e afins, marca a caixa e indica *trabalho inicial · espera · trabalho final* (ex.: 20 · 30 · 25). Durante a espera o colaborador fica livre e o sistema **encaixa lá outra cliente** — é assim que ganhas horas no dia sem trabalhar mais.
   - "Pacote" mostra preço original riscado.
2. **Equipa** — adiciona colaboradores (foto opcional). Cada um pode ter **horário próprio** (ex.: só tardes) e **férias/indisponibilidades**.
   - **Serviços que faz** — por omissão cada pessoa faz tudo. Se alguém não fizer todos (o barbeiro que não faz coloração, por exemplo), carrega em **Serviços** na linha dela e marca só o que faz. A partir daí os clientes deixam de a ver nos serviços que não faz, e o sistema não lhe marca esse trabalho. Numa marcação com vários serviços só aparece quem faz **todos**.
3. **Horários** — horário semanal, **pausa** (ex.: almoço) e **datas encerradas** (feriados, férias do salão).
4. **Configurações** — dados do salão, cor, e as regras das marcações online:
   - fuso horário;
   - intervalo entre horários (grelha: 15 min por omissão);
   - antecedência mínima (ex.: 30 min) e máxima (ex.: 90 dias);
   - até quantas horas antes o cliente pode cancelar sozinho (ex.: 24h);
   - **password da equipa** (definir uma nova invalida a anterior — usar quando alguém sai).

### B1. Já trabalhas há anos? Traz os teus clientes (`Importar`)
Não comeces do zero. Exporta do software que usas hoje (quase todos têm "Exportar" / "Guardar como CSV"; no Excel é *Ficheiro → Guardar como → CSV*) e larga o ficheiro no painel **Importar**.

- Reconhecemos as colunas pelo nome, tanto em português como em inglês. O que interessa:
  - **Clientes**: `Nome · Telemóvel · Email · Aniversário`
  - **Histórico de visitas**: `Data · Hora · Cliente · Telemóvel · Serviço · Valor · Profissional`
- Datas em `dd/mm/aaaa` e valores com vírgula (`35,00 €`) funcionam tal como saem do Excel português.
- **Vês tudo antes de gravar**: quantos clientes são novos, quantos já tens, que linhas têm problemas e porquê, e que serviços do ficheiro não existem no teu catálogo (esses ficam guardados na mesma, pelo nome).
- **Importa o histórico, não só a lista.** É o histórico que faz o Book It saber que a Dona Maria vinha de 5 em 5 semanas e já vão 12 — sem ele, o painel **Reativar** não tem nada a dizer.
- As visitas importadas entram como **concluídas** e **não ocupam a agenda** — são passado.
- Enganaste-te? Corrige o ficheiro e importa outra vez: os registos são **atualizados, não duplicados**.

## C. Dia-a-dia
- **Dashboard**: marcações de hoje em tempo real, pendentes, faturação do dia. Botão **＋ Nova marcação** (telefone/walk-in): escolhe serviço, colaborador (ou "sem preferência"), data e um dos **horários realmente livres**.
- **Marcações**: filtros por estado/data e pesquisa. Ações: Confirmar · Pagamento (atribui pontos; se for visitante cria a ficha de cliente) · **Reagendar** (mostra só horários livres; pode mudar de colaborador) · Não compareceu (penaliza pontos) · Cancelar (liberta o horário; "Anular" nos 6 s seguintes repõe se o horário ainda estiver livre).
- **Vista de dia**: cronograma visual.
- **Negócio**: marcações, receita registada, faltas, cancelamentos, ocupação, confirmações, regresso em 60 dias, por semana/origem/colaborador/serviço. Tudo contado nos registos — nada estimado.
- **Reativar** (rotina semanal, 5 minutos): lista de clientes que costumavam vir e deixaram de aparecer, ordenada pelo que gastaram no último ano. Cada cartão explica porquê (*"Vinha a cada 5 semanas; já passaram 10"*). **💬 Mensagem** abre o WhatsApp com um texto pessoal e um link de marcação; se o cliente marcar por esse link, a receita aparece em **Receita recuperada**. **Dispensar** esconde o cliente 6 meses. Depois de contactado, não volta a ser sugerido durante 30 dias, e quem já tem marcação futura nunca aparece.
- **Clientes**: visitas, pontos, gasto, progresso de fidelização; exportar CSV.
- **Promoções / Galeria / Parcerias**: alimentam o site público em tempo real.
- **Fidelização**: visitas para desconto, %, desconto de referido, penalização de não-comparência.

## D. Portal da equipa (`staff.html?salon=<slug>`)
Entra com a **password da equipa**. Vê o dia, confirma, regista pagamentos, marca não-comparência, cancela.

**Rotina de fim de dia (2 minutos):** no cartão **Por confirmar (hoje e amanhã)** carrega em **💬 WhatsApp** em cada marcação — abre a conversa com a mensagem pronta e um link onde o cliente confirma ou cancela sozinho. Se o cliente confirmar pelo link, a marcação passa a *Confirmada* automaticamente; se responder "1", carrega em **Confirmar**. As marcações não confirmadas até à hora são as que mais faltam: dá-lhes prioridade. O admin pode entrar no mesmo portal com as suas credenciais (aba "Admin") e vê também o separador Clientes.

## E. O cliente final
- Marca em `/?salon=<slug>` sem conta: **um ou mais serviços** (até 3 — corte + cor + tratamento; o tempo e o preço somam-se) → colaborador → data/hora (só horários livres) → telemóvel (email opcional) → confirmar. Recebe uma página com **.ics / Google Calendar** e o **link de gestão** (`m.html?s=…&t=…`) para confirmar presença ou cancelar dentro da janela do salão. Não há email automático (ver `functions/README.md`); a confirmação faz-se pelo WhatsApp da equipa.
- Para medir de onde vêm os clientes, partilha o link com origem: `/?salon=<slug>&src=ig` (Instagram), `&src=google` (perfil Google), `&src=qr` (balcão), `&src=site`.
- Com conta (`account.html`): vê estado das marcações, cancela dentro da janela permitida, pontos e cupões, código de amigo, exporta ou apaga os seus dados.

## F. Perguntas frequentes
- **Um colaborador saiu.** Equipa → Desativar (não remover, se tiver marcações futuras). Configurações → nova password da equipa.
- **Feriado.** Horários → Datas encerradas.
- **Cliente quer cancelar em cima da hora.** O cliente não consegue online; a equipa cancela no portal.
- **Alterar a duração de um serviço** afeta apenas marcações futuras; as existentes mantêm a duração com que foram criadas.
- **A cliente quer corte e coloração.** Escolhe os dois no passo 1 — o sistema soma o tempo e o preço. Não é preciso criar um serviço "corte + coloração".
- **Emitir faturas.** O Book It não emite faturas (exige software certificado pela AT). Continua a usar o que já tens; ver `FATURACAO.md`.
- **Ver marcações antigas** (mais de 500): Marcações → filtrar por data.
