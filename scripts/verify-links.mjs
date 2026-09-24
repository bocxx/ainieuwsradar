#!/usr/bin/env node
// verify-links.mjs — pre-deploy gate die niet-canonieke netwerk-links vangt.
//
// Blokkeert bij: naakt-domein waar www hoort, oude HLN-prefixes (/ai-nieuws,
// /digest, …), trailing slash op artikel-URLs waar 'ie hoort te ontbreken.
//
// Scans src/content/, src/components/, src/layouts/ — de plekken waar
// menselijk/gegenereerd content leest wat Google leest. Configs, docs en
// generator-output vallen erbuiten (per site eigen conventies of via een
// aparte generator gecontroleerd).
//
// Zusje van normalize-self-links.mjs en normalize-cross-links.mjs — bij een
// wijziging aan de HLN-redirect-tabel alle drie plus
// newsflux/src/build_news_tool_index.py bijwerken.
//
// Exit 0 = alle links canoniek. Exit 1 = één of meer fouten (print details).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// ── Netwerk-site conventies ─────────────────────────────────────────────────
const AIPLATFORM = 'https://www.aiplatformmkb.nl';
const HLN = 'https://www.hetlaatsteainieuws.nl';

// HLN's migration-redirects — 1:1 uit src/lib/migration-redirects.ts.
const hlnCategoryPrefixRedirects = {
  '/ai-nieuws': '/nieuws', '/ai-tutorials': `${AIPLATFORM}/gidsen`,
  '/ai-tools': `${AIPLATFORM}/tools`, '/tutorials': `${AIPLATFORM}/gidsen`,
  '/tools': `${AIPLATFORM}/tools`, '/ai-innovatie': '/achtergrond',
  '/ai-deep-dives': '/achtergrond', '/ai-ethiek': '/regelgeving',
  '/ai-beleid': '/regelgeving', '/digest': '/radar',
  '/trends': '/tag/trends', '/strategie': '/tag/strategie', '/start': '/tag/nieuw-met-ai',
};
const hlnExactRedirects = {
  '/nieuws/openai-beursgang-niet-2026-veiligheid': '/nieuws/wanneer-gaat-openai-naar-de-beurs',
  '/redactie': '/over', '/auteurs': '/over',
  '/ai-routekaart': `${AIPLATFORM}/gidsen`, '/ai-woordenboek': '/begrippen',
  '/ai-toepassingen': `${AIPLATFORM}/tools`, '/ai-tools-technieken': `${AIPLATFORM}/tools`,
  '/ai-beleid-strategie': '/regelgeving',
  '/nieuws/claude-skills-uitgelegd-plugins-marketplace': `${AIPLATFORM}/tools/claude-skills-uitgelegd-plugins-marketplace`,
  '/nieuws/n8n-claude-workflow-automatisering-casestudy': `${AIPLATFORM}/gidsen/n8n-claude-workflow-automatisering-casestudy`,
  '/ai-tools/wat-is-een-npu-en-waarom-in-elke-ai-laptop': '/nieuws/wat-is-een-npu-en-waarom-in-elke-ai-laptop',
  '/ai-tutorials/ai-hallucinations-herkennen': '/regelgeving/ai-hallucinaties-wetenschappelijke-literatuur',
  '/tutorials/goede-prompts-schrijven-voor-ai': '/achtergrond/goede-prompts-schrijven-voor-ai',
  '/ai-tutorials/goede-prompts-schrijven-voor-ai': '/achtergrond/goede-prompts-schrijven-voor-ai',
  '/nieuwsbrief/aanmelden': '/nieuwsbrief', '/nieuwsbrief/bedankt': '/nieuwsbrief',
  '/nieuws/claude-geld-verdienen-realistisch': '/nieuws/geld-verdienen-claude-ai-realistisch',
  '/nieuws/gpt-nl-nederlands-taalmodel-uitrol': '/nieuws/gpt-nl-klaar-voor-gebruik-eerste-klanten',
  '/achtergrond/ai-terugblik-juni-2026': '/achtergrond/maandterugblik-juni-2026',
};

function resolveHlnRedirect(pathname) {
  const clean = (pathname.replace(/\/+$/, '') || '/').toLowerCase();
  if (hlnExactRedirects[clean]) return hlnExactRedirects[clean];
  for (const [prefix, target] of Object.entries(hlnCategoryPrefixRedirects)) {
    if (clean === prefix) return target;
    if (clean.startsWith(prefix + '/')) return target + clean.slice(prefix.length);
  }
  return null;
}

