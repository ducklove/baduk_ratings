# Methodology

## Baduk-R

Baduk-R is the primary internal rating used for default ranking and prediction. It is recomputed from parsed professional game outcomes with an Elo-style game graph model. GoRatings score is not used as the Baduk-R input.

The current model version is stored in generated data as `modelVersion` and in every own rating row as `model_version`.

The model starts every player from the same neutral prior, deduplicates known games, replays wins/losses chronologically, and reports uncertainty from game volume and inactivity. Players with little connected game evidence remain high-uncertainty instead of being silently promoted by an external score.

## External Ratings

External ratings are not mixed into Baduk-R silently. They are stored as separate values:

- GoRatings Score
- Chinese Qiyuan Score
- Korean Baduk Association Score

Each row keeps source name, player name at source, rating value, rank if available, rating date, source URL, confidence, fetch timestamp, terms status, and parser version.

## Prediction

Predictions use Baduk-R unless another source is explicitly supported in the future. Users choose only Korean-style or Chinese-style rules. Komi is selected automatically:

- Korean-style: 6.5 by ruleset default unless source or tournament data provides a known value.
- Chinese-style: 7.5 by ruleset default unless source or tournament data provides a known value.

The current model primarily reflects rating difference. Ruleset and komi effects are displayed honestly and only applied where supported by available data.
