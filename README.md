# baduk_ratings

Static multilingual professional baduk/go rating, prediction, schedule, profile, and source-status service for Korea, China, Japan, and Taiwan.

Public URL target: <https://ducklove.github.io/baduk_ratings/>

## Features

- Integrated Ranking UI in English, Korean, Japanese, Simplified Chinese, and Traditional Chinese.
- Baduk-R own rating as the default ranking and prediction metric.
- External rating comparison columns for GoRatings, Chinese Qiyuan, and Korean Baduk Association scores when available.
- Accessible country/region badges with symbol, text code, and localized labels.
- Schedule coverage from Korea, Japan, and China with source provenance and deterministic importance classification.
- Match predictor with Korean-style and Chinese-style rules only; komi is selected automatically and labeled by source/default status.
- Player profile panel with rating comparison, rating history, recent games, official links, and source profile.
- Source hub and `source_status.json` for unavailable, empty, or legally unclear sources.

## Data

The app is static at runtime. Data is generated before build:

```bash
npm run generate:data
npm test
```

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

The Vite base path is `/baduk_ratings/`. The included GitHub Actions workflow regenerates data, validates, builds, and deploys `dist` to GitHub Pages on pushes to `main`.
