import { PIECES } from '../engine/index.ts';
import type {
  AIDifficulty,
  GameMode,
  Move,
  ScoringRule,
} from '../engine/index.ts';

export type ClockPreset = 'off' | 'blitz_3m' | 'rapid_5m';
export type OpponentType = 'ai' | 'human';

export type MatchSetupConfig = {
  readonly mode: GameMode;
  readonly difficulty: AIDifficulty;
  readonly opponentType: OpponentType;
  readonly clockPreset: ClockPreset;
  readonly scoringRule: ScoringRule;
  readonly puzzleId?: string;
};

export type MatchActionEntry =
  | { readonly kind: 'place'; readonly colorId: number; readonly move: Move }
  | { readonly kind: 'pass'; readonly colorId: number };

export type SavedActiveMatch = {
  readonly version: 2;
  readonly config: MatchSetupConfig;
  readonly history: readonly MatchActionEntry[];
  readonly historyIndex: number;
  readonly clocksMs: readonly number[] | null;
  readonly savedAt: string;
};

export type MatchScoreRecord = {
  readonly id: string;
  readonly mode: GameMode;
  readonly score: number;
  readonly scoringRule: ScoringRule;
  readonly winnerName: string;
  readonly result: 'WIN' | 'TIE' | 'LOSS' | 'SOLVED';
  readonly difficulty: AIDifficulty;
  readonly date: string;
};

export type UserPreferences = {
  readonly soundMuted: boolean;
  readonly colorblindMode: boolean;
  readonly scoringRule: ScoringRule;
  readonly showCornerHints: boolean;
  readonly showTerritoryOverlay: boolean;
  readonly snapToCorner: boolean;
};

const ACTIVE_MATCH_KEY = 'blokus-active-match-v2';
const SCORE_RECORDS_KEY = 'blokus-records-v2';
const LEGACY_SCORES_KEY = 'blokus-local-scores';
const PREFS_KEY = 'blokus-prefs-v2';
const PUZZLE_PROGRESS_KEY = 'blokus-puzzles-v1';

export const DEFAULT_PREFERENCES: UserPreferences = {
  soundMuted: false,
  colorblindMode: false,
  scoringRule: 'official',
  showCornerHints: true,
  showTerritoryOverlay: false,
  snapToCorner: true,
};

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore sandboxed storage errors
  }
  return null;
}

