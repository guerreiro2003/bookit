# Faturação — a objeção nº 1 e o que fazemos com ela

## O sinal

A dona do salão-piloto (utilizadora real de Zappy) disse que **não trocaria de software porque o Zappy faz-lhe a faturação**. É a informação de mercado mais valiosa que temos até hoje e confirma o risco já identificado na auditoria estratégica.

O que ela está a dizer não é "o vosso produto é pior". É: *"já tenho uma coisa que resolve uma obrigação legal, e trocar dá trabalho."*

## O que não vamos fazer

**Não construímos faturação.** Em Portugal, emitir faturas exige software certificado pela Autoridade Tributária. A certificação é um processo longo, caro e com manutenção legal permanente. Entrar aí é competir com a Zappy no terreno dela, com anos de atraso, sem ganhar nada em diferenciação.

## Posicionamento até haver integração

> "O Book It não substitui a tua faturação. Trata da agenda, das confirmações e dos clientes que deixaram de vir — e mostra-te quanto isso te rendeu."

O salão continua a emitir faturas onde já emite. O nosso valor é outro: menos faltas e clientes recuperados, medidos em euros.

**Custo honesto para o cliente:** há dupla entrada (marcar no Book It, faturar no outro sistema) até a integração existir. Não esconder isso na venda.

## O caminho definitivo: integrar um fornecedor certificado

Todos os principais têm API REST e são certificados pela AT:

| Fornecedor | Preço indicativo | Notas |
|---|---|---|
| [Cegid Vendus](https://www.vendus.pt/planos-precos/) | desde ~€6,25/mês (anual) | Tem [página dedicada a cabeleireiros](https://www.vendus.pt/software-faturacao-cabeleireiros/); POS + API |
| [InvoiceXpress](https://invoicexpress.com/) | a confirmar | API REST; grupo Visma |
| Moloni | a confirmar | OAuth 2.0; grupo Visma |

**Fluxo desenhado:** quando a equipa regista o pagamento no Book It (já é um passo que existe), uma Cloud Function chama a API do fornecedor e emite a fatura-recibo; guardamos o número e o link do documento na marcação.

**O que falta para o fazer (por ordem):**
1. Plano Blaze no Firebase (as chaves de API não podem viver no browser — precisa de backend). Custo: cêntimos/mês.
2. Conta do salão no fornecedor + chave de API guardada em Secret Manager, **por salão**.
3. Mapear serviços → artigos do fornecedor, taxas de IVA e séries de documentos.
4. Tratamento de erros: se a emissão falhar, o pagamento no Book It **não pode** ficar perdido — fica marcado como "por faturar" e é reenviado.
5. **LEGAL REVIEW REQUIRED**: responsabilidade fiscal de quem emite, dados na fatura, retenção, e se somos subcontratante para este efeito.

## Decisão atual

Adiado até haver o primeiro cliente a pagar (decisão de não gastar dinheiro antes de receita). Não bloqueia a wedge: confirmações e reativação funcionam sem tocar em faturação.

## Teste barato que muda a conversa

A dona já tem anos de histórico no Zappy. Exportar a lista de clientes e marcações, importar no Book It e correr o motor de cadência: em minutos ela vê **quem desapareceu e quanto gastava**. Nenhum concorrente lhe mostra isso. Se esse número não a impressionar, a wedge está errada — e é melhor sabermos com um salão do que com trinta.
