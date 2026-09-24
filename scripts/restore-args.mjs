/* Reading the command line of backup-restore.mjs, as a function that can be
 * asked questions without a Firestore behind it.
 *
 * It lived inline and it was wrong (KI-017). The line was:
 *
 *     const asIdx = args.indexOf('--as');
 *     const [file, salonId] = args.filter((a, i) => !a.startsWith('--') && i !== asIdx + 1);
 *
 * The filter meant to skip the value that follows `--as`. With no `--as`,
 * `indexOf` returns -1, `asIdx + 1` is 0, and the condition quietly became
 * "drop argument 0" — the backup file. So `restore <ficheiro> <salão>` threw
 * the file away, found no salonId, printed the usage and exited 1. The
 * rehearsal path worked, because there `asIdx + 1` really did point at the new
 * id. The path that actually brings a salon back never ran once.
 *
 * Unknown flags are rejected rather than ignored, and that is a safety
 * decision, not tidiness. `--as` mistyped as `--As` would leave target null,
 * dest would fall back to the original salon id, and `--yes` would then write
 * a rehearsal straight over the live salon. A typo must stop the script, not
 * change which salon it overwrites.
 */

export const USAGE = 'usage: node scripts/backup-restore.mjs <backup.json> <salonId> [--as <novoId>] [--yes]';

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const fail = (error) => ({ ok: false, error });

/**
 * @param {string[]} argv arguments after the script name (process.argv.slice(2))
 * @returns {{ok: true, file: string, salonId: string, target: string|null, apply: boolean}
 *          | {ok: false, error: string}} `error` is the exact text to print
 */
export function parseRestoreArgs(argv) {
  const args = [...argv];
  const positional = [];
  let target = null, apply = false, sawAs = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--yes') { apply = true; continue; }
    if (a === '--as') {
      if (sawAs) return fail(`✗ --as repetido\n${USAGE}`);
      sawAs = true;
      const value = args[i + 1];
      // A missing value, or the next flag, means the id was forgotten. Taking
      // `--yes` as the new id would restore into a salon called "--yes".
      if (value === undefined || value.startsWith('--')) return fail(`✗ --as precisa de um id novo\n${USAGE}`);
      target = value;
      i++;                                   // the value belongs to --as, not to us
      continue;
    }
    if (a.startsWith('--')) return fail(`✗ flag desconhecida: ${a}\n${USAGE}`);
    positional.push(a);
  }

  const [file, salonId, ...extra] = positional;
  if (!file || !salonId) return fail(USAGE);
  if (extra.length) return fail(`✗ argumentos a mais: ${extra.join(' ')}\n${USAGE}`);
  if (target !== null && !SLUG.test(target)) {
    return fail('✗ --as tem de ser um slug válido (minúsculas, números e hífenes)');
  }

  return { ok: true, file, salonId, target, apply };
}
