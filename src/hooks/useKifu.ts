import { useCallback, useEffect, useRef, useState } from 'react';
import type { KifuGameFile, KifuIndexEntry, KifuIndexFile } from '../types';

const BASE = import.meta.env.BASE_URL;

export type KifuStatus = 'loading' | 'ready' | 'absent';

let cachedIndex: { status: KifuStatus; entries: KifuIndexEntry[] } | null = null;
const gameCache = new Map<string, KifuGameFile>();

function isKifuIndex(payload: unknown): payload is KifuIndexFile {
  return (
    typeof payload === 'object' && payload !== null && Array.isArray((payload as KifuIndexFile).games)
  );
}

function isKifuGame(payload: unknown): payload is KifuGameFile {
  return (
    typeof payload === 'object' && payload !== null && Array.isArray((payload as KifuGameFile).moves)
  );
}

/**
 * Lazily fetches the kifu (game record) index once, then individual game
 * files on demand. Both layers are optional: a missing index resolves to
 * `absent` and callers show a neutral empty state.
 */
export function useKifu() {
  const [indexState, setIndexState] = useState<{ status: KifuStatus; entries: KifuIndexEntry[] }>(
    cachedIndex ?? { status: 'loading', entries: [] },
  );
  const [games, setGames] = useState<Record<string, KifuGameFile>>(() =>
    Object.fromEntries(gameCache),
  );
  const requestedIndexRef = useRef(false);
  const pendingGamesRef = useRef(new Set<string>());

  useEffect(() => {
    if (cachedIndex || requestedIndexRef.current) {
      return;
    }
    requestedIndexRef.current = true;
    let cancelled = false;

    const settle = (next: { status: KifuStatus; entries: KifuIndexEntry[] }) => {
      cachedIndex = next;
      if (!cancelled) {
        setIndexState(next);
      }
    };

    fetch(`${BASE}data/kifu/index.json`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`kifu index ${response.status}`);
        }
        const payload: unknown = await response.json();
        if (!isKifuIndex(payload)) {
          throw new Error('kifu index invalid');
        }
        settle({ status: 'ready', entries: payload.games });
      })
      .catch(() => {
        // Kifu data is optional and may legitimately stay empty.
        settle({ status: 'absent', entries: [] });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const getGame = useCallback(
    (key: string | null | undefined): KifuGameFile | undefined => {
      if (!key) {
        return undefined;
      }
      return games[key] ?? gameCache.get(key);
    },
    [games],
  );

  const requestGame = useCallback((entry: KifuIndexEntry | null | undefined) => {
    if (!entry || gameCache.has(entry.key) || pendingGamesRef.current.has(entry.key)) {
      return;
    }
    pendingGamesRef.current.add(entry.key);

    const file = (entry.file ?? '').replace(/^\/+/, '');
    fetch(`${BASE}${file}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`kifu game ${response.status}`);
        }
        const payload: unknown = await response.json();
        if (isKifuGame(payload)) {
          gameCache.set(entry.key, payload);
          setGames((previous) =>
            previous[entry.key] ? previous : { ...previous, [entry.key]: payload },
          );
        }
      })
      .catch(() => {
        // Individual game files are optional; the row keeps its source link.
      });
  }, []);

  return { status: indexState.status, entries: indexState.entries, getGame, requestGame };
}
