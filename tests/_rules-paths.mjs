/* Read firestore.rules and say which sub-collections a salon actually has.
 *
 * The point is to check TENANT_COLLECTIONS against something that is not
 * TENANT_COLLECTIONS. Anything that reads the list to build the expectation
 * would agree with itself forever — which is exactly how staffAuth and
 * waitlist went missing from the backups (KI-014). The rules are the closest
 * thing this project has to an independent statement of what a salon owns:
 * a collection with no rule is a collection nobody can read or write.
 *
 * Parsing is done properly rather than by indentation or by grepping for
 * `match /`, because both lie:
 *   - `match` blocks nest, and a nested one means salons/{id}/a/{x}/b;
 *   - the rules are full of braces inside strings (`'^\\d{4}-\\d{2}'`), which
 *     wreck a naive brace counter;
 *   - comments in this file contain the word match and example paths.
 * So: strip comments and string bodies first, then walk the braces.
 */

/**
 * Blank out comments and the insides of string literals, keeping length and
 * line structure intact so a brace count can be trusted afterwards.
 */
export function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i], next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && next === '*') {
      out += '  '; i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      out += ' '; i++;                                   // opening quote
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') { out += ' '; i++; }        // escape eats the next char too
        if (i < src.length) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      }
      out += ' '; i++;                                   // closing quote
      continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * Every match block, with the full path it resolves to once nesting is applied.
 * @returns {{path: string, line: number}[]} `path` has no leading slash
 */
export function matchPaths(src) {
  const clean = stripCommentsAndStrings(src);
  // A match path is a run of non-space characters, except that `{…}` groups are
  // part of it (`/salons/{salonId}`) and must not be read as a block opener.
  const TOKEN = /match\s+(\/(?:[^\s{}]|\{[^}]*\})+)\s*\{|[{}]/g;
  const open = [];          // {path, depth} of match blocks still open
  const found = [];
  let depth = 0, m;
  while ((m = TOKEN.exec(clean)) !== null) {
    if (m[1] !== undefined) {
      const segs = m[1].split('/').filter(Boolean);
      const parent = open.map(o => o.segs).flat();
      const full = [...parent, ...segs];
      found.push({ path: full.join('/'), line: clean.slice(0, m.index).split('\n').length });
      open.push({ segs, depth });
      depth++;
    } else if (m[0] === '{') {
      depth++;
    } else {
      depth--;
      while (open.length && open[open.length - 1].depth === depth) open.pop();
    }
  }
  return found;
}

const isWildcard = (seg) => seg.startsWith('{') && seg.endsWith('}');

/**
 * What the rules say a salon owns.
 *
 * @returns {{
 *   collections: string[],          // direct sub-collections of salons/{id}
 *   nested: {collection: string, path: string, line: number}[], // salons/{id}/a/{x}/b…
 *   recursiveWildcards: string[],   // sub-collections matched with {doc=**}
 * }}
 */
export function salonSubcollections(src) {
  const collections = new Set();
  const recursiveWildcards = new Set();
  const nested = [];

  for (const { path, line } of matchPaths(src)) {
    const segs = path.split('/');
    const at = segs.findIndex((s, i) => s === 'salons' && isWildcard(segs[i + 1] || ''));
    if (at === -1) continue;
    const rest = segs.slice(at + 2);
    if (!rest.length) continue;                      // the salon document itself
    const collection = rest[0];
    if (isWildcard(collection)) continue;            // salons/{id}/{anything=**}
    collections.add(collection);
    if (rest.length >= 2 && rest[1].endsWith('=**}')) recursiveWildcards.add(collection);
    // salons/{id}/clients/{clientId}/notes/… — a second level. The exporter
    // walks one level and would leave it behind without saying so.
    const deeper = rest.slice(2).filter(s => !isWildcard(s));
    for (const d of deeper) nested.push({ collection: d, path, line });
  }

  return {
    collections: [...collections],
    nested,
    recursiveWildcards: [...recursiveWildcards],
  };
}
