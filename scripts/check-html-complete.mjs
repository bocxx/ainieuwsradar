#!/usr/bin/env node
/**
 * Gate: elke gebouwde HTML-pagina moet een compleet document zijn.
 *
 * Waarom dit bestaat — hetlaatsteainieuws.nl, augustus 2026: een niet-
 * gedeclareerde variabele in podcasts/[slug].astro gooide een ReferenceError
 * *tijdens het streamen*, ná ~115 KB HTML. Astro schreef het halve document
 * weg en de build eindigde met exit 0. Alle 65 podcast-pagina's stonden
 * maandenlang live op 200 zonder gerelateerd-sectie, zonder voettekst en
 * zonder </html>. Niets ving dat: CI keek naar de exit-code, publicatie-check
 * naar statuscodes en canonical. "De build slaagde" was geen bewijs dat de
 * pagina's compleet waren.
 *
 * Astro >=7.2 maakt van dit specifieke geval een harde build-fout, maar
 * truncatie kan ook anders ontstaan (een plugin die halverwege gooit, een
 * SSR-route, een toekomstige regressie). Deze check is goedkoop en dekt de
 * klasse, niet één oorzaak.
 *
 * Redirect-stubs zijn een legitieme uitzondering: meta-refresh-pagina's zijn
 * bewust minimaal en hebben geen </html>. Die worden overgeslagen.
 *
 * Gebruik: node scripts/check-html-complete.mjs [--dir <pad>] [--quiet]
 * Exit 1 zodra er één afgebroken pagina is.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const dirArg = args.indexOf('--dir');

/** Astro schrijft naar dist/client bij een adapter, anders naar dist/. */
function resolveRoot() {
  if (dirArg !== -1 && args[dirArg + 1]) return args[dirArg + 1];
  for (const c of ['dist/client', 'dist']) if (existsSync(c)) return c;
  return null;
}

const root = resolveRoot();
if (!root) {
  console.error('[html-check] Geen dist/ gevonden — draai eerst de build.');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = walk(root);
if (files.length === 0) {
  console.error(`[html-check] Geen HTML gevonden in ${root}/ — klopt het buildpad?`);
  process.exit(1);
}

const broken = [];
let stubs = 0;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  // Bewuste redirect-stub: meta-refresh, geen volledig document. Overslaan.
  if (/http-equiv=["']?refresh/i.test(html)) { stubs++; continue; }
  if (!/<\/html\s*>/i.test(html)) {
    broken.push({ path: file.slice(root.length + 1), bytes: statSync(file).size });
  }
}

const checked = files.length - stubs;

if (broken.length > 0) {
  console.error(
    `\n[html-check] ❌ ${broken.length} van ${checked} pagina's is afgebroken ` +
    `(geen sluitende </html>):\n`
  );
  for (const b of broken.slice(0, 25)) {
    console.error(`   ${b.path}  (${b.bytes.toLocaleString('nl-NL')} bytes)`);
  }
  if (broken.length > 25) console.error(`   … en nog ${broken.length - 25}`);
  console.error(
    '\n   Dit betekent dat het renderen halverwege is gestopt. De build kan\n' +
    '   alsnog exit 0 geven — deploy deze output NIET. Zoek de fout op met:\n' +
    '     npx astro build 2>&1 | grep -i error\n'
  );
  process.exit(1);
}

if (!quiet) {
  console.log(
    `[html-check] ✓ ${checked} pagina's compleet` +
    (stubs ? ` (${stubs} redirect-stub${stubs === 1 ? '' : 's'} overgeslagen)` : '')
  );
}
