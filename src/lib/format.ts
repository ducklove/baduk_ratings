import { languages, type Language, type Translation } from './i18n';
import { getPlayerDisplayName } from './rating';
import type {
  LocalizedText,
  NewsItem,
  Player,
  RatingComparison,
  RatingComparisonValue,
  RatingMetric,
  RatingSourceId,
  RegionCode,
  SourceStatusItem,
} from '../types';

export type ImportanceLevel = 'high' | 'medium' | 'low';

export const localeForLanguage: Record<Language, string> = {
  en: 'en-US',
  ko: 'ko-KR',
  ja: 'ja-JP',
  zhHans: 'zh-CN',
  zhHant: 'zh-TW',
};

export const reasonLabelKeys: Record<string, keyof Translation> = {
  international_event: 'reasonInternational',
  title_match_or_final: 'reasonTitle',
  semifinal_or_deciding_round: 'reasonSemifinal',
  main_tournament: 'reasonMain',
  preliminary: 'reasonPreliminary',
  top10_player: 'reasonTop10',
  top30_player: 'reasonTop30',
  both_top100: 'reasonBothTop100',
  tournament_prestige: 'reasonPrestige',
  low_source_confidence: 'reasonLowConfidence',
  unresolved_players: 'reasonUnresolvedPlayers',
};

export function formatDate(value: string, language: Language) {
  const date = new Date(`${value}T00:00:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeForLanguage[language], {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function localizedText(
  value: LocalizedText | undefined,
  fallback: string | null | undefined,
  language: Language,
) {
  const text = value?.[language]?.trim();
  return text || fallback || '';
}

export function formatFullDate(value: string, language: Language) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+09:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeForLanguage[language], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function ageFromBirthDate(birthDate: string | null, generatedAt: string) {
  if (!birthDate) {
    return null;
  }

  const birth = new Date(`${birthDate}T00:00:00+09:00`);
  const now = new Date(generatedAt);

  if (Number.isNaN(birth.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  let age = now.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (now < birthdayThisYear) {
    age -= 1;
  }
  return age;
}

export function formatBirthBadge(
  birthDate: string | null | undefined,
  generatedAt: string,
  language: Language,
) {
  if (!birthDate) {
    return null;
  }

  const year = birthDate.slice(0, 4);
  if (!/^\d{4}$/.test(year)) {
    return null;
  }

  const age = ageFromBirthDate(birthDate, generatedAt);

  if (language === 'ko') {
    return age === null ? `${year}년생` : `${year}년생 · ${age}세`;
  }
  if (language === 'ja') {
    return age === null ? `${year}年生` : `${year}年生 · ${age}歳`;
  }
  if (language === 'zhHans') {
    return age === null ? `${year}年生` : `${year}年生 · ${age}岁`;
  }
  if (language === 'zhHant') {
    return age === null ? `${year}年生` : `${year}年生 · ${age}歲`;
  }

  return age === null ? `Born ${year}` : `Born ${year} · ${age}`;
}

export function regionLabel(region: RegionCode | 'global' | string | null | undefined, t: Translation) {
  switch (region) {
    case 'kr':
      return t.korea;
    case 'cn':
      return t.china;
    case 'jp':
      return t.japan;
    case 'tw':
      return t.taiwan;
    case 'int':
    case 'global':
      return t.international;
    default:
      return t.unknownRegion;
  }
}

export function regionShortCode(region: RegionCode | string | null | undefined) {
  switch (region) {
    case 'kr':
      return 'KR';
    case 'cn':
      return 'CN';
    case 'jp':
      return 'JP';
    case 'tw':
      return 'TW';
    case 'int':
      return 'INT';
    default:
      return 'UNKNOWN';
  }
}

export function sourceStatusLabel(
  status: RatingComparisonValue['status'] | SourceStatusItem['status'],
  t: Translation,
) {
  if (status === 'available') {
    return t.available;
  }

  if (status === 'terms_unknown') {
    return t.termsUnknown;
  }

  if (status === 'unavailable' || status === 'blocked' || status === 'parse_failed') {
    return t.unavailable;
  }

  return t.missing;
}

export function termsStatusLabel(status: RatingComparisonValue['terms_status'], t: Translation) {
  if (status === 'allowed') {
    return t.allowed;
  }
  if (status === 'restricted') {
    return t.restricted;
  }
  if (status === 'unavailable') {
    return t.unavailable;
  }
  return t.termsUnknown;
}

export function importanceLabel(level: ImportanceLevel | undefined, t: Translation) {
  if (level === 'high') {
    return t.importanceHigh;
  }
  if (level === 'medium') {
    return t.importanceMedium;
  }
  return t.importanceLow;
}

export function newsKindLabel(item: NewsItem, t: Translation) {
  if (item.content_type === 'column') {
    return t.columnArticle;
  }
  if (item.content_type === 'media_report') {
    return t.mediaReport;
  }
  return t.newsArticle;
}

export function formatImportanceReasons(reasons: string[] | undefined, t: Translation) {
  const labels = (reasons ?? [])
    .map((reason) => reasonLabelKeys[reason])
    .filter((key): key is keyof Translation => Boolean(key))
    .map((key) => t[key]);

  return labels.length ? labels.join(' + ') : t.reasonLowConfidence;
}

export function formatRating(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return Math.round(value).toLocaleString();
}

export function getPlayerOptionLabel(
  player: Player,
  language: Language,
  comparison: RatingComparison | undefined,
) {
  const nameKey = languages.find((item) => item.key === language)?.nameKey ?? 'en';
  const own = comparison?.own_rating;
  const rank = own?.own_rank ?? player.rank;
  const rating = own?.own_rating ?? player.rating;
  return `#${rank} ${getPlayerDisplayName(player, nameKey)} (${regionShortCode(player.country)}) - ${formatRating(rating)}`;
}

export function getExternalComparison(comparison: RatingComparison | undefined, source: RatingSourceId) {
  return comparison?.external_ratings[source];
}

export function getMetricValue(
  player: Player,
  comparison: RatingComparison | undefined,
  metric: RatingMetric,
) {
  if (metric === 'own') {
    return comparison?.own_rating?.own_rating ?? player.rating;
  }

  return getExternalComparison(comparison, metric)?.rating_value ?? null;
}

export function comparePlayersByMetric(
  left: Player,
  right: Player,
  comparisons: Map<string, RatingComparison>,
  metric: RatingMetric,
) {
  const leftValue = getMetricValue(left, comparisons.get(left.id), metric);
  const rightValue = getMetricValue(right, comparisons.get(right.id), metric);
  const leftMissing = leftValue === null || leftValue === undefined;
  const rightMissing = rightValue === null || rightValue === undefined;

  if (leftMissing !== rightMissing) {
    return leftMissing ? 1 : -1;
  }

  if (!leftMissing && !rightMissing && leftValue !== rightValue) {
    return rightValue - leftValue;
  }

  return left.rank - right.rank;
}
