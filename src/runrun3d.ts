import * as THREE from 'three';

export type GamePhase = 'ready' | 'running' | 'crashed';
export type ObstacleKind = 'stone' | 'log' | 'gate' | 'boulder';
export type ControlAction = 'left' | 'right' | 'jump' | 'slide' | 'start' | 'restart';

export interface GameSnapshot {
  phase: GamePhase;
  score: number;
  bestScore: number;
  speed: number;
  distance: number;
  lane: number;
  message: string;
}

interface ObstacleState {
  lane: number;
  kind: ObstacleKind;
  mesh: THREE.Group;
  box: THREE.Box3;
  size: THREE.Vector3;
  z: number;
  passed: boolean;
}

interface CoinState {
  lane: number;
  mesh: THREE.Mesh;
  z: number;
  collected: boolean;
}

interface TexturePack {
  stone: THREE.CanvasTexture;
  stoneAlt: THREE.CanvasTexture;
  plank: THREE.CanvasTexture;
  leaf: THREE.CanvasTexture;
  sky: THREE.CanvasTexture;
  gold: THREE.CanvasTexture;
  cloth: THREE.CanvasTexture;
}

const LANES = [-2.25, 0, 2.25] as const;
const PLAYER_Z = 0;
const PLAYER_HALF_WIDTH = 0.62;
const PLAYER_HALF_DEPTH = 0.48;
const GROUND_Y = 0;
const ROAD_SEGMENT_COUNT = 14;
const ROAD_SEGMENT_LENGTH = 10;
const ROAD_SPEED_MAX = 28;
const ROAD_SPEED_MIN = 12;
const SPAWN_DISTANCE = 112;
const CAMERA_LERP = 1 - Math.exp(-0.09);
const LANE_LERP = 1 - Math.exp(-0.14);
const GRAVITY = 24.5;
const JUMP_VELOCITY = 9.75;
const SLIDE_DURATION = 0.82;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function damp(current: number, target: number, smoothing: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-smoothing * dt));
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function choice<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

function makeCanvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function createTextures(): TexturePack {
  const stone = makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#7f725c';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 32) {
      for (let x = 0; x < size; x += 32) {
        const hue = 30 + Math.random() * 14;
        const light = 34 + Math.random() * 18;
        ctx.fillStyle = `hsl(${hue} 18% ${light}%)`;
        ctx.fillRect(x + 1, y + 1, 30, 30);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeRect(x + 0.5, y + 0.5, 31, 31);
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.fillRect(x + 4, y + 23, 22, 2);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 80; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  stone.repeat.set(1.5, 10);

  const stoneAlt = makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#5f5649';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 40) {
      for (let x = 0; x < size; x += 40) {
        const tint = Math.random() * 18;
        ctx.fillStyle = `rgb(${92 + tint}, ${86 + tint * 0.4}, ${72 + tint * 0.2})`;
        ctx.fillRect(x + 2, y + 2, 36, 36);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x + 8, y + 8, 22, 4);
      }
    }
  });
  stoneAlt.repeat.set(1.25, 8);

  const plank = makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#6b4a2c';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 10; i++) {
      const y = i * 25;
      ctx.fillStyle = i % 2 ? '#5b3f25' : '#78512f';
      ctx.fillRect(0, y, size, 25);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.moveTo(0, y + 1);
      ctx.lineTo(size, y + 1);
      ctx.stroke();
      for (let x = 0; x < size; x += 64) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x + 10, y + 4, 3, 18);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 70; i++) {
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
  });
  plank.repeat.set(2, 12);

  const leaf = makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#17391f';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 130; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 2 + Math.random() * 10;
      ctx.fillStyle = `rgba(${40 + Math.random() * 40}, ${90 + Math.random() * 90}, ${40 + Math.random() * 40}, 0.7)`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.2, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  leaf.repeat.set(4, 4);

  const sky = makeCanvasTexture(256, (ctx, size) => {
    const grd = ctx.createLinearGradient(0, 0, 0, size);
    grd.addColorStop(0, '#8dd8ff');
    grd.addColorStop(0.28, '#3f7cc3');
    grd.addColorStop(0.68, '#13284a');
    grd.addColorStop(1, '#07111f');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size * 0.5;
      const r = 20 + Math.random() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.20)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });

  const gold = makeCanvasTexture(256, (ctx, size) => {
    const grd = ctx.createLinearGradient(0, 0, size, size);
    grd.addColorStop(0, '#fff2a5');
    grd.addColorStop(0.4, '#ffcf4f');
    grd.addColorStop(1, '#b57b00');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, size - 24, size - 24);
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 8 + Math.random() * 18, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.stroke();
    }
  });

  const cloth = makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#d9b58a';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 16) {
      for (let x = 0; x < size; x += 16) {
        const shade = 180 + ((x + y) % 32);
        ctx.fillStyle = `rgb(${shade}, ${Math.max(120, shade - 40)}, ${Math.max(72, shade - 96)})`;
        ctx.fillRect(x, y, 16, 16);
      }
    }
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#341f0f';
    ctx.fillRect(0, 0, size, 64);
    ctx.globalAlpha = 1;
  });

  return { stone, stoneAlt, plank, leaf, sky, gold, cloth };
}

