# Recuperação de desastre

O que fazer quando correr mal. Escrito para ser seguido às 9h de uma segunda-feira com um salão ao telefone.

**O ensaio completo foi corrido a 2026-09-20** — backup → cifrar → decifrar → verificar → restaurar → verificar → limpar. Volta a correr o ensaio de três em três meses; um plano que ninguém executa é uma esperança, não um plano.

> **Os comandos de restauro desta página foram corrigidos a 2026-09-24.** Estavam escritos na forma `npm run restore … --yes`, e o npm não passa as flags ao script sem um `--` à frente: o `--as` e o `--yes` desapareciam pelo caminho. Quem correu o ensaio de setembro terá chamado o `node scripts/backup-restore.mjs` diretamente, porque a forma documentada não chegava a restaurar nada. É por isso que os comandos abaixo passaram todos a invocar o script diretamente — é a forma que a própria mensagem de erro do script ensina, e não tem separador para esquecer. Ver [KI-017](docs/KNOWN_ISSUES.md).

---

## O que existe

| Camada | Estado | Cobre |
|---|---|---|
| Backup lógico diário, cifrado (GitHub Actions) | Pronto — falta ligar os dois segredos | Apagamento acidental, escrita má, salão perdido |
| Backup manual (`npm run backup`) | A funcionar | O mesmo, quando te lembras |
| Point-in-time recovery do Firestore | **Não existe** — exige Blaze | Voltar a um instante exato das últimas 24h/7 dias |
| Proteção contra apagar a base de dados | **Desativada** — exige Blaze | Alguém apagar o Firestore inteiro |
| Histórico de versões do Hosting | A funcionar | Deploy mau do site |

Enquanto o PITR não existir, a granularidade é a do último backup: **perde-se até 24 horas**.

---

## Fazer um backup agora

```bash
npm run backup
```

Escreve `backups/bookit-<data>.json` com todos os salões e subcoleções. Corre isto **antes de qualquer operação destrutiva** — o `delete-salon.mjs` recusa-se a correr sem um backup do próprio dia.

Verificar que presta:

```bash
npm run backup:verify backups/bookit-<data>.json
```

Um export vazio parece ter corrido bem e não serve para nada. O verificador apanha isso, apanha leituras incompletas, e **apanha coleções em falta** — compara o que o backup diz ter exportado com a lista única em `scripts/_lib.mjs`.

> **Backups anteriores a 2026-09-21 são incompletos.** Não incluem `staffAuth` nem `waitlist`: um restauro a partir deles traria o salão de volta com **todos os colaboradores sem acesso** e sem a fila de espera. O verificador rejeita-os por esse motivo. Guarda-os se quiseres, mas não contes com eles.

---

## Cenários

### 1. Alguém apagou marcações ou clientes por engano

```bash
npm run backup                                            # preserva o estado atual primeiro
node scripts/backup-restore.mjs backups/<ficheiro>.json <salonId> --as ensaio-restauro --yes
```

Restaura **ao lado** do salão vivo, num id descartável. A cópia não fica com dono nenhum — sem `adminUid`, sem login de equipa, `staffAuth` todo inativo — para não aparecer no painel de quem tem conta. Confirma os dados, e só então escreve por cima:

```bash
node scripts/backup-restore.mjs backups/<ficheiro>.json <salonId> --yes
node scripts/delete-salon.mjs ensaio-restauro --yes
```

Sem `--yes` qualquer um destes comandos só mostra o que faria — e **vale a pena correr sempre sem `--yes` primeiro**, para ler o plano antes de o executar.

### 2. Um salão inteiro desapareceu

Igual ao cenário 1, mas o `--as` é escusado: não há nada por cima do que escrever.

```bash
node scripts/backup-restore.mjs backups/<ficheiro>.json <salonId> --yes
```

### 3. Um deploy partiu o site

Consola do Firebase → Hosting → Versões → **Repor** a anterior. Não toca nos dados.

### 4. As regras de segurança ficaram demasiado abertas ou demasiado fechadas

```bash
git log --oneline -- firestore.rules      # encontra a última versão boa
git checkout <commit> -- firestore.rules
npm run deploy:rules
npm run test:abuse                        # confirma que os ataques continuam a ser recusados
```

### 5. Um backup do GitHub Actions

Actions → **Backup diário** → a corrida que queres → descarregar o artefacto.

```bash
BACKUP_PASSPHRASE="<a tua frase>" npm run backup:decrypt bookit-<data>.json.enc
npm run backup:verify bookit-<data>.json
```

**Sem a frase, o ficheiro é inútil** — nem para ti, nem para o GitHub. Guarda-a no gestor de passwords, nunca no repositório.

---

## Ligar o backup automático

Dois segredos em **Settings → Secrets and variables → Actions**:

| Segredo | Onde obter |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Consola Google Cloud → IAM → Contas de serviço → Criar. Papel **Cloud Datastore Viewer** (só leitura, é quanto basta). Chaves → Adicionar chave → JSON → cola o conteúdo todo. |
| `BACKUP_PASSPHRASE` | Inventa uma frase longa. Guarda-a no gestor de passwords. |

O workflow corre às 03:00 de Lisboa, cifra antes de guardar, **decifra outra vez para confirmar que o ficheiro abre**, e mantém 90 dias. Sem qualquer dos segredos, falha em vez de guardar dados em claro.

---

## Ensaio trimestral

```bash
npm run backup
npm run backup:verify backups/<o-mais-recente>.json
node scripts/backup-restore.mjs backups/<o-mais-recente>.json <salonId> --as ensaio-$(date +%s) --yes
# confere no painel, depois:
node scripts/delete-salon.mjs ensaio-<…> --yes
```

> **`npm run restore` também serve, mas precisa de `--`:** `npm run restore -- backups/….json <salonId> --as ensaio --yes`. Sem o separador o npm come as flags e o script recebe `ensaio` como terceiro argumento solto — recusa-se a correr e diz `✗ argumentos a mais: ensaio`. Recusar é de propósito: um `--as` que se perde faz o restauro cair no id original, ou seja, escreve por cima do salão vivo. Os `npm run backup` e `npm run backup:verify` não têm flags e não precisam de separador.

Anota a data do último ensaio em [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

---

## O que isto ainda não cobre

- **Contas de autenticação.** Os backups levam os dados do Firestore, não os utilizadores do Firebase Auth. Perder o projeto significa que admins, equipa e clientes têm de recriar conta. Os dados sobrevivem; os logins não. O `staffAuth` volta (quem tinha acesso a quê), mas as contas em si não.
- **Menos de 24 horas.** Sem PITR, a granularidade é o último backup.
- **O projeto Firebase em si.** Se a conta Google for perdida ou suspensa, os backups em GitHub são o que resta — e não trazem o Auth de volta.
