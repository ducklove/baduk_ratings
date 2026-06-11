import { Newspaper } from 'lucide-react';
import { useMemo } from 'react';
import { formatDate, localizedText, newsKindLabel } from '../lib/format';
import type { Language, Translation } from '../lib/i18n';
import type { NewsItem } from '../types';

export function NewsPanel({
  t,
  language,
  query,
  news,
}: {
  t: Translation;
  language: Language;
  query: string;
  news: NewsItem[];
}) {
  const visibleNews = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return news
      .filter((item) => {
        if (!needle) {
          return true;
        }
        const translatedTitle = localizedText(item.localized_title, item.title, language);
        const translatedSummary = localizedText(item.localized_summary, item.summary, language);
        return `${translatedTitle} ${translatedSummary} ${item.title} ${item.summary}`.toLocaleLowerCase().includes(needle);
      })
      .slice(0, 6);
  }, [language, news, query]);

  return (
    <div className="panel news-panel" id="news">
      <div className="panel-title-row">
        <h2>
          <Newspaper size={18} />
          {t.news}
        </h2>
        <span>{t.sources}</span>
      </div>

      <div className="news-list">
        {visibleNews.map((item) => {
          const title = localizedText(item.localized_title, item.title, language);
          return (
            <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="news-row">
              <span>{formatDate(item.date, language)}</span>
              <strong>{title}</strong>
              <small>
                {item.source} · {newsKindLabel(item, t)}
              </small>
            </a>
          );
        })}
      </div>
    </div>
  );
}
