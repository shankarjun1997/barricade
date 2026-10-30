import { useMemo, type RefObject } from 'react';
import {
  legalPawnMoves,
  legalWallMoves,
  type GameState,
  type Move,
  type Point,
  type WallMove,
} from '@barricade/engine';
import { columnName } from '../lib/format.js';

interface BoardProps {
  readonly state: GameState;
  readonly interactive?: boolean;
  readonly mode?: 'move' | 'wall';
  readonly wallOrientation?: 'H' | 'V';
  readonly onMove?: (to: Point) => void;
  readonly onWall?: (move: WallMove) => void;
  readonly lastMove?: Move | null;
  readonly mini?: boolean;
  readonly boardRef?: RefObject<HTMLDivElement | null>;
  readonly dragging?: boolean;
  readonly dragCandidate?: { readonly r: number; readonly c: number; readonly valid: boolean } | null;
}

const WALL_THICKNESS = 2.4;
const SLOT_THICKNESS = 5;

function pointKey(r: number, c: number): string {
  return `${r},${c}`;
}

function wallStyle(orientation: 'H' | 'V', r: number, c: number, cell: number, thickness: number) {
  return orientation === 'H'
    ? {
        left: `${c * cell}%`,
        top: `${(r + 1) * cell - thickness / 2}%`,
        width: `${2 * cell}%`,
        height: `${thickness}%`,
      }
    : {
        left: `${(c + 1) * cell - thickness / 2}%`,
        top: `${r * cell}%`,
        width: `${thickness}%`,
        height: `${2 * cell}%`,
      };
}

export function Board({
  state,
  interactive = false,
  mode = 'move',
  wallOrientation = 'H',
  onMove,
  onWall,
  lastMove = null,
  mini = false,
  boardRef,
  dragging = false,
  dragCandidate = null,
}: BoardProps) {
  const size = state.config.size;
  const cell = 100 / size;

  const { legalPoints, legalWalls } = useMemo(() => {
    const points = new Set<string>();
    const walls: WallMove[] = [];
    if (interactive && !state.result) {
      if (mode === 'move' && !dragging) {
        for (const point of legalPawnMoves(state)) points.add(pointKey(point.r, point.c));
      } else {
        for (const move of legalWallMoves(state)) {
          if (move.orientation === wallOrientation) walls.push(move);
        }
      }
    }
    return { legalPoints: points, legalWalls: walls };
  }, [state, interactive, mode, wallOrientation, dragging]);

  const lastPawnTarget =
    lastMove?.kind === 'move' ? pointKey(lastMove.to.r, lastMove.to.c) : null;
  const lastWallKey =
    lastMove?.kind === 'wall'
      ? `${lastMove.orientation}${lastMove.r},${lastMove.c}`
      : null;

  const cells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const hasBlue = state.pawns.blue.r === r && state.pawns.blue.c === c;
      const hasRed = state.pawns.red.r === r && state.pawns.red.c === c;
      const key = pointKey(r, c);
      const canMove = legalPoints.has(key);
      const classes = ['cell'];
      if (r === 0) classes.push('goal-blue');
      if (r === size - 1) classes.push('goal-red');
      if (lastPawnTarget === key) classes.push('last');

      const point: Point = { r, c };
      const label = `Move to ${columnName(c)}${size - r}`;

      cells.push(
        <div key={key} className={classes.join(' ')} role="gridcell" aria-label={`${columnName(c)}${size - r}`}>
          {hasBlue ? (
            <div className="pawn blue" aria-hidden="true">
              B
            </div>
          ) : null}
          {hasRed ? (
            <div className="pawn red" aria-hidden="true">
              R
            </div>
          ) : null}
          {canMove && interactive ? (
            <button
              type="button"
              className="move-dot"
              aria-label={label}
              onClick={() => onMove?.(point)}
            >
              <span className="visually-hidden">{label}</span>
            </button>
          ) : null}
        </div>,
      );
    }
  }

  const wallEls = state.walls.map((w, index) => {
    const key = `${w.orientation}${w.r},${w.c}`;
    const isLast = key === lastWallKey;
    return (
      <div
        key={`${key}-${index}`}
        className={`wall${isLast ? ' last' : ''}`}
        style={wallStyle(w.orientation, w.r, w.c, cell, WALL_THICKNESS)}
        aria-hidden="true"
      />
    );
  });

  const slotEls = legalWalls.map((w) => {
    const key = `${w.orientation}${w.r},${w.c}`;
    const label = `Place ${w.orientation === 'H' ? 'horizontal' : 'vertical'} barrier at ${columnName(w.c)}${size - w.r}`;
    return (
      <button
        key={`slot-${key}`}
        type="button"
        className="wall-slot"
        style={wallStyle(w.orientation, w.r, w.c, cell, SLOT_THICKNESS)}
        aria-label={label}
        title={label}
        onClick={() => onWall?.(w)}
      />
    );
  });

  const previewEl = dragCandidate ? (
    <div
      className={`wall-preview${dragCandidate.valid ? '' : ' invalid'}`}
      style={wallStyle(wallOrientation, dragCandidate.r, dragCandidate.c, cell, WALL_THICKNESS)}
      aria-hidden="true"
    />
  ) : null;

  const boardLabel = `${size} by ${size} Barricade board. Blue at ${columnName(state.pawns.blue.c)}${size - state.pawns.blue.r}. Red at ${columnName(state.pawns.red.c)}${size - state.pawns.red.r}.`;

  return (
    <div className={`board-wrap${mini ? ' mini' : ''}`}>
      <div
        ref={boardRef}
        className={`board${dragging ? ' dragging' : ''}`}
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        role="grid"
        aria-label={boardLabel}
        aria-rowcount={size}
        aria-colcount={size}
      >
        {cells}
        {wallEls}
        {slotEls}
        {previewEl}
      </div>
      <div className="board-coords" aria-hidden="true">
        <span className="blue">Blue races up</span>
        <span className="red">Red races down</span>
      </div>
    </div>
  );
}
