export type LaneIndex = 0 | 1 | 2;
export type GamePhase = 'ready' | 'running' | 'crashed';
export type ObstacleKind = 'barrier' | 'truck';
export type MoveDirection = -1 | 1;

export interface Obstacle {
  id: number;
  lane: LaneIndex;
  kind: ObstacleKind;
  y: number;
  width: number;
  height: number;
  wobble: number;
  spin: number;
}

export interface GameState {
  phase: GamePhase;
  lane: LaneIndex;
  laneOffset: number;
  score: number;
  bestScore: number;
  distance: number;
  speed: number;
  spawnTimer: number;
  crashReason: string | null;
  obstacles: Obstacle[];
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const LANE_CENTERS: readonly [number, number, number] = [18, 50, 82];
export const PLAYER_RECT = { width: 10.5, height: 13, top: 78.5 } as const;
export const ROAD_BOTTOM = 112;
export const ROAD_TOP = -20;
const BASE_SPEED = 31;
const MAX_SPEED = 62;
const ACCELERATION = 0.72;
const INITIAL_SPAWN_DELAY = 0.82;
const MIN_SPAWN_DELAY = 0.34;
const OBSTACLE_SERIAL = { value: 1 };

function clampLane(lane: number): LaneIndex {
  if (lane <= 0) return 0;
  if (lane >= 2) return 2;
  return lane as LaneIndex;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function nextObstacleId(): number {
  const id = OBSTACLE_SERIAL.value;
  OBSTACLE_SERIAL.value += 1;
  return id;
}

function laneWidth(kind: ObstacleKind): number {
  return kind === 'truck' ? 13.8 : 10.8;
}

function obstacleHeight(kind: ObstacleKind): number {
  return kind === 'truck' ? 13.2 : 10.8;
}

function makeObstacle(lane: LaneIndex, kind: ObstacleKind): Obstacle {
  return {
    id: nextObstacleId(),
    lane,
    kind,
    y: ROAD_TOP,
    width: laneWidth(kind),
    height: obstacleHeight(kind),
    wobble: rand(-2, 2),
    spin: rand(-8, 8),
  };
}

function choosePattern(speed: number): LaneIndex[][] {
  const single: LaneIndex[][] = [[0], [1], [2]];
  const pair: LaneIndex[][] = [[0, 2], [0, 1], [1, 2]];
  const mixed: LaneIndex[][] = [[0], [2], [1], [0, 2], [0, 1], [1, 2]];
  if (speed < 38) return mixed;
  if (speed < 50) return Math.random() < 0.52 ? pair : mixed;
  return Math.random() < 0.42 ? pair : single;
}

function spawnWave(speed: number): Obstacle[] {
  const pattern = pick(choosePattern(speed));
  const kindBias = speed > 46 ? 0.48 : 0.72;
  return pattern.map((lane) => {
    const kind: ObstacleKind = Math.random() < kindBias ? 'barrier' : 'truck';
    return makeObstacle(lane, kind);
  });
}

export function laneToX(lane: LaneIndex): number {
  return LANE_CENTERS[lane];
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

export function createGame(bestScore = 0): GameState {
  return {
    phase: 'ready',
    lane: 1,
    laneOffset: 0,
    score: 0,
    bestScore,
    distance: 0,
    speed: BASE_SPEED,
    spawnTimer: 0.55,
    crashReason: null,
    obstacles: [],
  };
}

export function resetGame(bestScore = 0): GameState {
  return createGame(bestScore);
}

export function movePlayer(state: GameState, direction: MoveDirection): GameState {
  if (state.phase === 'crashed') return state;
  const nextLane = clampLane(state.lane + direction);
  return { ...state, phase: 'running', lane: nextLane };
}

export function startRun(state: GameState): GameState {
  if (state.phase !== 'ready') return state;
  return { ...state, phase: 'running' };
}

export function playerRect(lane: LaneIndex, laneOffset = 0): Rect {
  return {
    left: laneToX(lane) - PLAYER_RECT.width / 2 + laneOffset,
    top: PLAYER_RECT.top,
    width: PLAYER_RECT.width,
    height: PLAYER_RECT.height,
  };
}

export function obstacleRect(obstacle: Obstacle): Rect {
  return {
    left: laneToX(obstacle.lane) - obstacle.width / 2,
    top: obstacle.y,
    width: obstacle.width,
    height: obstacle.height,
  };
}

export function stepGame(state: GameState, dt: number): GameState {
  if (state.phase !== 'running') {
    const laneOffset = state.laneOffset + (0 - state.laneOffset) * Math.min(1, dt * 10);
    return { ...state, laneOffset };
  }

  const speed = Math.min(MAX_SPEED, state.speed + ACCELERATION * dt);
  const distance = state.distance + speed * dt;
  const score = Math.max(state.score, Math.floor(distance * 12.5));
  const laneOffset = state.laneOffset + (0 - state.laneOffset) * Math.min(1, dt * 12.5);
  let spawnTimer = state.spawnTimer - dt;
  let obstacles = state.obstacles
    .map((obstacle) => ({ ...obstacle, y: obstacle.y + speed * dt }))
    .filter((obstacle) => obstacle.y < ROAD_BOTTOM + 10);

  while (spawnTimer <= 0) {
    obstacles = [...spawnWave(speed), ...obstacles];
    spawnTimer += Math.max(MIN_SPAWN_DELAY, INITIAL_SPAWN_DELAY - speed * 0.0036);
  }

  const player = playerRect(state.lane, laneOffset);
  const hit = obstacles.find((obstacle) => rectsOverlap(player, obstacleRect(obstacle)));

  if (hit) {
    return {
      ...state,
      phase: 'crashed',
      speed,
      distance,
      score,
      laneOffset,
      bestScore: Math.max(state.bestScore, score),
      crashReason: hit.kind === 'truck' ? 'You clipped a truck.' : 'You hit an obstacle.',
      obstacles,
      spawnTimer,
    };
  }

  return {
    ...state,
    speed,
    distance,
    score,
    bestScore: Math.max(state.bestScore, score),
    laneOffset,
    crashReason: null,
    obstacles,
    spawnTimer,
  };
}

export function laneName(lane: LaneIndex): string {
  return ['left', 'center', 'right'][lane];
}
