import { useEffect, useRef } from 'react';
import type { RankingMode } from '../lib/rating';
import type { CountryCode, RatingMetric } from '../types';

export type HashFilters = {
  country: CountryCode | 'all';
  mode: RankingMode;
  metric: RatingMetric;
  query: string;
};

export type HashInit = {
  playerId: string | null;
  tournamentId: string | null;
  filters: Partial<HashFilters>;
};

const COUNTRIES: ReadonlyArray<HashFilters['country']> = ['all', 'kr', 'cn', 'jp', 'tw'];
const MODES: ReadonlyArray<RankingMode> = ['overall', 'women', 'rising'];
const METRICS: ReadonlyArray<RatingMetric> = ['own', 'goratings', 'chinese_qiyuan', 'korean_baduk'];

const PLAYER_HASH = /^#\/player\/([^?&]+)/;
const TOURNAMENT_HASH = /^#\/tournament\/([^?&]+)/;

export function parsePlayerHash(hash: string): string | null {
  const match = PLAYER_HASH.exec(hash);
  return match ? decodeURIComponent(match[1]) : null;
}

export function parseTournamentHash(hash: string): string | null {
  const match = TOURNAMENT_HASH.exec(hash);
  return match ? decodeURIComponent(match[1]) : null;
}

export function tournamentHash(tournamentId: string) {
  return `#/tournament/${encodeURIComponent(tournamentId)}`;
}

export function readHash(): HashInit {
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const playerId = parsePlayerHash(hash);
  const tournamentId = parseTournamentHash(hash);
  const filters: Partial<HashFilters> = {};

  const queryStart = hash.indexOf('?');
  if (queryStart >= 0) {
    const params = new URLSearchParams(hash.slice(queryStart + 1));

    const country = params.get('country');
    if (country && (COUNTRIES as readonly string[]).includes(country)) {
      filters.country = country as HashFilters['country'];
    }

    const mode = params.get('mode');
    if (mode && (MODES as readonly string[]).includes(mode)) {
      filters.mode = mode as RankingMode;
    }

    const metric = params.get('metric');
    if (metric && (METRICS as readonly string[]).includes(metric)) {
      filters.metric = metric as RatingMetric;
    }

    const query = params.get('q');
    if (query) {
      filters.query = query;
    }
  }

  return { playerId, tournamentId, filters };
}

export function encodeFiltersHash(filters: HashFilters) {
  const params = new URLSearchParams();
  if (filters.country !== 'all') {
    params.set('country', filters.country);
  }
  if (filters.mode !== 'overall') {
    params.set('mode', filters.mode);
  }
  if (filters.metric !== 'own') {
    params.set('metric', filters.metric);
  }
  if (filters.query.trim()) {
    params.set('q', filters.query.trim());
  }

  const encoded = params.toString();
  return encoded ? `#ratings?${encoded}` : '#ratings';
}

function replaceHash(hash: string) {
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}${hash}`);
}

export function writePlayerHash(playerId: string) {
  replaceHash(`#/player/${encodeURIComponent(playerId)}`);
}

/**
 * Mirrors the ranking filters into the URL hash (via replaceState, so no
 * history spam) once the user changes any of them.
 */
export function useFiltersInHash(filters: HashFilters) {
  const lastEncodedRef = useRef<string | null>(null);

  useEffect(() => {
    const encoded = encodeFiltersHash(filters);

    if (lastEncodedRef.current === null) {
      // Skip the initial render so in-page anchors and player deep links survive load.
      lastEncodedRef.current = encoded;
      return;
    }
    if (lastEncodedRef.current === encoded) {
      return;
    }

    lastEncodedRef.current = encoded;
    if (parseTournamentHash(window.location.hash)) {
      // Keep tournament deep links intact while the tournament page is open.
      return;
    }
    replaceHash(encoded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.country, filters.mode, filters.metric, filters.query]);
}

/**
 * Reacts to #/player/{id} deep links typed or clicked after load.
 */
export function usePlayerHashListener(onPlayer: (playerId: string) => void) {
  const handlerRef = useRef(onPlayer);
  handlerRef.current = onPlayer;

  useEffect(() => {
    const onHashChange = () => {
      const playerId = parsePlayerHash(window.location.hash);
      if (playerId) {
        handlerRef.current(playerId);
      }
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
}

/**
 * Reacts to every hash change with the current #/tournament/{id} value
 * (or null when the hash points elsewhere), so browser back/forward
 * naturally enters and leaves the tournament page.
 */
export function useTournamentHashListener(onChange: (tournamentId: string | null) => void) {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    const onHashChange = () => {
      handlerRef.current(parseTournamentHash(window.location.hash));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
}

export function scrollToProfile() {
  document.getElementById('profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
