/* O healthcheck tem de apontar para produção — as duas camadas.
 *
 * O que aconteceu: o healthcheck corre com `--import ./tests/_register.mjs`
 * para poder importar o código do browser sem o alterar. Na T5 esse ficheiro
 * passou a pôr BOOKIT_TARGET=emulator por omissão e a selar a rede — decisão
 * certa para as suites, desastrosa para este script. No GitHub não há emulador
 * nenhum: a primeira ligação foi bloqueada, o passo saiu com 97 e o workflow
 * abriu um issue a dizer que o Book It não aceitava marcações. O site estava de
 * pé. O que estava partido era o alarme, que é pior do que não ter alarme.
 *
 * Duas camadas, testadas aqui as duas:
 *   1. o workflow declara BOOKIT_TARGET: real no passo que corre o script;
 *   2. o script recusa-se a correr se o alvo resolvido não for produção, para
 *      que tirar a linha volte a dar um erro que se entende em vez de um falso
 *      alarme de site em baixo.
 *
 * Puro: a camada 1 lê um ficheiro, a camada 2 arranca o script em modo
 * emulador, onde a guarda de rede do _register.mjs está ativa e a guarda do
 * próprio script sai antes de qualquer ligação. Nada sai desta máquina.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/healthcheck.yml');

/* Um parser de indentação em vez de uma dependência de YAML, porque a stack é
   vanilla sem build e uma dependência nova precisa do Pedro. Só precisa de
   recortar UM passo de UMA lista, e falha alto se não conseguir — um parser que
   não encontra nada não pode passar a dizer "está tudo bem". */
function passoQueCorre(yml, marca) {
  const linhas = yml.split('\n');
  const iRun = linhas.findIndex(l => l.includes(marca));
  assert.notEqual(iRun, -1,
    `nenhuma linha de ${path.basename(WORKFLOW)} menciona ${marca} — ou o workflow deixou de correr o healthcheck, ou esta procura está desatualizada`);

  let inicio = -1, indent = '';
  for (let i = iRun; i >= 0; i--) {
    const m = linhas[i].match(/^(\s*)-\s/);
    if (m) { inicio = i; indent = m[1]; break; }
  }
  assert.notEqual(inicio, -1, 'não foi possível encontrar o início do passo — parser errado');

  let fim = linhas.length;
  for (let i = inicio + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.trim()) continue;
    const dela = l.match(/^(\s*)/)[1];
    if (dela.length <= indent.length) { fim = i; break; }
  }
  return { linhas: linhas.slice(inicio, fim), indent };
}

/* Só conta se estiver no bloco `env:` DESTE passo. Uma menção em comentário, ou
   num env de outro passo, não põe a variável no processo. */
function envDoPasso(passo) {
  const iEnv = passo.linhas.findIndex(l => /^\s*env:\s*$/.test(l));
  if (iEnv === -1) return {};
  const indentEnv = passo.linhas[iEnv].match(/^(\s*)/)[1].length;
  const env = {};
  for (let i = iEnv + 1; i < passo.linhas.length; i++) {
    const l = passo.linhas[i];
    if (!l.trim() || /^\s*#/.test(l)) continue;
    if (l.match(/^(\s*)/)[1].length <= indentEnv) break;
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

test('o workflow do healthcheck declara BOOKIT_TARGET=real no passo que o corre', () => {
  const yml = fs.readFileSync(WORKFLOW, 'utf8');
  const passo = passoQueCorre(yml, 'scripts/healthcheck.mjs');

  // A régua: se o recorte não trouxe o run, o resto não prova nada.
  assert.ok(passo.linhas.some(l => l.includes('scripts/healthcheck.mjs')),
    'o recorte do passo não contém o comando — parser errado');

  const env = envDoPasso(passo);
  assert.equal(env.BOOKIT_TARGET, 'real',
    `o passo corre scripts/healthcheck.mjs com BOOKIT_TARGET=${JSON.stringify(env.BOOKIT_TARGET)}.`
    + ' Sem "real" explícito, o tests/_register.mjs põe "emulator" por omissão e sela a rede:'
    + ' no GitHub não há emulador, a corrida morre na primeira ligação e este workflow abre um'
    + ' issue a dizer que o site está em baixo quando está de pé.');
});

test('o script recusa-se a vigiar um alvo que não seja produção', () => {
  /* Sem BOOKIT_TARGET, tal como o CI corria antes da correção. A guarda tem de
     sair antes da primeira ligação — se saísse depois, o que se via aqui era a
     guarda de rede a bloquear, não esta. */
  const r = spawnSync(process.execPath,
    ['--import', './tests/_register.mjs', 'scripts/healthcheck.mjs', 'demo'],
    { cwd: ROOT, encoding: 'utf8', timeout: 60_000, env: { ...process.env, BOOKIT_TARGET: '' } });

  const saida = `${r.stdout || ''}${r.stderr || ''}`;
  assert.notEqual(r.status, 0, `o healthcheck devia ter recusado um alvo de emulador e saiu 0:\n${saida}`);
  assert.match(saida, /só vigia PRODUÇÃO/,
    `esperava a mensagem da guarda de produção e veio outra coisa:\n${saida}`);
  assert.doesNotMatch(saida, /LIGAÇÃO REMOTA BLOQUEADA/,
    `a guarda saiu tarde: já se tentou ligar à rede antes de recusar o alvo:\n${saida}`);
});
