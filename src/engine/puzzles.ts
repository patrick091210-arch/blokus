import { EMPTY_CELL, OBSTACLE_CELL } from './board.ts';
import type { PuzzleDefinition } from './types.ts';

function parseGrid(rows: readonly string[]): number[] {
  const size = rows.length;
  const cells: number[] = new Array(size * size).fill(EMPTY_CELL);
  for (let y = 0; y < size; y += 1) {
    const row = rows[y];
    for (let x = 0; x < size; x += 1) {
      const ch = row[x] ?? '#';
      const idx = y * size + x;
      if (ch === '.') cells[idx] = EMPTY_CELL;
      else if (ch === '0') cells[idx] = 0;
      else if (ch === '1') cells[idx] = 1;
      else if (ch === '2') cells[idx] = 2;
      else if (ch === '3') cells[idx] = 3;
      else cells[idx] = OBSTACLE_CELL;
    }
  }
  return cells;
}

export const PUZZLES: readonly PuzzleDefinition[] = [
  {
    id: 'corner-thread',
    title: '01 · Corner Thread',
    subtitle: 'Thread V3 and L4 through a narrow amber blockade.',
    difficulty: 'Starter',
    boardSize: 8,
    startAnchor: { x: 0, y: 0 },
    mustCoverStart: false,
    // Solution: V3 at (1,1),(1,2),(2,2) -> L4 at (3,3),(3,4),(3,5),(4,5)
    initialCells: parseGrid([
      '0111####',
      '1..11###',
      '#..122##',
      '##1.22##',
      '##2..3##',
      '##2..3##',
      '###333##',
      '########',
    ]),
    availablePieces: ['V3', 'L4'],
    targetPiecesToPlace: 2,
    hint: 'Point V3 downward so its lower-right corner unlocks the L4 pocket.',
  },
  {
    id: 'twin-bridges',
    title: '02 · Monomino Finale',
    subtitle: 'Bridge across the diagonal and finish on the single square.',
    difficulty: 'Starter',
    boardSize: 8,
    startAnchor: { x: 0, y: 0 },
    mustCoverStart: false,
    // Solution: O4 at (1,1..2,2) -> I3 horizontal at (3,3..5,3) -> M at (6,4)
    initialCells: parseGrid([
      '0111####',
      '1...1###',
      '1..222##',
      '#.1...2#',
      '##2211.#',
      '#####33#',
      '########',
      '########',
    ]),
    availablePieces: ['M', 'I3', 'O4'],
    targetPiecesToPlace: 3,
    hint: 'Save the single square M for the isolated pocket at the far right.',
  },
  {
    id: 'pentomino-lock',
    title: '03 · Pentomino Lock',
    subtitle: 'Fit all 3 five-square pieces (V5, U, T5) into tight pockets.',
    difficulty: 'Tactical',
    boardSize: 10,
    startAnchor: { x: 0, y: 0 },
    mustCoverStart: false,
    // Solution: V5 at (1,1),(1,2),(1,3),(2,3),(3,3) -> U at (4,1),(6,1),(4,2),(5,2),(6,2) -> T5 at (7,3),(8,3),(9,3),(8,4),(8,5)
    initialCells: parseGrid([
      '0111######',
      '1.11.2.2##',
      '1.21...22#',
      '1...221...',
      '#222##11.#',
      '#######1.#',
      '#######33#',
      '##########',
      '##########',
      '##########',
    ]),
    availablePieces: ['V5', 'U', 'T5'],
    targetPiecesToPlace: 3,
    hint: 'Swing V5 along the left wall so its tip kisses the U-shaped chamber.',
  },
  {
    id: 'crossroads-squeeze',
    title: '04 · Crossroads Squeeze',
    subtitle: 'Use X as a dual corner hub to branch into both W and I5.',
    difficulty: 'Tactical',
    boardSize: 10,
    startAnchor: { x: 1, y: 4 },
    mustCoverStart: false,
    // Solution: X at (1,1) -> [(2,1),(1,2),(2,2),(3,2),(2,3)]; W at (4,3) -> [(4,3),(4,4),(5,4),(5,5),(6,5)]; I5 at (3,0..7,0)
    initialCells: parseGrid([
      '###.....1#',
      '#1.111111#',
      '#...22####',
      '#1.2.22###',
      '#011..3###',
      '####1..3##',
      '#####333##',
      '##########',
      '##########',
      '##########',
    ]),
    availablePieces: ['X', 'W', 'I5'],
    targetPiecesToPlace: 3,
    hint: 'X has four corners — plant it in the cross chamber to feed both top I5 and lower-right W.',
  },
  {
    id: 'spiral-vault',
    title: '05 · Four-Pentomino Vault',
    subtitle: 'Chain P, F, Z, and L5 across four chambers without sharing an edge.',
    difficulty: 'Master',
    boardSize: 10,
    startAnchor: { x: 0, y: 0 },
    mustCoverStart: false,
    // Solution:
    // P at (1,1): (1,1),(2,1),(1,2),(2,2),(1,3)
    // F at (3,2): (4,2),(5,2),(3,3),(4,3),(4,4)
    // Z at (6,1): (6,1),(7,1),(7,2),(7,3),(8,3)
    // L5 at (5,5): (5,5),(5,6),(5,7),(5,8),(6,8)
    initialCells: parseGrid([
      '0111######',
      '1..111..2#',
      '1..1..1.2#',
      '1.2..21..#',
      '#222.2222#',
      '####3.3###',
      '####3.3###',
      '####3.3###',
      '####3..3##',
      '#####333##',
    ]),
    availablePieces: ['P', 'F', 'Z', 'L5'],
    targetPiecesToPlace: 4,
    hint: 'Build from P at top-left into F at the center; F splits into Z top-right and L5 down the shaft.',
  },
  {
    id: 'grandmaster-finish',
    title: '06 · Grandmaster Climb',
    subtitle: 'Ascend from bottom-left with Y, N, and S4 to crown the summit with M.',
    difficulty: 'Master',
    boardSize: 10,
    startAnchor: { x: 0, y: 9 },
    mustCoverStart: false,
    // Solution:
    // Y at (1,5): (1,5),(1,6),(1,7),(1,8),(2,6)
    // N at (3,4): (3,4),(3,5),(4,5),(4,6),(4,7)
    // S4 at (5,3): (6,3),(7,3),(5,4),(6,4)
    // M at (8,2): (8,2)
    initialCells: parseGrid([
      '##########',
      '#######11#',
      '#######1.#',
      '#####1..1#',
      '##2.2..11#',
      '#.2..21###',
      '#..2.2####',
      '#.22.2####',
      '#.333#####',
      '03########',
    ]),
    availablePieces: ['M', 'S4', 'N', 'Y'],
    targetPiecesToPlace: 4,
    hint: 'Y’s side stud at row 7 col 3 is the only diagonal bridge to N.',
  },
];

export const PUZZLE_BY_ID: Readonly<Record<string, PuzzleDefinition>> = Object.fromEntries(
  PUZZLES.map((puzzle) => [puzzle.id, puzzle]),
);
