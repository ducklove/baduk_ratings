import { Database } from 'lucide-react';
import type { Translation } from '../lib/i18n';

export function DataApiPanel({ t, examplePlayerId }: { t: Translation; examplePlayerId: string }) {
  const base = import.meta.env.BASE_URL;

  const endpoints: Array<{ path: string; href: string; descriptionKey: keyof Translation }> = [
    { path: 'data/baduk-data.json', href: `${base}data/baduk-data.json`, descriptionKey: 'apiFullDataset' },
    { path: 'data/baduk-data-core.json', href: `${base}data/baduk-data-core.json`, descriptionKey: 'apiCoreDataset' },
    {
      path: 'data/players/{id}.json',
      href: `${base}data/players/${encodeURIComponent(examplePlayerId)}.json`,
      descriptionKey: 'apiPlayerDetail',
    },
    { path: 'data/ratings/own_latest.json', href: `${base}data/ratings/own_latest.json`, descriptionKey: 'apiOwnLatest' },
    {
      path: 'data/ratings/external_latest.json',
      href: `${base}data/ratings/external_latest.json`,
      descriptionKey: 'apiExternalLatest',
    },
    {
      path: 'data/ratings/comparison_latest.json',
      href: `${base}data/ratings/comparison_latest.json`,
      descriptionKey: 'apiComparisonLatest',
    },
    {
      path: 'data/ratings/source_status.json',
      href: `${base}data/ratings/source_status.json`,
      descriptionKey: 'apiSourceStatus',
    },
    {
      path: 'data/ratings/own_history.json',
      href: `${base}data/ratings/own_history.json`,
      descriptionKey: 'apiOwnHistory',
    },
    { path: 'feed.xml', href: `${base}feed.xml`, descriptionKey: 'apiRssFeed' },
  ];

  return (
    <section className="panel data-api-panel" id="data-api">
      <div className="panel-title-row">
        <h2>
          <Database size={18} />
          {t.dataApi}
        </h2>
      </div>
      <p className="data-api-intro">{t.dataApiIntro}</p>
      <ul className="data-api-list">
        {endpoints.map((endpoint) => (
          <li key={endpoint.path}>
            <a href={endpoint.href} target="_blank" rel="noreferrer">
              <code>{endpoint.path}</code>
            </a>
            <small>{t[endpoint.descriptionKey]}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
