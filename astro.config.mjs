import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { selectCanonicalTrends } from './src/lib/trend-filter.mjs';

// Trend-data op config-tijd inlezen: voor de enkelvoud/meervoud-redirects
// en de sitemap-lastmod. Junk-slugs (HTML-artefacten) krijgen bewust géén
// redirect — die horen 404 te geven. Vangnet; de structurele fix hoort
// upstream in de newsflux-export.
const trendsDir = fileURLToPath(new URL('./src/content/trends/', import.meta.url));
const trendSummaries = readdirSync(trendsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const d = JSON.parse(readFileSync(trendsDir + f, 'utf8'));
    return { slug: d.slug, mentions: d.data?.total_mentions ?? 0, lastSeen: d.data?.last_seen ?? null };
  });
const { redirects: trendRedirects } = selectCanonicalTrends(trendSummaries);

// Lastmod-bronnen voor de sitemap: radar-edities dragen hun datum in de URL,
// trendpagina's krijgen de laatste meetdag (last_seen) van hun data-refresh.
const trendLastSeen = new Map(trendSummaries.filter((t) => t.lastSeen).map((t) => [t.slug, t.lastSeen]));
const latestTrendRefresh = [...trendLastSeen.values()].sort().pop() ?? null;
const radarDir = fileURLToPath(new URL('./src/content/radar/', import.meta.url));
const latestRadarDate = readdirSync(radarDir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .pop()
  ?.replace('.json', '') ?? null;

export default defineConfig({
  site: 'https://ainieuwsradar.nl',
  // Gedropte duplicaat-slug → canonieke trendpagina (statisch: meta-refresh-stub).
  redirects: Object.fromEntries(
    [...trendRedirects].map(([from, to]) => [`/trend/${from}`, `/trend/${to}/`])
  ),
  integrations: [
    sitemap({
      // Per-URL lastmod (W3C date): stuurt crawl-budget bij 138 gedateerde
      // radar-edities + dagelijks ververste trendpagina's.
      serialize(item) {
        const path = new URL(item.url).pathname;
        const radarDay = path.match(/^\/radar\/(\d{4}-\d{2}-\d{2})\/?$/);
        if (radarDay) {
          item.lastmod = radarDay[1];
        } else if (path === '/' || /^\/radar\/?$/.test(path)) {
          if (latestRadarDate) item.lastmod = latestRadarDate;
        } else if (/^\/trends\/?$/.test(path)) {
          if (latestTrendRefresh) item.lastmod = latestTrendRefresh;
        } else {
          const trend = path.match(/^\/trend\/([^/]+)\/?$/);
          const seen = trend ? trendLastSeen.get(trend[1]) : null;
          if (seen) item.lastmod = seen;
        }
        return item;
      },
    }),
  ],
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Boldonse',
      cssVariable: '--font-boldonse',
    },
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-geist',
      weights: ['400', '500', '600', '700'],
    },
    {
      provider: fontProviders.google(),
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains-mono',
      weights: ['400', '500'],
    },
  ],
});
