import * as THREE from 'three';

export type GamePhase = 'ready' | 'running' | 'crashed';
export type ObstacleKind = 'crate' | 'barrel' | 'barrier' | 'lamp';
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

type RunnerPart = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

interface ObstacleState {
  kind: ObstacleKind;
  lane: number;
  z: number;
  size: THREE.Vector3;
  mesh: THREE.Group;
  box: THREE.Box3;
  passed: boolean;
}

interface BananaState {
  lane: number;
  z: number;
  mesh: THREE.Group;
  box: THREE.Box3;
  collected: boolean;
}

interface Textures {
  sky: THREE.CanvasTexture;
  plank: THREE.CanvasTexture;
  rope: THREE.CanvasTexture;
  palm: THREE.CanvasTexture;
  water: THREE.CanvasTexture;
  gold: THREE.CanvasTexture;
}

const LANES = [-2.35, 0, 2.35] as const;
const PLAYER_Z = 0;
const ROAD_SEGMENT_COUNT = 16;
const ROAD_SEGMENT_LENGTH = 10;
const BASE_SPEED = 12.5;
const MAX_SPEED = 31.5;
const SPAWN_DISTANCE = 120;
const GRAVITY = 26.5;
const JUMP_VELOCITY = 10.4;
const SLIDE_DURATION = 0.78;
const LANE_LERP = 1 - Math.exp(-12 * 0.016);
const CAMERA_LERP = 1 - Math.exp(-5 * 0.016);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function damp(current: number, target: number, sharpness: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-sharpness * dt));
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
  if (!ctx) throw new Error('Could not create 2D canvas context');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function createTextures(): Textures {
  const sky = makeCanvasTexture(256, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#8fddff');
    gradient.addColorStop(0.25, '#4e88c8');
    gradient.addColorStop(0.6, '#162e53');
    gradient.addColorStop(1, '#07111f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size * 0.5;
      const r = 18 + Math.random() * 48;
      const cloud = ctx.createRadialGradient(x, y, 0, x, y, r);
      cloud.addColorStop(0, 'rgba(255,255,255,0.2)');
      cloud.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cloud;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });

  const plank = makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#7d5530';
    ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      ctx.fillStyle = row % 2 ? '#664426' : '#8a5d35';
      ctx.fillRect(0, y, size, 32);
      for (let x = 0; x < size; x += 64) {
        ctx.fillStyle = 'rgba(0,0,0,0.17)';
        ctx.fillRect(x + 10, y + 5, 3, 22);
        ctx.fillRect(x + 34, y + 5, 3, 22);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(size, y + 0.5);
      ctx.stroke();
    }
  });
  plank.repeat.set(1.2, 10);

  const rope = makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#4d3320';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#8c6a45';
    ctx.lineWidth = 8;
    for (let y = 20; y < size; y += 42) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 80; i++) {
      ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  });
  rope.repeat.set(2, 8);

  const palm = makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#1b4422';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 2 + Math.random() * 10;
      ctx.fillStyle = `rgba(${40 + Math.random() * 50}, ${110 + Math.random() * 90}, ${40 + Math.random() * 40}, 0.65)`;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.2, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  palm.repeat.set(4, 4);

  const water = makeCanvasTexture(256, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#0d4d66');
    gradient.addColorStop(1, '#082033');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = '#8dd9ff';
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      const y = i * 16 + 8;
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(64, y - 6, 128, y);
      ctx.quadraticCurveTo(192, y + 6, 256, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  water.repeat.set(6, 12);

  const gold = makeCanvasTexture(256, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#fff0a7');
    gradient.addColorStop(0.45, '#ffd34f');
    gradient.addColorStop(1, '#b07200');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 6 + Math.random() * 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  return { sky, plank, rope, palm, water, gold };
}

function createHeroPart(geometry: THREE.BufferGeometry, material: THREE.Material): RunnerPart {
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
  private readonly root = new THREE.Group();
  private readonly roadGroup = new THREE.Group();
  private readonly decorGroup = new THREE.Group();
  private readonly obstacleGroup = new THREE.Group();
  private readonly bananaGroup = new THREE.Group();
  private readonly playerGroup = new THREE.Group();
  private readonly textures = createTextures();
  private readonly roadSegments: THREE.Mesh[] = [];
  private readonly obstacles: ObstacleState[] = [];
  private readonly bananas: BananaState[] = [];
  private readonly decor: THREE.Object3D[] = [];
  private readonly clock = new THREE.Clock(false);
  private raf = 0;
  private disposed = false;
  private phase: GamePhase = 'ready';
  private bestScore = 0;
  private score = 0;
  private distance = 0;
  private speed = 0;
  private spawnTimer = 0.9;
  private bananaTimer = 0.45;
  private lane = 1;
  private laneTarget = 1;
  private laneX = LANES[1];
  private laneVelocity = 0;
  private playerY = 0;
  private playerVelocityY = 0;
  private slideTimer = 0;
  private lean = 0;
  private gameMessage = 'Tap, swipe, or press any move key to start.';
  private pulse = 0;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly player = {
    root: new THREE.Group(),
    head: null as RunnerPart | null,
    torso: null as RunnerPart | null,
    leftArm: null as RunnerPart | null,
    rightArm: null as RunnerPart | null,
    leftLeg: null as RunnerPart | null,
    rightLeg: null as RunnerPart | null,
    goggles: null as RunnerPart | null,
  };
  private lastPointer = { active: false, x: 0, y: 0 };

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
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#07111f');
    this.scene.fog = new THREE.Fog('#07111f', 18, 100);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 220);
    this.camera.position.set(0, 4.2, 9.7);

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(160, 32, 24),
      new THREE.MeshBasicMaterial({ map: this.textures.sky, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(skyDome);

    const ambient = new THREE.HemisphereLight('#a5e6ff', '#0d180f', 1.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight('#fff3d0', 2.4);
    sun.position.set(-7, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 48;
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    this.scene.add(sun);

    const fill = new THREE.PointLight('#5cd9ff', 0.95, 24, 2.2);
    fill.position.set(0, 5, 7);
    this.scene.add(fill);

    this.root.rotation.x = -0.05;
    this.scene.add(this.root);
    this.root.add(this.roadGroup, this.decorGroup, this.obstacleGroup, this.bananaGroup, this.playerGroup);

    this.buildBoardwalk();
    this.buildDecor();
    this.buildPlayer();

    this.container.style.touchAction = 'none';
    this.container.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
    this.container.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    this.container.addEventListener('pointerup', this.handlePointerUp, { passive: true });
    this.container.addEventListener('pointercancel', this.handlePointerUp, { passive: true });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('blur', this.handleBlur);

    this.clock.start();
    this.publishSnapshot();
    this.loop();
  }

  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
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

  public control(action: ControlAction): void {
    if (action === 'restart') {
      this.restart();
      return;
    }

    if (this.phase === 'ready') {
      this.start();
    }

    if (this.phase === 'crashed' && action !== 'start') {
      return;
    }

    switch (action) {
      case 'left':
        this.laneTarget = clamp(this.laneTarget - 1, 0, 2);
        this.lean = 0.22;
        break;
      case 'right':
        this.laneTarget = clamp(this.laneTarget + 1, 0, 2);
        this.lean = -0.22;
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
      case 'restart':
        this.restart();
        break;
    }
  }

  public start(): void {
    if (this.phase === 'ready') {
      this.resetRun();
      this.phase = 'running';
      this.gameMessage = 'Running';
      this.publishSnapshot();
    } else if (this.phase === 'crashed') {
      this.resetRun();
      this.phase = 'running';
      this.gameMessage = 'Running';
      this.publishSnapshot();
    }
  }

  public restart(): void {
    this.resetRun();
    this.phase = 'running';
    this.gameMessage = 'Running';
    this.publishSnapshot();
  }

  private resetRun(): void {
    this.score = 0;
    this.distance = 0;
    this.speed = BASE_SPEED;
    this.spawnTimer = 0.85;
    this.bananaTimer = 0.4;
    this.lane = 1;
    this.laneTarget = 1;
    this.laneX = LANES[1];
    this.laneVelocity = 0;
    this.playerY = 0;
    this.playerVelocityY = 0;
    this.slideTimer = 0;
    this.lean = 0;
    this.gameMessage = 'Running';
    for (const obstacle of this.obstacles) obstacle.mesh.parent?.remove(obstacle.mesh);
    this.obstacles.length = 0;
    for (const banana of this.bananas) banana.mesh.parent?.remove(banana.mesh);
    this.bananas.length = 0;
    this.player.root.position.set(LANES[1], 0, 0);
  }

  private buildBoardwalk(): void {
    const boardMat = new THREE.MeshStandardMaterial({ map: this.textures.plank, color: '#e0bf8a', roughness: 1 });
    const railMat = new THREE.MeshStandardMaterial({ map: this.textures.rope, color: '#7e5a37', roughness: 1 });
    const postMat = new THREE.MeshStandardMaterial({ map: this.textures.plank, color: '#4e3524', roughness: 1 });
    const waterMat = new THREE.MeshStandardMaterial({ map: this.textures.water, color: '#1a6c8f', roughness: 0.9, metalness: 0.03 });

    const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 240), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.42, -80);
    water.receiveShadow = true;
    this.decorGroup.add(water);

    for (let i = 0; i < ROAD_SEGMENT_COUNT; i++) {
      const z = -i * ROAD_SEGMENT_LENGTH;
      const segment = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.22, ROAD_SEGMENT_LENGTH + 0.2), boardMat.clone());
      segment.position.set(0, 0, z);
      segment.receiveShadow = true;
      segment.castShadow = false;
      if (segment.material instanceof THREE.MeshStandardMaterial && segment.material.map) {
        segment.material.map = this.textures.plank;
        segment.material.map.repeat.set(1.25, 1.2);
        segment.material.map.needsUpdate = true;
      }
      this.roadGroup.add(segment);
      this.roadSegments.push(segment);

      const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, ROAD_SEGMENT_LENGTH), railMat);
      const rightRail = leftRail.clone();
      leftRail.position.set(-2.92, 0.46, z);
      rightRail.position.set(2.92, 0.46, z);
      this.roadGroup.add(leftRail, rightRail);

      const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), postMat);
      const rightPost = leftPost.clone();
      leftPost.position.set(-2.92, 0.62, z - ROAD_SEGMENT_LENGTH * 0.45);
      rightPost.position.set(2.92, 0.62, z - ROAD_SEGMENT_LENGTH * 0.45);
      this.roadGroup.add(leftPost, rightPost);
    }
  }

  private buildDecor(): void {
    const postMat = new THREE.MeshStandardMaterial({ map: this.textures.plank, color: '#5f4023', roughness: 1 });
    const ropeMat = new THREE.MeshStandardMaterial({ map: this.textures.rope, color: '#9a744d', roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ map: this.textures.palm, color: '#7ccf68', roughness: 1 });
    const goldMat = new THREE.MeshStandardMaterial({ map: this.textures.gold, color: '#ffd14b', roughness: 0.4, metalness: 0.15, emissive: '#3a2200', emissiveIntensity: 0.1 });

    for (let i = 0; i < 16; i++) {
      const z = -i * 8.5 - 4;
      const palmLeft = this.makePalm(-5.5 - Math.random() * 2.5, z, 0.9 + Math.random() * 0.35, leafMat, postMat);
      const palmRight = this.makePalm(5.5 + Math.random() * 2.5, z - 3.2, 0.9 + Math.random() * 0.35, leafMat, postMat);
      this.decorGroup.add(palmLeft, palmRight);
      this.decor.push(palmLeft, palmRight);
    }

    for (let i = 0; i < 9; i++) {
      const z = -i * 15 - 10;
      const lampLeft = this.makeLamp(-3.35, z, postMat, ropeMat, goldMat);
      const lampRight = this.makeLamp(3.35, z - 7, postMat, ropeMat, goldMat);
      this.decorGroup.add(lampLeft, lampRight);
      this.decor.push(lampLeft, lampRight);
    }

    const signMat = new THREE.MeshStandardMaterial({ map: this.textures.gold, color: '#ffcd56', roughness: 0.35, metalness: 0.05 });
    for (let i = 0; i < 6; i++) {
      const sign = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.8, 0.22), postMat);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.14), signMat);
      board.position.set(0, 1.55, 0);
      sign.add(post, board);
      sign.position.set(i % 2 === 0 ? -4.7 : 4.7, 0, -i * 18 - 6);
      sign.rotation.y = i % 2 === 0 ? 0.13 : -0.13;
      this.decorGroup.add(sign);
      this.decor.push(sign);
    }
  }

  private makePalm(x: number, z: number, scale: number, leafMat: THREE.MeshStandardMaterial, trunkMat: THREE.MeshStandardMaterial): THREE.Group {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 5, 7), trunkMat);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 10), leafMat);
    trunk.position.y = 2.45;
    crown.position.y = 5.1;
    crown.scale.set(1.1, 0.7, 1.25);
    palm.add(trunk, crown);
    palm.position.set(x, 0, z);
    palm.scale.setScalar(scale);
    return palm;
  }

  private makeLamp(x: number, z: number, postMat: THREE.MeshStandardMaterial, ropeMat: THREE.MeshStandardMaterial, goldMat: THREE.MeshStandardMaterial): THREE.Group {
    const lamp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), postMat);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.14), ropeMat);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), goldMat);
    const light = new THREE.PointLight('#ffb44d', 1.1, 8, 2);
    base.position.y = 1.3;
    arm.position.set(0.47, 2.15, 0);
    bulb.position.set(0.88, 2.12, 0);
    light.position.set(0.88, 2.12, 0);
    lamp.add(base, arm, bulb, light);
    lamp.position.set(x, 0, z);
    return lamp;
  }

  private buildPlayer(): void {
    this.player.root.position.set(LANES[1], 0, PLAYER_Z);
    this.playerGroup.add(this.player.root);

    const skin = new THREE.MeshStandardMaterial({ color: '#f0c38e', roughness: 0.8 });
    const overalls = new THREE.MeshStandardMaterial({ color: '#1d4d8f', roughness: 1 });
    const shirt = new THREE.MeshStandardMaterial({ color: '#f5d04a', roughness: 1 });
    const boots = new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 1 });
    const goggles = new THREE.MeshStandardMaterial({ color: '#27415f', roughness: 0.35, metalness: 0.1, emissive: '#5dd7ff', emissiveIntensity: 0.14 });

    const torso = createHeroPart(new THREE.CapsuleGeometry(0.45, 1.0, 4, 8), overalls);
    torso.position.y = 1.55;
    torso.rotation.z = Math.PI / 2;
    this.player.torso = torso;

    const shirtTop = createHeroPart(new THREE.CapsuleGeometry(0.34, 0.7, 4, 8), shirt);
    shirtTop.position.y = 1.72;
    shirtTop.rotation.z = Math.PI / 2;

    const head = createHeroPart(new THREE.SphereGeometry(0.4, 18, 18), skin);
    head.position.set(0.06, 2.45, 0);
    this.player.head = head;

    const goggleBand = createHeroPart(new THREE.TorusGeometry(0.38, 0.06, 8, 20), goggles);
    goggleBand.position.set(0.02, 2.5, 0.28);
    goggleBand.rotation.y = Math.PI / 2;
    this.player.goggles = goggleBand;

    const leftArm = createHeroPart(new THREE.CapsuleGeometry(0.11, 0.72, 3, 8), skin);
    const rightArm = createHeroPart(new THREE.CapsuleGeometry(0.11, 0.72, 3, 8), skin);
    leftArm.position.set(-0.44, 1.45, 0.06);
    rightArm.position.set(0.44, 1.45, 0.06);
    this.player.leftArm = leftArm;
    this.player.rightArm = rightArm;

    const leftLeg = createHeroPart(new THREE.CapsuleGeometry(0.13, 0.8, 3, 8), boots);
    const rightLeg = createHeroPart(new THREE.CapsuleGeometry(0.13, 0.8, 3, 8), boots);
    leftLeg.position.set(-0.19, 0.52, 0);
    rightLeg.position.set(0.19, 0.52, 0);
    this.player.leftLeg = leftLeg;
    this.player.rightLeg = rightLeg;

    const strapLeft = createHeroPart(new THREE.BoxGeometry(0.1, 0.9, 0.1), overalls);
    const strapRight = strapLeft.clone() as RunnerPart;
    strapLeft.position.set(-0.22, 1.78, 0.18);
    strapRight.position.set(0.22, 1.78, 0.18);
    strapLeft.rotation.z = 0.15;
    strapRight.rotation.z = -0.15;

    const backpack = createHeroPart(new THREE.BoxGeometry(0.46, 0.56, 0.26), new THREE.MeshStandardMaterial({ color: '#12304a', roughness: 1 }));
    backpack.position.set(-0.3, 1.55, -0.28);

    this.player.root.add(torso, shirtTop, head, goggleBand, leftArm, rightArm, leftLeg, rightLeg, strapLeft, strapRight, backpack);
  }

  private makeObstacle(kind: ObstacleKind): ObstacleState {
    const wood = new THREE.MeshStandardMaterial({ map: this.textures.plank, color: '#ad7340', roughness: 1 });
    const rope = new THREE.MeshStandardMaterial({ map: this.textures.rope, color: '#785235', roughness: 1 });
    const metal = new THREE.MeshStandardMaterial({ color: '#7a8e9d', roughness: 0.5, metalness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: '#5c3d22', roughness: 1 });

    const mesh = new THREE.Group();
    let size = new THREE.Vector3(1, 1, 1);

    if (kind === 'crate') {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), wood);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.14, 1.18), metal);
      brace.position.y = 0.03;
      mesh.add(crate, brace);
      size = new THREE.Vector3(1.1, 1.1, 1.1);
    } else if (kind === 'barrel') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 1.5, 10), dark);
      const bandTop = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.08, 8, 16), metal);
      const bandMid = bandTop.clone();
      const bandBottom = bandTop.clone();
      bandTop.rotation.x = Math.PI / 2;
      bandMid.rotation.x = Math.PI / 2;
      bandBottom.rotation.x = Math.PI / 2;
      bandTop.position.y = 0.44;
      bandMid.position.y = 0.02;
      bandBottom.position.y = -0.42;
      mesh.add(barrel, bandTop, bandMid, bandBottom);
      size = new THREE.Vector3(1.3, 1.5, 1.3);
    } else if (kind === 'barrier') {
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.4, 0.32), wood);
      const right = left.clone();
      left.position.x = -1.22;
      right.position.x = 1.22;
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.34, 0.34), rope);
      top.position.y = 1.15;
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.52, 0.08), metal);
      cloth.position.set(0, 0.28, 0.1);
      mesh.add(left, right, top, cloth);
      size = new THREE.Vector3(2.7, 2.4, 0.72);
    } else {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.7, 0.2), wood);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), metal);
      lamp.position.set(0.82, 2.0, 0);
      mesh.add(pole, lamp);
      size = new THREE.Vector3(1.1, 2.7, 0.7);
    }

    mesh.position.y = 0.01;
    return {
      kind,
      lane: 1,
      z: -SPAWN_DISTANCE,
      size,
      mesh,
      box: new THREE.Box3(),
      passed: false,
    };
  }

  private makeBanana(): BananaState {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.34, 0, 0),
      new THREE.Vector3(-0.1, 0.1, 0),
      new THREE.Vector3(0.18, 0.2, 0),
      new THREE.Vector3(0.45, 0.16, 0),
    ]);
    const body = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 16, 0.14, 10, false),
      new THREE.MeshStandardMaterial({ color: '#ffd54a', roughness: 0.55, metalness: 0.05, emissive: '#a56d00', emissiveIntensity: 0.08 }),
    );
    const tipLeft = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshStandardMaterial({ color: '#9c6b1e', roughness: 1 }));
    tipLeft.position.set(-0.37, 0.01, 0);
    const tipRight = tipLeft.clone();
    tipRight.position.set(0.52, 0.16, 0);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: '#7b5620', roughness: 1 }));
    stem.position.set(-0.43, 0.04, 0);
    const banana = new THREE.Group();
    banana.add(body, tipLeft, tipRight, stem);
    banana.rotation.z = Math.PI * 0.25;
    banana.rotation.x = Math.PI * 0.05;
    return {
      lane: 1,
      z: -SPAWN_DISTANCE,
      mesh: banana,
      box: new THREE.Box3(),
      collected: false,
    };
  }

  private spawnWave(): void {
    const patterns: number[][] = [[0], [1], [2], [0, 2], [0, 1], [1, 2], [0, 1, 2]];
    const pattern = choice(patterns);
    pattern.forEach((lane, index) => {
      const obstacle = this.makeObstacle(choice(['crate', 'barrel', 'barrier', 'lamp'] as const));
      obstacle.lane = lane;
      obstacle.z = -SPAWN_DISTANCE - index * rand(9, 15);
      obstacle.mesh.position.set(LANES[lane], 0, obstacle.z);
      obstacle.mesh.rotation.y = rand(-0.2, 0.2);
      this.obstacleGroup.add(obstacle.mesh);
      this.obstacles.push(obstacle);
    });

    if (Math.random() < 0.75) {
      const lane = Math.floor(rand(0, 3));
      const bananaCount = Math.random() > 0.5 ? 4 : 6;
      for (let i = 0; i < bananaCount; i++) {
        const banana = this.makeBanana();
        banana.lane = lane;
        banana.z = -SPAWN_DISTANCE - rand(6, 24) - i * 3.2;
        banana.mesh.position.set(LANES[lane], 1.55 + Math.sin(i * 0.8) * 0.12, banana.z);
        this.bananaGroup.add(banana.mesh);
        this.bananas.push(banana);
      }
    }
  }

  private jump(): void {
    if (this.playerY <= 0.02) {
      this.playerVelocityY = JUMP_VELOCITY;
      this.slideTimer = 0;
    }
  }

  private slide(): void {
    if (this.playerY <= 0.2) {
      this.slideTimer = SLIDE_DURATION;
      this.playerVelocityY = Math.min(this.playerVelocityY, 0);
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') {
      event.preventDefault();
      this.control('left');
      return;
    }
    if (key === 'arrowright' || key === 'd') {
      event.preventDefault();
      this.control('right');
      return;
    }
    if (key === 'arrowup' || key === 'w' || key === ' ') {
      event.preventDefault();
      this.control('jump');
      return;
    }
    if (key === 'arrowdown' || key === 's') {
      event.preventDefault();
      this.control('slide');
      return;
    }
    if (key === 'enter') {
      event.preventDefault();
      if (this.phase === 'crashed') this.restart();
      else this.start();
      return;
    }
    if (key === 'r') {
      event.preventDefault();
      this.restart();
    }
  };

  private handlePointerDown = (event: PointerEvent): void => {
    this.lastPointer.active = true;
    this.lastPointer.x = event.clientX;
    this.lastPointer.y = event.clientY;
    if (this.phase === 'ready') this.start();
    if (this.phase === 'crashed') this.restart();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.lastPointer.active) return;
    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    if (Math.abs(dx) < 42 && Math.abs(dy) < 42) return;
    this.lastPointer.active = false;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.control(dx > 0 ? 'right' : 'left');
    } else {
      this.control(dy < 0 ? 'jump' : 'slide');
    }
  };

  private handlePointerUp = (): void => {
    this.lastPointer.active = false;
  };

  private handleResize = (): void => {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private handleBlur = (): void => {
    this.lastPointer.active = false;
  };

  private loop = (): void => {
    if (this.disposed) return;
    const dt = clamp(this.clock.getDelta(), 0, 0.033);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.pulse += dt;
    const running = this.phase === 'running';

    if (running) {
      this.speed = damp(this.speed, clamp(BASE_SPEED + this.distance * 0.055, BASE_SPEED, MAX_SPEED), 1.15, dt);
      this.distance += this.speed * dt;
      this.score = Math.max(this.score, Math.floor(this.distance * 12));
      this.spawnTimer -= dt;
      this.bananaTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnWave();
        this.spawnTimer = clamp(1.35 - this.speed * 0.025, 0.45, 1.1) * rand(0.8, 1.2);
      }
      if (this.bananaTimer <= 0) {
        this.bananaTimer = rand(0.45, 0.8);
      }
    } else {
      this.speed = damp(this.speed, 0, 2.1, dt);
    }

    this.lane = this.laneTarget;
    this.laneX = damp(this.laneX, LANES[this.laneTarget], 12, dt);
    this.lean = damp(this.lean, 0, 5, dt);

    if (this.slideTimer > 0) {
      this.slideTimer -= dt;
    }

    if (this.playerVelocityY !== 0 || this.playerY > 0) {
      this.playerY += this.playerVelocityY * dt;
      this.playerVelocityY -= GRAVITY * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVelocityY = 0;
      }
    }

    this.updateBoardwalk(dt, running);
    this.updateDecor(dt);
    this.updateObstacles(dt, running);
    this.updateBananas(dt, running);
    this.updatePlayer(dt, running);
    this.updateCamera(dt);

    if (this.phase === 'ready') {
      this.gameMessage = 'Tap, swipe, or press any move key to start.';
    } else if (this.phase === 'running') {
      this.gameMessage = 'Running';
    }

    this.publishSnapshot();
  }

  private updateBoardwalk(dt: number, running: boolean): void {
    const scroll = running ? this.speed : 0.12;
    for (const segment of this.roadSegments) {
      segment.position.z += scroll * dt;
      if (segment.position.z > ROAD_SEGMENT_LENGTH * 2) {
        segment.position.z -= ROAD_SEGMENT_LENGTH * ROAD_SEGMENT_COUNT;
      }
    }
  }

  private updateDecor(dt: number): void {
    for (const item of this.decor) {
      item.position.z += this.speed * dt * 0.24;
      if (item.position.z > 20) item.position.z -= 180;
      if (item instanceof THREE.PointLight) {
        item.intensity = 0.95 + Math.sin(this.pulse * 7 + item.position.x) * 0.12;
      }
    }
  }

  private updatePlayer(dt: number, running: boolean): void {
    const targetScaleY = this.slideTimer > 0 ? 0.66 : 1;
    const targetBob = running ? Math.sin(this.distance * 8.5) * 0.08 : Math.sin(this.pulse * 2.4) * 0.04;
    this.player.root.position.x = this.laneX;
    this.player.root.position.y = this.playerY;
    this.player.root.rotation.y = -this.lean * 0.4;
    this.player.root.scale.y = damp(this.player.root.scale.y || 1, targetScaleY, 9, dt);
    this.player.root.scale.x = 1 + Math.abs(this.lean) * 0.08;
    this.player.root.scale.z = 1;

    if (this.player.torso) {
      this.player.torso.position.y = 1.52 + targetBob;
      this.player.torso.rotation.z = Math.PI / 2 + this.lean * 0.16;
    }
    if (this.player.head) this.player.head.position.y = 2.44 + targetBob;
    if (this.player.leftArm) this.player.leftArm.rotation.x = Math.sin(this.distance * 12) * 0.7;
    if (this.player.rightArm) this.player.rightArm.rotation.x = -Math.sin(this.distance * 12) * 0.7;
    if (this.player.leftLeg) this.player.leftLeg.rotation.x = -Math.sin(this.distance * 13) * 0.9;
    if (this.player.rightLeg) this.player.rightLeg.rotation.x = Math.sin(this.distance * 13) * 0.9;
  }

  private updateCamera(dt: number): void {
    const targetX = this.laneX * 0.12 + this.lean * 0.25;
    const targetY = 4.1 + this.playerY * 0.35 + (this.slideTimer > 0 ? -0.45 : 0);
    this.camera.position.x = damp(this.camera.position.x, targetX, 4.4, dt);
    this.camera.position.y = damp(this.camera.position.y, targetY, 4.4, dt);
    this.camera.position.z = damp(this.camera.position.z, 9.7, 4.4, dt);
    this.cameraTarget.set(this.camera.position.x * 0.2, 1.2 + this.playerY * 0.12, -10);
    this.camera.lookAt(this.cameraTarget);
    this.camera.rotation.z = this.lean * 0.03;
  }

  private updateObstacles(dt: number, running: boolean): void {
    const scroll = running ? this.speed : 0.12;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obstacle = this.obstacles[i];
      obstacle.z += scroll * dt;
      obstacle.mesh.position.z = obstacle.z;
      obstacle.mesh.position.x = LANES[obstacle.lane];
      obstacle.mesh.rotation.y += dt * 0.25;

      const center = new THREE.Vector3(obstacle.mesh.position.x, obstacle.mesh.position.y + obstacle.size.y * 0.5, obstacle.mesh.position.z);
      obstacle.box.setFromCenterAndSize(center, obstacle.size);

      if (running && !obstacle.passed && obstacle.z > -2.4) {
        obstacle.passed = true;
        this.score += 10;
        this.bestScore = Math.max(this.bestScore, this.score);
      }

      if (obstacle.z > 4) {
        obstacle.mesh.parent?.remove(obstacle.mesh);
        this.obstacles.splice(i, 1);
        continue;
      }

      if (running && this.phase === 'running') {
        const playerBox = this.getPlayerBox();
        if (playerBox.intersectsBox(obstacle.box)) {
          if (obstacle.kind === 'barrier' && this.slideTimer > 0) continue;
          if ((obstacle.kind === 'barrel' || obstacle.kind === 'lamp') && this.playerY > 1.15) continue;
          if (obstacle.kind === 'crate' && this.playerY > 0.95) continue;
          this.crash('Game over.');
          return;
        }
      }
    }
  }

  private updateBananas(dt: number, running: boolean): void {
    const scroll = running ? this.speed : 0.12;
    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const banana = this.bananas[i];
      banana.z += scroll * dt;
      banana.mesh.position.z = banana.z;
      banana.mesh.position.x = LANES[banana.lane];
      banana.mesh.position.y = 1.5 + Math.sin((banana.z + i) * 0.5) * 0.15;
      banana.mesh.rotation.y += dt * 4.5;
      banana.box.setFromCenterAndSize(
        new THREE.Vector3(banana.mesh.position.x, banana.mesh.position.y, banana.mesh.position.z),
        new THREE.Vector3(0.75, 0.75, 0.75),
      );

      if (banana.z > 4) {
        banana.mesh.parent?.remove(banana.mesh);
        this.bananas.splice(i, 1);
        continue;
      }

      if (running && this.phase === 'running') {
        const playerBox = this.getPlayerBox();
        if (playerBox.intersectsBox(banana.box)) {
          banana.mesh.parent?.remove(banana.mesh);
          this.bananas.splice(i, 1);
          this.score += 50;
          this.bestScore = Math.max(this.bestScore, this.score);
        }
      }
    }
  }

  private getPlayerBox(): THREE.Box3 {
    const crouching = this.slideTimer > 0;
    const height = crouching ? 1.0 : 2.05;
    const width = crouching ? 0.78 : 1.08;
    const centerY = crouching ? 0.55 : 1.08 + this.playerY;
    return new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(this.laneX, centerY, PLAYER_Z), new THREE.Vector3(width, height, 0.9));
  }

  private crash(message: string): void {
    if (this.phase === 'crashed') return;
    this.phase = 'crashed';
    this.bestScore = Math.max(this.bestScore, this.score);
    this.speed = Math.max(0, this.speed * 0.34);
    this.gameMessage = message;
    this.publishSnapshot();
  }

  private publishSnapshot(): void {
    this.onSnapshot({
      phase: this.phase,
      score: this.score,
      bestScore: this.bestScore,
      speed: Math.round(this.speed * 10) / 10,
      distance: Math.round(this.distance * 10) / 10,
      lane: this.lane,
      message: this.gameMessage,
    });
  }
}
