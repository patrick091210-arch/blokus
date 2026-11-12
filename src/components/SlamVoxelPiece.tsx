import { memo } from 'react';
import type { CSSProperties } from 'react';
import { PLAYER_COLORS, getShape } from '../engine/index.ts';

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
    startPos: { x: -240, y: -260, z: 680, rx: 68, ry: -52, rz: -110 },
    impactPos: { x: -56, y: -46 },
  },
  {
    id: 'duel',
    pieceId: 'T5',
    color: PLAYER_COLORS[1],
    label: '1v1',
    startPos: { x: 220, y: -290, z: 720, rx: -64, ry: 58, rz: 95 },
    impactPos: { x: 56, y: -46 },
  },
  {
    id: 'party',
    pieceId: 'Z',
    color: PLAYER_COLORS[2],
    label: '4P',
    startPos: { x: -210, y: 240, z: 660, rx: 58, ry: 64, rz: 125 },
    impactPos: { x: -56, y: 48 },
  },
  {
    id: 'puzzle',
    pieceId: 'W',
    color: PLAYER_COLORS[3],
    label: 'PUZZLE',
    startPos: { x: 250, y: 230, z: 700, rx: -72, ry: -48, rz: -95 },
    impactPos: { x: 56, y: 48 },
  },
];

/**
 * True 6-face extruded CSS `preserve-3d` pentomino sculpture.
 */
export const VoxelPentomino3D = memo(function VoxelPentomino3D({
  pieceId,
  color,
  unit = 20,
  depth = 16,
}: {
  readonly pieceId: string;
  readonly color: string;
  readonly unit?: number;
  readonly depth?: number;
}) {
  const shape = getShape(pieceId, 0, false);
  const maxX = Math.max(...shape.map((c) => c.x));
  const maxY = Math.max(...shape.map((c) => c.y));
  const width = (maxX + 1) * unit;
  const height = (maxY + 1) * unit;

  return (
    <div
      className="relative"
      style={{
        width,
        height,
        transformStyle: 'preserve-3d',
      }}
    >
      {shape.map((cell, idx) => (
        <div
          key={idx}
          className="voxel-prism"
          style={
            {
              left: cell.x * unit,
              top: cell.y * unit,
              width: unit - 1.5,
              height: unit - 1.5,
              '--tile-color': color,
              '--prism-depth': `${depth}px`,
            } as CSSProperties
          }
        >
          <div className="voxel-face-top" />
          <div className="voxel-face-bottom" />
          <div className="voxel-face-left" />
          <div className="voxel-face-right" />
          <div className="voxel-face-front" />
        </div>
      ))}
    </div>
  );
});

/**
 * Symbolic Geometric Mode Emblem (zero text clutter, pure spatial geometry).
 */
export const ModeSymbolicGlyph = memo(function ModeSymbolicGlyph({
  modeId,
}: {
  readonly modeId: SlamBlockSpec['id'];
}) {
  if (modeId === 'solo') {
    // Glowing Blue core corner + 3 subtle satellite nodes
    return (
      <div className="grid grid-cols-2 gap-2">
        <span
          className="h-5 w-5 rounded-[4px] acrylic-tile"
          style={{ '--tile-color': PLAYER_COLORS[0] } as CSSProperties}
        />
        <span className="h-5 w-5 rounded-[4px] bg-current opacity-15 scale-75" />
        <span className="h-5 w-5 rounded-[4px] bg-current opacity-15 scale-75" />
        <span className="h-5 w-5 rounded-[4px] bg-current opacity-15 scale-75" />
      </div>
    );
  }

  if (modeId === 'duel') {
    // Two opposing diagonal corner gems facing off
    return (
      <div className="grid grid-cols-2 gap-2">
        <span
          className="h-5 w-5 rounded-[4px] acrylic-tile"
          style={{ '--tile-color': PLAYER_COLORS[0] } as CSSProperties}
        />
        <span className="h-5 w-5 rounded-[4px] border border-current opacity-15 scale-75" />
        <span className="h-5 w-5 rounded-[4px] border border-current opacity-15 scale-75" />
        <span
          className="h-5 w-5 rounded-[4px] acrylic-tile"
          style={{ '--tile-color': PLAYER_COLORS[1] } as CSSProperties}
        />
      </div>
    );
  }

  if (modeId === 'party') {
    // 2x2 Four-color diagonal Blokus emblem
    return (
      <div className="grid grid-cols-2 gap-2">
        {PLAYER_COLORS.map((c) => (
          <span
            key={c}
            className="h-5 w-5 rounded-[4px] acrylic-tile"
            style={{ '--tile-color': c } as CSSProperties}
          />
        ))}
      </div>
    );
  }

  // Puzzle: interlocking L-pocket + glowing emerald keystone
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <span className="h-4 w-4 rounded-[3px] bg-current opacity-20" />
      <span className="h-4 w-4 rounded-[3px] bg-current opacity-20" />
      <span
        className="h-4 w-4 rounded-[3px] acrylic-tile"
        style={{ '--tile-color': PLAYER_COLORS[3] } as CSSProperties}
      />
      <span className="h-4 w-4 rounded-[3px] bg-current opacity-20" />
      <span
        className="h-4 w-4 rounded-[3px] acrylic-tile"
        style={{ '--tile-color': PLAYER_COLORS[3] } as CSSProperties}
      />
      <span
        className="h-4 w-4 rounded-[3px] acrylic-tile"
        style={{ '--tile-color': PLAYER_COLORS[3] } as CSSProperties}
      />
    </div>
  );
});

