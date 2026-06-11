import { Globe2, Search, X } from 'lucide-react';
import { languages, type Language, type Translation } from '../lib/i18n';

export function TopBar({
  t,
  language,
  onLanguageChange,
  query,
  onQueryChange,
}: {
  t: Translation;
  language: Language;
  onLanguageChange: (language: Language) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <header className="topbar">
      <a className="brand" href="#ratings" aria-label="Baduk-R home">
        Baduk-R
      </a>

      <nav className="topnav" aria-label="Primary">
        <a href="#ratings">{t.ratings}</a>
        <a href="#profile">{t.players}</a>
        <a href="#schedule">{t.events}</a>
        <a href="#news">{t.news}</a>
        <a href="#predictor">{t.compare}</a>
        <a href="#methodology">{t.methodology}</a>
      </nav>

      <div className="top-actions">
        <label className="searchbox">
          <Search size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t.search} />
          {query ? (
            <button type="button" onClick={() => onQueryChange('')} aria-label="Clear search">
              <X size={15} />
            </button>
          ) : null}
        </label>

        <label className="language-select">
          <Globe2 size={17} aria-hidden="true" />
          <select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}>
            {languages.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
