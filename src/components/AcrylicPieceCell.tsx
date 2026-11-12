import { memo } from 'react';
import type { CSSProperties } from 'react';
import { getShape } from '../engine/index.ts';
import type { Point } from '../engine/index.ts';

export type NeighborMask = {
  readonly top: boolean;
  readonly right: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
};

export function getShapeNeighborMask(
  occupiedKeys: ReadonlySet<string>,
  x: number,
  y: number,
): NeighborMask {
  return {
    top: occupiedKeys.has(`${x},${y - 1}`),
    right: occupiedKeys.has(`${x + 1},${y}`),
    bottom: occupiedKeys.has(`${x},${y + 1}`),
    left: occupiedKeys.has(`${x - 1},${y}`),
  };
}

export function buildAcrylicCellStyle(
  color: string,
  mask: NeighborMask,
  cornerRadiusPx = 3,
  seated = false,
): CSSProperties {
  const r = `${cornerRadiusPx}px`;
  const shadows: string[] = [
    mask.top
      ? 'inset 0 0.5px 0 rgba(255, 255, 255, 0.16)'
      : 'inset 0 1.5px 0 rgba(255, 255, 255, 0.72)',
    mask.left
      ? 'inset 0.5px 0 0 rgba(255, 255, 255, 0.13)'
      : 'inset 1.5px 0 0 rgba(255, 255, 255, 0.54)',
    mask.bottom
      ? 'inset 0 -0.5px 0 rgba(0, 0, 0, 0.22)'
      : 'inset 0 -2.2px 0 rgba(0, 0, 0, 0.44)',
    mask.right
      ? 'inset -0.5px 0 0 rgba(0, 0, 0, 0.18)'
      : 'inset -2px 0 0 rgba(0, 0, 0, 0.36)',
  ];

  if (seated && (!mask.bottom || !mask.right)) {
    shadows.push('1px 1.5px 2.5px rgba(0, 0, 0, 0.44)');
  }

  return {
    '--tile-color': color,
    borderTopLeftRadius: !mask.top && !mask.left ? r : '0px',
    borderTopRightRadius: !mask.top && !mask.right ? r : '0px',
    borderBottomRightRadius: !mask.bottom && !mask.right ? r : '0px',
    borderBottomLeftRadius: !mask.bottom && !mask.left ? r : '0px',
    boxShadow: shadows.join(', '),
  } as CSSProperties;
}

export function buildGhostSilhouetteStyle(
  color: string,
  mask: NeighborMask,
  valid: boolean,
): CSSProperties {
  const r = '3px';
  const rim = valid ? 'rgba(255, 255, 255, 0.86)' : 'rgba(255, 76, 98, 0.68)';
  const seam = valid ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 76, 98, 0.14)';
  const shadows: string[] = [
    !mask.top ? `inset 0 1.5px 0 ${rim}` : `inset 0 0.5px 0 ${seam}`,
    !mask.left ? `inset 1.5px 0 0 ${rim}` : `inset 0.5px 0 0 ${seam}`,
    !mask.bottom ? `inset 0 -1.5px 0 ${rim}` : `inset 0 -0.5px 0 ${seam}`,
    !mask.right ? `inset -1.5px 0 0 ${rim}` : `inset -0.5px 0 0 ${seam}`,
  ];
  if (valid) shadows.push(`0 0 14px color-mix(in srgb, ${color} 46%, transparent)`);

  return {
    backgroundColor: valid
      ? `color-mix(in srgb, ${color} 54%, transparent)`
      : `color-mix(in srgb, ${color} 18%, transparent)`,
    borderTopLeftRadius: !mask.top && !mask.left ? r : '0px',
    borderTopRightRadius: !mask.top && !mask.right ? r : '0px',
    borderBottomRightRadius: !mask.bottom && !mask.right ? r : '0px',
    borderBottomLeftRadius: !mask.bottom && !mask.left ? r : '0px',
    boxShadow: shadows.join(', '),
  };
}

/**
 * Renders a monolithic injection-molded polycarbonate polyomino with zero internal gaps
 * and iconic Blokus inner stepped facets. Uses strict integer pixel tracks to prevent sub-pixel jitter.
 */
export const ConnectedPolyominoFigure = memo(function ConnectedPolyominoFigure({
  pieceId,
  rotation = 0,
  flipped = false,
  color,
  unitPx,
  cornerRadiusPx = 2.5,
  showFacet = true,
}: {
  readonly pieceId: string;
  readonly rotation?: number;
  readonly flipped?: boolean;
  readonly color: string;
  readonly unitPx: number;
  readonly cornerRadiusPx?: number;
  readonly showFacet?: boolean;
}) {
  const shape: readonly Point[] = getShape(pieceId, rotation, flipped);
  let maxX = 0;
  let maxY = 0;
  const occupied = new Set<string>();
  for (const c of shape) {
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
    occupied.add(`${c.x},${c.y}`);
  }
  const cols = maxX + 1;
  const rows = maxY + 1;

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${unitPx}px)`,
        gridTemplateRows: `repeat(${rows}, ${unitPx}px)`,
      }}
    >
      {Array.from({ length: rows * cols }, (_, idx) => {
        const x = idx % cols;
        const y = Math.floor(idx / cols);
        if (!occupied.has(`${x},${y}`)) {
          return <span key={idx} className="pointer-events-none opacity-0" />;
        }
        const mask = getShapeNeighborMask(occupied, x, y);
        return (
          <span
            key={idx}
            className="poly-cell block"
            style={buildAcrylicCellStyle(color, mask, cornerRadiusPx, false)}
          >
            {showFacet && <span className="poly-facet" />}
          </span>
        );
      })}
    </div>
  );
});
