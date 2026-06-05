import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ainieuwsradar.nl',
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
