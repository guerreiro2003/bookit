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
1. **Serviços & preços** — nome, preço, duração (a duração é o que bloqueia a agenda). "Pacote" mostra preço original riscado.
2. **Equipa** — adiciona colaboradores (foto opcional). Cada um pode ter **horário próprio** (ex.: só tardes) e **férias/indisponibilidades**.
3. **Horários** — horário semanal, **pausa** (ex.: almoço) e **datas encerradas** (feriados, férias do salão).
4. **Configurações** — dados do salão, cor, e as regras das marcações online:
   - fuso horário;
   - intervalo entre horários (grelha: 15 min por omissão);
   - antecedência mínima (ex.: 30 min) e máxima (ex.: 90 dias);
   - até quantas horas antes o cliente pode cancelar sozinho (ex.: 24h);
   - **password da equipa** (definir uma nova invalida a anterior — usar quando alguém sai).

## C. Dia-a-dia
- **Dashboard**: marcações de hoje em tempo real, pendentes, faturação do dia. Botão **＋ Nova marcação** (telefone/walk-in): escolhe serviço, colaborador (ou "sem preferência"), data e um dos **horários realmente livres**.
- **Marcações**: filtros por estado/data e pesquisa. Ações: Confirmar · Pagamento (atribui pontos; se for visitante cria a ficha de cliente) · **Reagendar** (mostra só horários livres; pode mudar de colaborador) · Não compareceu (penaliza pontos) · Cancelar (liberta o horário; "Anular" nos 6 s seguintes repõe se o horário ainda estiver livre).
- **Vista de dia**: cronograma visual.
- **Clientes**: visitas, pontos, gasto, progresso de fidelização; exportar CSV.
- **Promoções / Galeria / Parcerias**: alimentam o site público em tempo real.
- **Fidelização**: visitas para desconto, %, desconto de referido, penalização de não-comparência.

## D. Portal da equipa (`staff.html?salon=<slug>`)
Entra com a **password da equipa**. Vê o dia, confirma, regista pagamentos, marca não-comparência, cancela. O admin pode entrar no mesmo portal com as suas credenciais (aba "Admin") e vê também o separador Clientes.

## E. O cliente final
- Marca em `/?salon=<slug>` sem conta: serviço → colaborador → data/hora (só horários livres) → dados → confirmar. Recebe uma página com **.ics / Google Calendar** (não há email automático — ver `functions/README.md`).
- Com conta (`account.html`): vê estado das marcações, cancela dentro da janela permitida, pontos e cupões, código de amigo, exporta ou apaga os seus dados.

## F. Perguntas frequentes
- **Um colaborador saiu.** Equipa → Desativar (não remover, se tiver marcações futuras). Configurações → nova password da equipa.
- **Feriado.** Horários → Datas encerradas.
- **Cliente quer cancelar em cima da hora.** O cliente não consegue online; a equipa cancela no portal.
- **Alterar a duração de um serviço** afeta apenas marcações futuras; as existentes mantêm a duração com que foram criadas.
- **Ver marcações antigas** (mais de 500): Marcações → filtrar por data.
