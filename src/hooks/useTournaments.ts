import { useEffect, useRef, useState } from 'react';
import type { Tournament, TournamentsFile } from '../types';

const BASE = import.meta.env.BASE_URL;

export type TournamentsStatus = 'loading' | 'ready' | 'absent';

export type TournamentsState = {
  status: TournamentsStatus;
  tournaments: Tournament[];
  curationNote: string;
};

let cached: TournamentsState | null = null;

function isTournamentsFile(payload: unknown): payload is TournamentsFile {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as TournamentsFile).tournaments)
  );
}

/**
 * Lazily fetches the curated major-tournament registry. The file is optional:
 * a missing or invalid file resolves to `absent` (callers hide the feature).
 */
export function useTournaments(): TournamentsState {
  const [state, setState] = useState<TournamentsState>(
    cached ?? { status: 'loading', tournaments: [], curationNote: '' },
  );
  const requestedRef = useRef(false);

  useEffect(() => {
    if (cached || requestedRef.current) {
      return;
    }
    requestedRef.current = true;
    let cancelled = false;

    const settle = (next: TournamentsState) => {
      cached = next;
      if (!cancelled) {
        setState(next);
      }
    };

    fetch(`${BASE}data/tournaments.json`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`tournaments.json ${response.status}`);
        }
        const payload: unknown = await response.json();
        if (!isTournamentsFile(payload) || !payload.tournaments.length) {
          throw new Error('tournaments.json invalid or empty');
        }
        settle({
          status: 'ready',
          tournaments: payload.tournaments,
          curationNote: payload.curation_note ?? '',
        });
      })
      .catch(() => {
        // Registry is optional: absence hides tournament features gracefully.
        settle({ status: 'absent', tournaments: [], curationNote: '' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
