/* What the suites point at, in one place.
 *
 * Every suite used to carry its own `E.SALON_ID || 'demo'` ladder, and they
 * drifted: `rules.integration.mjs` defaulted OTHER_SALON_ID to `zenorganic`,
 * which does not exist — the salon is `zen-organic` — so the cross-tenant
 * assertions were refused for the wrong reason and passed without testing
 * anything (KI-016). One list, and a seed that guarantees the data behind it.
 *
 * The defaults are the EMULATOR's, because that is where the suites go unless
 * told otherwise (tests/_register.mjs sets BOOKIT_TARGET=emulator when nothing
 * else did). Accounts and ids are the ones scripts/seed-emulator.mjs creates.
 * Against the real project the environment has to supply them: production has
 * no `corte` service id, and a suite that guessed would be testing fiction.
 */
import { TARGET, IS_EMULATOR, targetSummary } from '../scripts/_lib.mjs';

const E = process.env;

export { TARGET, IS_EMULATOR, targetSummary };

/** The tenant every suite works in. */
export const SALON = E.SALON_ID || 'demo';

/** The neighbour that must stay unreadable. Seeded WITH clients and bookings:
 *  an empty salon makes every isolation assertion vacuous. */
export const OTHER_SALON = E.OTHER_SALON_ID || 'zen-organic';

/** A service that exists in SALON. The emulator seeds readable ids; production
 *  has Firestore auto-ids, so there it must be given. */
export const SERVICE_ID = E.SERVICE_ID || (IS_EMULATOR ? 'corte' : '');

export const ADMIN = { email: E.ADMIN_EMAIL || 'admin@bookit.demo', pw: E.ADMIN_PASSWORD || 'Demo2026!' };
export const CLIENT = { email: E.CLIENT_EMAIL || 'cliente@bookit.demo', pw: E.CLIENT_PASSWORD || 'Cliente2026!' };
export const TEAM_PW = E.TEAM_PASSWORD || 'equipa2026';

/** Admin of OTHER_SALON — a different person, with a different uid. */
export const OTHER_ADMIN = { email: E.OTHER_ADMIN_EMAIL || 'admin@zen.demo', pw: E.OTHER_ADMIN_PASSWORD || 'Zen2026!' };

if (!SERVICE_ID) {
  console.error('\n✗ SERVICE_ID não tem omissão fora do emulador — passa SERVICE_ID=<id de um serviço real>.\n');
  process.exit(1);
}
