# Deploy — ainieuwsradar.nl

Statische Astro-site op **Cloudflare Workers (Static Assets)** via `wrangler`,
exact zoals `debesteaitools.nl.ai`. Geen Pages-git-koppeling — `wrangler deploy`
zet live.

---

## Git-repo (eenmalig)

Remote-conventie zoals HLN/DBAT: SSH-host-alias voor het `bocxx`-account, branch
`main`. De pipeline (`stage_deploy`) doet automatisch `git add -A && commit && push`,
dus de remote moet via SSH werken.

Maak eerst een **lege** repo op GitHub: `github.com/bocxx/ainieuwsradar`
(zonder README/licentie, anders botst de eerste push). Dan op je Mac:

```bash
cd ~/Projects/DEPLOYED/ainieuwsradar.nl
git init -b main
git add -A
git commit -m "Initial commit: ainieuwsradar.nl — signaalradar (Astro + Workers)"
git remote add origin git@github.com-bocxx:bocxx/ainieuwsradar.git
git push -u origin main
```

`node_modules/`, `dist/`, `.astro/` en `.wrangler/` staan in `.gitignore`; de
gegenereerde content (`src/content/`) en OG-kaarten (`public/og/`) gaan wél mee.

---

## Eerste keer live zetten

Voorwaarde: het domein staat als zone in Cloudflare en de nameservers wijzen
naar Cloudflare. Check in het Cloudflare-dashboard dat de zone op **Active**
staat (na een nameserver-wissel kan dat tot ~1 uur duren).

```bash
cd ~/Projects/DEPLOYED/ainieuwsradar.nl
npm install            # eenmalig — astro, @astrojs/sitemap, wrangler
npx wrangler login     # eenmalig, als wrangler nog niet is ingelogd (opent browser)
npm run deploy         # = npm run build && wrangler deploy
```

Bij de eerste `wrangler deploy`:
- wordt de Worker **`ainieuwsradar`** aangemaakt;
- worden `ainieuwsradar.nl` én `www.ainieuwsradar.nl` als **custom domains**
  gekoppeld (lukt alleen als de zone Active is);
- regelt Cloudflare automatisch het TLS-certificaat (paar minuten).

Daarna is de site bereikbaar op https://ainieuwsradar.nl.

### www → apex (301) — via een Redirect Rule, NIET via `_redirects`

`_redirects` in Workers Static Assets accepteert alleen **relatieve** URL's,
dus een cross-host redirect (`www` → apex) kan daar niet (geeft
`Invalid _redirects configuration: Only relative URLs are allowed`). Daarom
géén `_redirects`-bestand gebruiken voor www→apex. Zet in plaats daarvan een
**Single Redirect Rule** in het Cloudflare-dashboard:

1. Cloudflare → zone `ainieuwsradar.nl` → **Rules → Redirect Rules → Create rule**.
2. *When incoming requests match*: `Hostname` `equals` `www.ainieuwsradar.nl`.
3. *Then*: **Dynamic** redirect, expression
   `concat("https://ainieuwsradar.nl", http.request.uri.path)`,
   status **301**, *Preserve query string* aan.
4. Opslaan. (Werkt vóór de Worker, dus `www` als custom domain laten staan is prima.)

Canonieke host blijft het kale `ainieuwsradar.nl`.

---

## Dagelijks bijwerken (automatisch)

ainieuwsradar zit in de NewsFlux-pipeline en heeft niets handmatigs nodig:

1. **`stage_data_exports`** draait twee scripts:
   - `export_ainieuwsradar.py --copy-to-site` → ververst de live-homepage-data
     (`src/data/radar.json`);
   - `generate_radar_archive.py --backfill --days 2 --trends --top 30` →
     schrijft de nieuwe dag-snapshot + eventuele nieuwe trendpagina's
     (LLM-analyse + OG-kaart), idempotent.
2. **`stage_deploy`** bouwt en deployt de site (`npm run build && wrangler deploy`),
   net als HLN en DBAT.

Kosten LLM: ~$0,007 per dag (1 dag-analyse + soms een trend).

---

## Handmatig een deploy draaien

```bash
cd ~/Projects/DEPLOYED/ainieuwsradar.nl
npm run deploy
```

