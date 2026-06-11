import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { USER_AGENT, readPositiveIntEnv, sourceUrls } from './config.mjs';
import { sourceStatus } from './comparisons.mjs';
import { fetchTextResponseWithTimeout, withConcurrency } from './http.mjs';
import { buildPlayerNameIndex, matchPlayerByName } from './text.mjs';

export const KIFU_MIN_MOVES = 30;
const KIFU_TOP_PLAYERS = readPositiveIntEnv('KIFU_TOP_PLAYERS', 30);
const KIFU_MAX_GAMES = readPositiveIntEnv('KIFU_MAX_GAMES', 24);
const KIFU_FETCH_TIMEOUT_MS = readPositiveIntEnv('KIFU_FETCH_TIMEOUT_MS', 10000);
const KIFU_CONCURRENCY = readPositiveIntEnv('KIFU_CONCURRENCY', 4);
// Hard wall-clock budget for the whole kifu stage, mirroring the OpenRouter
// translation budget: a slow upstream can never stall the snapshot build.
const KIFU_BUDGET_MS = readPositiveIntEnv('KIFU_BUDGET_MS', 120000);

const KIFU_SOURCE_NOTE =
  'Game records fetched from linked public viewer pages; terms_status unknown; original source linked per game.';

const SGF_LETTERS = 'abcdefghijklmnopqrs';

function jsonOut(value) {
  return `${JSON.stringify(value)}\n`;
}

export function kifuKeyFromUrl(url) {
  const withoutQuery = String(url ?? '').split(/[?#]/)[0];
  const segment = withoutQuery.split('/').filter(Boolean).pop() ?? '';
  const sanitized = segment.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sanitized) {
    return null;
  }
  return /^\d/.test(sanitized) ? `g${sanitized}` : sanitized;
}

export function kifuSourceName(url) {
  if (/go4go\.net/i.test(String(url ?? ''))) {
    return 'Go4Go';
  }
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

// Finds the longest balanced "(;...)" game-tree block whose content looks like
// a go game (GM[1] or SZ[19]). Property values in brackets are skipped so that
// parentheses inside comments never unbalance the scan.
export function extractSgf(body) {
  const text = String(body ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"');
  const trimmed = text.trim();
  if (trimmed.startsWith('(;')) {
    return trimmed;
  }

  let best = null;
  for (let start = text.indexOf('(;'); start !== -1; start = text.indexOf('(;', start + 1)) {
    let depth = 0;
    let inValue = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inValue) {
        if (ch === '\\') {
          i += 1;
        } else if (ch === ']') {
          inValue = false;
        }
        continue;
      }
      if (ch === '[') {
        inValue = true;
      } else if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          const block = text.slice(start, i + 1);
          if (/GM\[1\]|SZ\[19\]/.test(block) && (!best || block.length > best.length)) {
            best = block;
          }
          break;
        }
      }
    }
  }

  return best;
}

function parseMainLineNodes(sgf) {
  let pos = 0;

  function skipWhitespace() {
    while (pos < sgf.length && /\s/.test(sgf[pos])) {
      pos += 1;
    }
  }

  function parseValue() {
    pos += 1; // consume '['
    let out = '';
    while (pos < sgf.length) {
      const ch = sgf[pos];
      if (ch === '\\') {
        out += sgf[pos + 1] ?? '';
        pos += 2;
        continue;
      }
      if (ch === ']') {
        pos += 1;
        return out;
      }
      out += ch;
      pos += 1;
    }
    throw new Error('unterminated SGF property value');
  }

  function parseNode() {
    pos += 1; // consume ';'
    const props = [];
    while (pos < sgf.length) {
      skipWhitespace();
      const identMatch = /^[A-Za-z]+/.exec(sgf.slice(pos, pos + 16));
      if (!identMatch) {
        break;
      }
      pos += identMatch[0].length;
      skipWhitespace();
      if (sgf[pos] !== '[') {
        throw new Error(`SGF property ${identMatch[0]} has no value`);
      }
      const values = [];
      while (sgf[pos] === '[') {
        values.push(parseValue());
        skipWhitespace();
      }
      props.push({ ident: identMatch[0].replace(/[a-z]/g, ''), values });
    }
    return props;
  }

  function skipSubtree() {
    let depth = 0;
    while (pos < sgf.length) {
      const ch = sgf[pos];
      if (ch === '[') {
        parseValue();
        continue;
      }
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          pos += 1;
          return;
        }
      }
      pos += 1;
    }
    throw new Error('unterminated SGF variation');
  }

  function parseSequence(nodes) {
    while (pos < sgf.length) {
      skipWhitespace();
      const ch = sgf[pos];
      if (ch === ';') {
        nodes.push(parseNode());
      } else if (ch === '(') {
        // First variation is the main line; remaining siblings are skipped.
        pos += 1;
        parseSequence(nodes);
        skipWhitespace();
        while (sgf[pos] === '(') {
          skipSubtree();
          skipWhitespace();
        }
      } else if (ch === ')') {
        pos += 1;
        return;
      } else {
        throw new Error(`unexpected SGF character '${ch}' at ${pos}`);
      }
    }
    throw new Error('unterminated SGF game tree');
  }

  skipWhitespace();
  if (sgf[pos] !== '(') {
    throw new Error('SGF must start with a game tree');
  }
  pos += 1;
  const nodes = [];
  parseSequence(nodes);
  return nodes;
}

