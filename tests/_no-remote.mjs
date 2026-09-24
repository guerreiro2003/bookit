/* In emulator mode, nothing may leave this machine.
 *
 * Patching `fetch` is not enough. The Firestore JS SDK in Node does not use
 * fetch for its data path — it speaks gRPC over HTTP/2, which goes through
 * `http2.connect` onto a TLS or TCP socket and never touches the fetch API. A
 * guard that only wraps fetch would watch the front door while the SDK walks
 * out the back.
 *
 * So the check sits at the connection layer — net, tls and http2 — where every
 * one of those paths has to pass, whatever library is on top.
 *
 * This is not about saving bandwidth. A suite pointed half at the emulator and
 * half at production is the exact accident this whole exercise exists to
 * prevent: it would write test bookings into a live salon while printing
 * green. Better to abort loudly on the first packet than to find out later.
 */
import net from 'node:net';
import tls from 'node:tls';
import http2 from 'node:http2';

/** Names and addresses that mean "this machine". */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', '::']);

let blocked = 0;
let allowed = 0;

function hostOf(value) {
  if (value === undefined || value === null || value === '') return null;   // defaults to localhost
  let h = String(value).trim().toLowerCase();
  if (h.includes('://')) { try { h = new URL(h).hostname; } catch { /* use as-is */ } }
  return h.replace(/^\[|\]$/g, '');
}

function assertLocal(where, value) {
  const host = hostOf(value);
  if (host === null) { allowed++; return; }                 // no host = loopback
  if (LOOPBACK.has(host) || host.startsWith('127.')) { allowed++; return; }
  blocked++;
  console.error(`\n✗ LIGAÇÃO REMOTA BLOQUEADA · ${where} → ${host}`);
  console.error('  Esta corrida está em modo emulador e nada pode sair desta máquina.');
  console.error('  Ou um endpoint ficou por ligar ao emulador, ou uma suite está a falar');
  console.error('  com o projeto real. Em qualquer dos casos o resultado não valia nada.');
  // Who tried. Without this the message says a connection happened and leaves
  // you guessing which of several SDKs wanted it.
  const stack = (new Error().stack || '').split('\n').slice(2, 9)
    .map(l => l.trim()).filter(l => l.startsWith('at '));
  if (stack.length) { console.error('\n  quem tentou:'); for (const l of stack) console.error(`    ${l}`); }
  console.error('');
  process.exit(97);
}

/** Pull the host out of the several shapes these functions accept. */
function checkArgs(where, args) {
  const o = args[0];
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    if (!o.path) assertLocal(where, o.host ?? o.hostname);  // a unix socket has no host
  } else if (typeof o === 'number' || (typeof o === 'string' && /^\d+$/.test(o))) {
    assertLocal(where, typeof args[1] === 'string' ? args[1] : null);
  }
}

/* net: the floor everything else stands on.
   BOTH the prototype method and the module-level functions, which is not
   belt-and-braces: undici — the fetch implementation inside Node — calls
   `net.connect(options)`, the module function, and for plain http it never
   touches Socket.prototype.connect in a way this could see. Patching only the
   prototype let every emulator fetch through uncounted, which is how the first
   version of this guard reported "0 ligações locais" during a suite that was
   plainly talking to the emulator. */
const rawProtoConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  checkArgs('net.Socket.connect', args);
  return rawProtoConnect.apply(this, args);
};
for (const name of ['connect', 'createConnection']) {
  const raw = net[name];
  net[name] = function (...args) {
    checkArgs(`net.${name}`, args);
    return raw.apply(this, args);
  };
}

/* tls: checked on its own because a TLSSocket can be handed an already-open
   socket, and then net's check has already happened (or never will). */
const rawTls = tls.connect;
tls.connect = function (...args) {
  const o = args[0];
  if (o && typeof o === 'object') assertLocal('tls.connect', o.host || o.servername);
  else if (typeof o === 'number') assertLocal('tls.connect', typeof args[1] === 'string' ? args[1] : null);
  return rawTls.apply(this, args);
};

/* http2: what gRPC actually calls. `authority` is a URL. */
const rawHttp2 = http2.connect;
http2.connect = function (authority, ...rest) {
  assertLocal('http2.connect', authority);
  return rawHttp2.call(this, authority, ...rest);
};

/** How many connections were inspected, for the report at the end. */
export const netGuardStats = () => ({ blocked, allowed });

process.on('exit', () => {
  if (process.env.BOOKIT_NET_GUARD_QUIET) return;
  console.log(`  guarda de rede: ${allowed} ligação(ões) local(is), ${blocked} bloqueada(s)`);
});
