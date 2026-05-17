# 🎬 Guia de demonstração ao vivo — Book It + Zen Organic

Walkthrough completo passo-a-passo. Pensado para mostrar à audiência ao vivo (apresentação, defesa, reunião com cliente). Cobre tudo o que está em produção, na ordem que conta a melhor história.

**Duração total estimada:** 18–22 min de demo + Q&A.

---

## 🔑 Credenciais a ter à mão

Antes de começar, abre **3 separadores anónimos** (Cmd+Shift+N) e cola estas URLs (não faças login ainda):

| Separador | URL |
|---|---|
| 1 | <https://zen-organic-pt.web.app> |
| 2 | <https://zen-organic-pt.web.app/admin.html> |
| 3 | <https://bookit-51575.web.app/admin.html> |

E tem este bloco a postos para copiar quando precisares:

```
─── Conta admin ──────────────────────
Email:    admin@bookit.demo
Password: Demo2026!

─── Password da equipa ───────────────
equipa2026

─── Conta cliente de teste ───────────
Email:    cliente@bookit.demo
Password: Cliente2026!

─── Painel do site Zen Organic ───────
Password: zen2025
─────────────────────────────────────
```

---

## ⏱ Estrutura sugerida

| # | Secção | Tempo | Aba |
|---|---|---|---|
| 1 | Site Zen Organic (vertente pública) | 3 min | 1 |
| 2 | Painel do site Zen Organic + ligação ao BookIt | 3 min | 2 |
| 3 | App de marcações (vertente do cliente novo) | 4 min | (novo) |
| 4 | Área pessoal do cliente (Zen Club) | 3 min | (novo) |
| 5 | Portal da equipa | 2 min | (novo) |
| 6 | Admin completo do BookIt | 5 min | 3 |
| 7 | Bónus: ⌘K, mobile, dark mode | 1 min | 3 |

---

## 1️⃣ Site Zen Organic — vertente pública

**Aba 1.** Abre <https://zen-organic-pt.web.app>.

### O que mostrar e o que dizer

> *"Este é o site público do Zen Organic — um salão de cabeleireiro eco-conscious em Telheiras. Está concebido como um produto de marca, não um site genérico."*

**Faz scroll lento de cima até ao fundo**, comentando cada secção:

| Secção | Aponta para |
|---|---|
| **Hero** | Tipografia em serif italic, badges das credenciais (sem parabenos, sulfatos, etc.). "Concept brand, não salão genérico." |
| **Serviços** | 4 cartões de serviços principais — cada um com botão "Marcar". |
| **Promoções** | Banner de destaque, anúncios secundários geridos pelo painel admin. |
| **Preços** | Tabelas Mulher / Homem com CTA "Pronto para marcar?" em destaque. |
| **Galeria** | "Esta é uma das partes que o gestor edita no admin." |
| **Testemunhos** | Quotes em serif italic — toque editorial. |
| **Equipa** | Gerido no painel (cartões com fotos + bio). |
| **Parcerias** | Marcas orgânicas — também gerido no painel. |
| **Zen Club** | "Aqui apresentamos o programa de fidelização — leva o cliente para criar conta no BookIt." |
| **Localização** | Endereço + Google Maps embed + horários. |
| **Contactos** | Apenas dois cards: marcação online e formulário simples (mailto). |

### Popup Zen Club

Ao fim de **~4 segundos** aparece o popup do Zen Club. **Aponta:**

> *"Pop-up dispara automaticamente em primeiras visitas — convite a criar conta. Tem foco-trap (acessibilidade), fecha com Esc, e regista-se na sessionStorage para não voltar a aparecer."*

**Fecha** com "Agora não" ou no X.

### Click crítico — botão "Marcar Agora"

> *"Quando o cliente decide marcar, este botão leva-o à app de marcações do BookIt já configurada para este salão específico."*

**NÃO cliques ainda** — vamos voltar a isto na secção 3. Em vez disso, abre a Aba 2.

---

## 2️⃣ Painel do site Zen Organic — onde o gestor edita o site

**Aba 2.** Abre <https://zen-organic-pt.web.app/admin.html>.

> *"Este é o painel separado para o **dono do site editar conteúdo**: fotos, equipa, parcerias, anúncios. Diferente do admin do BookIt — que gere marcações."*

**Password:** `zen2025` → **Entrar**.

### Dashboard — o moment que liga os dois mundos

Esta é a parte mais interessante para a audiência:

> *"Olha o dashboard — tem **dois lados**. Em cima: marcações reais do BookIt em tempo real, lidas diretamente do mesmo Firestore. Em baixo: estatísticas do conteúdo do site."*

