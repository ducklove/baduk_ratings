import { formatRating, sourceStatusLabel } from '../lib/format';
import type { Translation } from '../lib/i18n';
import type { RatingComparisonValue } from '../types';

export function RatingValueCell({
  label,
  value,
  meta,
  t,
  primary = false,
}: {
  label: string;
  value: number | null | undefined;
  meta: string;
  t: Translation;
  primary?: boolean;
}) {
  return (
    <span className={primary ? 'rating-stack rating-stack-primary' : 'rating-stack'} title={`${label}: ${meta}`}>
      <strong>{value === null || value === undefined ? t.missing : formatRating(value)}</strong>
      <small>{meta}</small>
    </span>
  );
}

export function ExternalRatingCell({
  value,
  t,
}: {
  value: RatingComparisonValue | undefined;
  t: Translation;
}) {
  if (!value || value.rating_value === null) {
    return <RatingValueCell label={t.ratingSources} value={null} meta={t.missing} t={t} />;
  }

  const status = value.terms_status === 'unknown' ? t.termsUnknown : sourceStatusLabel(value.status, t);
  const rankText = value.rank_value ? `#${value.rank_value}` : status;
  return (
    <RatingValueCell
      label={value.source_name}
      value={value.rating_value}
      meta={`${rankText} · ${value.rating_date ?? value.fetched_at?.slice(0, 10) ?? status}`}
      t={t}
    />
  );
}