function pointFromValue(value, size) {
  const x = SGF_LETTERS.indexOf(value[0]);
  const y = SGF_LETTERS.indexOf(value[1]);
  if (value.length !== 2 || x < 0 || y < 0 || x >= size || y >= size) {
    throw new Error(`SGF move out of range: ${value}`);
  }
  return { x, y };
}

export function parseSgf(text) {
  const sgf = String(text ?? '').trim();
  if (!sgf.startsWith('(;')) {
    throw new Error('not an SGF game tree');
  }

  const nodes = parseMainLineNodes(sgf);
  if (!nodes.length) {
    throw new Error('SGF has no nodes');
  }

  const rootValue = (ident) =>
    nodes[0].find((prop) => prop.ident === ident)?.values[0]?.trim() || null;

  const gm = rootValue('GM');
  if (gm && gm !== '1') {
    throw new Error(`not a go game record (GM[${gm}])`);
  }

  const size = Number(rootValue('SZ')) || 19;
  const moves = [];
  const setup = [];

  for (const node of nodes) {
    for (const prop of node) {
      if (prop.ident === 'B' || prop.ident === 'W') {
        const color = prop.ident === 'B' ? 'b' : 'w';
        const value = prop.values[0].trim();
        if (value === '' || (value === 'tt' && size <= 19)) {
          moves.push({ pass: true });
        } else {
          moves.push({ c: color, ...pointFromValue(value, size) });
        }
      } else if (prop.ident === 'AB' || prop.ident === 'AW') {
        const color = prop.ident === 'AB' ? 'b' : 'w';
        for (const value of prop.values) {
          setup.push({ c: color, ...pointFromValue(value.trim(), size) });
        }
      }
    }
  }

  const komiValue = Number.parseFloat(rootValue('KM') ?? '');
  const handicapValue = Number.parseInt(rootValue('HA') ?? '', 10);

  return {
    size,
    black: rootValue('PB'),
    white: rootValue('PW'),
    result: rootValue('RE'),
    date: rootValue('DT'),
    event: rootValue('EV'),
    komi: Number.isFinite(komiValue) ? komiValue : null,
    moves,
    setup,
    handicap: setup.length > 0 || (Number.isFinite(handicapValue) && handicapValue > 0),
  };
}

