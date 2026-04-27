import type { CSSProperties } from 'react';
import type { GameState, Obstacle } from '../game/runner';
import { laneToX } from '../game/runner';

export interface SceneFrame {
  cameraStyle: CSSProperties;
  runnerStyle: CSSProperties;
  trackStyle: CSSProperties;
  laneGlowStyle: CSSProperties;
  backdropStyle: CSSProperties;
}

function laneShift(game: GameState): number {
  return (game.lane - 1) * 22;
}

export function buildSceneFrame(game: GameState): SceneFrame {
  const speedNorm = Math.min(1, game.speed / 62);
  const shift = laneShift(game);
  const sway = Math.sin(game.distance * 0.55) * 1.8;
  const bob = Math.sin(game.distance * 14) * (0.8 + speedNorm * 0.95);
  const roll = shift * 0.08 + sway;
  const pitch = 68 - speedNorm * 6.2;
  const dolly = -8 - speedNorm * 10;
  const depth = 24 + speedNorm * 10;

  return {
    cameraStyle: {
      transform: `translate3d(${shift * -0.58}px, ${dolly}px, 0) rotateX(${pitch}deg) rotateZ(${roll}deg)`,
      transformStyle: 'preserve-3d',
    },
    runnerStyle: {
      transform: `translate3d(${shift * 0.88}px, ${bob}px, 130px) rotateY(${shift * -1.05}deg) rotateZ(${game.phase === 'crashed' ? 18 : shift * 0.22}deg) scale(${1 + speedNorm * 0.1})`,
      transformStyle: 'preserve-3d',
    },
    trackStyle: {
      transform: `translate3d(0, ${220 + depth}px, -280px) rotateX(90deg) scaleX(${2.05 + speedNorm * 0.2})`,
      transformOrigin: '50% 50%',
    },
    laneGlowStyle: {
      transform: `translate3d(${laneToX(game.lane) - 50}%, 0, 0) scale(${1 + speedNorm * 0.12})`,
    },
    backdropStyle: {
      transform: `translate3d(0, ${speedNorm * -12}px, -420px) scale(${1 + speedNorm * 0.08})`,
    },
  };
}

export function buildObstacleStyle(obstacle: Obstacle): CSSProperties {
  const depth = 332 - obstacle.y * 4.4;
  const bob = Math.sin(obstacle.id * 2.1 + obstacle.y * 0.1) * 1.5;
  const tilt = obstacle.kind === 'truck' ? -10 : -6;

  return {
    transform: `translate3d(${obstacle.wobble}px, ${bob}px, ${-depth}px) rotateY(${tilt + obstacle.spin * 0.15}deg) scale(${1 + obstacle.y * 0.0024})`,
    transformStyle: 'preserve-3d',
  };
}