Aponta para:
- **Contadores Marcações / Pendentes / Confirmadas / Faturação hoje** → "atualiza em tempo real"
- **Cronograma do dia** → "vê o que está a acontecer no salão hoje"
- **Botão "Gerir marcações no Book It →"** → "quando precisa de mexer, vai para o admin certo"

### Edição de conteúdo (mostrar 2–3, não todos)

**Tab Galeria:**
- Mostra fotos existentes.
- *"Upload de fotos a partir do telemóvel — depois aparecem no site público."*
- (Não é preciso fazer upload ao vivo a menos que queiras.)

**Tab Equipa:**
- Mostra membros existentes.
- *"Adicionar nome, função, bio, foto. Reordenar com setas."*

**Tab Anúncios:**
- *"Cria banners de promoções. O cliente vê-os logo na entrada do site, na secção 'Promoções'."*

> 💬 **Diz à audiência:** *"O dados deste painel ficam guardados no browser daquele computador — não na cloud. É uma limitação conhecida, documentada. Para uma agência multi-utilizador, faria sentido migrar para Firestore também."*

---

## 3️⃣ App de marcações — fluxo de cliente

Volta à **Aba 1** (Zen Organic), faz scroll para o topo, e **clica "Marcar Agora"**.

> *"Abre numa aba nova — a app de marcações já com o salão certo carregado."*

URL será: `https://bookit-51575.web.app/?salon=demo`

### Os 5 passos

Comenta a transição visual e a barra de progresso:

> *"Cinco passos. Tempo médio: menos de 90 segundos. Funciona sem conta."*

**Passo 1 — Serviço:**
- Aponta para o **pacote** (Coloração Completa) com badge verde e poupança calculada.
- *"Sistema suporta serviços individuais e pacotes com preço original riscado e poupança calculada."*
- Escolhe **Corte + Brushing**.

**Passo 2 — Colaborador:**
- *"Pode escolher sem preferência ou um nome específico. Repara na Marta Pinto — só trabalha à tarde. Isso afeta os horários disponíveis."*
- Escolhe **Ana Silva**.

**Passo 3 — Data e hora:**
- Aponta para o calendário: dias passados desactivados, hoje destacado, domingo fechado (a cor mais clara).
- Escolhe **amanhã** (ou outro dia útil).
- *"Os slots disponíveis são gerados em tempo real a partir do horário do salão + duração do serviço. E mais importante: **a query verifica em tempo real quais slots já estão ocupados** — não permite double-booking."*
- Escolhe **um horário** (qualquer).

**Passo 4 — Dados:**
- Preenche manualmente (para mostrar o fluxo "sem conta"):
  - Nome: `Maria Sousa`
  - Email: `maria@teste.pt`
  - Telemóvel: `912 000 000`
- Aponta para os campos:
  - *"Esta marcação é para outra pessoa? — campo para quem marca para um familiar"*
  - *"Código de referido — se um amigo lhe deu o código dele, ambos ganham desconto"*

**Passo 5 — Confirmar:**
- Mostra a tabela resumo.
- **Clica "Confirmar marcação"**.

### Página de sucesso

> *"Página de confirmação com animação de check + ring pulsante. Tipografia editorial — momento celebratório."*

Aponta para:
- **Código de referido único** gerado automaticamente (ex: `DEM-MARI42`)
- Botão "Copiar código"
- Cartão "🌿 Conta gratuita" — *"convite a criar conta para esta pessoa que marcou sem conta"*
- Botão "Nova marcação"

---

## 4️⃣ Área pessoal do cliente — Zen Club

**Abre nova aba:** <https://bookit-51575.web.app/account.html?salon=demo>

> *"Esta é a área pessoal do cliente. Vou entrar como o cliente de demonstração que tem histórico real."*

**Email:** `cliente@bookit.demo` · **Password:** `Cliente2026!` → **Entrar**.

### Profile header

- Avatar com inicial em serif italic (consistente com o brand mark).
- Nome, email, "Membro desde".
- **3 stat cards:** Visitas / Pontos Zen Club / Gasto total.
- **Barra de fidelização** com mensagem ("Faltam X visitas para o teu desconto de 20%").

> *"Cada visita PAGA = 10 pontos. À 5ª visita (configurável), o sistema cria automaticamente um cupão de 20%."*

### Tabs

**Próximas:**
- Lista de marcações futuras.
- *"Marcações de hoje têm destaque visual especial."*
- Botão **"Cancelar marcação"** disponível para pendentes/confirmadas (mostrar, sem clicar).

**Histórico:**
- Visitas passadas com status badges.
- Cliente já tem uma marcação concluída e paga (criada no setup) → mostra `+10 pontos`.

