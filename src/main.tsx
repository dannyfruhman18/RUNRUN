import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  createGame,
  laneToX,
  movePlayer,
  obstacleRect,
  playerRect,
  rectsOverlap,
  resetGame,
  stepGame,
  type GameState,
  type MoveDirection,
} from './game/runner';

const STORAGE_KEY = 'runrun.best-score';

function readBestScore(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function App() {
  const [game, setGame] = useState<GameState>(() => createGame(readBestScore()));
  const gameRef = useRef(game);
  const gestureRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(game.bestScore));
    } catch {
      // ignore storage failures
    }
  }, [game.bestScore]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.034);
      last = now;
      setGame((current) => stepGame(current, dt));
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        queueMove(-1);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        event.preventDefault();
        queueMove(1);
        return;
      }
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        restart();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (gameRef.current.phase === 'crashed') {
          restart();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false } as AddEventListenerOptions);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function queueMove(direction: MoveDirection) {
    setGame((current) => movePlayer(current, direction));
  }

  function restart() {
    setGame((current) => resetGame(Math.max(current.bestScore, current.score)));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    gestureRef.current = { x: event.clientX, y: event.clientY, active: true };
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture.active) return;
    gestureRef.current.active = false;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy)) {
      queueMove(dx > 0 ? 1 : -1);
    }
  }

  const player = playerRect(game.lane);
  const currentObstacleRects = game.obstacles.map((obstacle) => ({ obstacle, rect: obstacleRect(obstacle) }));
  const playerCollisions = currentObstacleRects.filter(({ rect }) => rectsOverlap(player, rect));
  const isDanger = game.phase === 'running' && playerCollisions.length > 0;

  return (
    <main className='app-shell'>
      <header className='topbar'>
        <div>
          <p className='eyebrow'>RUNRUN</p>
          <h1>Endless runner prototype</h1>
        </div>
        <div className='pill-row'>
          <span className='pill'>Score {game.score}</span>
          <span className='pill'>Best {game.bestScore}</span>
          <span className='pill'>Speed {Math.round(game.speed * 10)}</span>
        </div>
      </header>

      <section className={'game-stage ' + (isDanger ? 'game-stage--danger' : '')} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className='sky-glow' />
        <div className='road'>
          <div className='lane lane--left' />
          <div className='lane lane--right' />
          <div className='road-edge road-edge--left' />
          <div className='road-edge road-edge--right' />
        </div>

        <div className='lane-sense'>
          <span>Swipe left / right</span>
          <span>or tap the arrows</span>
        </div>

        {game.obstacles.map((obstacle) => (
          <div
            key={obstacle.id}
            className={'obstacle obstacle--' + obstacle.kind}
            style={{
              left: laneToX(obstacle.lane) + '%',
              top: obstacle.y + '%',
              width: obstacle.width + '%',
              height: obstacle.height + '%',
            }}
          />
        ))}

        <div
          className={'player ' + (game.phase === 'crashed' ? 'player--crashed' : '')}
          style={{
            left: laneToX(game.lane) + '%',
            top: player.top + '%',
            width: player.width + '%',
            height: player.height + '%',
          }}
        >
          <div className='player__head' />
          <div className='player__body' />
          <div className='player__shadow' />
        </div>

        <div className='hud'>
          <div>
            <p className='hud__label'>status</p>
            <p className='hud__value'>{game.phase === 'ready' ? 'Ready' : game.phase === 'running' ? 'Running' : 'Crashed'}</p>
          </div>
          <div>
            <p className='hud__label'>lane</p>
            <p className='hud__value'>{game.lane + 1} / 3</p>
          </div>
          <div>
            <p className='hud__label'>route</p>
            <p className='hud__value'>{Math.floor(game.distance * 10)} m</p>
          </div>
        </div>

        {game.phase === 'ready' && (
          <div className='overlay overlay--ready'>
            <p className='overlay__eyebrow'>Tap to start</p>
            <h2>Move left and right to dodge traffic.</h2>
            <p>Every lane change starts the run. Keep climbing the speed curve and push for the highest score.</p>
          </div>
        )}

        {game.phase === 'crashed' && (
          <div className='overlay overlay--crashed'>
            <p className='overlay__eyebrow'>Run ended</p>
            <h2>Game over.</h2>
            <p>{game.crashReason ?? 'You crashed.'} Final score: {game.score}.</p>
            <button className='primary-button' onClick={restart}>Restart</button>
          </div>
        )}
      </section>

      <footer className='controls'>
        <button className='control-button' onClick={() => queueMove(-1)} aria-label='Move left'>◀</button>
        <button className='control-button control-button--wide' onClick={restart}>Restart</button>
        <button className='control-button' onClick={() => queueMove(1)} aria-label='Move right'>▶</button>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
