// Test van de 301-worker (src/worker.ts), zonder wrangler of netwerk.
// Run: node --experimental-strip-types scripts/test-redirects.mjs
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import worker, { redirectTarget, targetPath } from '../src/worker.ts';

const H = 'https://www.hetlaatsteainieuws.nl';
const cases = [
  ['https://ainieuwsradar.nl/', '/radar/'],
  ['http://ainieuwsradar.nl', '/radar/'],
  ['https://www.ainieuwsradar.nl/', '/radar/'],
  ['https://ainieuwsradar.nl/hype', '/radar/hype/'],
  ['http://www.ainieuwsradar.nl/hype/', '/radar/hype/'],
  ['https://ainieuwsradar.nl/HYPE/?utm_source=x', '/radar/hype/'],
  ['https://ainieuwsradar.nl/ai-in-nederland/', '/radar/ai-in-cijfers/'],
  ['https://ainieuwsradar.nl/voorspellingen/', '/radar/track-record/'],
  ['https://ainieuwsradar.nl/track-record', '/radar/track-record/'],
  ['https://ainieuwsradar.nl/wetenschap/', '/radar/wetenschap/'],
  ['https://ainieuwsradar.nl/methode/', '/radar/methode/'],
  ['https://ainieuwsradar.nl/radar/', '/radar/'],
  ['https://ainieuwsradar.nl/radar/2026-10-27/', '/radar/'],
  ['https://ainieuwsradar.nl/trends/', '/dossiers/'],
  ['https://ainieuwsradar.nl/trend/agentic/', '/dossier/ai-agents/'],
  ['https://ainieuwsradar.nl/trend/ai-agents', '/dossier/ai-agents/'],
  ['https://ainieuwsradar.nl/trend/claude-code/', '/dossier/anthropic-claude/'],
  ['https://ainieuwsradar.nl/trend/anthropic/', '/dossier/anthropic-claude/'],
  ['https://ainieuwsradar.nl/trend/gemma/', '/dossier/google-gemini/'],
  ['https://ainieuwsradar.nl/trend/gpt-5/', '/dossier/openai-chatgpt/'],
  ['https://ainieuwsradar.nl/trend/sora/', '/dossier/openai-chatgpt/'],
  ['https://ainieuwsradar.nl/trend/llama-cpp/', '/dossier/open-source-lokale-llms/'],
  ['https://ainieuwsradar.nl/trend/hugging-face/', '/dossier/open-source-lokale-llms/'],
  ['https://ainieuwsradar.nl/trend/nvidia/', '/dossier/energievoetafdruk-ai/'],
  ['https://ainieuwsradar.nl/trend/ai-safety/', '/dossier/hoe-gevaarlijk-is-ai/'],
  ['https://ainieuwsradar.nl/trend/perplexity/', '/dossier/ai-zoeken/'],
  ['https://ainieuwsradar.nl/trend/ai-coding/', '/voor/developer'],
  ['https://ainieuwsradar.nl/trend/github/', '/voor/developer'],
  ['https://ainieuwsradar.nl/trend/grpo/', '/voor/developer'],
  ['https://ainieuwsradar.nl/trend/copyright/', '/radar/hype/'],
  ['https://ainieuwsradar.nl/trend/multimodal/', '/radar/hype/'],
  ['https://ainieuwsradar.nl/robots.txt', '/radar/'],
  ['https://ainieuwsradar.nl/sitemap-index.xml', '/radar/'],
  ['https://ainieuwsradar.nl/bestaat/niet/', '/radar/'],
];

let n = 0;
for (const [from, to] of cases) {
  assert.equal(redirectTarget(from), H + to, `${from} → verwacht ${to}`);
  n++;
}

// fetch-handler: status 301 + Location
const res = await worker.fetch(new Request('http://www.ainieuwsradar.nl/trend/openai/'));
assert.equal(res.status, 301);
assert.equal(res.headers.get('location'), H + '/dossier/openai-chatgpt/');
n++;

// Elk dossier-doel moet in HLN bestaan (alleen als de HLN-repo ernaast staat)
// Zoekt de HLN-repo naast deze checkout (hoofd-checkout) of naast de worktree.
const candidates = [
  '../../hetlaatsteainieuws-v2/src/pages/dossier/',
  '../../../../../hetlaatsteainieuws-v2/src/pages/dossier/',
].map((rel) => new URL(rel, import.meta.url));
let dossierCheck = 'overgeslagen (HLN-repo niet gevonden)';
try {
  const dir = candidates.find((u) => { try { readdirSync(u); return true; } catch { return false; } });
  if (!dir) throw Object.assign(new Error('geen HLN-repo'), { code: 'ENOENT' });
  const existing = new Set(readdirSync(dir).map((f) => f.replace(/\.astro$/, '')));
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8'));
  const targets = [...src.matchAll(/'\/dossier\/([a-z0-9-]+)\/'/g)].map((m) => m[1]);
  for (const t of targets) assert.ok(existing.has(t), `dossier bestaat niet in HLN: ${t}`);
  dossierCheck = `${targets.length} dossier-doelen bestaan in HLN`;
} catch (e) {
  if (e?.code !== 'ENOENT') throw e;
}

console.log(`✅ ${n} redirect-checks geslaagd; ${dossierCheck}. targetPath('/') = ${targetPath('/')}`);