**Descontos:**
- Mostrar cupões que o cliente tem (ex: aniversário, fidelização).
- Cada cupão tem código copiável (estilo dashed border).

**Referidos:**
- O código único do cliente, grande e copiável.
- *"Quando um amigo usa este código numa marcação, ambos ganham desconto."*
- Lista de pessoas trazidas (vazio se ninguém).

**Dados:**
- Formulário para alterar nome, telemóvel, data de aniversário.
- *"A data de aniversário ativa o cupão automático no mês."*
- Botão para alterar password.
- **Zona de risco:** apagar conta (anonimiza, GDPR-friendly).

> 💬 **Highlight:** *"Repara que quando o cliente faz uma marcação enquanto está logado, a página de sucesso reconhece-o e oferece 'Ver as minhas marcações' em vez do convite a criar conta. UX consciente."*

---

## 5️⃣ Portal da Equipa

**Abre nova aba:** <https://bookit-51575.web.app/staff.html?salon=demo>

> *"Este é o portal **mínimo viável** para os colaboradores. Não os obrigamos a aprender o admin completo — só vêem o que precisam: o dia."*

### Login

- Mostra os dois tabs: **Equipa** e **Admin**.
- No tab Equipa → password: `equipa2026` → Entrar.
- *"Password única partilhada pela equipa, gerida pelo admin. Hashada com SHA-256 antes de gravar."*

### Tab "Hoje"

- **4 stat cards no topo:** Marcações / Pendentes / Confirmadas / Faturação.
- **Indicador "Em tempo real"** com dot animado.
- **Cronograma** com cada marcação.

Aponta para os **botões de ação** em cada marcação:
- ✅ **Confirmar** (pendentes)
- 💰 **Pagamento** (não pagas, abre modal com método: Balcão ou Online)
- ⚪ **Não compareceu** (deduz 5 pontos)
- ❌ **Cancelar**

### Demonstra o pagamento (high-impact)

- **Encontra uma marcação pendente** (cria uma rápida primeiro na aba do cliente se não houver).
- Clica **"Confirmar"** → muda para "Confirmada" em **tempo real, sem refresh**.
- Clica **"💰 Pagamento"** → abre modal.
- Escolhe **"💵 Balcão"** → clica **"Confirmar"**.

> *"Esta operação é uma **transação atómica**: atualiza a marcação para concluída + paga + atribui 10 pontos ao cliente + cria automaticamente o cupão de fidelização se atingiu a 5ª visita. Tudo num só commit Firestore. Se uma parte falhar, nada fica meio-feito."*

### Outras tabs

- **Todas as marcações:** filtros por estado e data, pesquisa.
- **Serviços:** read-only (consulta de preços/duração).

### Admin no tab

> *"O admin pode entrar pelo tab 'Admin' com email + password — vê mais um tab: 'Clientes'."*

(Não cliques agora — vamos ver isso no admin completo a seguir.)

---

## 6️⃣ BookIt Admin completo

**Volta à Aba 3** (admin.html).

**Email:** `admin@bookit.demo` · **Password:** `Demo2026!` → **Entrar**.

### Tour pelo Dashboard

> *"Sidebar à esquerda com 7 painéis. Conteúdo principal à direita. Vista que é a 'home' do dono do salão."*

- **5 stat cards** com KPIs do dia
- **Marcações de hoje** em tempo real (a mesma data que aparece no Zen Organic admin)
- Botão **"↻ Atualizar"** + **"＋ Nova marcação"**

### Tour rápido pelos painéis

**Marcações** (Cmd+K para ir mais rápido — ver bónus):
- Tabela com todas as marcações
- Filtros: estado, data, pesquisa
- **Botão "⬇ Exportar CSV"** — *"Para o contabilista, marketing, etc."*

**Vista de dia** (impacto visual):
- Cronograma vertical do dia, hora a hora
- Eventos coloridos por estado (pendente amarelo, confirmado azul, concluído verde, cancelado cinza)
- Clica num evento → abre modal de pagamento
- Setas para navegar dias

**Clientes:**
- Tabela ordenada por visitas
- Barra de progresso de fidelização por cliente
- Código de referido
- Pesquisa + exportar CSV

**Serviços:**
- Formulário com toggle "Serviço individual / Pacote"
- Mostra os 6 serviços já criados — destaca o pacote
- *"Editar serviço carrega os valores no formulário — uma só fonte de verdade."*

**Equipa:**
- Lista de colaboradores (Ana, João, Marta)
- Secção "Horário individual por colaborador" — **NOVO, com instruções passo-a-passo**
- *"A Marta só trabalha à tarde — isso é configurado aqui."*
- Seleciona **Marta** no dropdown → vê o horário (manhãs fechadas).

