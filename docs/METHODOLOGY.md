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

Predictions use Baduk-R unless another source is explicitly supported in the future. The current UI exposes:

- single-game win probability
- best-of-3 series win probability
- best-of-5 series win probability

The current model primarily reflects rating difference. Color, ruleset, and komi controls are hidden until there is enough reliable historical data to estimate those effects honestly.
