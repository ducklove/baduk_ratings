export type CountryCode = 'kr' | 'cn' | 'jp' | 'tw';
export type Gender = 'male' | 'female';

export type PlayerNameSet = {
  en: string;
  ko: string;
  ja: string;
  zh: string;
};

export type HistoryPoint = {
  date: string;
  rating: number;
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
  timeKst: string | null;
  weekday: string;
  title: string;
  category: 'world' | 'prd' | 'dev' | 'etc' | 'online';
  region: CountryCode;
  source: string;
  sourceUrl: string;
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  date: string;
  region: CountryCode;
  source: string;
  url: string;
};

export type SourceHubItem = {
  region: CountryCode | 'global';
  name: string;
  url: string;
  kind: string;
  note: string;
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
};
