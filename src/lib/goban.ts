import type { KifuMove, KifuSetupStone, KifuStoneColor } from '../types';

/** Board cell: stone color or empty. Indexed as board[y][x] (y = row, top -> bottom). */
export type BoardCell = KifuStoneColor | null;
export type Board = BoardCell[][];

function isValidCoord(size: number, x: number | undefined, y: number | undefined): x is number {
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < size &&
    y >= 0 &&
    y < size
  );
}

function emptyBoard(size: number): Board {
  return Array.from({ length: size }, () => new Array<BoardCell>(size).fill(null));
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Flood-fills the group containing (x, y) and reports its stones and whether
 * it has at least one liberty.
 */
function collectGroup(
  board: Board,
  size: number,
  x: number,
  y: number,
): { stones: Array<[number, number]>; hasLiberty: boolean } {
  const color = board[y][x];
  const stones: Array<[number, number]> = [];
  if (!color) {
    return { stones, hasLiberty: true };
  }

  const seen = new Set<number>();
  const stack: Array<[number, number]> = [[x, y]];
  seen.add(y * size + x);
  let hasLiberty = false;

  while (stack.length) {
    const [cx, cy] = stack.pop() as [number, number];
    stones.push([cx, cy]);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) {
        continue;
      }
      const cell = board[ny][nx];
      if (cell === null) {
        hasLiberty = true;
      } else if (cell === color) {
        const key = ny * size + nx;
        if (!seen.has(key)) {
          seen.add(key);
          stack.push([nx, ny]);
        }
      }
    }
  }

  return { stones, hasLiberty };
}

function removeGroup(board: Board, stones: Array<[number, number]>) {
  for (const [x, y] of stones) {
    board[y][x] = null;
  }
}

/**
 * Plays one stone with capture resolution: enemy neighbor groups without
 * liberties are removed first, then the placed group is checked for
 * self-capture. Invalid or occupied coordinates are ignored defensively.
 */
function applyMove(board: Board, size: number, move: KifuMove) {
  if (move.pass) {
    return;
  }
  const { c, x, y } = move;
  if ((c !== 'b' && c !== 'w') || !isValidCoord(size, x, y) || typeof y !== 'number') {
    return;
  }
  if (board[y][x] !== null) {
    return;
  }

  board[y][x] = c;
  const enemy: KifuStoneColor = c === 'b' ? 'w' : 'b';

  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) {
      continue;
    }
    if (board[ny][nx] === enemy) {
      const group = collectGroup(board, size, nx, ny);
      if (!group.hasLiberty) {
        removeGroup(board, group.stones);
      }
    }
  }

  const own = collectGroup(board, size, x, y);
  if (!own.hasLiberty) {
    removeGroup(board, own.stones);
  }
}

/**
 * Returns the board position after the first `n` moves (0 = setup only).
 * Pure and defensive: invalid setup stones or moves are skipped silently.
 */
export function positionAtMove(
  size: number,
  setup: KifuSetupStone[] | undefined,
  moves: KifuMove[] | undefined,
  n: number,
): Board {
  const boardSize = Number.isInteger(size) && size >= 2 && size <= 25 ? size : 19;
  const board = emptyBoard(boardSize);

  for (const stone of setup ?? []) {
    if ((stone.c === 'b' || stone.c === 'w') && isValidCoord(boardSize, stone.x, stone.y)) {
      board[stone.y][stone.x] = stone.c;
    }
  }

  const list = moves ?? [];
  const upTo = Math.max(0, Math.min(Math.floor(n), list.length));
  for (let index = 0; index < upTo; index += 1) {
    applyMove(board, boardSize, list[index]);
  }

  return board;
}

/**
 * Last non-pass move among the first `n` moves, with its move number, or null.
 * Only reported when the stone is still on the board afterwards.
 */
export function lastStonePlacement(
  moves: KifuMove[] | undefined,
  n: number,
): { x: number; y: number; c: KifuStoneColor; moveNumber: number } | null {
  const list = moves ?? [];
  const upTo = Math.max(0, Math.min(Math.floor(n), list.length));
  for (let index = upTo - 1; index >= 0; index -= 1) {
    const move = list[index];
    if (!move.pass && (move.c === 'b' || move.c === 'w') && typeof move.x === 'number' && typeof move.y === 'number') {
      return { x: move.x, y: move.y, c: move.c, moveNumber: index + 1 };
    }
  }
  return null;
}

/** Column label for x (0-based, left -> right): A-T skipping I. */
export function columnLabel(x: number): string {
  const letters = 'ABCDEFGHJKLMNOPQRST';
  return letters[x] ?? '';
}

/** Star point (hoshi) coordinates for a board size; only 19x19 and 13x13/9x9 get classic points. */
export function starPoints(size: number): Array<[number, number]> {
  if (size === 19) {
    const lines = [3, 9, 15];
    return lines.flatMap((y) => lines.map((x) => [x, y] as [number, number]));
  }
  if (size === 13) {
    return [
      [3, 3],
      [9, 3],
      [6, 6],
      [3, 9],
      [9, 9],
    ];
  }
  if (size === 9) {
    return [
      [2, 2],
      [6, 2],
      [4, 4],
      [2, 6],
      [6, 6],
    ];
  }
  return [];
}