Alleen builden (zonder deployen), bijv. om de output te checken:

```bash
npm run build      # -> dist/
npm run preview    # lokaal bekijken op http://localhost:4321
```

---

## Content (re)genereren — vanuit de NewsFlux-repo

De content (`src/content/radar/*.json`, `src/content/trends/*.json`) wordt
gegenereerd door `~/Projects/DEPLOYED/newsflux/src/generate_radar_archive.py`.

```bash
cd ~/Projects/DEPLOYED/newsflux
source venv/bin/activate

# één dag
python3 src/generate_radar_archive.py --date 2026-06-04

# historie terugvullen (idempotent — slaat bestaande over)
python3 src/generate_radar_archive.py --backfill --days 75

# trendpagina's
python3 src/generate_radar_archive.py --trends --top 30

# overschrijven i.p.v. overslaan
python3 src/generate_radar_archive.py --date 2026-06-04 --force

# zonder LLM (template-fallback) of alleen data tonen
python3 src/generate_radar_archive.py --date 2026-06-04 --no-llm
python3 src/generate_radar_archive.py --date 2026-06-04 --dry-run
```

Vereist: `duckdb`, `anthropic` (of de ingestelde LLM-provider) en `pillow`
in de venv. Pillow ontbreekt? `pip install pillow`. De OG-generatie degradeert
netjes (slaat OG over) als Pillow mist — de site blijft bouwen.

Ruisfilter en bronlabels staan in `export_ainieuwsradar.py` (`SKIP`,
`BUZZ_SOURCES`); die worden hergebruikt door de archief-generator.

---

## SEO-bestanden (automatisch in de build)

- `dist/sitemap-index.xml` + `dist/sitemap-0.xml` — via `@astrojs/sitemap`
  (gepind op een Astro 4-compatibele versie).
- `public/robots.txt` — verwijst naar de sitemap.
- Per pagina: canonical, Open Graph + Twitter-card (`/og/<...>.png`), JSON-LD.
- `www → apex` 301 via een Cloudflare **Redirect Rule** (dashboard), niet via
  `_redirects` — zie de sectie hierboven.

> Canonieke host = **apex** (`https://ainieuwsradar.nl`). Staat ook als `site`
> in `astro.config.mjs`; niet wijzigen zonder de redirect mee aan te passen.

---

## Troubleshooting

| Symptoom | Oorzaak / fix |
|---|---|
| `wrangler deploy` vraagt om login | `npx wrangler login` (eenmalig). |
| Custom domain koppelt niet | Zone nog niet **Active** in Cloudflare — even wachten op nameserver-propagatie, dan opnieuw. |
| `Hostname … already has externally managed DNS records … [code: 100117]` | Cloudflare heeft bij het toevoegen van de zone bestaande A/AAAA/CNAME-records (parking/oude host) overgenomen op `@` en `www`. **DNS → Records → verwijder die A/AAAA/CNAME op `ainieuwsradar.nl` en `www`** (MX/TXT laten staan), dan opnieuw `npm run deploy`. Wrangler maakt dan zelf het custom-domain-record. |
| `Invalid _redirects configuration: Only relative URLs are allowed` | `_redirects` mag geen absolute/cross-host URL's bevatten. Verwijder `public/_redirects` en doe `www → apex` via een Redirect Rule in het dashboard (zie boven). |
| Sitemap mist na build | Controleer dat `@astrojs/sitemap` op een **Astro 4**-compatibele versie staat (3.2.x). Nieuwere majors verwachten Astro 5+ en falen met `_routes … reduce`. |
| `EPERM unlink … .astro/…` | Treedt alleen op in de sandbox-omgeving (mount blokkeert `unlink`). Op je Mac bouwt het schoon door. |
| Lege fasen op een dagpagina | Die dag was nog partieel in `trend_snapshots` op moment van genereren. Regenereer met `--force`. |

---

## Naslag

- `wrangler.toml` — Worker-naam, custom domains, `[assets] directory = "./dist"`.
- `astro.config.mjs` — `site` + sitemap-integratie.
- `src/content/config.ts` — data-collections `radar` en `trends`.
- Canoniek = apex; www 301'et ernaartoe.
