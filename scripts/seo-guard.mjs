#!/usr/bin/env node
/**
 * SEO-poort na elke build (draait als postbuild, dus ook in CI vóór deploy).
 *
 * Aanleiding (18 sep 2026): debesteaitools.nl verloor in juni vrijwel al zijn
 * Google-zichtbaarheid. Onder de oorzaken zaten fouten die geen enkele check
 * ving: 298 noindex-pagina's in de sitemap, redirect-pagina's in de sitemap,
 * 26 kapotte interne links, en _redirects-regels die live niet werkten.
 * Deze poort maakt van zulke fouten een mislukte build.
 *
 * FOUT (build faalt):
 *   - sitemap-URL zonder gebouwde pagina (en geen on-demand route)
 *   - sitemap-URL met `noindex` of een meta-refresh ("Redirecting…"-stub)
 *   - sitemap-URL waarvan de canonical niet exact die URL is
 *   - interne link naar een pagina die niet bestaat (404)
 *   - JSON-LD-blok dat geen geldige JSON is (Google negeert het dan stil)
 *   - URL die nu in de live sitemap staat maar na deze build verdwenen is,
 *     zonder pagina, redirect of vermelding in `gone` (sinds 9 okt 2026;
 *     precies het soort verlies dat DBAT in juni zijn zichtbaarheid kostte)
 * WAARSCHUWING (build gaat door):
 *   - interne link naar een URL uit public/_redirects (onnodige redirect-hop)
 *   - verdwenen live-URL op een on-demand route (ssrRoutes/ssrPrefixes): de
 *     guard kan niet zien of die nog 200 geeft, dus geen harde fout
 *   - live sitemap niet op te halen (vergelijking overgeslagen)
 *
 * Gebruik: node scripts/seo-guard.mjs [--dist dist/client] [--offline]
 * (--offline of SEO_GUARD_OFFLINE=1 slaat de vergelijking met live over)
 *
 * Per site in te stellen via seo-guard.config.json in de projectroot (optioneel):
 *   { "ssrRoutes": ["/nieuws"], "ssrPrefixes": ["/api/"],
 *     "gone": ["/oud-artikel", "/oude-sectie/"], "liveSitemap": "https://…" }
 * ssrRoutes/ssrPrefixes = routes met `prerender = false`, die alleen on-demand
 * bestaan en dus geen bestand in dist hebben. gone = bewust verwijderde paden
 * (eindigt op `/` = alles daaronder) die geen redirect krijgen. liveSitemap =
 * standaard <domein>/sitemap-index.xml; `false` zolang de site niet live is.
 * Het domein wordt uit de sitemap afgeleid.
 *
 * Bron van waarheid: astro-starter/scripts/seo-guard.mjs. Sites kopiëren hem
 * ongewijzigd; site-specifieke instellingen alleen in seo-guard.config.json.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const argDist = process.argv.indexOf('--dist');
// Met Cloudflare-adapter staat de statische output in dist/client, zonder in dist.
const DIST = argDist > -1 ? process.argv[argDist + 1]
  : existsSync('dist/client/sitemap-0.xml') || !existsSync('dist/sitemap-0.xml') ? 'dist/client' : 'dist';
let guardConfig = {};
try {
  guardConfig = JSON.parse(readFileSync('seo-guard.config.json', 'utf-8'));
} catch { /* geen config: alleen standaardwaarden */ }
// Routes met `prerender = false`: bestaan alleen on-demand, niet als bestand.
const SSR_ROUTES = new Set(guardConfig.ssrRoutes ?? []);
const SSR_PREFIXES = guardConfig.ssrPrefixes ?? ['/api/'];
const GONE = guardConfig.gone ?? [];
const OFFLINE = process.argv.includes('--offline') || process.env.SEO_GUARD_OFFLINE === '1';

if (!existsSync(join(DIST, 'sitemap-0.xml'))) {
  console.error(`seo-guard: ${DIST}/sitemap-0.xml ontbreekt — draai eerst astro build.`);
  process.exit(1);
}