**Horários:**
- Horário geral do salão por dia da semana
- *"Define o que aparece como disponível na app de marcações."*

**Promoções:**
- Cria banner que aparece no topo da app de marcações.

**Fidelização:**
- Configura: visitas para desconto (5), % desconto (20%), % referido (10%), penalização não compareceu (5 pts).

**Configurações:**
- Nome do salão, morada, telefone, **cor primária** (color picker — *"toda a app re-cor automaticamente"*).
- **Password da equipa** (hashada antes de gravar — só admin pode alterar).

### "Anular" toast

Para demonstrar a UX de undo:
- Vai a **Serviços** → clica **"Remover"** num qualquer.
- Confirma o popup.
- No fundo aparece toast: **"Removido. [Anular]"** — clica em "Anular" antes dos 6 segundos.
- *"Reduz erros operacionais — toda a ação destrutiva tem 6 segundos para anular."*

---

## 7️⃣ Bónus — três coisas para fechar com chave de ouro

### a) Command palette (⌘K)

Carrega **`Cmd+K`** (Mac) ou **`Ctrl+K`** (Windows).
- *"Pesquisa universal estilo Linear / Stripe."*
- Escreve "vista" → desce com setas → Enter → salta para Vista de dia.
- Pesquisa por nome de cliente também funciona.

### b) Dark mode

Na sidebar, clica **"Tema escuro"** → toda a interface muda em <300ms.
- *"Sistema completo de tokens — uma só classe `[data-theme=\"dark\"]` no `<html>` faz toda a interface mudar. Persistido em localStorage por utilizador."*

### c) Mobile

Reduz a janela do browser (ou abre no telemóvel).
- Sidebar transforma-se em drawer.
- Header mobile com burger menu.
- Modais a 100% do écrã, formulários adaptados.
- *"Mobile-first desde o início — não é responsive 'afterwards'."*

---

## 🎬 Sequência alternativa (versão curta — 8 min)

Se tiveres pouco tempo:

1. **Zen Organic site** (1 min) — só hero + scroll rápido.
2. **Zen Organic admin** (1 min) — só o dashboard com o widget de marcações.
3. **Booking flow** (2 min) — passos 1, 4, 5 (saltar staff e calendário detalhe).
4. **Admin BookIt** (3 min) — dashboard, vista de dia, transação atómica de pagamento.
5. **Bónus** (1 min) — ⌘K + dark mode.

---

## 💡 Tips para a apresentação

### Histórias de bastidores para mencionar quando relevantes

- *"Quando o cliente marca uma hora, o sistema **verifica em tempo real** os slots ocupados — query Firestore com 3 filtros. Tivemos de afinar as regras de segurança para isso funcionar."*
- *"O sistema de pontos + cupão automático é uma **transação atómica** — não há possibilidade de cobrar e não atribuir pontos."*
- *"O design system é próprio — Inter para o corpo, Instrument Serif para os momentos editoriais. Inspirado em Linear, Stripe, Vercel."*
- *"O site Zen Organic é estático puro (HTML/CSS/JS) — o admin guarda em localStorage. Limitação conhecida, documentada. Trade-off por simplicidade."*
- *"O BookIt é multi-tenant — cada salão é um doc Firestore com sub-colecções. Adicionar um salão novo é só correr o setup."*

### Coisas para NÃO mencionar (a menos que perguntem)

- A história dos créditos Netlify (irrelevante).
- O salão `zenorganic` antigo (vazio, legacy — confunde).
- A conta do `pedroguerreiro2003@gmail.com` (privada).

### Quando algo falhar ao vivo

- **Demo deusa = caching antigo.** Abre janela anónima e refresh.
- **Marcação não aparece imediatamente?** Espera 1–2 segundos para o snapshot Firestore propagar.
- **Modal não fecha?** Carrega Esc — sempre funciona.

---

## ✅ Checklist pré-apresentação (5 min antes)

- [ ] 3 abas anónimas abertas com os URLs corretos
- [ ] Bloco de credenciais à mão (impresso ou notas separadas)
- [ ] Browser em zoom 110-125% se o écrã for grande (mais legível para a audiência)
- [ ] Carregar o site Zen Organic uma vez para "esquentar" cache (não vai esperar 4s pelo popup)
- [ ] Ter já a cliente@bookit.demo logada na aba do account.html (poupa 30s)
- [ ] Garrafa de água. Respira.

---

**Vais arrasar.** O produto fala por si — está tudo lá. Tu só tens de mostrar.