export function loadPreferences(): UserPreferences {
  const store = getStorage();
  if (!store) return DEFAULT_PREFERENCES;
  try {
    const raw = store.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      soundMuted: Boolean(parsed.soundMuted),
      colorblindMode: Boolean(parsed.colorblindMode),
      scoringRule: parsed.scoringRule === 'positive' ? 'positive' : 'official',
      showCornerHints: parsed.showCornerHints ?? true,
      showTerritoryOverlay: Boolean(parsed.showTerritoryOverlay),
      snapToCorner: parsed.snapToCorner ?? true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  const store = getStorage();
  if (!store) return;
  try {
    store.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota errors
  }
}

export function saveActiveMatch(match: SavedActiveMatch | null): void {
  const store = getStorage();
  if (!store) return;
  try {
    if (!match) {
      store.removeItem(ACTIVE_MATCH_KEY);
    } else {
      store.setItem(ACTIVE_MATCH_KEY, JSON.stringify(match));
    }
  } catch {
    // Ignore quota errors
  }
}

export function loadActiveMatch(): SavedActiveMatch | null {
  const store = getStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(ACTIVE_MATCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedActiveMatch;
    if (parsed?.version !== 2 || !parsed.config || !Array.isArray(parsed.history)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadScoreRecords(): MatchScoreRecord[] {
  const store = getStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(SCORE_RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as MatchScoreRecord[];
    }
    // Migrate legacy v1 records smoothly if present
    const legacyRaw = store.getItem(LEGACY_SCORES_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Array<{
        score: number;
        result: 'WIN' | 'RUN';
        mode: string;
        date: string;
      }>;
      if (Array.isArray(legacy)) {
        return legacy.slice(0, 12).map((item, idx) => ({
          id: `legacy-${idx}`,
          mode: item.mode === 'duo' ? 'duo_coop' : item.mode === 'local' ? 'pass_play' : 'solo',
          score: item.score,
          scoringRule: 'positive',
          winnerName: item.result === 'WIN' ? 'Champion' : 'Player',
          result: item.result === 'WIN' ? 'WIN' : 'LOSS',
          difficulty: 'medium',
          date: item.date ?? '',
        }));
      }
    }
  } catch {
    // Ignore malformed JSON
  }
  return [];
}

export function appendScoreRecord(record: Omit<MatchScoreRecord, 'id'>): MatchScoreRecord[] {
  const existing = loadScoreRecords();
  const entry: MatchScoreRecord = {
    ...record,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  const next = [entry, ...existing].slice(0, 24);
  const store = getStorage();
  if (store) {
    try {
      store.setItem(SCORE_RECORDS_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  }
  return next;
}

export function loadSolvedPuzzles(): Set<string> {
  const store = getStorage();
  if (!store) return new Set();
  try {
    const raw = store.getItem(PUZZLE_PROGRESS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function markPuzzleSolved(puzzleId: string): Set<string> {
  const solved = loadSolvedPuzzles();
  solved.add(puzzleId);
  const store = getStorage();
  if (store) {
    try {
      store.setItem(PUZZLE_PROGRESS_KEY, JSON.stringify([...solved]));
    } catch {
      // Ignore
    }
  }
  return solved;
}

// ============================================================================
// Compact Base64URL Match Notation Codec (BLKS1-...)
// ============================================================================

const MODE_LIST: readonly GameMode[] = [
  'solo',
  'duo_coop',
  'tournament_1v1',
  'blokus_duo',
  'pass_play',
  'puzzle',
];

const DIFF_LIST: readonly AIDifficulty[] = ['easy', 'medium', 'hard'];
const CLOCK_LIST: readonly ClockPreset[] = ['off', 'blitz_3m', 'rapid_5m'];
const PIECE_INDEX_BY_ID: Readonly<Record<string, number>> = Object.fromEntries(
  PIECES.map((p, idx) => [p.id, idx]),
);

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  if (typeof atob === 'function') {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

/**
 * Encodes a match setup + move history into a compact `BLKS1-...` share string.
 * Each placement takes only 3 bytes; passes take 1 byte.
 */
export function exportMatchCode(
  config: MatchSetupConfig,
  history: readonly MatchActionEntry[],
): string {
  const puzzleBytes = config.puzzleId
    ? new TextEncoder().encode(config.puzzleId)
    : new Uint8Array(0);

  const bytes: number[] = [];
  // Byte 0: version = 1
  bytes.push(1);
  // Byte 1: mode (3 bits) | difficulty (2 bits) | opponentType (1 bit) | scoringRule (1 bit)
  const modeIdx = Math.max(0, MODE_LIST.indexOf(config.mode));
  const diffIdx = Math.max(0, DIFF_LIST.indexOf(config.difficulty));
  const oppBit = config.opponentType === 'human' ? 1 : 0;
  const ruleBit = config.scoringRule === 'positive' ? 1 : 0;
  bytes.push((modeIdx & 0x07) | ((diffIdx & 0x03) << 3) | (oppBit << 5) | (ruleBit << 6));
  // Byte 2: clockPreset
  bytes.push(Math.max(0, CLOCK_LIST.indexOf(config.clockPreset)));
  // Byte 3..: puzzleId length + utf8 bytes
  bytes.push(puzzleBytes.length);
  for (let i = 0; i < puzzleBytes.length; i += 1) {
    bytes.push(puzzleBytes[i]);
  }
  // Action count (uint16 big-endian)
  const count = Math.min(history.length, 65535);
  bytes.push((count >> 8) & 0xff, count & 0xff);

  for (let i = 0; i < count; i += 1) {
    const entry = history[i];
    if (entry.kind === 'pass') {
      // Tag bit 7 = 1 for pass, bits 0..2 = colorId
      bytes.push(0x80 | (entry.colorId & 0x07));
    } else {
      // Tag bit 7 = 0 for place:
      // B0: (colorId << 5) | pieceIdx (0..20)
      // B1: (flipped << 7) | ((rotation & 3) << 5) | (x & 31)
      // B2: y & 31
      const pIdx = PIECE_INDEX_BY_ID[entry.move.pieceId] ?? 0;
      const rot = ((entry.move.rotation % 4) + 4) % 4;
      const flip = entry.move.flipped ? 1 : 0;
      bytes.push(((entry.colorId & 0x03) << 5) | (pIdx & 0x1f));
      bytes.push((flip << 7) | (rot << 5) | (entry.move.x & 0x1f));
      bytes.push(entry.move.y & 0x1f);
    }
  }

  return `BLKS1-${bytesToBase64Url(new Uint8Array(bytes))}`;
}

export function importMatchCode(code: string): {
  config: MatchSetupConfig;
  history: MatchActionEntry[];
} | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith('BLKS1-')) return null;
  try {
    const raw = base64UrlToBytes(trimmed.slice(6));
    if (raw.length < 6 || raw[0] !== 1) return null;

    const flags = raw[1];
    const mode = MODE_LIST[flags & 0x07];
    const difficulty = DIFF_LIST[(flags >> 3) & 0x03];
    const opponentType: OpponentType = ((flags >> 5) & 0x01) === 1 ? 'human' : 'ai';
    const scoringRule: ScoringRule = ((flags >> 6) & 0x01) === 1 ? 'positive' : 'official';
    const clockPreset = CLOCK_LIST[raw[2]] ?? 'off';

    if (!mode || !difficulty) return null;

    let offset = 3;
    const puzzleLen = raw[offset++];
    if (offset + puzzleLen + 2 > raw.length) return null;
    const puzzleId = puzzleLen > 0
      ? new TextDecoder().decode(raw.slice(offset, offset + puzzleLen))
      : undefined;
    offset += puzzleLen;

    const count = (raw[offset] << 8) | raw[offset + 1];
    offset += 2;

    const history: MatchActionEntry[] = [];
    for (let i = 0; i < count; i += 1) {
      if (offset >= raw.length) return null;
      const b0 = raw[offset++];
      if ((b0 & 0x80) !== 0) {
        history.push({ kind: 'pass', colorId: b0 & 0x07 });
      } else {
        if (offset + 2 > raw.length) return null;
        const b1 = raw[offset++];
        const b2 = raw[offset++];
        const colorId = (b0 >> 5) & 0x03;
        const piece = PIECES[b0 & 0x1f];
        if (!piece) return null;
        const flipped = ((b1 >> 7) & 0x01) === 1;
        const rotation = (b1 >> 5) & 0x03;
        const x = b1 & 0x1f;
        const y = b2 & 0x1f;
        history.push({
          kind: 'place',
          colorId,
          move: { pieceId: piece.id, x, y, rotation, flipped },
        });
      }
    }

    return {
      config: {
        mode,
        difficulty,
        opponentType,
        clockPreset,
        scoringRule,
        ...(puzzleId ? { puzzleId } : {}),
      },
      history,
    };
  } catch {
    return null;
  }
}
