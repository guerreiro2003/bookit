/* Encrypt and decrypt a backup file with a passphrase.
 *
 *   node scripts/crypt.mjs enc <ficheiro>            → <ficheiro>.enc
 *   node scripts/crypt.mjs dec <ficheiro.enc>        → <ficheiro>
 *
 * A passphrase comes from BACKUP_PASSPHRASE, never from the command line,
 * where it would end up in shell history and in `ps`.
 *
 * AES-256-GCM with a scrypt-derived key. GCM is authenticated, so a file that
 * has been tampered with fails to open instead of decrypting into plausible
 * rubbish — which matters for something you will only ever read on the worst
 * day. `node:crypto` does the work, so this behaves identically on a Mac and
 * on a CI runner; shelling out to openssl does not (LibreSSL has no -iter).
 *
 * File layout:  magic(8) · salt(16) · iv(12) · tag(16) · ciphertext
 */
import fs from 'node:fs';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';

const MAGIC = Buffer.from('BKITENC1');
const [mode, file] = process.argv.slice(2);
const pass = process.env.BACKUP_PASSPHRASE;

if (!mode || !file || !['enc', 'dec'].includes(mode)) {
  console.error('usage: BACKUP_PASSPHRASE=… node scripts/crypt.mjs <enc|dec> <ficheiro>');
  process.exit(1);
}
if (!pass || pass.length < 12) {
  console.error('✗ BACKUP_PASSPHRASE em falta ou demasiado curta (mínimo 12 caracteres).');
  process.exit(1);
}
if (!fs.existsSync(file)) { console.error('✗ ficheiro não encontrado:', file); process.exit(1); }

// N=2^15 needs ~32 MB (128·N·r); give the allocator headroom or it refuses.
const key = (salt) => scryptSync(pass, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

if (mode === 'enc') {
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(salt), iv);
  const body = Buffer.concat([c.update(fs.readFileSync(file)), c.final()]);
  const out = `${file}.enc`;
  fs.writeFileSync(out, Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]));
  console.log(`✓ ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
} else {
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(MAGIC)) { console.error('✗ não parece um backup cifrado por esta ferramenta.'); process.exit(1); }
  const d = createDecipheriv('aes-256-gcm', key(buf.subarray(8, 24)), buf.subarray(24, 36));
  d.setAuthTag(buf.subarray(36, 52));
  let plain;
  try { plain = Buffer.concat([d.update(buf.subarray(52)), d.final()]); }
  catch { console.error('✗ frase errada, ou o ficheiro foi alterado.'); process.exit(1); }
  const out = file.replace(/\.enc$/, '');
  fs.writeFileSync(out, plain);
  console.log(`✓ ${out} (${Math.round(plain.length / 1024)} KB)`);
}
