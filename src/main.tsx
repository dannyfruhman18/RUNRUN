import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { RunRunGame, type GameSnapshot } from './runrun3d';

const STORAGE_KEY = 'runrun.best-score';

const initialSnapshot: GameSnapshot = {
  phase: 'ready',
  score: 0,
  bestScore: 0,
  speed: 0,
  distance: 0,
  lane: 1,
  message: 'Tap, swipe, or press any move key to start.',
};

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
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RunRunGame | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => ({ ...initialSnapshot, bestScore: readBestScore() }));

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    const engine = new RunRunGame(host, (next) => {
      setSnapshot((current) => ({ ...current, ...next }));
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next.bestScore));
      } catch {
        // ignore
      }
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const controls = useMemo(
    () => [
      { label: 'Left', action: 'left' as const, icon: '◀' },
      { label: 'Jump', action: 'jump' as const, icon: '▲' },
      { label: 'Slide', action: 'slide' as const, icon: '▼' },
      { label: 'Right', action: 'right' as const, icon: '▶' },
    ],
    [],
  );

  return (
    <main className='shell'>
      <div className='viewport-shell'>
        <div ref={mountRef} className='viewport' />
        <div className='hud'>
          <header className='hud__top'>
            <div>
              <p className='eyebrow'>RUNRUN</p>
              <h1>Temple Run 3D</h1>
            </div>
            <div className='stats'>
              <div className='stat'><span>score</span><strong>{snapshot.score}</strong></div>
              <div className='stat'><span>best</span><strong>{snapshot.bestScore}</strong></div>
              <div className='stat'><span>speed</span><strong>{snapshot.speed.toFixed(1)}</strong></div>
            </div>
          </header>

          <section className='hud__status'>
            <div>
              <span>phase</span>
              <strong>{snapshot.phase}</strong>
            </div>
            <div>
              <span>lane</span>
              <strong>{snapshot.lane + 1} / 3</strong>
            </div>
            <div>
              <span>distance</span>
              <strong>{snapshot.distance.toFixed(1)} m</strong>
            </div>
          </section>

          <section className='hud__message'>
            <p>{snapshot.message}</p>
          </section>

          <section className='hud__controls'>
            {controls.map((control) => (
              <button
                key={control.label}
                type='button'
                className='control'
                onClick={() => engineRef.current?.control(control.action)}
                aria-label={control.label}
              >
                <span>{control.icon}</span>
                <small>{control.label}</small>
              </button>
            ))}
            <button type='button' className='control control--wide' onClick={() => engineRef.current?.control('restart')}>
              Restart
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
