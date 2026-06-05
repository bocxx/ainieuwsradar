import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const radar = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/radar' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    description: z.string(),
    analysis: z.string(),
    draft: z.boolean().optional(),
    data: z.any(),
  }),
});

const trends = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/trends' }),
  schema: z.object({
    title: z.string(),
    keyword: z.string(),
    slug: z.string(),
    description: z.string(),
    analysis: z.string(),
    draft: z.boolean().optional(),
    data: z.any(),
  }),
});

export const collections = { radar, trends };