/**
 * Draws the geometric grid shockwave ripple & radial light shards on impact (200ms – 620ms).
 */
export function drawShockwaveFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  impactElapsedMs: number,
  isLightTheme: boolean,
): void {
  ctx.clearRect(0, 0, width, height);
  if (impactElapsedMs < 0 || impactElapsedMs > 460) return;

  const p = Math.min(1, impactElapsedMs / 440);
  const easeOut = 1 - Math.pow(1 - p, 3.2);
  const fade = Math.pow(1 - p, 1.85);
  const cx = width / 2;
  const cy = height / 2;
  const baseRgb = isLightTheme ? '32, 44, 58' : '210, 236, 255';

  ctx.save();
  ctx.translate(cx, cy);

  // 1. Subtle recessed impact grid flash
  const gridExtent = 160 + easeOut * 260;
  const step = 34;
  ctx.strokeStyle = `rgba(${baseRgb}, ${0.14 * fade})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let offset = -4; offset <= 4; offset += 1) {
    const pos = offset * step;
    ctx.moveTo(pos, -gridExtent);
    ctx.lineTo(pos, gridExtent);
    ctx.moveTo(-gridExtent, pos);
    ctx.lineTo(gridExtent, pos);
  }
  ctx.stroke();

  // 2. Primary crisp rounded-rect geometric shockwave wavefront
  const halfSize = 54 + easeOut * Math.min(width, height) * 0.42;
  const radius = 18 + easeOut * 36;
  ctx.strokeStyle = `rgba(${baseRgb}, ${0.58 * fade})`;
  ctx.lineWidth = Math.max(1, 3.2 * (1 - p));
  ctx.beginPath();
  ctx.roundRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2, radius);
  ctx.stroke();

  // 3. Secondary harmonic inner ripple
  if (impactElapsedMs > 35) {
    const p2 = Math.min(1, (impactElapsedMs - 35) / 380);
    const e2 = 1 - Math.pow(1 - p2, 3);
    const h2 = 38 + e2 * Math.min(width, height) * 0.28;
    ctx.strokeStyle = `rgba(${baseRgb}, ${0.28 * (1 - p2)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-h2, -h2, h2 * 2, h2 * 2, 14 + e2 * 20);
    ctx.stroke();
  }

  // 4. Twelve crisp axial/diagonal shard streaks
  const colors = PLAYER_COLORS;
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const rInner = 64 + easeOut * 195;
    const rOuter = rInner + 18 * (1 - p * 0.6);
    ctx.strokeStyle = colors[i % 4];
    ctx.globalAlpha = 0.62 * fade;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * rInner, Math.sin(angle) * rInner);
    ctx.lineTo(Math.cos(angle) * rOuter, Math.sin(angle) * rOuter);
    ctx.stroke();
  }

  ctx.restore();
}