function makeRunnerPart(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class RunRunGame {
  private readonly container: HTMLElement;
  private readonly onSnapshot: (snapshot: GameSnapshot) => void;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly world = new THREE.Group();
  private readonly roadGroup = new THREE.Group();
  private readonly decorGroup = new THREE.Group();
  private readonly obstaclesGroup = new THREE.Group();
  private readonly coinsGroup = new THREE.Group();
  private readonly playerGroup = new THREE.Group();
  private readonly textures = createTextures();
  private readonly roadSegments: THREE.Mesh[] = [];
  private readonly torches: THREE.PointLight[] = [];
  private readonly archPieces: THREE.Group[] = [];
  private readonly obstacles: ObstacleState[] = [];
  private readonly coins: CoinState[] = [];
  private readonly keys = { left: false, right: false, up: false, down: false };
  private readonly pointer = { active: false, x: 0, y: 0 };
  private animationFrame = 0;
  private disposed = false;
  private lastTime = performance.now();
  private phase: GamePhase = 'ready';
  private lane = 1;
  private laneTarget = 1;
  private laneX = LANES[1];
  private laneLean = 0;
  private playerY = 0;
  private playerYVelocity = 0;
  private slideTime = 0;
  private speed = 0;
  private distance = 0;
  private score = 0;
  private bestScore = 0;
  private spawnTimer = 1.1;
  private coinTimer = 0.6;
  private gameMessage = 'Tap, swipe, or press any move key to start.';
  private backgroundPulse = 0;
  private readonly player = {
    root: new THREE.Group(),
    torso: null as THREE.Mesh | null,
    head: null as THREE.Mesh | null,
    leftArm: null as THREE.Mesh | null,
    rightArm: null as THREE.Mesh | null,
    leftLeg: null as THREE.Mesh | null,
    rightLeg: null as THREE.Mesh | null,
    backpack: null as THREE.Mesh | null,
  };

  constructor(container: HTMLElement, onSnapshot: (snapshot: GameSnapshot) => void) {
    this.container = container;
    this.onSnapshot = onSnapshot;
    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#07111f');
    this.scene.fog = new THREE.Fog('#07111f', 14, 86);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 220);
    this.camera.position.set(0, 4.6, 9.5);

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(160, 24, 24),
      new THREE.MeshBasicMaterial({ map: this.textures.sky, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(skyDome);

    const amb = new THREE.HemisphereLight('#9fdcff', '#0b110b', 1.55);
    this.scene.add(amb);

    const sun = new THREE.DirectionalLight('#fff6d8', 2.25);
    sun.position.set(-7, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 44;
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    this.scene.add(sun);

    const rim = new THREE.PointLight('#64d2ff', 0.8, 20, 2.1);
    rim.position.set(0, 4, 8);
    this.scene.add(rim);

    this.world.rotation.x = -0.04;
    this.scene.add(this.world);
    this.world.add(this.roadGroup, this.decorGroup, this.obstaclesGroup, this.coinsGroup, this.playerGroup);

    this.buildRoad();
    this.buildDecor();
    this.buildPlayer();
    this.buildGuides();

    this.container.style.touchAction = 'none';
    this.container.tabIndex = 0;
    this.container.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
    this.container.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    this.container.addEventListener('pointerup', this.handlePointerUp, { passive: true });
    this.container.addEventListener('pointercancel', this.handlePointerUp, { passive: true });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('blur', this.handleBlur);

    this.setSnapshot('Tap, swipe, or press any move key to start.');
    this.tick();
  }

  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.container.removeEventListener('pointerdown', this.handlePointerDown);
    this.container.removeEventListener('pointermove', this.handlePointerMove);
    this.container.removeEventListener('pointerup', this.handlePointerUp);
    this.container.removeEventListener('pointercancel', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('blur', this.handleBlur);
    this.renderer.dispose();
    this.container.innerHTML = '';
  }

  public restart(): void {
    this.phase = 'running';
    this.gameMessage = 'Running';
    this.speed = ROAD_SPEED_MIN;
    this.distance = 0;
    this.score = 0;
    this.spawnTimer = 0.65;
    this.coinTimer = 0.4;
    this.playerY = 0;
    this.playerYVelocity = 0;
    this.slideTime = 0;
    this.lane = 1;
    this.laneTarget = 1;
    this.laneX = LANES[1];
    this.laneLean = 0;
    this.obstacles.forEach((obstacle) => {
      obstacle.mesh.parent?.remove(obstacle.mesh);
    });
    this.obstacles.length = 0;
    this.coins.forEach((coin) => {
      coin.mesh.parent?.remove(coin.mesh);
    });
    this.coins.length = 0;
    this.setSnapshot('Running');
  }

  public start(): void {
    if (this.phase === 'ready') this.restart();
  }

  public control(action: ControlAction): void {
    if (action === 'restart') {
      this.restart();
      return;
    }
    if (this.phase === 'crashed' && action !== 'start') return;
    if (this.phase === 'ready') this.start();

    switch (action) {
      case 'left':
        this.laneTarget = clamp(this.laneTarget - 1, 0, 2);
        this.laneLean = 0.35;
        break;
      case 'right':
        this.laneTarget = clamp(this.laneTarget + 1, 0, 2);
        this.laneLean = -0.35;
        break;
      case 'jump':
        this.jump();
        break;
      case 'slide':
        this.slide();
        break;
      case 'start':
        this.start();
        break;
    }
  }

  private buildRoad(): void {
    const roadMat = new THREE.MeshStandardMaterial({
      map: this.textures.plank,
      color: '#c2a57b',
      roughness: 1,
      metalness: 0,
    });
    const railMat = new THREE.MeshStandardMaterial({ color: '#4f3925', roughness: 1, metalness: 0 });
    const postMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneAlt, roughness: 1 });

    for (let i = 0; i < ROAD_SEGMENT_COUNT; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.24, ROAD_SEGMENT_LENGTH + 0.4), roadMat.clone());
      seg.receiveShadow = true;
      seg.castShadow = false;
      seg.position.set(0, 0, -i * ROAD_SEGMENT_LENGTH);
      seg.material.map = i % 2 ? this.textures.plank : this.textures.stone;
      if (seg.material.map) {
        seg.material.map.repeat.set(1.2, 1.6);
        seg.material.map.needsUpdate = true;
      }
      this.roadGroup.add(seg);
      this.roadSegments.push(seg);

      const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, ROAD_SEGMENT_LENGTH), railMat);
      leftRail.position.set(-2.75, 0.36, -i * ROAD_SEGMENT_LENGTH);
      leftRail.castShadow = true;
      this.roadGroup.add(leftRail);

      const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, ROAD_SEGMENT_LENGTH), railMat);
      rightRail.position.set(2.75, 0.36, -i * ROAD_SEGMENT_LENGTH);
      rightRail.castShadow = true;
      this.roadGroup.add(rightRail);

      const postLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), postMat);
      postLeft.position.set(-2.75, 0.6, -i * ROAD_SEGMENT_LENGTH - ROAD_SEGMENT_LENGTH * 0.45);
      postLeft.castShadow = true;
      this.roadGroup.add(postLeft);

      const postRight = postLeft.clone();
      postRight.position.x = 2.75;
      this.roadGroup.add(postRight);
    }
  }

  private buildDecor(): void {
    const leafMat = new THREE.MeshStandardMaterial({ map: this.textures.leaf, roughness: 1, color: '#81c784' });
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneAlt, roughness: 1, color: '#c5b49a' });
    const goldMat = new THREE.MeshStandardMaterial({ map: this.textures.gold, emissive: '#6b4f00', emissiveIntensity: 0.16, roughness: 0.42, metalness: 0.25 });
    const torchFire = new THREE.PointLight('#ffb347', 1.4, 8, 2);

    const archPositions = [-20, -44, -68, -92, -116, -140];
    archPositions.forEach((z, index) => {
      const arch = new THREE.Group();
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.75, 4.6, 0.8), stoneMat);
      const columnRight = column.clone();
      column.position.set(-2.9, 2.3, 0);
      columnRight.position.set(2.9, 2.3, 0);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.7, 0.88), stoneMat);
      beam.position.set(0, 4.72, 0);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.28, 1.2), goldMat);
      cap.position.set(0, 5.18, 0);
      arch.add(column, columnRight, beam, cap);
      arch.position.z = z;
      arch.position.y = 0.01;
      arch.rotation.y = index % 2 ? 0.02 : -0.02;
      arch.castShadow = true;
      arch.receiveShadow = true;
      this.decorGroup.add(arch);
      this.archPieces.push(arch);
    });

    for (let i = 0; i < 18; i++) {
      const z = -i * 8.8;
      const leftPalm = this.buildPalm(-4.6 - Math.random() * 1.4, z - 2.5, 0.8 + Math.random() * 0.8, leafMat);
      const rightPalm = this.buildPalm(4.6 + Math.random() * 1.4, z - 5, 0.8 + Math.random() * 0.8, leafMat);
      this.decorGroup.add(leftPalm, rightPalm);
    }

    for (let i = 0; i < 10; i++) {
      const z = -i * 16 - 8;
      const torchLeft = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.1, 6), stoneMat);
      stick.position.y = 1.0;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), goldMat);
      flame.position.y = 2.0;
      const light = new THREE.PointLight('#ffaf4f', 1.1, 10, 2);
      light.position.y = 2.0;
      torchLeft.add(stick, flame, light);
      torchLeft.position.set(-3.3, 0, z);
      this.decorGroup.add(torchLeft);
      this.torches.push(light);

      const torchRight = torchLeft.clone(true);
      torchRight.position.x = 3.3;
      this.decorGroup.add(torchRight);
      const cloned = torchRight.children.find((child) => child.type === 'PointLight') as THREE.PointLight | undefined;
      if (cloned) this.torches.push(cloned);
    }

    const cliffMat = new THREE.MeshStandardMaterial({ color: '#1e2f1a', map: this.textures.leaf, roughness: 1 });
    for (let side of [-1, 1] as const) {
      const cliff = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 8.5, 60, 8, 1, true, 0, Math.PI), cliffMat);
      cliff.position.set(side * 10.5, 10, -50);
      cliff.rotation.z = Math.PI / 2;
      cliff.rotation.y = side < 0 ? Math.PI : 0;
      this.decorGroup.add(cliff);
    }

    const river = new THREE.Mesh(new THREE.PlaneGeometry(80, 120), new THREE.MeshStandardMaterial({ color: '#0c4a62', roughness: 0.82, metalness: 0.04, transparent: true, opacity: 0.92 }));
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, -0.35, -70);
    this.decorGroup.add(river);

    const mist = new THREE.FogExp2('#07111f', 0.015);
    this.scene.fog = mist;
  }

  private buildPalm(x: number, z: number, scale: number, leafMat: THREE.MeshStandardMaterial): THREE.Group {
    const palm = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#735532', roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 5.4, 7), trunkMat);
    trunk.castShadow = true;
    trunk.position.y = 2.7;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.85, 9, 9), leafMat);
    crown.position.y = 5.2;
    crown.scale.set(1.2, 0.7, 1.2);
    palm.add(trunk, crown);
    palm.position.set(x, 0, z);
    palm.scale.setScalar(scale);
    return palm;
  }

  private buildPlayer(): void {
    this.player.root.position.set(LANES[1], 0, PLAYER_Z);
    this.player.root.castShadow = true;
    this.playerGroup.add(this.player.root);

    const skin = new THREE.MeshStandardMaterial({ color: '#efc08d', roughness: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ map: this.textures.cloth, color: '#d3ad72', roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#27303b', roughness: 1 });
    const bag = new THREE.MeshStandardMaterial({ color: '#12212f', roughness: 1 });
    const visor = new THREE.MeshStandardMaterial({ color: '#1c2b3d', emissive: '#7dd3fc', emissiveIntensity: 0.26, roughness: 0.35 });

    const torso = makeRunnerPart(new THREE.CapsuleGeometry(0.48, 1.0, 4, 8), cloth);
    torso.position.y = 1.55;
    torso.rotation.z = Math.PI / 2;
    this.player.torso = torso;

    const head = makeRunnerPart(new THREE.SphereGeometry(0.39, 16, 16), skin);
    head.position.set(0.06, 2.45, 0);
    this.player.head = head;

    const backpack = makeRunnerPart(new THREE.BoxGeometry(0.48, 0.62, 0.32), bag);
    backpack.position.set(-0.34, 1.55, -0.3);
    this.player.backpack = backpack;

    const armGeo = new THREE.CapsuleGeometry(0.12, 0.65, 3, 8);
    const legGeo = new THREE.CapsuleGeometry(0.13, 0.78, 3, 8);
    const leftArm = makeRunnerPart(armGeo, skin);
    const rightArm = makeRunnerPart(armGeo, skin);
    const leftLeg = makeRunnerPart(legGeo, dark);
    const rightLeg = makeRunnerPart(legGeo, dark);
    leftArm.position.set(-0.42, 1.5, 0.05);
    rightArm.position.set(0.42, 1.5, 0.05);
    leftLeg.position.set(-0.22, 0.55, 0);
    rightLeg.position.set(0.22, 0.55, 0);
    this.player.leftArm = leftArm;
    this.player.rightArm = rightArm;
    this.player.leftLeg = leftLeg;
    this.player.rightLeg = rightLeg;

    const visorBand = makeRunnerPart(new THREE.TorusGeometry(0.38, 0.07, 8, 20), visor);
    visorBand.position.set(0.02, 2.52, 0.28);
    visorBand.rotation.y = Math.PI / 2;

    this.player.root.add(torso, head, backpack, leftArm, rightArm, leftLeg, rightLeg, visorBand);
    this.player.root.scale.set(1.05, 1.05, 1.05);
  }

  private buildGuides(): void {
    const guideMat = new THREE.MeshStandardMaterial({ color: '#2d3c49', roughness: 1, metalness: 0 });
    for (let i = 0; i < 12; i++) {
      const guide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 1.8), guideMat);
      guide.position.set(0, 0.15, -i * 10 - 5);
      guide.receiveShadow = true;
      this.roadGroup.add(guide);
    }
  }

  private spawnPattern(): void {
    const patterns: number[][] = [
      [0],
      [2],
      [1],
      [0, 2],
      [0, 1],
      [1, 2],
      [0, 1, 2],
    ];
    const pattern = choice(patterns);
    pattern.forEach((lane, idx) => {
      const kind: ObstacleKind = this.pickObstacleKind();
      const obstacle = this.createObstacle(kind);
      obstacle.mesh.position.set(LANES[lane], 0, -SPAWN_DISTANCE - idx * 12 - rand(0, 8));
      obstacle.mesh.rotation.y = rand(-0.2, 0.2);
      obstacle.box = new THREE.Box3();
      this.obstaclesGroup.add(obstacle.mesh);
      this.obstacles.push(obstacle);
    });

    if (Math.random() < 0.72) {
      const lane = Math.floor(rand(0, 3));
      const coin = this.createCoin();
      coin.mesh.position.set(LANES[lane], 1.9 + rand(0, 0.6), -SPAWN_DISTANCE - rand(5, 24));
      this.coinsGroup.add(coin.mesh);
      this.coins.push(coin);
    }
  }

  private pickObstacleKind(): ObstacleKind {
    if (this.speed > 24) return choice(['stone', 'log', 'gate', 'boulder'] as const);
    return choice(['stone', 'log', 'stone', 'boulder'] as const);
  }

  private createObstacle(kind: ObstacleKind): ObstacleState {
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stone, color: '#d8c5a7', roughness: 1, metalness: 0 });
    const mossMat = new THREE.MeshStandardMaterial({ color: '#486a38', roughness: 1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#4d331d', roughness: 1 });
    const metalMat = new THREE.MeshStandardMaterial({ color: '#916b45', roughness: 0.7, metalness: 0.1 });

    const group = new THREE.Group();
    let size = new THREE.Vector3(1, 1, 1);

    if (kind === 'stone') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.25, 1.02), stoneMat);
      base.castShadow = true;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.42, 0.86), mossMat);
      top.position.y = 0.82;
      group.add(base, top);
      size = new THREE.Vector3(1.04, 1.36, 1.04);
    } else if (kind === 'log') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.58, 2.16, 10), darkMat);
      trunk.rotation.z = Math.PI / 2;
      trunk.castShadow = true;
      const bind = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 8, 16), metalMat);
      bind.position.set(0.82, 0, 0);
      const bind2 = bind.clone();
      bind2.position.x = -0.82;
      group.add(trunk, bind, bind2);
      size = new THREE.Vector3(2.2, 0.9, 1.0);
    } else if (kind === 'gate') {
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.8, 0.42), stoneMat);
      const right = left.clone();
      right.position.x = 1.52;
      left.position.x = -1.52;
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.52, 0.54), darkMat);
      top.position.y = 1.35;
      const hanging = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.2), metalMat);
      hanging.position.set(0, 0.2, 0.08);
      group.add(left, right, top, hanging);
      size = new THREE.Vector3(3.48, 2.82, 0.75);
    } else {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.86, 0), stoneMat);
      ball.castShadow = true;
      const crack = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.08, 8, 18), darkMat);
      crack.rotation.x = Math.PI / 2;
      crack.position.y = 0.14;
      group.add(ball, crack);
      size = new THREE.Vector3(1.72, 1.72, 1.72);
    }

    group.position.y = 0.02;
    return { lane: 1, kind, mesh: group, box: new THREE.Box3(), size, z: -SPAWN_DISTANCE, passed: false };
  }

  private createCoin(): CoinState {
    const mat = new THREE.MeshStandardMaterial({ map: this.textures.gold, color: '#ffce4d', emissive: '#ffaf32', emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.18 });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.08, 10, 20), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    return { lane: 1, mesh, z: -SPAWN_DISTANCE, collected: false };
  }

  private jump(): void {
    if (this.playerY <= 0.02) {
      this.playerYVelocity = JUMP_VELOCITY;
      if (this.slideTime > 0) this.slideTime = 0;
    }
  }

  private slide(): void {
    if (this.playerY <= 0.2) {
      this.slideTime = SLIDE_DURATION;
      this.playerYVelocity = Math.min(this.playerYVelocity, 0);
    }
  }

  private crash(reason: string): void {
    if (this.phase === 'crashed') return;
    this.phase = 'crashed';
    this.gameMessage = reason;
    this.bestScore = Math.max(this.bestScore, this.score);
    this.speed = Math.max(0, this.speed * 0.38);
    this.setSnapshot(reason);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      this.control('left');
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
      event.preventDefault();
      this.control('right');
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W' || event.key === ' ') {
      event.preventDefault();
      this.control('jump');
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
      event.preventDefault();
      this.control('slide');
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.phase === 'crashed') this.restart();
      else this.control('start');
      return;
    }
    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      this.restart();
    }
  };

  private handlePointerDown = (event: PointerEvent): void => {
    this.pointer.active = true;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    if (this.phase === 'ready') this.control('start');
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointer.active) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    if (Math.abs(dx) > 42 || Math.abs(dy) > 42) {
      this.pointer.active = false;
      if (Math.abs(dx) > Math.abs(dy)) this.control(dx > 0 ? 'right' : 'left');
      else this.control(dy > 0 ? 'slide' : 'jump');
    }
  };

  private handlePointerUp = (): void => {
    this.pointer.active = false;
  };

  private handleResize = (): void => {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private handleBlur = (): void => {
    this.keys.left = this.keys.right = this.keys.up = this.keys.down = false;
    this.pointer.active = false;
  };

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = clamp((now - this.lastTime) / 1000, 0, 0.033);
    this.lastTime = now;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private update(dt: number): void {
    this.backgroundPulse += dt;
    const isRunning = this.phase === 'running';

    if (isRunning) {
      this.speed = damp(this.speed, clamp(ROAD_SPEED_MIN + this.distance * 0.05, ROAD_SPEED_MIN, ROAD_SPEED_MAX), 1.4, dt);
      this.distance += this.speed * dt;
      this.score = Math.max(this.score, Math.floor(this.distance * 11.5));
      this.bestScore = Math.max(this.bestScore, this.score);
      this.spawnTimer -= dt;
      this.coinTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnPattern();
        this.spawnTimer = clamp(1.1 - this.speed * 0.02, 0.42, 1.08) * rand(0.78, 1.25);
      }
      if (this.coinTimer <= 0) {
        this.coinTimer = rand(0.45, 0.82);
        if (Math.random() < 0.8) this.spawnCoinLine();
      }
    } else if (this.phase === 'ready') {
      this.speed = damp(this.speed, 0, 2.2, dt);
      this.score = 0;
    }

    this.lane = this.laneTarget;
    this.laneX = damp(this.laneX, LANES[this.laneTarget], 11, dt);
    this.laneLean = damp(this.laneLean, 0, 5.5, dt);

    if (this.slideTime > 0) this.slideTime -= dt;
    const slideFactor = this.slideTime > 0 ? 0.62 : 1;

    if (this.playerYVelocity !== 0 || this.playerY > 0) {
      this.playerY += this.playerYVelocity * dt;
      this.playerYVelocity -= GRAVITY * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerYVelocity = 0;
      }
    }

    const cameraOffsetZ = 9.5;
    const cameraY = 4.1 + this.playerY * 0.38 + (this.slideTime > 0 ? -0.45 : 0);
    const cameraX = this.laneX * 0.16 + this.laneLean * 0.42;
    this.camera.position.x = damp(this.camera.position.x, cameraX, 4.4, dt);
    this.camera.position.y = damp(this.camera.position.y, cameraY, 4.4, dt);
    this.camera.position.z = damp(this.camera.position.z, cameraOffsetZ, 4.4, dt);
    this.camera.lookAt(this.camera.position.x * 0.24, 1.35 + this.playerY * 0.15, -9);
    this.camera.rotation.z = this.laneLean * 0.03;

    const pulse = Math.sin(this.backgroundPulse * 2.2) * 0.02 + Math.sin(this.backgroundPulse * 0.7) * 0.01;
    this.world.rotation.y = pulse;
    this.player.root.position.x = this.laneX;
    this.player.root.position.y = this.playerY;
    this.player.root.position.z = 0;
    this.player.root.scale.y = slideFactor;
    this.player.root.scale.x = 1 + Math.abs(this.laneLean) * 0.06;
    this.player.root.scale.z = 1;
    this.player.root.rotation.y = -this.laneLean * 0.28;

    this.animateRunner(dt, isRunning);
    this.updateRoad(dt, isRunning);
    this.updateDecor(dt);
    this.updateObstacles(dt, isRunning);
    this.updateCoins(dt, isRunning);

    if (this.phase === 'ready') {
      this.gameMessage = 'Tap, swipe, or press any move key to start.';
    } else if (this.phase === 'running') {
      this.gameMessage = 'Running';
    }

    this.setSnapshot(this.gameMessage);
  }

  private animateRunner(dt: number, running: boolean): void {
    const swing = running ? Math.sin(this.distance * 12.5) : Math.sin(this.backgroundPulse * 4.2) * 0.3;
    const armSwing = swing * 0.8;
    const legSwing = swing * 1.05;
    const bob = running ? Math.sin(this.distance * 8.2) * 0.08 : Math.sin(this.backgroundPulse * 3.2) * 0.045;

    if (this.player.torso) {
      this.player.torso.position.y = 1.55 + bob;
      this.player.torso.rotation.z = Math.PI / 2 + this.laneLean * 0.24;
    }
    if (this.player.head) {
      this.player.head.position.y = 2.43 + bob * 0.95;
      this.player.head.rotation.y = this.laneLean * -0.25;
    }
    if (this.player.backpack) {
      this.player.backpack.position.y = 1.56 + bob * 0.5;
    }
    if (this.player.leftArm) this.player.leftArm.rotation.x = armSwing;
    if (this.player.rightArm) this.player.rightArm.rotation.x = -armSwing;
    if (this.player.leftLeg) this.player.leftLeg.rotation.x = -legSwing;
    if (this.player.rightLeg) this.player.rightLeg.rotation.x = legSwing;
  }

  private updateRoad(dt: number, running: boolean): void {
    const roadSpeed = running ? this.speed * 0.38 : 0.45;
    this.roadSegments.forEach((segment, index) => {
      segment.position.z += roadSpeed * dt;
      if (segment.position.z > ROAD_SEGMENT_LENGTH * 2) {
        segment.position.z -= ROAD_SEGMENT_LENGTH * ROAD_SEGMENT_COUNT;
        segment.position.y = Math.sin((index + this.distance) * 0.18) * 0.025;
      }
    });

    this.roadGroup.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child !== this.player.root) {
        child.position.z += roadSpeed * dt;
        if (child.position.z > ROAD_SEGMENT_LENGTH * 2) child.position.z -= ROAD_SEGMENT_LENGTH * ROAD_SEGMENT_COUNT;
      }
    });
  }

  private updateDecor(dt: number): void {
    const sway = Math.sin(this.backgroundPulse * 1.9) * 0.018;
    this.archPieces.forEach((arch, index) => {
      arch.rotation.y = Math.sin(this.backgroundPulse * 0.3 + index) * 0.03;
      arch.position.y = Math.sin(this.backgroundPulse * 1.4 + index) * 0.02;
      arch.position.z += this.speed * dt * 0.32;
      if (arch.position.z > 16) arch.position.z -= 160;
    });
    this.decorGroup.children.forEach((child) => {
      child.rotation.z = sway * 0.2;
      if (child instanceof THREE.PointLight) {
        child.intensity = 1.05 + Math.sin(this.backgroundPulse * 7 + child.position.x * 3) * 0.18;
      }
      if (child.position.z !== undefined && child.position.z > 18) child.position.z -= 160;
      if (child.position.z !== undefined) child.position.z += this.speed * dt * 0.18;
    });
  }

  private updateObstacles(dt: number, running: boolean): void {
    const worldSpeed = running ? this.speed : 0.2;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obstacle = this.obstacles[i];
      obstacle.z += worldSpeed * dt;
      obstacle.mesh.position.z = obstacle.z;
      obstacle.mesh.rotation.y += dt * 0.4;
      obstacle.mesh.position.y = Math.sin((obstacle.z + i) * 0.12) * 0.03;

      const spin = obstacle.kind === 'boulder' ? dt * 2.8 : dt * 0.35;
      obstacle.mesh.rotation.x += spin * 0.08;

      const center = new THREE.Vector3(obstacle.mesh.position.x, 1.0, obstacle.z);
      const box = obstacle.box;
      box.setFromCenterAndSize(center, obstacle.size);

      if (running && !obstacle.passed && obstacle.z > -2.5) {
        obstacle.passed = true;
        this.score += 10;
        this.bestScore = Math.max(this.bestScore, this.score);
      }

      if (running && obstacle.z > 2.2) {
        obstacle.mesh.parent?.remove(obstacle.mesh);
        this.obstacles.splice(i, 1);
        continue;
      }

      if (running && this.phase === 'running') {
        const playerBox = this.getPlayerBox();
        if (playerBox.intersectsBox(box)) {
          const canSlide = obstacle.kind === 'gate';
          const canJump = obstacle.kind === 'log' || obstacle.kind === 'boulder';
          if (canSlide && this.slideTime > 0) continue;
          if (canJump && this.playerY > 1.05) continue;
          this.crash('Game over.');
        }
      }
    }
  }

  private updateCoins(dt: number, running: boolean): void {
    const worldSpeed = running ? this.speed : 0.2;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.z += worldSpeed * dt;
      coin.mesh.position.z = coin.z;
      coin.mesh.rotation.y += dt * 4.8;
      coin.mesh.position.y = 2.0 + Math.sin((coin.z + i) * 0.4) * 0.18;
      if (coin.z > 2.2) {
        coin.mesh.parent?.remove(coin.mesh);
        this.coins.splice(i, 1);
        continue;
      }
      if (!coin.collected && running) {
        const playerBox = this.getPlayerBox();
        const coinBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(coin.mesh.position.x, coin.mesh.position.y, coin.mesh.position.z), new THREE.Vector3(0.55, 0.55, 0.3));
        if (playerBox.intersectsBox(coinBox)) {
          coin.collected = true;
          coin.mesh.parent?.remove(coin.mesh);
          this.coins.splice(i, 1);
          this.score += 50;
          this.bestScore = Math.max(this.bestScore, this.score);
        }
      }
    }
  }

  private spawnCoinLine(): void {
    const lane = Math.floor(rand(0, 3));
    const count = Math.random() > 0.5 ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const coin = this.createCoin();
      coin.mesh.position.set(LANES[lane], 1.8 + i * 0.22, -SPAWN_DISTANCE - i * 4 - rand(0, 3));
      this.coinsGroup.add(coin.mesh);
      this.coins.push(coin);
    }
  }

  private getPlayerBox(): THREE.Box3 {
    const width = this.slideTime > 0 ? 0.72 : 1.2;
    const height = this.slideTime > 0 ? 0.95 : 2.15;
    const centerY = this.slideTime > 0 ? 0.55 : 1.08 + this.playerY;
    const centerX = this.laneX;
    return new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(centerX, centerY, PLAYER_Z), new THREE.Vector3(width, height, 0.95));
  }

  private setSnapshot(message: string): void {
    this.onSnapshot({
      phase: this.phase,
      score: this.score,
      bestScore: this.bestScore,
      speed: Math.round(this.speed * 10) / 10,
      distance: Math.round(this.distance * 10) / 10,
      lane: this.laneTarget,
      message,
    });
  }
}
