/* Can this machine run the Firebase emulators?
 *
 *   node scripts/check-emulators.mjs
 *
 * The emulator suite needs two things that are NOT npm dependencies: a JVM
 * (the Firestore emulator is a Java program) and firebase-tools. Neither is
 * installed by `npm ci`, and when either is missing the failure arrives as a
 * wall of Java or a download that never starts — a long way from "install a
 * JDK". This says it in one line instead.
 *
 * Deliberately contains no path from any particular machine: it reports what
 * it finds and what is missing. WHERE a given computer keeps its JDK is that
 * computer's business, and belongs in the environment, never in the repo.
 *
 * A note on PATH, learned the hard way: a Claude Code session (and any GUI
 * app) inherits the environment of whatever launched it, and does not read
 * ~/.zshrc. Install a JDK while a session is open and that session still will
 * not see it — the app has to be reopened. If this script says java is missing
 * and you know it is installed, that is almost always why.
 */
import { spawnSync } from 'node:child_process';

const MIN_JAVA = 11;
/* Versions this was last known to work with, for when something behaves oddly
   and you want to know whether you are far from the tested ground. */
const TESTED = { java: '17.0.20.1 (Temurin)', firebase: '15.18.0', node: '20.20.2' };

const problems = [];
const found = [];

/** Run a command and return its combined output, or null if it is not there. */
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error || r.status === null) return null;
  return `${r.stdout || ''}${r.stderr || ''}`.trim();
}

/* ── Java ─────────────────────────────────────────────────────────────────
   `java -version` writes to stderr, and the version string comes in two
   shapes: "17.0.20.1" on anything modern, "1.8.0_292" on 8 and earlier, where
   the number that matters is the second one. */
const INSTALL_JAVA =
  '     Instala um JDK 11 ou superior (o Temurin da Adoptium serve) e garante\n'
  + '     que o `java` fica no PATH. Se já o instalaste, fecha e reabre a app:\n'
  + '     a sessão herda o PATH de quem a lançou e não relê o ~/.zshrc.';

const javaOut = run('java', ['-version']);
const javaVer = javaOut === null ? null : /version "(\d+)(?:\.(\d+))?/.exec(javaOut);
const javaMajor = javaVer ? (javaVer[1] === '1' ? Number(javaVer[2]) : Number(javaVer[1])) : NaN;

if (!Number.isFinite(javaMajor)) {
  // Either there is no java at all, or there is one that cannot run. macOS
  // ships a /usr/bin/java stub that exists, answers, and says "Unable to
  // locate a Java Runtime" — the commonest way this fails on a Mac, and the
  // moment the install instructions are most needed.
  const why = javaOut === null
    ? 'java não encontrado.'
    : `java não está utilizável — respondeu:\n     ${javaOut.split('\n')[0]}`;
  problems.push(`${why}\n${INSTALL_JAVA}`);
} else if (javaMajor < MIN_JAVA) {
  problems.push(`java ${javaMajor} é antigo de mais — o emulador do Firestore precisa de ${MIN_JAVA}+.\n${INSTALL_JAVA}`);
} else {
  found.push(`java ${javaMajor} · ${javaOut.split('\n')[0]}`);
}

/* ── firebase-tools ───────────────────────────────────────────────────────
   Global install on purpose. `npx firebase-tools` is denied in this project's
   Claude Code settings, and pinning it as a devDependency would drag a large
   tree into a repo that deliberately has none. */
const fbOut = run('firebase', ['--version']);
if (fbOut === null) {
  problems.push(
    'firebase não encontrado.\n'
    + '     Instala:  npm i -g firebase-tools\n'
    + '     (não uses `npx firebase-tools` — está vedado nas definições deste projeto)');
} else {
  found.push(`firebase-tools ${fbOut.split('\n')[0]}`);
}

found.push(`node ${process.version.replace(/^v/, '')}`);

/* ── report ───────────────────────────────────────────────────────────── */
for (const f of found) console.log(`✓ ${f}`);
if (problems.length) {
  console.error(`\n✗ faltam ${problems.length} coisa(s) para correr os emuladores:\n`);
  for (const p of problems) console.error(`   · ${p}\n`);
  console.error(`Testado com: java ${TESTED.java}, firebase-tools ${TESTED.firebase}, node ${TESTED.node}.`);
  process.exit(1);
}
console.log('\n✓ esta máquina consegue correr os emuladores.');
console.log('  A primeira corrida descarrega os jars do emulador (~algumas centenas de MB)');
console.log('  para ~/.cache/firebase/emulators. É só uma vez, e não toca em nada remoto.');
