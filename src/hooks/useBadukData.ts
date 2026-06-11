import { useCallback, useEffect, useRef, useState } from 'react';
import type { OwnHistoryFile, OwnHistoryPoint, PlayerDetail, RatingData } from '../types';

const BASE = import.meta.env.BASE_URL;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Data request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function isRatingData(payload: unknown): payload is RatingData {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as RatingData).players) &&
    (payload as RatingData).players.length > 0
  );
}

/**
 * Loads the dataset: tries the lightweight core file first and falls back to
 * the full bundle when the core file is missing (e.g. older deployments).
 */
export function useBadukData() {
  const [data, setData] = useState<RatingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let payload: RatingData;
      try {
        payload = await fetchJson<RatingData>(`${BASE}data/baduk-data-core.json`);
        if (!isRatingData(payload)) {
          throw new Error('Invalid core dataset');
        }
      } catch {
        payload = await fetchJson<RatingData>(`${BASE}data/baduk-data.json`);
      }

      if (!isRatingData(payload)) {
        throw new Error('Invalid dataset');
      }

      if (!cancelled) {
        setData({ ...payload, playerDetails: payload.playerDetails ?? {} });
      }
    };

    load().catch((fetchError: unknown) => {
      if (!cancelled) {
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load data');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}

/**
 * Resolves player details: embedded details in the dataset take precedence,
 * otherwise details are lazily fetched from data/players/{id}.json and cached.
 */
export function usePlayerDetails(data: RatingData | null) {
  const [fetched, setFetched] = useState<Record<string, PlayerDetail>>({});
  const pendingRef = useRef(new Set<string>());

  const getDetail = useCallback(
    (id: string | null | undefined): PlayerDetail | undefined => {
      if (!id) {
        return undefined;
      }
      return data?.playerDetails?.[id] ?? fetched[id];
    },
    [data, fetched],
  );

  const requestDetail = useCallback(
    (id: string | null | undefined) => {
      if (!id || !data || data.playerDetails?.[id] || pendingRef.current.has(id)) {
        return;
      }

      pendingRef.current.add(id);
      fetchJson<PlayerDetail>(`${BASE}data/players/${encodeURIComponent(id)}.json`)
        .then((detail) => {
          if (detail && typeof detail === 'object') {
            setFetched((previous) => (previous[id] ? previous : { ...previous, [id]: detail }));
          }
        })
        .catch(() => {
          // Detail file is optional; keep the id marked as attempted.
        });
    },
    [data],
  );

  return { getDetail, requestDetail };
}

/**
 * Lazily fetches the Baduk-R own-rating history once. Missing or invalid
 * files are treated as absent (returns null).
 */
export function useOwnHistory(enabled: boolean) {
  const [histories, setHistories] = useState<Record<string, OwnHistoryPoint[]> | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!enabled || requestedRef.current) {
      return;
    }
    requestedRef.current = true;

    fetchJson<OwnHistoryFile>(`${BASE}data/ratings/own_history.json`)
      .then((payload) => {
        if (payload && typeof payload === 'object' && payload.players && typeof payload.players === 'object') {
          setHistories(payload.players);
        }
      })
      .catch(() => {
        // History file is optional; treat as absent.
      });
  }, [enabled]);

  return histories;
}
