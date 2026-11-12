import { memo } from 'react';
import type { CSSProperties } from 'react';
import { PLAYER_COLORS, getShape } from '../engine/index.ts';
import { buildAcrylicCellStyle, getShapeNeighborMask } from './AcrylicPieceCell.tsx';

export type SlamBlockSpec = {
  readonly id: 'solo' | 'duel' | 'party' | 'puzzle';
  readonly pieceId: string;
  readonly color: string;
  readonly label: string;
  readonly startPos: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  readonly impactPos: { x: number; y: number };
};

export const SLAM_BLOCKS: readonly SlamBlockSpec[] = [
  {
    id: 'solo',
    pieceId: 'F',
    color: PLAYER_COLORS[0],
    label: 'SOLO',
    startPos: { x: -220, y: -240, z: 640, rx: 64, ry: -48, rz: -96 },
    impactPos: { x: -54, y: -44 },
  },
  {
    id: 'duel',
    pieceId: 'T5',
    color: PLAYER_COLORS[1],
    label: '1v1',
    startPos: { x: 210, y: -260, z: 680, rx: -58, ry: 52, rz: 88 },
    impactPos: { x: 54, y: -44 },
  },
  {
    id: 'party',
    pieceId: 'Z',
    color: PLAYER_COLORS[2],
    label: '4P',
    startPos: { x: -200, y: 220, z: 620, rx: 54, ry: 58, rz: 112 },
    impactPos: { x: -54, y: 46 },
  },
  {
    id: 'puzzle',
    pieceId: 'W',
    color: PLAYER_COLORS[3],
    label: 'PUZZLE',
    startPos: { x: 230, y: 210, z: 660, rx: -66, ry: -44, rz: -90 },
    impactPos: { x: 54, y: 46 },
  },
];

/**
 * Connected Monolithic 3D Polycarbonate Pentomino: culls hidden interior side walls
 * (reducing GPU quads by ~45% and eliminating internal seams) and renders inner stepped facets.
 */
export const VoxelPentomino3D = memo(function VoxelPentomino3D({
  pieceId,
  color,
  unit = 22,
  depth = 16,
}: {
  readonly pieceId: string;
  readonly color: string;
  readonly unit?: number;
  readonly depth?: number;
}) {
  const shape = getShape(pieceId, 0, false);
  const occupied = new Set(shape.map((c) => `${c.x},${c.y}`));
  const maxX = Math.max(...shape.map((c) => c.x));
  const maxY = Math.max(...shape.map((c) => c.y));

  return (
    <div
      className="relative"
      style={{
        width: (maxX + 1) * unit,
        height: (maxY + 1) * unit,
        transformStyle: 'preserve-3d',
      }}
    >
      {shape.map((cell, idx) => {
        const mask = getShapeNeighborMask(occupied, cell.x, cell.y);
        const frontStyle = buildAcrylicCellStyle(color, mask, 3, false);
        return (
          <div
            key={idx}
            className="voxel-prism"
            style={
              {
                left: cell.x * unit,
                top: cell.y * unit,
                width: unit,
                height: unit,
                '--tile-color': color,
                '--prism-depth': `${depth}px`,
              } as CSSProperties
            }
          >
            {!mask.top && <div className="voxel-face-top" />}
            {!mask.bottom && <div className="voxel-face-bottom" />}
            {!mask.left && <div className="voxel-face-left" />}
            {!mask.right && <div className="voxel-face-right" />}
            <div className="voxel-face-front" style={frontStyle}>
              <span className="poly-facet" />
            </div>
          </div>
        );
      })}
    </div>
  );
});

const SINGLE_MASK = { top: false, right: false, bottom: false, left: false } as const;