// Per netwerk-site: welk host-patroon is canoniek, en welke redirects gelden.
const SITES = [
  { name: 'hetlaatsteainieuws', hostRe: /^(www\.)?hetlaatsteainieuws\.nl$/, wantHost: 'www.hetlaatsteainieuws.nl', stripArticleSlash: true, resolveRedirect: resolveHlnRedirect },
  { name: 'aiplatformmkb', hostRe: /^(www\.)?aiplatformmkb\.nl$/, wantHost: 'www.aiplatformmkb.nl', stripArticleSlash: true, resolveRedirect: () => null },
  { name: 'debesteaitools', hostRe: /^(www\.)?debesteaitools\.nl$/, wantHost: 'debesteaitools.nl', stripArticleSlash: true, resolveRedirect: () => null },
  { name: 'ainieuwsradar', hostRe: /^(www\.)?ainieuwsradar\.nl$/, wantHost: 'ainieuwsradar.nl', stripArticleSlash: false, resolveRedirect: () => null },
  { name: 'feedzz', hostRe: /^(www\.)?feedzz\.online$/, wantHost: 'feedzz.online', stripArticleSlash: false, resolveRedirect: () => null },
  { name: 'whotofollow', hostRe: /^(www\.)?whotofollow\.online$/, wantHost: 'whotofollow.online', stripArticleSlash: false, resolveRedirect: () => null },
];

// Return null als de link canoniek is, anders een string met de reden.
function checkUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  const site = SITES.find((s) => s.hostRe.test(u.hostname));
  if (!site) return null;  // Niet-netwerk URL — buiten scope.

  // Fout 1: verkeerde host (naakt vs www).
  if (u.hostname !== site.wantHost) return `host moet ${site.wantHost} zijn`;

  // Fout 2: oude prefix / redirect-target.
  const redirect = site.resolveRedirect(u.pathname);
  if (redirect) return `pad ${u.pathname} redirect naar ${redirect} — gebruik de eindvorm`;

  // Fout 3: trailing slash op artikel-URL (twee of meer segmenten).
  if (site.stripArticleSlash && u.pathname !== '/' && u.pathname.endsWith('/')) {
    const segments = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    if (segments.length >= 2) return `trailing slash op artikel-URL — moet zonder`;
  }
  return null;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.astro', '.wrangler', '.next', '__pycache__', '.claude',
]);
const TEXT_EXT = /\.(md|mdx|astro|ts|tsx|js|mjs|cjs|json|yml|yaml|html)$/i;

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walk(full);
    else if (st.isFile() && TEXT_EXT.test(name)) yield full;
  }
}

// Scope: alleen de mappen die *publieke* URL's produceren. Configs, scripts,
// docs, gegenereerde JSON en social-caption-bestanden (excluded uit content-
// collection) vallen erbuiten. Zo blokkeer je nooit op iets dat Google niet ziet.
const SCAN_ROOTS = [
  join(ROOT, 'src', 'content'),
  join(ROOT, 'src', 'components'),
  join(ROOT, 'src', 'layouts'),
  join(ROOT, 'src', 'pages'),
];
const SKIP_FILES = new Set([
  // Sluit social-captions uit: die zijn tekst voor Buffer, niet HTML voor Google.
]);
const SKIP_FILE_PATTERNS = [/\.social\.md$/];

const URL_RE = /https?:\/\/[^\s"'<>)\]}`]*(?:hetlaatsteainieuws\.nl|aiplatformmkb\.nl|debesteaitools\.nl|ainieuwsradar\.nl|feedzz\.online|whotofollow\.online)[^\s"'<>)\]}`]*/g;

const errors = [];
let filesScanned = 0;
let urlsSeen = 0;

for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(scanRoot)) {
    const rel = relative(ROOT, file);
    if (SKIP_FILES.has(rel)) continue;
    if (SKIP_FILE_PATTERNS.some((p) => p.test(rel))) continue;
    filesScanned++;

    const text = readFileSync(file, 'utf8');
    const matches = text.match(URL_RE);
    if (!matches) continue;

    for (let url of matches) {
      // Strip trailing punctuation (markdown "…).")
      while (/[.,;:!?)]$/.test(url)) url = url.slice(0, -1);
      urlsSeen++;
      const err = checkUrl(url);
      if (err) errors.push({ file: rel, url, err });
    }
  }
}

if (errors.length === 0) {
  console.log(`✓ verify-links: ${urlsSeen} netwerk-links in ${filesScanned} bestanden zijn canoniek`);
  process.exit(0);
}

console.error(`✗ verify-links: ${errors.length} niet-canonieke link(s) in ${filesScanned} bestanden\n`);
// Groepeer per bestand.
const byFile = new Map();
for (const e of errors) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}
for (const [file, es] of byFile) {
  console.error(`  ${file}`);
  for (const { url, err } of es) {
    console.error(`    ✗ ${url}`);
    console.error(`       ${err}`);
  }
}
console.error(`\nFix met: node scripts/normalize-self-links.mjs --apply  (HLN)`);
console.error(`      of: node scripts/normalize-cross-links.mjs --apply  (aiplatformmkb / DBAT)`);
process.exit(1);
