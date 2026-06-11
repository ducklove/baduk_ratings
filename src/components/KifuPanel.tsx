import { FileText } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '../lib/format';
import type { Language, Translation } from '../lib/i18n';
import { getPlayerDisplayName } from '../lib/rating';
import type { KifuGameFile, KifuIndexEntry, KifuPlayerRef, Player } from '../types';
import { KifuViewer } from './KifuViewer';

function refName(reference: KifuPlayerRef, players: Player[], nameKey: 'en' | 'ko' | 'ja' | 'zh') {
  const player = reference.player_id
    ? players.find((item) => item.id === reference.player_id)
    : undefined;
  return player ? getPlayerDisplayName(player, nameKey) : reference.name;
}

/**
 * Shared game-record list with an inline expandable viewer; used by the
 * dashboard kifu panel and the tournament page.
 */
export function KifuGameList({
  t,
  language,
  nameKey,
  entries,
  players,
  getGame,
  requestGame,
}: {
  t: Translation;
  language: Language;
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
  entries: KifuIndexEntry[];
  players: Player[];
  getGame: (key: string | null | undefined) => KifuGameFile | undefined;
  requestGame: (entry: KifuIndexEntry | null | undefined) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggle = (entry: KifuIndexEntry) => {
    if (openKey === entry.key) {
      setOpenKey(null);
      return;
    }
    requestGame(entry);
    setOpenKey(entry.key);
  };

  return (
    <div className="kifu-list">
      {entries.map((entry) => (
        <div key={entry.key} className="kifu-item">
          <button
            type="button"
            className={openKey === entry.key ? 'kifu-row kifu-row-open' : 'kifu-row'}
            onClick={() => toggle(entry)}
            aria-expanded={openKey === entry.key}
            aria-label={`${t.viewKifu}: ${refName(entry.black, players, nameKey)} vs ${refName(entry.white, players, nameKey)}`}
          >
            <span className="kifu-row-date">{formatDate(entry.date, language)}</span>
            <span className="kifu-row-main">
              <strong>
                {refName(entry.black, players, nameKey)} vs {refName(entry.white, players, nameKey)}
              </strong>
              <small>
                {entry.result} · {entry.move_count} {t.movesUnit}
                {entry.event ? ` · ${entry.event}` : ''}
              </small>
            </span>
          </button>
          {openKey === entry.key ? (
            <KifuViewer
              t={t}
              language={language}
              entry={entry}
              game={getGame(entry.key)}
              players={players}
              nameKey={nameKey}
              onClose={() => setOpenKey(null)}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function KifuPanel({
  t,
  language,
  nameKey,
  entries,
  players,
  getGame,
  requestGame,
}: {
  t: Translation;
  language: Language;
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
  entries: KifuIndexEntry[];
  players: Player[];
  getGame: (key: string | null | undefined) => KifuGameFile | undefined;
  requestGame: (entry: KifuIndexEntry | null | undefined) => void;
}) {
  return (
    <div className="panel kifu-panel" id="kifu">
      <div className="panel-title-row">
        <h2>
          <FileText size={18} />
          {t.kifuPanelTitle}
        </h2>
        <span>{t.sources}</span>
      </div>

      {entries.length ? (
        <KifuGameList
          t={t}
          language={language}
          nameKey={nameKey}
          entries={entries.slice(0, 24)}
          players={players}
          getGame={getGame}
          requestGame={requestGame}
        />
      ) : (
        <div className="empty-state">{t.kifuEmpty}</div>
      )}
    </div>
  );
}
