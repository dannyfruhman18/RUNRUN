import type { CSSProperties } from 'react';
import type { GameState, Obstacle } from '/vercel/sandbox/workspace/poke/game/runner.ts';
import { laneToX } from '/vercel/sandbox/workspace/poke/game/runner.ts';

export interface SceneFrame {
  cameraStyle: CSSProperties;
  runnerStyle: CSSProperties;
  trackStyle: CSSProperties;
  laneGlowStyle: CSSProperties;
}

function laneShift(game: GameState): number {
  return (game.lane - 1) * 22;
}

export function buildSceneFrame(game: GameState): SceneFrame {
  const speedNorm = Math.min(1, game.speed / 58);
  const shift = laneShift(game);
  const sway = Math.sin(game.distance * 0.55) * 1.8;
  const roll = shift * 0.08 + sway;
  const pitch = 66 - speedNorm * 4;

  return {
    cameraStyle: {
      transform: `translate3d(${shift * -0.5}px, ${-9 - speedNorm * 7}px, 0) rotateX(${pitch}deg) rotateZ(${roll}deg)`,
      transformStyle: 'preserve-3d',
    },
    runnerStyle: {
      transform: `translate3d(${shift * 0.85}px, ${Math.sin(game.distance * 15) * 1.2}px, 120px) rotateY(${shift * -0.8}deg) rotateZ(${game.phase === 'crashed' ? 18 : shift * 0.18}deg) scale(${1 + speedNorm * 0.08})`,
      transformStyle: 'preserve-3d',
    },
    trackStyle: {
      transform: 'translate3d(0, 220px, -240px) rotateX(90deg) scaleX(1.9)',
      transformOrigin: '50% 50%',
    },
    laneGlowStyle: {
      transform: `translate3d(${laneToX(game.lane) - 50}%, 0, 0)`,
    },
  };
}

export function buildObstacleStyle(obstacle: Obstacle): CSSProperties {
  const depth = 320 - obstacle.y * 4;
  const bob = Math.sin(obstacle.id * 2.1 + obstacle.y * 0.1) * 1.5;
  const tilt = obstacle.kind === 'truck' ? -10 : -6;

  return {
    transform: `translate3d(0, ${bob}px, ${-depth}px) rotateY(${tilt}deg) scale(${1 + obstacle.y * 0.0025})`,
    transformStyle: 'preserve-3d',
  };
}