const norm = (p) => {
  let x = p.split('#')[0].split('?')[0];
  try { x = decodeURI(x); } catch { /* laat staan */ }
  return x !== '/' ? x.replace(/\/+$/, '') || '/' : x;
};

function pageFile(pathname) {
  // Ook de homepage kan on-demand zijn (output: 'server'), dus altijd checken.
  if (pathname === '/') return existsSync(join(DIST, 'index.html')) ? join(DIST, 'index.html') : null;
  for (const c of [join(DIST, pathname, 'index.html'), join(DIST, `${pathname}.html`)]) {
    if (existsSync(c)) return c;
  }
  return null;
}
const isAsset = (pathname) => {
  const f = join(DIST, pathname);
  return existsSync(f) && statSync(f).isFile();
};
const isSsr = (p) => SSR_ROUTES.has(p) || SSR_PREFIXES.some((x) => p.startsWith(x));

// _redirects-bronnen (exact + splat)
const redirectExact = new Set();
const redirectSplats = [];
try {
  for (const line of readFileSync(join(DIST, '_redirects'), 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [from] = t.split(/\s+/);
    if (from.endsWith('/*')) redirectSplats.push(from.slice(0, -1));
    else redirectExact.add(norm(from));
  }
} catch { /* geen _redirects */ }
const isRedirect = (p) => redirectExact.has(p) || redirectSplats.some((s) => (p + '/').startsWith(s));

const errors = [];
const warnings = [];

// ── 1. Sitemap ────────────────────────────────────────────────────────────
const sitemapXml = readdirSync(DIST)
  .filter((f) => /^sitemap-\d+\.xml$/.test(f))
  .map((f) => readFileSync(join(DIST, f), 'utf-8'))
  .join('\n');
const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const SITE = locs.length ? new URL(locs[0]).origin : '';
for (const loc of locs) {
  const p = norm(loc.replace(SITE, '') || '/');
  if (isRedirect(p)) { errors.push(`sitemap bevat redirect-URL: ${p}`); continue; }
  const file = pageFile(p);
  if (!file) {
    if (!isSsr(p)) errors.push(`sitemap-URL zonder pagina: ${p}`);
    continue;
  }
  const html = readFileSync(file, 'utf-8');
  const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '';
  if (/noindex/i.test(robots)) errors.push(`sitemap bevat noindex-pagina: ${p}`);
  if (/<meta http-equiv="refresh"/i.test(html)) errors.push(`sitemap bevat redirect-stub: ${p}`);
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const expected = p === '/' ? `${SITE}/` : `${SITE}${p}`;
  if (!canonical) errors.push(`geen canonical: ${p}`);
  else if (canonical !== expected && canonical !== loc) {
    errors.push(`canonical wijkt af: ${p} → ${canonical}`);
  }
}

// ── 2. Interne links op alle gebouwde pagina's ────────────────────────────
function* htmlFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'assets' && e.name !== 'pagefind') yield* htmlFiles(f); }
    else if (e.name.endsWith('.html')) yield f;
  }
}
const broken = new Map();
const viaRedirect = new Map();
const badJsonLd = [];
let pages = 0;
for (const file of htmlFiles(DIST)) {
  const rel = '/' + relative(DIST, file).replace(/index\.html$/, '').replace(/\.html$/, '');
  if (rel === '/404') continue;
  pages++;
  const html = readFileSync(file, 'utf-8');
  const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '';
  if (/http-equiv="refresh"/i.test(html)) continue; // redirect-stubs overslaan
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(m[1]); } catch (e) { badJsonLd.push(`${norm(rel)} (${e.message.slice(0, 80)})`); }
  }
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
    const raw = m[1];
    if (raw.startsWith('//')) continue;
    const p = norm(raw);
    // /pagefind/ = zoekindex, soms pas ná astro build gegenereerd (npm run deploy)
    if (!p || p.startsWith('/_') || p.startsWith('/cdn-cgi/') || p.startsWith('/pagefind/')) continue;
    if (isRedirect(p)) { (viaRedirect.get(p) ?? viaRedirect.set(p, new Set()).get(p)).add(norm(rel)); continue; }
    if (pageFile(p) || isAsset(p) || isSsr(p)) continue;
    (broken.get(p) ?? broken.set(p, new Set()).get(p)).add(norm(rel) + (robots.includes('noindex') ? ' (noindex)' : ''));
  }
}
for (const [target, from] of broken) {
  errors.push(`kapotte interne link: ${target} ← ${[...from].slice(0, 3).join(', ')}${from.size > 3 ? ` (+${from.size - 3})` : ''}`);
}
for (const [target, from] of viaRedirect) {
  warnings.push(`link via redirect: ${target} ← ${[...from].slice(0, 2).join(', ')}${from.size > 2 ? ` (+${from.size - 2})` : ''}`);
}
for (const b of badJsonLd) errors.push(`ongeldige JSON-LD: ${b}`);

