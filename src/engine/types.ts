export type Point = {
  readonly x: number;
  readonly y: number;
};

export type PieceSize = 1 | 2 | 3 | 4 | 5;

export type PieceDefinition = {
  readonly id: string;
  readonly label: string;
  readonly size: PieceSize;
  readonly cells: readonly Point[];
};

export type CompiledOrientation = {
  readonly index: number;
  readonly rotation: number;
  readonly flipped: boolean;
  readonly shape: readonly Point[];
  readonly width: number;
  readonly height: number;
  readonly handle: Point;
  readonly key: string;
};

export type CompiledPiece = {
  readonly id: string;
  readonly label: string;
  readonly size: PieceSize;
  readonly cells: readonly Point[];
  readonly orientations: readonly CompiledOrientation[];
  readonly lookupByTransform: readonly number[];
  readonly nextRotateIndex: readonly number[];
  readonly nextFlipIndex: readonly number[];
};

export type Move = {
  readonly pieceId: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly flipped: boolean;
};

export type PlacementValidation = {
  readonly valid: boolean;
  readonly code?: 'OUT_OF_BOUNDS' | 'OCCUPIED' | 'EDGE_CONTACT' | 'MISS_START' | 'NO_CORNER_CONTACT';
  readonly reason?: string;
};

export type AIDifficulty = 'easy' | 'medium' | 'hard';

export type GameMode =
  | 'solo'
  | 'duo_coop'
  | 'tournament_1v1'
  | 'blokus_duo'
  | 'pass_play'
  | 'puzzle';

export type ScoringRule = 'official' | 'positive';

export type BoardConfig = {
  readonly size: number;
  readonly colorCount: number;
  readonly startAnchors: readonly Point[];
  readonly mustCoverStart: boolean;
  readonly initialCells?: readonly number[];
};

export type BoardState = {
  readonly size: number;
  readonly colorCount: number;
  readonly startAnchors: readonly Point[];
  readonly mustCoverStart: boolean;
  readonly cells: readonly number[];
  readonly forbiddenMasks: readonly Uint8Array[];
  readonly frontierSets: readonly (readonly number[])[];
};

export type ColorPlayerState = {
  readonly id: number;
  readonly name: string;
  readonly controllerName: string;
  readonly controllerId: number;
  readonly color: string;
  readonly isHuman: boolean;
  readonly aiAutoplay: boolean;
  readonly available: readonly string[];
  readonly placedSquares: number;
  readonly placedPieces: number;
  readonly lastPiece: string | null;
  readonly passed: boolean;
};

export type StandingEntry = {
  readonly id: number;
  readonly name: string;
  readonly color: string;
  readonly isHuman: boolean;
  readonly placedSquares: number;
  readonly remainingSquares: number;
  readonly remainingPieces: number;
  readonly officialScore: number;
  readonly positiveScore: number;
  readonly displayScore: number;
  readonly rank: number;
  readonly isWinner: boolean;
};

export type TeamStandingEntry = {
  readonly controllerId: number;
  readonly name: string;
  readonly colorIds: readonly number[];
  readonly colors: readonly string[];
  readonly isHuman: boolean;
  readonly placedSquares: number;
  readonly remainingSquares: number;
  readonly officialScore: number;
  readonly positiveScore: number;
  readonly displayScore: number;
  readonly rank: number;
  readonly isWinner: boolean;
};

export type TerritorySummary = {
  readonly ownerByCell: Int8Array;
  readonly distanceByCell: Uint8Array;
  readonly counts: readonly number[];
};

export type PuzzleDefinition = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly difficulty: 'Starter' | 'Tactical' | 'Master';
  readonly boardSize: number;
  readonly startAnchor: Point;
  readonly mustCoverStart: boolean;
  readonly initialCells: readonly number[];
  readonly availablePieces: readonly string[];
  readonly targetPiecesToPlace: number;
  readonly hint: string;
};
