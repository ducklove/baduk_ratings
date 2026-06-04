# baduk_ratings

Static multilingual professional baduk/go ratings service for Korea, China, Japan, and Taiwan.

Public URL target: <https://ducklove.github.io/baduk_ratings/>

## Features

- WHR/Elo-style professional ratings table sourced from GoRatings.
- Multilingual UI: English, Korean, Japanese, Simplified Chinese, Traditional Chinese.
- Search and filters by region, women players, and rising ratings.
- Match predictor with color, rules, and komi adjustment.
- Player profile panel with rating history, recent games, official links, and source profile.
- Current-month Korea Baduk Association schedule and latest news snapshot.
- Source hub for GoRatings, Korea Baduk Association, Chinese Weiqi Association, Nihon Ki-in, Kansai Ki-in, and Taiwan reference sources.

## Data

The app is static at runtime. Data is generated into `public/data/baduk-data.json` before build.

```bash
npm run generate:data
npm test
```

Snapshot sources:

- GoRatings: <https://www.goratings.org/en/>
- Korea Baduk Association schedule: <https://baduk.or.kr/record/schedule.asp>
- Korea Baduk Association news: <https://baduk.or.kr/news/report.asp>

## Development

```bash
npm install
npm run generate:data
npm run dev
```

## Quality Checks

```bash
npm run lint
npm test
npm run build
```

## Deployment

The Vite base path is `/baduk_ratings/`. The included GitHub Actions workflow regenerates data, validates, builds, and deploys `dist` to GitHub Pages on pushes to `main`.
