import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { selectCanonicalTrends } from './src/lib/trend-filter.mjs';

// Trend-data op config-tijd inlezen: voor de enkelvoud/meervoud-redirects.
// Junk-slugs (HTML-artefacten) krijgen bewust géén redirect — die horen 404
// te geven. Vangnet; de structurele fix hoort upstream in de newsflux-export.
const trendsDir = fileURLToPath(new URL('./src/content/trends/', import.meta.url));
const trendSummaries = readdirSync(trendsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const d = JSON.parse(readFileSync(trendsDir + f, 'utf8'));
    return { slug: d.slug, mentions: d.data?.total_mentions ?? 0 };
  });
const { redirects: trendRedirects } = selectCanonicalTrends(trendSummaries);

export default defineConfig({
  site: 'https://ainieuwsradar.nl',
  // Gedropte duplicaat-slug → canonieke trendpagina (statisch: meta-refresh-stub).
  redirects: Object.fromEntries(
    [...trendRedirects].map(([from, to]) => [`/trend/${from}`, `/trend/${to}/`])
  ),
  integrations: [sitemap()],
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
