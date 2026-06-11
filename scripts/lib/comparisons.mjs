import { sourceUrls } from './config.mjs';

export function buildRatingSources() {
  return [
    {
      rating_source_id: 'own',
      source_name: 'Baduk-R',
      display_name: 'Baduk-R',
      source_url: null,
      terms_status: 'allowed',
      notes: 'Internally computed own rating from normalized professional game history.',
    },
    {
      rating_source_id: 'goratings',
      source_name: 'GoRatings',
      display_name: 'GoRatings Score',
      source_url: sourceUrls.goratings,
      terms_status: 'unknown',
      notes: 'External public score retained separately from Baduk-R.',
    },
    {
      rating_source_id: 'chinese_qiyuan',
      source_name: 'Chinese Weiqi Association',
      display_name: 'Chinese Qiyuan Score',
      source_url: sourceUrls.cwaPlayer,
      terms_status: 'unknown',
      notes: 'Official CWA ranking points when matched to player_id.',
    },
    {
      rating_source_id: 'korean_baduk',
      source_name: 'Korea Baduk Association',
      display_name: 'Korean Baduk Association Score',
      source_url: sourceUrls.kbaRankingPublic,
      terms_status: 'unknown',
      notes: 'Official Korean ranking points when matched to player_id.',
    },
  ];
}

export function missingComparison(sourceName, sourceUrl, region, termsStatus = 'unknown') {
  return {
    source_name: sourceName,
    rating_value: null,
    rank_value: null,
    rating_date: null,
    country_or_region: region,
    source_url: sourceUrl,
    source_confidence: null,
    fetched_at: null,
    notes: 'No matched rating value in this snapshot.',
    terms_status: termsStatus,
    status: termsStatus === 'unavailable' ? 'unavailable' : 'missing',
  };
}

export function buildRatingComparisons(players, ownRatings, externalRatings) {
  const ownByPlayer = new Map(ownRatings.map((row) => [row.player_id, row]));
  const externalByPlayer = new Map();

  for (const rating of externalRatings) {
    const bucket = externalByPlayer.get(rating.player_id) ?? {};
    bucket[rating.rating_source_id] = {
      source_name: rating.source_name,
      rating_value: rating.rating_value,
      rank_value: rating.rank_value,
      rating_date: rating.rating_date,
      country_or_region: rating.country_or_region,
      source_url: rating.source_url,
      source_confidence: rating.source_confidence,
      fetched_at: rating.fetched_at,
      notes: rating.notes,
      terms_status: rating.terms_status,
      status: rating.terms_status === 'unknown' ? 'terms_unknown' : 'available',
    };
    externalByPlayer.set(rating.player_id, bucket);
  }

  return players.map((player) => {
    const external = externalByPlayer.get(player.id) ?? {};
    return {
      player_id: player.id,
      own_rating: ownByPlayer.get(player.id) ?? null,
      external_ratings: {
        goratings:
          external.goratings ??
          missingComparison('GoRatings', player.profileUrl, player.country, 'unknown'),
        chinese_qiyuan:
          external.chinese_qiyuan ??
          missingComparison('Chinese Weiqi Association', sourceUrls.cwaPlayer, 'cn', 'unknown'),
        korean_baduk:
          external.korean_baduk ??
          missingComparison('Korea Baduk Association', sourceUrls.kbaRankingPublic, 'kr', 'unknown'),
      },
    };
  });
}

export function buildSourceHub() {
  return [
    {
      region: 'global',
      name: 'GoRatings',
      url: sourceUrls.goratings,
      kind: 'ratings',
      note: 'WHR-style professional rating list with game records and player histories.',
    },
    {
      region: 'kr',
      name: 'Korea Baduk Association',
      url: 'https://www.baduk.or.kr/',
      kind: 'schedule-news-ratings',
      note: 'Official Korean professional schedule, news, rankings, and player records.',
    },
    {
      region: 'cn',
      name: 'Chinese Weiqi Association',
      url: 'https://www.weiqi.org.cn/',
      kind: 'schedule-ratings',
      note: 'Official Chinese weiqi federation portal and ranking API.',
    },
    {
      region: 'jp',
      name: 'Nihon Ki-in',
      url: 'https://www.nihonkiin.or.jp/',
      kind: 'schedule-federation',
      note: 'Official Japan Go association portal for tournaments and match schedules.',
    },
    {
      region: 'jp',
      name: 'Kansai Ki-in',
      url: 'https://kansaikiin.jp/',
      kind: 'federation',
      note: 'Kansai professional Go association portal.',
    },
    {
      region: 'tw',
      name: 'HaiFong Go Association',
      url: sourceUrls.haifong,
      kind: 'federation-news',
      note: 'Taiwan professional Go operations reference source.',
    },
  ];
}

export function sourceStatus({
  source_id,
  source_name,
  country_or_region,
  data_type,
  status,
  terms_status = 'unknown',
  source_url,
  fetched_at,
  confidence,
  item_count,
  notes,
  stale,
}) {
  return {
    source_id,
    source_name,
    country_or_region,
    data_type,
    status,
    terms_status,
    source_url,
    fetched_at,
    confidence,
    item_count,
    notes,
    ...(stale ? { stale: true } : {}),
  };
}
