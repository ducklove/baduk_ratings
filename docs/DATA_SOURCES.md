# Data Sources

`baduk_ratings` is a static service. Runtime frontend code reads generated JSON only; it does not call external APIs and never calls OpenRouter.

Optional schedule/news localization is performed only at data-generation time when `OPENROUTER_API_KEY` is present. The configured model defaults to `qwen/qwen3.7-plus`, and translated fields are stored in generated JSON as `localized_title`, `localized_tournament`, and `localized_summary`. If the key is absent or the request fails, the app falls back to source text and records the state in `source_status.json`.

## Ratings

- Baduk-R: internally computed own rating from parsed professional game outcomes. GoRatings score is not used as the Baduk-R input.
- GoRatings: public score retained only as a separate external score with `terms_status: unknown`; parsed game-result rows are used as one public historical game-record source for Baduk-R.
- Chinese Qiyuan Score: official Chinese Weiqi Association ranking API at `https://www.weiqi.org.cn/player`, matched to local `player_id` by normalized English/Chinese aliases. Unmatched players are reported in `external_latest.json`.
- Korean Baduk Association Score: official monthly ranking page at `https://baduk.or.kr/record/rankingPlayer.asp`, matched by normalized Korean name. Unmatched players are reported in `external_latest.json`.

Missing external values are stored as `null` with a status such as `missing`, `unavailable`, or `terms_unknown`. They are never represented as zero.

## Schedule

- Korea: Korea Baduk Association monthly schedule.
- Japan: Nihon Ki-in two-week match result/schedule page. Upcoming table rows are parsed as scheduled games.
- China: Chinese Weiqi Association calendar API is checked first. When the calendar response is empty, dated official tournament regulation records are parsed as tournament-level events with lower confidence.
- Taiwan: HaiFong calendar page is checked. The current page does not expose structured upcoming professional schedule rows, so it is recorded as `available_empty`.

Every schedule item includes source name, URL, fetch timestamp, confidence, region, and deterministic importance fields:

- `importance_score`
- `importance_level`
- `importance_reasons`

The source health snapshot is exported to `public/data/ratings/source_status.json`.

## Exports

- `public/data/baduk-data.json`
- `public/data/ratings/own_latest.json`
- `public/data/ratings/external_latest.json`
- `public/data/ratings/source_status.json`
- `public/data/ratings/comparison_latest.json`

## Limitations

External rating source terms are not asserted as allowed unless explicitly verified. Official pages and APIs can change shape or return empty data; such cases are documented in `source_status.json` instead of fabricating data.
