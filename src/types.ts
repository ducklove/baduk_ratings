export type CountryCode = 'kr' | 'cn' | 'jp' | 'tw';
export type RegionCode = CountryCode | 'int' | 'unknown';
export type Gender = 'male' | 'female';
export type TermsStatus = 'allowed' | 'unknown' | 'restricted' | 'unavailable';
export type SourceAvailability =
  | 'available'
  | 'available_empty'
  | 'blocked'
  | 'unavailable'
  | 'parse_failed'
  | 'terms_unknown';
export type RatingSourceId = 'goratings' | 'chinese_qiyuan' | 'korean_baduk';
export type RatingMetric = 'own' | RatingSourceId;

export type PlayerNameSet = {
  en: string;
  ko: string;
  ja: string;
  zh: string;
};

export type LocalizedText = {
  en: string;
  ko: string;
  ja: string;
  zhHans: string;
  zhHant: string;
};

export type HistoryPoint = {
  date: string;
  rating: number;
};

export type OwnHistoryPoint = HistoryPoint & {
  rank?: number;
};

export type OwnHistoryFile = {
  schema_version: number;
  updated_at: string;
  players: Record<string, OwnHistoryPoint[]>;
};

export type RecentGame = {
  date: string;
  rating: number;
  color: 'black' | 'white';
  result: 'win' | 'loss';
  opponentId: string;
  opponentName: string;
  opponentRating: number;
  opponentCountry: string;
  kifuUrl: string;
};

export type PlayerDetail = {
  wins: number;
  losses: number;
  totalGames: number;
  birthDate: string | null;
  links: Array<{ url: string; label: string }>;
  recentGames: RecentGame[];
  history: HistoryPoint[];
  ratingDelta30: number | null;
  ratingDelta180: number | null;
  ownRating?: OwnRating;
  externalRatings?: ExternalRating[];
  ratingComparison?: RatingComparison;
};

export type Player = {
  rank: number;
  id: string;
  name: string;
  gender: Gender;
  country: CountryCode;
  rating: number;
  names: PlayerNameSet;
  profileUrl: string;
  regionalRank: number;
  ratingDelta30: number | null;
  ratingDelta180: number | null;
  form: Array<'W' | 'L'>;
  history: HistoryPoint[];
};

export type ScheduleEvent = {
  id: string;
  date: string;
  dateEnd?: string | null;
  timeKst: string | null;
  weekday: string;
  title: string;
  localized_title?: LocalizedText;
  tournament?: string;
  localized_tournament?: LocalizedText;
  round?: string | null;
  category: 'world' | 'prd' | 'dev' | 'etc' | 'online';
  region: RegionCode;
  country_or_region?: RegionCode;
  source: string;
  sourceUrl: string;
  source_name?: string;
  source_url?: string;
  fetched_at?: string;
  source_confidence?: number;
  importance_level?: 'high' | 'medium' | 'low';
  importance_score?: number;
  importance_reasons?: string[];
  resolved_players?: string[];
  unresolved_players?: string[];
  event_type?: 'game' | 'tournament';
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  localized_title?: LocalizedText;
  localized_summary?: LocalizedText;
  date: string;
  region: RegionCode;
  source: string;
  url: string;
  category?: string;
  content_type?: 'news' | 'column' | 'media_report';
  curation_score?: number;
  curation_reason?: string[];
};

export type SourceHubItem = {
  region: RegionCode | 'global';
  name: string;
  url: string;
  kind: string;
  note: string;
};

export type OwnRating = {
  rating_date: string;
  player_id: string;
  own_rating: number;
  own_rating_uncertainty: number;
  own_rank: number;
  own_rank_delta: number | null;
  own_rating_delta_1d: number | null;
  own_rating_delta_7d: number | null;
  own_rating_delta_30d: number | null;
  own_rating_delta_90d: number | null;
  own_rating_delta_365d: number | null;
  games_total: number;
  games_recent: number;
  active_flag: boolean;
  model_version: string;
};

export type ExternalRating = {
  rating_source_id: RatingSourceId;
  source_name: string;
  player_id: string;
  source_player_name: string;
  rating_value: number | null;
  rank_value: number | null;
  rating_date: string | null;
  country_or_region: RegionCode;
  source_url: string;
  source_confidence: number;
  fetched_at: string;
  notes: string | null;
  terms_status: TermsStatus;
  parser_version: string;
};

export type RatingComparisonValue = {
  source_name: string;
  rating_value: number | null;
  rank_value: number | null;
  rating_date: string | null;
  country_or_region: RegionCode;
  source_url: string | null;
  source_confidence: number | null;
  fetched_at: string | null;
  notes: string | null;
  terms_status: TermsStatus;
  status: 'available' | 'missing' | 'unavailable' | 'terms_unknown';
};

export type RatingComparison = {
  player_id: string;
  own_rating: OwnRating | null;
  external_ratings: Record<RatingSourceId, RatingComparisonValue>;
};

export type RatingSourceMeta = {
  rating_source_id: RatingMetric;
  source_name: string;
  display_name: string;
  source_url: string | null;
  terms_status: TermsStatus;
  notes: string;
};

export type SourceStatusItem = {
  source_id: string;
  source_name: string;
  country_or_region: RegionCode | 'global';
  data_type: string;
  status: SourceAvailability;
  terms_status: TermsStatus;
  source_url: string;
  fetched_at: string | null;
  confidence: number;
  item_count: number;
  notes: string;
};

export type SourceStatusSnapshot = {
  schema_version: number;
  generated_at: string;
  sources: SourceStatusItem[];
};

export type RatingData = {
  schemaVersion: number;
  generatedAt: string;
  ratingStats: {
    games: number;
    players: number;
    mostRecentGame: string;
  };
  players: Player[];
  playerDetails: Record<string, PlayerDetail>;
  schedule: ScheduleEvent[];
  news: NewsItem[];
  sourceHub: SourceHubItem[];
  ownRatings?: OwnRating[];
  externalRatings?: ExternalRating[];
  ratingComparisons?: RatingComparison[];
  ratingSources?: RatingSourceMeta[];
  sourceStatus?: SourceStatusSnapshot;
  modelVersion?: string;
};
