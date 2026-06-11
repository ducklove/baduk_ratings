import { Rss, Users } from 'lucide-react';
import { regionLabel, sourceStatusLabel } from '../lib/format';
import type { Translation } from '../lib/i18n';
import type { SourceHubItem, SourceStatusItem } from '../types';
import { RegionBadge } from './RegionBadge';

export function SourceHubPanel({
  t,
  sources,
  sourceStatuses,
}: {
  t: Translation;
  sources: SourceHubItem[];
  sourceStatuses: SourceStatusItem[];
}) {
  return (
    <div className="panel source-panel">
      <div className="panel-title-row">
        <h2>
          <Users size={18} />
          {t.sourceHub}
        </h2>
        <a className="rss-link" href={`${import.meta.env.BASE_URL}feed.xml`} target="_blank" rel="noreferrer">
          <Rss size={14} aria-hidden="true" />
          {t.rssFeed}
        </a>
      </div>

      <div className="source-list">
        {sources.map((source) => {
          const status = sourceStatuses.find(
            (item) => item.source_name === source.name || item.source_url === source.url,
          );
          return (
            <a key={`${source.region}-${source.name}`} href={source.url} target="_blank" rel="noreferrer">
              <RegionBadge region={source.region} label={regionLabel(source.region, t)} compact />
              <strong>{source.name}</strong>
              <small>
                {source.note}
                {status ? ` · ${t.sourceStatus}: ${sourceStatusLabel(status.status, t)} (${status.item_count})` : ''}
              </small>
            </a>
          );
        })}
      </div>
    </div>
  );
}
