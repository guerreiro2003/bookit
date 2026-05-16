# 🔄 Como atualizar o site

Resumo rápido de como mexer no site e ter as alterações online.

---

## URLs em produção

- **App:** [https://bookit-51575.web.app](https://bookit-51575.web.app)
- **Demo:** https://bookit-51575.web.app/?salon=zenorganic
- **Admin:** https://bookit-51575.web.app/admin.html
- **GitHub:** [github.com/guerreiro2003/bookit](https://github.com/guerreiro2003/bookit)

> O alias `bookit-51575.firebaseapp.com` também funciona — ambos os domínios servem o mesmo site.

---

## Fluxo para atualizar o site

```bash
# 1. Entrar na pasta do projeto
cd ~/Downloads/bookit-main

# 2. Garantir que tens a versão mais recente
git pull

# 3. Mexer nos ficheiros (HTML, CSS, JS, o que precisares)
#    podes usar qualquer editor: VSCode, Sublime, até mesmo TextEdit

# 4. Guardar no Git (versionar)
git add .
git commit -m "Descreve o que mudaste"
git push                            # atualiza GitHub

# 5. Publicar no Firebase
firebase deploy --only hosting      # ~30 segundos
```

Pronto. O site em `bookit-51575.web.app` reflete a mudança em segundos.

---

## Comandos úteis

### Ver o site em local antes de publicar

```bash
firebase serve --only hosting
# abre http://localhost:5000
```

Permite-te testar sem publicar online. Útil para experimentar mudanças grandes.

### Atualizar só as regras Firestore

Se mexeres em `firestore.rules` (segurança da base de dados):

```bash
firebase deploy --only firestore:rules
```

### Atualizar tudo de uma vez

```bash
firebase deploy
```

Sobe tudo: hosting + rules + indexes.

### Ver os logs de deploy

```bash
firebase hosting:channel:list
firebase hosting:channel:open live
```

---

## Como reverter se algo correr mal

### Opção 1 — Reverter no GitHub
1. Vai a [github.com/guerreiro2003/bookit/commits/main](https://github.com/guerreiro2003/bookit/commits/main)
2. Clica no commit anterior (o que funcionava)
3. Carrega no botão de "Revert" — cria uma PR de reversão
4. Depois `git pull` e `firebase deploy --only hosting`

### Opção 2 — Reverter no Firebase
1. Vai a [console.firebase.google.com/project/bookit-51575/hosting/sites](https://console.firebase.google.com/project/bookit-51575/hosting/sites)
2. Clica no site → "Release history"
3. Clica nos 3 pontos da release anterior → **"Rollback"**

Fica online em segundos.

---

## E se quiser uma URL mais bonita?

### Opção A — Comprar um domínio (~€10/ano)

1. Compra em [Namecheap](https://namecheap.com), [Porkbun](https://porkbun.com), ou [101domain.pt](https://101domain.pt) — escolhe `bookit.pt`, `bookitapp.com`, etc.

2. No Firebase: [console.firebase.google.com/project/bookit-51575/hosting/sites](https://console.firebase.google.com/project/bookit-51575/hosting/sites) → "Add custom domain" → segue as instruções.

3. Firebase dá-te DNS records para colares no painel do registar de domínios. SSL é automático.

### Opção B — Mudar para um projeto Firebase com nome melhor (grátis)

1. Cria novo projeto Firebase com nome `bookit` ou similar
2. Copia o novo `firebaseConfig` do passo 18 do `DEPLOY.md`
3. Cola em `firebase.js`
4. Corre `firebase use bookit-novo` e `firebase deploy`
5. Apaga o projeto antigo (opcional)

URL fica `bookit.web.app` em vez de `bookit-51575.web.app`.

---

## Ficheiros importantes (NÃO mexer sem saber o que fazes)

- `firebase.js` — config do Firebase. Se mudares, o site para de funcionar.
- `firestore.rules` — regras de segurança. Cuidado com mudanças aqui.
- `firebase.json` — config do hosting.
- `.firebaserc` — que projeto Firebase usar.

Tudo o resto (HTML, CSS, app.js) podes mexer à vontade.

---

## Atalhos

| Quero… | Comando |
|---|---|
| Atualizar o site | `git add . && git commit -m "X" && git push && firebase deploy --only hosting` |
| Ver o site localmente | `firebase serve --only hosting` |
| Atualizar regras Firestore | `firebase deploy --only firestore:rules` |
| Reverter para versão anterior | Console Firebase → Hosting → Release history → Rollback |
| Apagar dados de teste | Console Firebase → Firestore → apagar documentos manualmente |

---

## Limites do plano free

- 🌐 **Largura de banda:** ~360 MB/dia (≈ 10 GB/mês)
- 💾 **Storage Firestore:** 1 GB de dados
- 📥 **Reads Firestore:** 50 000/dia
- 📤 **Writes Firestore:** 20 000/dia
- 🔐 **Auth:** ilimitado

Se ultrapassares estes limites em algum dia, o Firebase **só pára os pedidos extras** — não te cobra. No dia seguinte volta a contar do zero.

Para um projeto académico (até 100 visitas/dia), nunca vais chegar nem perto destes limites.

Boa programação 🚀
