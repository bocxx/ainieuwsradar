#!/usr/bin/env node
// Normaliseer cross-site en self-links in aiplatformmkb-content naar canoniek:
// - naakt domein → www
// - HLN-links: extra via resolveRedirect naar de eind-URL (mirror van
//   hetlaatsteainieuws-v2/src/lib/migration-redirects.ts)
// - trailing slash strippen behalve op root
//
// Doet drie targets: hetlaatsteainieuws, aiplatformmkb (self), debesteaitools.
// ainieuwsradar/feedzz/whotofollow serveren mét slash — die niet stripen.
//
// Gebruik: node scripts/normalize-cross-links.mjs [--apply] [--verbose]

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const AIPLATFORM = 'https://www.aiplatformmkb.nl';
const HLN = 'https://www.hetlaatsteainieuws.nl';
const DBAT = 'https://debesteaitools.nl';  // DBAT gebruikt naakt-domein als canoniek (2 jul 2026)

// HLN's migration-redirects — 1:1 kopie. Bij wijziging dáár, hier ook.
const hlnCategoryPrefixRedirects = {
  '/ai-nieuws':     '/nieuws',
  '/ai-tutorials':  `${AIPLATFORM}/gidsen`,
  '/ai-tools':      `${AIPLATFORM}/tools`,
  '/tutorials':     `${AIPLATFORM}/gidsen`,
  '/tools':         `${AIPLATFORM}/tools`,
  '/ai-innovatie':  '/achtergrond',
  '/ai-deep-dives': '/achtergrond',
  '/ai-ethiek':     '/regelgeving',
  '/ai-beleid':     '/regelgeving',
  '/digest':        '/radar',
  '/trends':        '/tag/trends',
  '/strategie':     '/tag/strategie',
  '/start':         '/tag/nieuw-met-ai',
};
const hlnExactRedirects = {
  '/nieuws/openai-beursgang-niet-2026-veiligheid': '/nieuws/wanneer-gaat-openai-naar-de-beurs',
  '/redactie':                 '/over',
  '/auteurs':                  '/over',
  '/ai-routekaart':            `${AIPLATFORM}/gidsen`,
  '/ai-woordenboek':           '/begrippen',
  '/ai-toepassingen':          `${AIPLATFORM}/tools`,
  '/ai-tools-technieken':      `${AIPLATFORM}/tools`,
  '/ai-beleid-strategie':      '/regelgeving',
  '/nieuws/claude-skills-uitgelegd-plugins-marketplace': `${AIPLATFORM}/tools/claude-skills-uitgelegd-plugins-marketplace`,
  '/nieuws/n8n-claude-workflow-automatisering-casestudy': `${AIPLATFORM}/gidsen/n8n-claude-workflow-automatisering-casestudy`,
  '/ai-tools/wat-is-een-npu-en-waarom-in-elke-ai-laptop': '/nieuws/wat-is-een-npu-en-waarom-in-elke-ai-laptop',
  '/ai-tutorials/ai-hallucinations-herkennen':            '/regelgeving/ai-hallucinaties-wetenschappelijke-literatuur',
  '/tutorials/goede-prompts-schrijven-voor-ai':    '/achtergrond/goede-prompts-schrijven-voor-ai',
  '/ai-tutorials/goede-prompts-schrijven-voor-ai': '/achtergrond/goede-prompts-schrijven-voor-ai',
  '/nieuwsbrief/aanmelden':    '/nieuwsbrief',
  '/nieuwsbrief/bedankt':      '/nieuwsbrief',
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

// Target-configs: alleen apex + www. Subdomeinen (bv. videos.hln, cdn.dbat)
// zijn asset-hosts en mogen NIET naar www worden hersteld.
const TARGETS = [
  {
    name: 'hetlaatsteainieuws',
    hostRe: /^(www\.)?hetlaatsteainieuws\.nl$/,
    canonicalBase: HLN,
    stripSlash: true,
    resolveRedirect: resolveHlnRedirect,
  },
  {
    name: 'aiplatformmkb',
    hostRe: /^(www\.)?aiplatformmkb\.nl$/,
    canonicalBase: AIPLATFORM,
    stripSlash: true,
    resolveRedirect: () => null,
  },
  {
    name: 'debesteaitools',
    hostRe: /^(www\.)?debesteaitools\.nl$/,
    canonicalBase: DBAT,   // DBAT is bewust op naakt-domein (2 jul 2026 audit)
    stripSlash: true,
    resolveRedirect: () => null,
  },
];

function canonicalize(originalUrl) {
  let u;
  try { u = new URL(originalUrl); } catch { return null; }
  const target = TARGETS.find((t) => t.hostRe.test(u.hostname));
  if (!target) return null;

  const redirect = target.resolveRedirect(u.pathname);
  let base;
  let path;
  if (redirect && /^https?:\/\//.test(redirect)) {
    const t = new URL(redirect);
    base = `${t.protocol}//${t.hostname}`;
    path = t.pathname;
  } else if (redirect) {
    base = target.canonicalBase;
    path = redirect;
  } else {
    base = target.canonicalBase;
    path = u.pathname.toLowerCase();
  }
  if (target.stripSlash && path !== '/' && path.endsWith('/')) {
    path = path.replace(/\/+$/, '') || '/';
  }
  // Root-URL: behoud de originele slash-status. SITE_URL-constants en tekst-refs
  // schrijven vaak "https://x.nl" zonder trailing slash — die niet mét slash
  // hersteren. Kijk of de originele URL echt no-path was (host direct gevolgd
  // door end/query/hash) of no-path-mét-slash.
  if (path === '/') {
    const afterHost = originalUrl.replace(/^https?:\/\/[^/?#]+/, '');
    const rootHadSlash = afterHost.startsWith('/');
    if (!rootHadSlash) {
      return base + u.search + u.hash;  // bv. "https://www.example.com" (zonder /)
    }
  }
  return base + path + u.search + u.hash;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.astro', '.wrangler', '.next', '__pycache__', '.claude',
]);
const TEXT_EXT = /\.(md|mdx|astro|ts|tsx|js|mjs|cjs|json|yml|yaml|txt|html)$/i;
const GENERATED_FILES = new Set([
  'scripts/normalize-cross-links.mjs',
  'src/data/dbat_tools.json',  // gegenereerd door newsflux/src/select_writing_queue.py
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (st.isFile() && TEXT_EXT.test(name)) {
      if (GENERATED_FILES.has(relative(ROOT, full))) continue;
      yield full;
    }
  }
}

const URL_RE = /https?:\/\/[^\s"'<>)\]}`]*(?:hetlaatsteainieuws\.nl|aiplatformmkb\.nl|debesteaitools\.nl)[^\s"'<>)\]}`]*/g;

const stats = { filesScanned: 0, filesChanged: 0, urlsSeen: 0, urlsChanged: 0, byTarget: {}, changesByFile: [] };

for (const file of walk(ROOT)) {
  stats.filesScanned++;
  const rel = relative(ROOT, file);
  const original = readFileSync(file, 'utf8');
  if (!URL_RE.test(original)) continue;
  URL_RE.lastIndex = 0;

  const perFile = [];
  const updated = original.replace(URL_RE, (raw) => {
    let url = raw;
    let tail = '';
    while (/[.,;:!?)]$/.test(url)) { tail = url.slice(-1) + tail; url = url.slice(0, -1); }
    stats.urlsSeen++;

    const canon = canonicalize(url);
    if (!canon || canon === url) return raw;

    stats.urlsChanged++;
    const host = new URL(url).hostname.replace(/^www\./, '');
    stats.byTarget[host] = (stats.byTarget[host] ?? 0) + 1;
    perFile.push({ from: url, to: canon });
    return canon + tail;
  });

  if (updated !== original) {
    stats.filesChanged++;
    stats.changesByFile.push({ file: rel, count: perFile.length, samples: perFile });
    if (APPLY) writeFileSync(file, updated);
  }
}

const mode = APPLY ? 'APPLIED' : 'DRY-RUN';
console.log(`\n[${mode}] scanned ${stats.filesScanned}, changed ${stats.filesChanged}`);
console.log(`URLs seen: ${stats.urlsSeen}   URLs changed: ${stats.urlsChanged}\n`);
console.log('Per doel-domein:');
Object.entries(stats.byTarget).sort(([, a], [, b]) => b - a).forEach(([h, n]) => {
  console.log(`  ${String(n).padStart(4)}  ${h}`);
});

if (VERBOSE) {
  console.log('\nPer bestand (eerste 3):');
  for (const f of stats.changesByFile) {
    console.log(`\n  ${f.file}  (${f.count})`);
    for (const c of f.samples.slice(0, 3)) console.log(`    ${c.from}\n    → ${c.to}`);
  }
} else {
  console.log('\nTop-10 bestanden:');
  stats.changesByFile.sort((a, b) => b.count - a.count).slice(0, 10).forEach((f) => {
    console.log(`  ${String(f.count).padStart(4)}  ${f.file}`);
  });
  console.log('\n(--verbose voor diff, --apply om te schrijven.)');
}