// ── 3. Verdwenen pagina's: live sitemap tegen deze build ──────────────────
// Elke URL die Google nu via de sitemap kent en na deze build niet meer
// bestaat, wordt een 404. Dat mag alleen bewust: met een redirect of in `gone`.
async function fetchLocs(url, depth = 0) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${url} gaf ${res.status}`);
  const xml = await res.text();
  const found = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  if (!/<sitemapindex/i.test(xml)) return found;
  if (depth > 1) return [];
  return (await Promise.all(found.map((u) => fetchLocs(u, depth + 1)))).flat();
}
const isGone = (p) => GONE.some((g) => (g.endsWith('/') ? (p + '/').startsWith(g) : norm(g) === p));
let liveCount = 0;
if (!OFFLINE && SITE && guardConfig.liveSitemap !== false) {
  const liveUrl = guardConfig.liveSitemap ?? `${SITE}/sitemap-index.xml`;
  try {
    const live = await fetchLocs(liveUrl);
    liveCount = live.length;
    const built = new Set(locs.map((l) => norm(l.replace(SITE, '') || '/')));
    const vanished = [];
    const vanishedSsr = [];
    for (const loc of live) {
      let p;
      try { p = norm(new URL(loc).pathname); } catch { continue; }
      if (built.has(p) || pageFile(p) || isRedirect(p) || isGone(p)) continue;
      (isSsr(p) ? vanishedSsr : vanished).push(p);
    }
    for (const p of vanished) {
      errors.push(`live-URL verdwenen zonder redirect: ${p} — voeg een redirect toe of zet hem in "gone" (loopt je checkout achter? git pull)`);
    }
    if (vanishedSsr.length) {
      warnings.push(`${vanishedSsr.length} live-URL('s) op on-demand routes niet meer in de sitemap: ${vanishedSsr.slice(0, 5).join(', ')}${vanishedSsr.length > 5 ? ' …' : ''}`);
    }
  } catch (e) {
    warnings.push(`live sitemap niet op te halen, vergelijking overgeslagen (${e.message})`);
  }
}

console.log(`seo-guard: ${locs.length} sitemap-URL's, ${pages} pagina's gecontroleerd${liveCount ? `, ${liveCount} live-URL's vergeleken` : ''}.`);
for (const w of warnings.slice(0, 20)) console.warn(`  ⚠ ${w}`);
if (warnings.length > 20) console.warn(`  ⚠ … en nog ${warnings.length - 20} waarschuwingen`);
if (errors.length) {
  for (const e of errors.slice(0, 50)) console.error(`  ✗ ${e}`);
  if (errors.length > 50) console.error(`  ✗ … en nog ${errors.length - 50} fouten`);
  console.error(`seo-guard: ${errors.length} fout(en) — build afgekeurd.`);
  process.exit(1);
}
console.log('seo-guard: ✓ geen fouten.');
