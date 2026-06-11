import { formatFullDate } from '../lib/format';
import type { Language, Translation } from '../lib/i18n';
import { compactNumber } from '../lib/rating';
import type { RatingData } from '../types';

export function ReleaseStrip({
  t,
  language,
  data,
  modelVersion,
}: {
  t: Translation;
  language: Language;
  data: RatingData;
  modelVersion: string;
}) {
  return (
    <section className="release-strip" aria-label="Dataset status">
      <div>
        <span>{t.release}</span>
        <strong>{data.ratingStats.mostRecentGame}</strong>
      </div>
      <div>
        <span>{t.dataUpdated}</span>
        <strong>{formatFullDate(data.generatedAt, language)}</strong>
      </div>
      <div>
        <span>{t.games}</span>
        <strong>{compactNumber(data.ratingStats.games)}</strong>
      </div>
      <div>
        <span>{t.modelVersion}</span>
        <strong>{modelVersion}</strong>
      </div>
    </section>
  );
}
