/**
 * ainieuwsradar.nl → hetlaatsteainieuws.nl (301-worker)
 *
 * Sinds de netwerkconsolidatie van oktober 2026 is ainieuwsradar.nl opgegaan
 * in de radar van hetlaatsteainieuws.nl (HLN). Deze worker serveert geen
 * pagina's meer: elk verzoek, op http of https, met of zonder www, met of
 * zonder trailing slash, krijgt een permanente redirect (301) naar de
 * dichtstbijzijnde HLN-pagina. De querystring gaat bewust niet mee.
 *
 * De Astro-site in src/pages blijft voorlopig in de repo staan, maar wordt
 * niet meer geserveerd (zie wrangler.toml: `main` wijst hierheen en het
 * [assets]-blok staat uit).
 *
 * Test: node --experimental-strip-types scripts/test-redirects.mjs
 */

export const HLN = 'https://www.hetlaatsteainieuws.nl';

/*
 * Doelen staan in de vorm die HLN met 200 serveert, zodat er geen tweede hop
 * ontstaat. Prerendered pagina's (radar, dossiers, dossier) geven zonder slash
 * een 307 naar de slash-vorm (live gecontroleerd 27-10-2026), dus die krijgen
 * hier een slash. /voor/developer is SSR met een canonical zonder slash.
 */

/** Vaste paden (bron zonder trailing slash, kleine letters). */
const EXACT: Record<string, string> = {
  '/': '/radar/',
  '/hype': '/radar/hype/',
  '/ai-in-nederland': '/radar/ai-in-cijfers/',
  '/voorspellingen': '/radar/track-record/',
  '/track-record': '/radar/track-record/',
  '/wetenschap': '/radar/wetenschap/',
  '/methode': '/radar/methode/',
  '/radar': '/radar/',
  '/trends': '/dossiers/',
};

/**
 * /trend/<slug> → HLN-dossier. Volgorde telt: de eerste regel die matcht op
 * de slug wint. Elk doel is gecontroleerd tegen
 * hetlaatsteainieuws-v2/src/pages/dossier/ (en /voor/developer).
 */
const TREND_RULES: [RegExp, string][] = [
  [/agentic|ai-agent/, '/dossier/ai-agents/'],
  [/claude|anthropic/, '/dossier/anthropic-claude/'],
  [/gemini|gemma/, '/dossier/google-gemini/'],
  [/chatgpt|openai|gpt-|sora/, '/dossier/openai-chatgpt/'],
  [/llama|qwen|deepseek|mistral|hugging-face|quantization|lora|fine-tuning|together|minimax|cohere/, '/dossier/open-source-lokale-llms/'],
  [/data-center|nvidia/, '/dossier/energievoetafdruk-ai/'],
  [/safety|hallucination/, '/dossier/hoe-gevaarlijk-is-ai/'],
  [/perplexity/, '/dossier/ai-zoeken/'],
  [/coding|cursor|cline|copilot|code-generation|mcp-server|dify|openclaw|make|prompt-engineering|grpo|reinforcement|github/, '/voor/developer'],
];
const TREND_FALLBACK = '/radar/hype/';
const DEFAULT = '/radar/';

/** Normaliseer een pad: decoderen, kleine letters, dubbele en afsluitende slashes weg. */
function normalizePath(pathname: string): string {
  let p = pathname;
  try {
    p = decodeURIComponent(p);
  } catch {
    // ongeldige %-codering: gebruik het pad zoals het binnenkwam
  }
  p = p.toLowerCase().replace(/\/{2,}/g, '/');
  p = p.replace(/\/index\.html?$/, '/').replace(/\.html?$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/** Geeft het HLN-pad terug waar een oud ainieuwsradar-pad heen moet. */
export function targetPath(pathname: string): string {
  const p = normalizePath(pathname);
  if (EXACT[p]) return EXACT[p];

  // /radar/<datum> en alles verder onder /radar → het radar-archief
  if (p.startsWith('/radar/')) return DEFAULT;

  // /trend/<slug> → dossier volgens de regels hierboven
  const m = p.match(/^\/trend\/([^/]+)/);
  if (m) {
    const slug = m[1];
    for (const [re, to] of TREND_RULES) if (re.test(slug)) return to;
    return TREND_FALLBACK;
  }

  return DEFAULT;
}

/** Volledige doel-URL voor een binnenkomende request-URL. */
export function redirectTarget(requestUrl: string): string {
  return HLN + targetPath(new URL(requestUrl).pathname);
}

export default {
  async fetch(request: Request): Promise<Response> {
    return new Response(null, {
      status: 301,
      headers: {
        Location: redirectTarget(request.url),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  },
};
