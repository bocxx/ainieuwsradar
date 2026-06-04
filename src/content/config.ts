import { defineCollection, z } from 'astro:content';

// Data-collections (JSON), gegenereerd door NewsFlux:
//   src/content/radar/<YYYY-MM-DD>.json  — dag-snapshot + LLM-analyse
//   src/content/trends/<slug>.json       — trend-entiteit + LLM-analyse
const radar = defineCollection({
  type: 'data',
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
  type: 'data',
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