// Defensive extraction + parse used per fetched candidate. Returns null on any
// failure; kifu absence is a first-class outcome and must never be fabricated.
export function parseKifuFromBody(body) {
  try {
    const sgf = extractSgf(body);
    if (!sgf) {
      return null;
    }
    const parsed = parseSgf(sgf);
    if (parsed.moves.length < KIFU_MIN_MOVES) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function selectKifuCandidates(ownRatings, playerDetails, {
  topPlayers = KIFU_TOP_PLAYERS,
  maxGames = KIFU_MAX_GAMES,
} = {}) {
  const topIds = [...(ownRatings ?? [])]
    .sort((left, right) => (right.own_rating ?? 0) - (left.own_rating ?? 0))
    .slice(0, topPlayers)
    .map((row) => row.player_id);

  const byUrl = new Map();
  for (const playerId of topIds) {
    const detail = playerDetails?.[playerId];
    for (const game of detail?.recentGames ?? []) {
      if (!game.kifuUrl || byUrl.has(game.kifuUrl)) {
        continue;
      }
      byUrl.set(game.kifuUrl, {
        kifuUrl: game.kifuUrl,
        date: game.date,
        ownerId: playerId,
        opponentId: game.opponentId ?? null,
        opponentName: game.opponentName ?? null,
        color: game.color,
      });
    }
  }

  return [...byUrl.values()]
    .sort((left, right) => {
      if (left.date !== right.date) {
        return String(right.date).localeCompare(String(left.date));
      }
      return String(left.kifuUrl).localeCompare(String(right.kifuUrl));
    })
    .slice(0, maxGames);
}

function resolveSide({ name, knownId, playerById, playerNameIndex }) {
  if (knownId && playerById.has(knownId)) {
    return { name, player_id: knownId };
  }
  return { name, player_id: matchPlayerByName(name ?? '', playerNameIndex)?.id ?? null };
}

export function buildKifuRecord(candidate, parsed, { playerById, playerNameIndex }) {
  const key = kifuKeyFromUrl(candidate.kifuUrl);
  if (!key) {
    return null;
  }

  const owner = playerById.get(candidate.ownerId);
  const ownerName = owner?.names?.en || owner?.name || null;
  const blackIsOwner = candidate.color === 'black';

  const black = resolveSide({
    name: parsed.black || (blackIsOwner ? ownerName : candidate.opponentName),
    knownId: blackIsOwner ? candidate.ownerId : candidate.opponentId,
    playerById,
    playerNameIndex,
  });
  const white = resolveSide({
    name: parsed.white || (blackIsOwner ? candidate.opponentName : ownerName),
    knownId: blackIsOwner ? candidate.opponentId : candidate.ownerId,
    playerById,
    playerNameIndex,
  });

  return {
    key,
    size: parsed.size,
    black,
    white,
    result: parsed.result,
    date: parsed.date ?? candidate.date ?? null,
    event: parsed.event,
    komi: parsed.komi,
    moves: parsed.moves,
    setup: parsed.setup,
    handicap: parsed.handicap,
    source_name: kifuSourceName(candidate.kifuUrl),
    source_url: candidate.kifuUrl,
    terms_status: 'unknown',
  };
}

export function buildKifuIndex(records, generatedAt) {
  return {
    schema_version: 1,
    generated_at: generatedAt,
    source_note: KIFU_SOURCE_NOTE,
    games: records.map((record) => ({
      key: record.key,
      date: record.date,
      black: record.black,
      white: record.white,
      result: record.result,
      event: record.event,
      move_count: record.moves.length,
      source_name: record.source_name,
      source_url: record.source_url,
      terms_status: record.terms_status,
      file: `data/kifu/${record.key}.json`,
    })),
  };
}

async function writeKifuOutputs(dataDir, records, generatedAt) {
  const kifuDir = path.join(dataDir, 'kifu');
  await mkdir(kifuDir, { recursive: true });

  const keep = new Set(['index.json', ...records.map((record) => `${record.key}.json`)]);
  let existing = [];
  try {
    existing = await readdir(kifuDir);
  } catch {
    existing = [];
  }
  const stale = existing.filter((file) => file.endsWith('.json') && !keep.has(file));

  await Promise.all([
    writeFile(path.join(kifuDir, 'index.json'), jsonOut(buildKifuIndex(records, generatedAt)), 'utf8'),
    ...records.map((record) => writeFile(path.join(kifuDir, `${record.key}.json`), jsonOut(record), 'utf8')),
    ...stale.map((file) => unlink(path.join(kifuDir, file))),
  ]);
}

// Network-mode-only collector. Fetches candidate viewer pages defensively and
// writes public/data/kifu/* only when at least one game parses. When nothing is
// extractable the previous kifu exports are left untouched, and --from-snapshot
// runs skip this stage entirely.
export async function collectKifuRecords({ players, ownRatings, playerDetails, dataDir, generatedAt }) {
  const statusBase = {
    source_id: 'kifu_records',
    source_name: 'Go4Go',
    country_or_region: 'global',
    data_type: 'kifu',
    terms_status: 'unknown',
    source_url: sourceUrls.go4go,
    fetched_at: generatedAt,
  };

  try {
    const candidates = selectKifuCandidates(ownRatings, playerDetails);
    const playerById = new Map((players ?? []).map((player) => [player.id, player]));
    const playerNameIndex = buildPlayerNameIndex(players ?? []);
    const startedAt = Date.now();
    let budgetExhausted = false;
    let fetchFailures = 0;

    const fetched = await withConcurrency(candidates, KIFU_CONCURRENCY, async (candidate) => {
      if (Date.now() - startedAt > KIFU_BUDGET_MS) {
        budgetExhausted = true;
        return null;
      }
      let bodyText = null;
      try {
        const result = await fetchTextResponseWithTimeout(
          candidate.kifuUrl,
          { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain,application/x-go-sgf,*/*' } },
          KIFU_FETCH_TIMEOUT_MS,
        );
        if (!result.response.ok) {
          fetchFailures += 1;
          return null;
        }
        bodyText = result.bodyText;
      } catch {
        fetchFailures += 1;
        return null;
      }
      const parsed = parseKifuFromBody(bodyText);
      if (!parsed) {
        return null;
      }
      return buildKifuRecord(candidate, parsed, { playerById, playerNameIndex });
    });

    const seenKeys = new Set();
    const records = fetched.filter((record) => {
      if (!record || seenKeys.has(record.key)) {
        return false;
      }
      seenKeys.add(record.key);
      return true;
    });

    if (records.length) {
      await writeKifuOutputs(dataDir, records, generatedAt);
    }

    const detail = `${candidates.length} candidate game(s), ${records.length} kifu extracted, ${fetchFailures} fetch failure(s)${budgetExhausted ? ', time budget exhausted' : ''}.`;
    return sourceStatus({
      ...statusBase,
      status: records.length ? 'available' : 'available_empty',
      confidence: records.length ? 0.7 : 0.3,
      item_count: records.length,
      notes: records.length
        ? `Kifu collected from linked public viewer pages. ${detail} Each game links back to its original source.`
        : `No kifu could be extracted from linked viewer pages; existing kifu exports were left untouched. ${detail}`,
    });
  } catch (error) {
    return sourceStatus({
      ...statusBase,
      status: 'unavailable',
      confidence: 0,
      item_count: 0,
      notes: `Kifu collection failed without affecting the snapshot: ${error.message}`,
    });
  }
}
