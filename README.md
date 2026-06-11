# baduk_ratings

Static multilingual professional baduk/go rating, prediction, schedule, profile, and source-status service for Korea, China, Japan, and Taiwan.

Public URL target: <https://ducklove.github.io/baduk_ratings/>

## Features

- Integrated Ranking UI in English, Korean, Japanese, Simplified Chinese, and Traditional Chinese.
- Baduk-R own rating as the default ranking and prediction metric, recomputed from game outcomes rather than GoRatings score.
- External rating comparison columns for GoRatings, Chinese Qiyuan, and Korean Baduk Association scores when available.
- Accessible country/region badges with symbol, text code, and localized labels.
- Schedule coverage from Korea, Japan, and China with source provenance and deterministic importance classification.
- News/column feed that prioritizes official columns, media reports, interviews, and feature-like baduk articles from Korea, Japan, and China.
- Match predictor with single-game, best-of-3, and best-of-5 probabilities from Baduk-R rating difference, plus a rating-history comparison chart for the two selected players.
- Tournament simulator: 4- or 8-player seeded single-elimination bracket with Monte Carlo championship probabilities.
- Country aggregates panel: top-100 presence, top-10 mean Baduk-R, tracked players, and women in top-100 per country.
- Player profile panel with rating comparison, rating history (Baduk-R history preferred, GoRatings series explicitly labeled), recent games, official links, and source profile.
- Major-tournament pages (`#/tournament/{id}`): curated registry of seven international events with source-linked past winners, automatically linked schedule and per-game win probabilities, and a simulator seeded with actual participants.
- Kifu viewer: hand-rolled SVG goban with capture-aware move navigation for collected game records; records are gathered defensively with source attribution and the feature degrades to source links when none are collectable.
- Shareable URLs: `#/player/{id}` deep links and filter state in the hash; language is auto-detected and persisted.
- Source hub and `source_status.json` for unavailable, empty, or legally unclear sources.
- RSS feed (`feed.xml`), PWA manifest/service worker, OG/Twitter meta, sitemap, and a public data API panel.

## Data

The app is static at runtime. Data is generated before build:

```bash
npm run generate:data
npm test
```

Optional build-time localization uses OpenRouter only during `npm run generate:data`.
Set `OPENROUTER_API_KEY` in the local environment, as a GitHub Actions repository secret, or as a `github-pages` environment secret.
`OPENROUTER_MODEL` defaults to `qwen/qwen3.7-plus`.
The browser app never calls OpenRouter and no API key is bundled into the frontend.

Generated exports (all minified):

- `public/data/baduk-data.json` (full snapshot, kept for compatibility)
- `public/data/baduk-data-core.json` (same shape with empty `playerDetails`; the app loads this first)
- `public/data/players/{id}.json` (per-player details, lazily fetched by the app)
- `public/data/ratings/own_latest.json`
- `public/data/ratings/external_latest.json`
- `public/data/ratings/source_status.json`
- `public/data/ratings/comparison_latest.json`
- `public/data/ratings/own_history.json` (daily Baduk-R history archive, merged from the deployed site so scheduled runs accumulate)
- `public/data/tournaments.json` (curated major-tournament registry with resolved player ids and linked schedule event ids)
- `public/data/kifu/index.json` + `public/data/kifu/{key}.json` (collected game records; optional — emitted only when records are extractable)
- `public/feed.xml` (RSS: top-10 snapshot and biggest movers)

`node scripts/update-data.mjs --from-snapshot` re-emits every derived export from the existing
`baduk-data.json` without network access. If the GoRatings rating list is unavailable, the pipeline
falls back to the previous deployed/local snapshot and marks the source row stale instead of aborting.

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) and [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

## Development

```bash
npm install
npm run generate:data
npm run dev
```

## Quality Checks

```bash
npm run lint
npm run typecheck
npm run test:unit   # parser/model unit tests + mocked end-to-end pipeline smoke test
npm run test        # validates the generated data snapshot
npm run build
pytest
```

## Deployment

The Vite base path is `/baduk_ratings/`. The included GitHub Actions workflow regenerates data, validates, builds, and deploys `dist` to GitHub Pages on pushes to `main`, manual dispatches, the daily 18:17 KST refresh, and a 20:07 KST backup refresh.

The scheduled refresh runs `npm run generate:data`, so it checks public news/column sources, current schedules and game-result sources, external rating sources, recomputes Baduk-R, validates the snapshot, and deploys the fresh static artifact.
