import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data" / "baduk-data.json"
RATINGS = ROOT / "public" / "data" / "ratings"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_multicountry_schedule_and_importance_schema():
    data = load_json(DATA)
    regions = {item["region"] for item in data["schedule"]}

    assert {"kr", "jp", "cn"}.issubset(regions)
    assert all(item.get("importance_level") in {"high", "medium", "low"} for item in data["schedule"])
    assert all(isinstance(item.get("importance_score"), int) for item in data["schedule"])
    assert all(item.get("source_name") and item.get("source_url") for item in data["schedule"])


def test_external_rating_missing_values_are_null_not_zero():
    data = load_json(DATA)

    for comparison in data["ratingComparisons"]:
        for value in comparison["external_ratings"].values():
            assert value["rating_value"] != 0
            if value["rating_value"] is None:
                assert value["status"] in {"missing", "unavailable", "terms_unknown"}


def test_rating_exports_exist_and_match_snapshot():
    data = load_json(DATA)
    own = load_json(RATINGS / "own_latest.json")
    external = load_json(RATINGS / "external_latest.json")
    source_status = load_json(RATINGS / "source_status.json")
    comparison = load_json(RATINGS / "comparison_latest.json")

    assert len(own["own_ratings"]) == len(data["ownRatings"])
    assert len(external["external_ratings"]) == len(data["externalRatings"])
    assert len(comparison["comparisons"]) == len(data["ratingComparisons"])
    assert any(item["source_id"] == "cwa_ratings" for item in source_status["sources"])
    assert any(item["source_id"] == "nihon_schedule" for item in source_status["sources"])


def test_tournaments_export_exists_and_links_known_schedule_events():
    data = load_json(DATA)
    tournaments = load_json(ROOT / "public" / "data" / "tournaments.json")

    assert tournaments["schema_version"] == 1
    assert tournaments["curation_note"]
    assert len(tournaments["tournaments"]) >= 5

    schedule_ids = {event["id"] for event in data["schedule"]}
    for tournament in tournaments["tournaments"]:
        for lang in ("en", "ko", "ja", "zhHans", "zhHant"):
            assert tournament["names"][lang]
        assert tournament["web_url"]
        for winner in tournament["winners"]:
            assert winner["winner_name"].strip()
            assert winner["source_url"]
            assert "winner_player_id" in winner and "runner_up_player_id" in winner
        assert all(event_id in schedule_ids for event_id in tournament["event_ids"])


def test_kifu_index_is_optional_but_consistent_when_present():
    index_path = ROOT / "public" / "data" / "kifu" / "index.json"
    if not index_path.exists():
        return  # kifu collection is network-only; absence is a valid outcome

    index = load_json(index_path)
    assert index["schema_version"] == 1
    for game in index["games"]:
        assert game["source_url"] and game["terms_status"]
        kifu = load_json(ROOT / "public" / game["file"])
        assert len(kifu["moves"]) >= 30


def test_baduk_r_is_game_graph_model_not_goratings_copy():
    data = load_json(DATA)

    assert "game-graph" in data["modelVersion"]
    for comparison in data["ratingComparisons"][:50]:
        own = comparison["own_rating"]["own_rating"]
        goratings = comparison["external_ratings"]["goratings"]["rating_value"]
        assert abs(own - goratings) > 100
