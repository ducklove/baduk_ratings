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
- Match predictor with single-game, best-of-3, and best-of-5 probabilities from Baduk-R rating difference.
- Player profile panel with rating comparison, rating history, recent games, official links, and source profile.
- Source hub and `source_status.json` for unavailable, empty, or legally unclear sources.

## Data

The app is static at runtime. Data is generated before build:

```bash
npm run generate:data
npm test
```

Optional build-time localization uses OpenRouter only during `npm run generate:data`.
Set `OPENROUTER_API_KEY` in the environment or as a GitHub Actions repository secret.
`OPENROUTER_MODEL` defaults to `qwen/qwen3.7-plus`.
The browser app never calls OpenRouter and no API key is bundled into the frontend.

Generated exports:

- `public/data/baduk-data.json`
- `public/data/ratings/own_latest.json`
- `public/data/ratings/external_latest.json`
- `public/data/ratings/source_status.json`
- `public/data/ratings/comparison_latest.json`

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
npm run test
npm run build
pytest
```

## Deployment

The Vite base path is `/baduk_ratings/`. The included GitHub Actions workflow regenerates data, validates, builds, and deploys `dist` to GitHub Pages on pushes to `main`, manual dispatches, and the daily 18:00 KST refresh.

The scheduled refresh runs `npm run generate:data`, so it checks public news/column sources, current schedules and game-result sources, external rating sources, recomputes Baduk-R, validates the snapshot, and deploys the fresh static artifact.
