# ainieuwsradar.nl

Live AI-signaalradar in de huisstijl van hetlaatsteainieuws.nl, met emerald
als primary-kleur. Gevoed door NewsFlux-data.

## Stack
Astro (static). Hergebruikt HLN's design-tokens (`src/styles/00-tokens.css`,
`02-base.css`, `05-utilities.css`); de enige merk-afwijking staat in
`src/styles/06-brand.css` (fonts + emerald primary-hue). Fonts liggen lokaal
in `public/fonts/` (Boldonse, Inter, Space Grotesk); JetBrains Mono via Google Fonts.

## Draaien
```bash
npm install
npm run dev      # lokaal previewen
npm run build    # -> dist/
```

## Data verversen
De pagina leest `src/data/radar.json`. Dat bestand wordt gegenereerd uit
NewsFlux (`trend_radar.json` + `early_signals.json`). Genereer een verse versie met:

```bash
# vanuit de newsflux-repo, schrijf naar deze map
python3 scripts/build_radar_json.py   # (nog toe te voegen aan de pipeline)
```

Voor nu staat er een snapshot in `src/data/radar.json`. De volgende stap is een
klein export-script in NewsFlux dat dit dagelijks bijwerkt (zoals de andere sites).

## Kleur wisselen
Pas alleen de `--primary-*` waarden in `06-brand.css` aan (dark in `:root`,
licht in `[data-theme="light"]`). De rest van de UI volgt automatisch.
