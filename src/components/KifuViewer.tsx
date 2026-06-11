import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatFullDate, termsStatusLabel } from '../lib/format';
import { columnLabel, lastStonePlacement, positionAtMove, starPoints } from '../lib/goban';
import type { Language, Translation } from '../lib/i18n';
import { getPlayerDisplayName } from '../lib/rating';
import type { KifuGameFile, KifuIndexEntry, KifuPlayerRef, Player } from '../types';

const CELL = 22;
const MARGIN = 26;

function PlayerName({
  reference,
  players,
  nameKey,
}: {
  reference: KifuPlayerRef;
  players: Player[];
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
}) {
  const player = reference.player_id
    ? players.find((item) => item.id === reference.player_id)
    : undefined;
  const name = player ? getPlayerDisplayName(player, nameKey) : reference.name;

  if (reference.player_id) {
    return <a href={`#/player/${encodeURIComponent(reference.player_id)}`}>{name}</a>;
  }
  return <span>{name}</span>;
}

function GobanSvg({ game, moveNumber, t }: { game: KifuGameFile; moveNumber: number; t: Translation }) {
  const size = Number.isInteger(game.size) && game.size >= 2 && game.size <= 25 ? game.size : 19;
  const span = CELL * (size - 1);
  const total = MARGIN * 2 + span;

  const board = useMemo(
    () => positionAtMove(size, game.setup, game.moves, moveNumber),
    [game.moves, game.setup, moveNumber, size],
  );
  const lastStone = useMemo(() => {
    const placement = lastStonePlacement(game.moves, moveNumber);
    if (!placement || board[placement.y]?.[placement.x] !== placement.c) {
      return null;
    }
    return placement;
  }, [board, game.moves, moveNumber]);

  const px = (x: number) => MARGIN + x * CELL;
  const py = (y: number) => MARGIN + y * CELL;

  const stones: Array<{ x: number; y: number; c: 'b' | 'w' }> = [];
  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) {
        stones.push({ x, y, c: cell });
      }
    });
  });

  return (
    <svg
      className="goban"
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={`${t.moveWord} ${moveNumber}`}
    >
      <rect x={0} y={0} width={total} height={total} rx={8} className="goban-wood" />
      {Array.from({ length: size }, (_, index) => (
        <g key={index}>
          <line className="goban-line" x1={px(0)} y1={py(index)} x2={px(size - 1)} y2={py(index)} />
          <line className="goban-line" x1={px(index)} y1={py(0)} x2={px(index)} y2={py(size - 1)} />
        </g>
      ))}
      {starPoints(size).map(([x, y]) => (
        <circle key={`star-${x}-${y}`} className="goban-star" cx={px(x)} cy={py(y)} r={2.6} />
      ))}
      {Array.from({ length: size }, (_, index) => (
        <g key={`coord-${index}`} className="goban-coord">
          <text x={px(index)} y={MARGIN - 11} textAnchor="middle">
            {columnLabel(index)}
          </text>
          <text x={MARGIN - 11} y={py(index) + 3} textAnchor="end">
            {size - index}
          </text>
        </g>
      ))}
      {stones.map((stone) => (
        <circle
          key={`${stone.x}-${stone.y}`}
          className={stone.c === 'b' ? 'goban-stone-black' : 'goban-stone-white'}
          cx={px(stone.x)}
          cy={py(stone.y)}
          r={CELL * 0.47}
        />
      ))}
      {lastStone ? (
        <circle
          className={lastStone.c === 'b' ? 'goban-marker-on-black' : 'goban-marker-on-white'}
          cx={px(lastStone.x)}
          cy={py(lastStone.y)}
          r={CELL * 0.26}
        />
      ) : null}
    </svg>
  );
}

export function KifuViewer({
  t,
  language,
  entry,
  game,
  players,
  nameKey,
  onClose,
}: {
  t: Translation;
  language: Language;
  entry: KifuIndexEntry;
  game: KifuGameFile | undefined;
  players: Player[];
  nameKey: 'en' | 'ko' | 'ja' | 'zh';
  onClose?: () => void;
}) {
  const total = game?.moves?.length ?? 0;
  const [requested, setRequested] = useState<number | null>(null);
  const current = requested === null ? total : Math.max(0, Math.min(requested, total));

  const black = game?.black ?? entry.black;
  const white = game?.white ?? entry.white;
  const result = game?.result ?? entry.result;
  const date = game?.date ?? entry.date;
  const eventName = game?.event ?? entry.event;
  const sourceName = game?.source_name ?? entry.source_name;
  const sourceUrl = game?.source_url ?? entry.source_url;
  const termsStatus = game?.terms_status ?? entry.terms_status;
  const currentIsPass = Boolean(game && current > 0 && game.moves[current - 1]?.pass);

  return (
    <div className="kifu-viewer">
      <div className="kifu-viewer-header">
        <div className="kifu-players">
          <span className="kifu-color-dot kifu-color-black" aria-hidden="true" />
          <strong>
            <PlayerName reference={black} players={players} nameKey={nameKey} />
          </strong>
          <span className="kifu-vs">vs</span>
          <span className="kifu-color-dot kifu-color-white" aria-hidden="true" />
          <strong>
            <PlayerName reference={white} players={players} nameKey={nameKey} />
          </strong>
        </div>
        {onClose ? (
          <button type="button" className="kifu-close" onClick={onClose} aria-label={t.closeViewer}>
            <X size={15} />
          </button>
        ) : null}
      </div>

      <div className="kifu-meta">
        <span>
          {t.resultLabel}: <strong>{result}</strong>
        </span>
        <span>{formatFullDate(date, language)}</span>
        {eventName ? <span>{eventName}</span> : null}
        {game?.komi ? (
          <span>
            {t.komi}: {game.komi}
          </span>
        ) : null}
      </div>

      {game ? (
        <>
          <GobanSvg game={game} moveNumber={current} t={t} />

          <div className="kifu-controls">
            <button
              type="button"
              onClick={() => setRequested(0)}
              disabled={current <= 0}
              aria-label={t.firstMoveAria}
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setRequested(current - 1)}
              disabled={current <= 0}
              aria-label={t.prevMoveAria}
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="range"
              min={0}
              max={total}
              value={current}
              aria-label={t.moveSliderAria}
              onChange={(event) => setRequested(Number(event.target.value))}
            />
            <button
              type="button"
              onClick={() => setRequested(current + 1)}
              disabled={current >= total}
              aria-label={t.nextMoveAria}
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => setRequested(null)}
              disabled={current >= total}
              aria-label={t.lastMoveAria}
            >
              <ChevronsRight size={16} />
            </button>
          </div>
          <div className="kifu-counter">
            {t.moveWord} {current} / {total}
            {currentIsPass ? ` · ${t.passMove}` : ''}
          </div>
        </>
      ) : (
        <div className="kifu-loading muted">{t.loadingText}</div>
      )}

      <div className="kifu-footer">
        <a href={sourceUrl} target="_blank" rel="noreferrer">
          {t.sourceLabel}: {sourceName} ({termsStatusLabel(termsStatus, t)})
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