export const ModeSymbolicGlyph = memo(function ModeSymbolicGlyph({
  modeId,
}: {
  readonly modeId: SlamBlockSpec['id'];
}) {
  if (modeId === 'solo') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <span
          className="poly-cell block h-5 w-5"
          style={buildAcrylicCellStyle(PLAYER_COLORS[0], SINGLE_MASK, 3, false)}
        >
          <span className="poly-facet" />
        </span>
        <span className="h-5 w-5 rounded-[3px] bg-current opacity-12 scale-75" />
        <span className="h-5 w-5 rounded-[3px] bg-current opacity-12 scale-75" />
        <span className="h-5 w-5 rounded-[3px] bg-current opacity-12 scale-75" />
      </div>
    );
  }

  if (modeId === 'duel') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <span
          className="poly-cell block h-5 w-5"
          style={buildAcrylicCellStyle(PLAYER_COLORS[0], SINGLE_MASK, 3, false)}
        >
          <span className="poly-facet" />
        </span>
        <span className="h-5 w-5 rounded-[3px] border border-current opacity-15 scale-75" />
        <span className="h-5 w-5 rounded-[3px] border border-current opacity-15 scale-75" />
        <span
          className="poly-cell block h-5 w-5"
          style={buildAcrylicCellStyle(PLAYER_COLORS[1], SINGLE_MASK, 3, false)}
        >
          <span className="poly-facet" />
        </span>
      </div>
    );
  }

  if (modeId === 'party') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {PLAYER_COLORS.map((c) => (
          <span
            key={c}
            className="poly-cell block h-5 w-5"
            style={buildAcrylicCellStyle(c, SINGLE_MASK, 3, false)}
          >
            <span className="poly-facet" />
          </span>
        ))}
      </div>
    );
  }

  // Puzzle: connected V3 emerald corner pocket + muted blockade cells
  const v3Occ = new Set(['1,0', '0,1', '1,1']);
  return (
    <div className="grid grid-cols-2 gap-0">
      <span className="m-[1.5px] h-[19px] w-[19px] rounded-[2.5px] bg-current opacity-16" />
      <span
        className="poly-cell block h-[22px] w-[22px]"
        style={buildAcrylicCellStyle(PLAYER_COLORS[3], getShapeNeighborMask(v3Occ, 1, 0), 3, false)}
      >
        <span className="poly-facet" />
      </span>
      <span
        className="poly-cell block h-[22px] w-[22px]"
        style={buildAcrylicCellStyle(PLAYER_COLORS[3], getShapeNeighborMask(v3Occ, 0, 1), 3, false)}
      >
        <span className="poly-facet" />
      </span>
      <span
        className="poly-cell block h-[22px] w-[22px]"
        style={buildAcrylicCellStyle(PLAYER_COLORS[3], getShapeNeighborMask(v3Occ, 1, 1), 3, false)}
      >
        <span className="poly-facet" />
      </span>
    </div>
  );
});

export function drawShockwaveFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  impactElapsedMs: number,
  isLightTheme: boolean,
): void {
  ctx.clearRect(0, 0, width, height);
  if (impactElapsedMs < 0 || impactElapsedMs > 460) return;

  const p = Math.min(1, impactElapsedMs / 450);
  const easeOut = 1 - Math.pow(1 - p, 3.2);
  const fade = Math.pow(1 - p, 1.9);
  const cx = width / 2;
  const cy = height / 2;
  const baseRgb = isLightTheme ? '28, 40, 54' : '214, 236, 255';

  ctx.save();
  ctx.translate(cx, cy);

  const gridExtent = 150 + easeOut * 250;
  ctx.strokeStyle = `rgba(${baseRgb}, ${0.13 * fade})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let offset = -4; offset <= 4; offset += 1) {
    const pos = offset * 34;
    ctx.moveTo(pos, -gridExtent);
    ctx.lineTo(pos, gridExtent);
    ctx.moveTo(-gridExtent, pos);
    ctx.lineTo(gridExtent, pos);
  }
  ctx.stroke();

  const halfSize = 50 + easeOut * Math.min(width, height) * 0.42;
  ctx.strokeStyle = `rgba(${baseRgb}, ${0.55 * fade})`;
  ctx.lineWidth = Math.max(1, 2.8 * (1 - p));
  ctx.beginPath();
  ctx.roundRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2, 16 + easeOut * 34);
  ctx.stroke();

  if (impactElapsedMs > 30) {
    const p2 = Math.min(1, (impactElapsedMs - 30) / 380);
    const e2 = 1 - Math.pow(1 - p2, 3);
    const h2 = 36 + e2 * Math.min(width, height) * 0.28;
    ctx.strokeStyle = `rgba(${baseRgb}, ${0.26 * (1 - p2)})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.roundRect(-h2, -h2, h2 * 2, h2 * 2, 12 + e2 * 20);
    ctx.stroke();
  }

  ctx.restore();
}
