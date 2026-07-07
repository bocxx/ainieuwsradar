/**
 * trend-filter — vangnet tegen ruis in de NewsFlux-keyworddata.
 *
 * De trend-collectie komt 1-op-1 uit de newsflux-export en bevat soms
 * HTML/RSS-artefacten die als "AI-trend" een eigen indexeerbare pagina
 * zouden krijgen (bv. /trend/allowfullscreen/), plus enkelvoud/meervoud-
 * duplicaten (hallucination naast hallucinations). Dit module filtert
 * beide vóór de paginageneratie.
 *
 * LET OP: dit is een vangnet, geen oplossing. De structurele fix hoort
 * upstream in newsflux (keyword-export: artefacten eruit, singular/plural
 * normaliseren) — zolang die er niet is, houdt deze blocklist de site schoon.
 *
 * Plain ESM (geen Astro/TS-imports) zodat zowel de pagina's als
 * astro.config.mjs (redirects + sitemap-lastmod) dit kunnen importeren.
 */

/** HTML/RSS-artefacten uit de bron-scrape — nooit een trendpagina waard. */
export const JUNK_TREND_SLUGS = new Set([
  'allowfullscreen', // iframe-attribuut
  'textblock', // CMS/HTML-artefact
  'nofollow', // rel-attribuut
  'enclosure', // RSS-tag
]);

/**
 * Bepaal de canonieke set trend-slugs.
 *
 * @param {Array<{slug: string, mentions: number}>} items
 * @returns {{ keep: Set<string>, redirects: Map<string, string> }}
 *   keep      — slugs die een eigen pagina krijgen
 *   redirects — gedropte duplicaat-slug → canonieke slug (voor 301-stubs)
 */
export function selectCanonicalTrends(items) {
  const bySlug = new Map();
  for (const it of items) {
    if (!JUNK_TREND_SLUGS.has(it.slug)) bySlug.set(it.slug, it.mentions ?? 0);
  }
  const keep = new Set(bySlug.keys());
  const redirects = new Map();
  // Enkelvoud/meervoud-paren (slug + 's'): houd de variant met de meeste
  // vermeldingen; bij gelijkspel wint het enkelvoud.
  for (const slug of [...keep]) {
    const plural = `${slug}s`;
    if (!keep.has(plural)) continue;
    const singularWins = (bySlug.get(slug) ?? 0) >= (bySlug.get(plural) ?? 0);
    const drop = singularWins ? plural : slug;
    const target = singularWins ? slug : plural;
    keep.delete(drop);
    redirects.set(drop, target);
  }
  return { keep, redirects };
}

/**
 * Filter een Astro content-collectie ('trends') tot de canonieke entries.
 * Entries hebben de vorm { data: { slug, data: { total_mentions } } }.
 */
export function canonicalTrendEntries(entries) {
  const { keep } = selectCanonicalTrends(
    entries.map((t) => ({ slug: t.data.slug, mentions: t.data.data?.total_mentions ?? 0 }))
  );
  return entries.filter((t) => keep.has(t.data.slug));
}
