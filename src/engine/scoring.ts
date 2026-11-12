import { PIECE_BY_ID } from './pieces.ts';
import type {
  ColorPlayerState,
  ScoringRule,
  StandingEntry,
  TeamStandingEntry,
} from './types.ts';

export const CLEAR_ALL_BONUS = 15;
export const MONOMINO_LAST_BONUS = 5;

export function countRemainingSquares(available: readonly string[]): number {
  let sum = 0;
  for (const id of available) {
    sum += PIECE_BY_ID[id]?.size ?? 0;
  }
  return sum;
}

export function computePlayerScores(player: Pick<ColorPlayerState, 'available' | 'placedSquares' | 'lastPiece'>): {
  remainingSquares: number;
  clearBonus: number;
  officialScore: number;
  positiveScore: number;
} {
  const remainingSquares = countRemainingSquares(player.available);
  const clearBonus = player.available.length === 0
    ? CLEAR_ALL_BONUS + (player.lastPiece === 'M' ? MONOMINO_LAST_BONUS : 0)
    : 0;
  const officialScore = player.available.length === 0 ? clearBonus : -remainingSquares;
  const positiveScore = player.placedSquares + clearBonus;
  return {
    remainingSquares,
    clearBonus,
    officialScore,
    positiveScore,
  };
}

export function computeStandings(
  players: readonly ColorPlayerState[],
  scoringRule: ScoringRule = 'official',
): StandingEntry[] {
  const raw = players.map((player) => {
    const scores = computePlayerScores(player);
    const displayScore = scoringRule === 'official' ? scores.officialScore : scores.positiveScore;
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      isHuman: player.isHuman,
      placedSquares: player.placedSquares,
      remainingSquares: scores.remainingSquares,
      remainingPieces: player.available.length,
      officialScore: scores.officialScore,
      positiveScore: scores.positiveScore,
      displayScore,
    };
  });

  raw.sort((a, b) => b.displayScore - a.displayScore || b.placedSquares - a.placedSquares || a.id - b.id);

  const topScore = raw[0]?.displayScore ?? 0;
  let currentRank = 1;

  return raw.map((entry, index) => {
    if (index > 0 && entry.displayScore < raw[index - 1].displayScore) {
      currentRank = index + 1;
    }
    return {
      ...entry,
      rank: currentRank,
      isWinner: entry.displayScore === topScore,
    };
  });
}

export function computeTeamStandings(
  players: readonly ColorPlayerState[],
  scoringRule: ScoringRule = 'official',
): TeamStandingEntry[] {
  const byController = new Map<number, {
    controllerId: number;
    name: string;
    colorIds: number[];
    colors: string[];
    isHuman: boolean;
    placedSquares: number;
    remainingSquares: number;
    officialScore: number;
    positiveScore: number;
  }>();

  for (const player of players) {
    const scores = computePlayerScores(player);
    const existing = byController.get(player.controllerId);
    if (existing) {
      existing.colorIds.push(player.id);
      existing.colors.push(player.color);
      existing.placedSquares += player.placedSquares;
      existing.remainingSquares += scores.remainingSquares;
      existing.officialScore += scores.officialScore;
      existing.positiveScore += scores.positiveScore;
    } else {
      byController.set(player.controllerId, {
        controllerId: player.controllerId,
        name: player.controllerName,
        colorIds: [player.id],
        colors: [player.color],
        isHuman: player.isHuman,
        placedSquares: player.placedSquares,
        remainingSquares: scores.remainingSquares,
        officialScore: scores.officialScore,
        positiveScore: scores.positiveScore,
      });
    }
  }

  const list = [...byController.values()].map((team) => ({
    ...team,
    displayScore: scoringRule === 'official' ? team.officialScore : team.positiveScore,
  }));

  list.sort((a, b) => b.displayScore - a.displayScore || b.placedSquares - a.placedSquares || a.controllerId - b.controllerId);

  const topScore = list[0]?.displayScore ?? 0;
  let currentRank = 1;

  return list.map((entry, index) => {
    if (index > 0 && entry.displayScore < list[index - 1].displayScore) {
      currentRank = index + 1;
    }
    return {
      ...entry,
      rank: currentRank,
      isWinner: entry.displayScore === topScore,
    };
  });
}

export function formatSignedScore(score: number, scoringRule: ScoringRule): string {
  if (scoringRule === 'official' && score > 0) return `+${score}`;
  return String(score);
}
