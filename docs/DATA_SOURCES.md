# Data Sources

`baduk_ratings` is a static service. Runtime frontend code reads generated JSON only; it does not call external APIs and never calls OpenRouter.

Optional schedule/news localization is performed only at data-generation time when `OPENROUTER_API_KEY` is present. The configured model defaults to `qwen/qwen3.7-plus`, and translated fields are stored in generated JSON as `localized_title`, `localized_tournament`, and `localized_summary`. If the key is absent or the request fails, the app falls back to source text and records the state in `source_status.json`.

## Scheduled Refresh

GitHub Actions runs the data refresh and Pages deployment every day at 18:17 Asia/Seoul (09:17 UTC), with a 20:07 Asia/Seoul backup refresh. The scheduled job performs the same pipeline as a push deployment: collect public source data, regenerate news, schedule, external ratings, and Baduk-R, validate the generated snapshot, build, and deploy the static artifact.

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

## News And Columns

- Korea: Korea Baduk Association official report feed.
- Japan: Nihon Ki-in official column Atom feed. Column and feature articles are prioritized over routine notices.
- China: Chinese Weiqi Association public news API. Media reports, interviews, analysis, player-focused stories, and feature-like articles are prioritized over notices, regulations, and raw results.

Generated news rows include `content_type`, `curation_score`, and `curation_reason`. The frontend labels rows as news, column, or media report, and build-time OpenRouter localization translates titles and summaries into every supported UI language when `OPENROUTER_API_KEY` is configured.

## Exports

- `public/data/baduk-data.json` (full snapshot, kept for compatibility)
- `public/data/baduk-data-core.json` (full snapshot with empty `playerDetails`)
- `public/data/players/{id}.json` (per-player detail split, one file per enriched profile)
- `public/data/ratings/own_latest.json`
- `public/data/ratings/external_latest.json`
- `public/data/ratings/source_status.json`
- `public/data/ratings/comparison_latest.json`
- `public/data/ratings/own_history.json` (daily Baduk-R rating/rank archive per player; on each run the deployed copy is fetched and merged first so scheduled CI runs accumulate history)
- `public/feed.xml` (RSS 2.0 with the top-10 snapshot and biggest rating movers)

All exports are minified. `node scripts/update-data.mjs --from-snapshot` re-emits every derived
export from the existing `baduk-data.json` without any network access.

## Failure Behavior

If the GoRatings rating list fetch or parse fails (or yields too few players), the pipeline reuses
players, profiles, and own ratings from the previous deployed or local snapshot, marks
`goratings_rating_list` as `unavailable` with `stale: true`, and continues refreshing schedule,
news, and external ratings. Build-time translations are reused from the previous snapshot when the
source text is unchanged, so only new or changed items are sent to OpenRouter.

## Limitations

External rating source terms are not asserted as allowed unless explicitly verified. Official pages and APIs can change shape or return empty data; such cases are documented in `source_status.json` instead of fabricating data.

## Tournaments

`data/manual/tournaments.json` is a manually curated registry of major professional tournaments
(names in five languages, organizer, founding year, cycle, format, reference URL, and aliases).
Winner rows are intentionally sparse: an entry is added only when verified, and every row carries
its own `source_url`. The pipeline resolves winner/runner-up names to local player ids and links
schedule events by alias matching, then exports `public/data/tournaments.json`.

## Kifu Records

Recent games of top-rated players link to public viewer pages (currently Go4Go). At generation
time the pipeline attempts to extract raw SGF from up to 24 linked pages under a strict time
budget. Records are stored with source attribution and `terms_status: unknown`, reported under
`source_id: kifu_records`, and the export is optional — when nothing is extractable the UI falls
back to original source links. No game data is ever fabricated.
