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
        // ignore storage failures
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

  const laneStyle = {
    '--lane-index': String(snapshot.lane),
  } as React.CSSProperties;

  const speedProgress = Math.min(1, snapshot.speed / 28);
  const scoreProgress = Math.min(1, snapshot.score / Math.max(1, snapshot.bestScore || 1200));
  const isRunning = snapshot.phase === 'running';
  const showLobby = snapshot.phase === 'ready';
  const showCrash = snapshot.phase === 'crashed';

  return (
    <main className='shell'>
      <section className='viewport-shell'>
        <div ref={mountRef} className='viewport' aria-label='RUNRUN game scene' />
        <div className={isRunning ? 'ui-layer ui-layer--running' : 'ui-layer'}>
          {!isRunning && (
            <>
              <header className='top-hud'>
                <div className='brand-lockup'>
                  <img src='/logo.svg' alt='' className='brand-mark' />
                  <div className='brand-copy'>
                    <p className='eyebrow'>RUNRUN</p>
                    <h1>Temple Run 3D</h1>
                    <span>Stone ruins, glowing relics, smooth endless run.</span>
                  </div>
                </div>

                <div className='score-stack' aria-label='score summary'>
                  <div className='score-chip'>
                    <span>score</span>
                    <strong>{snapshot.score}</strong>
                  </div>
                  <div className='score-chip'>
                    <span>best</span>
                    <strong>{snapshot.bestScore}</strong>
                  </div>
                  <div className='score-chip score-chip--accent'>
                    <span>speed</span>
                    <strong>{snapshot.speed.toFixed(1)}</strong>
                  </div>
                </div>
              </header>

              <aside className='left-rail' data-lane={snapshot.lane} style={laneStyle} aria-label='lane indicator'>
                <div className='lane-glyph'>
                  <span />
                  <span />
                  <span />
                </div>
                <div className='meter-card'>
                  <span className='meter-card__label'>distance</span>
                  <strong>{snapshot.distance.toFixed(1)} m</strong>
                  <div className='meter-bar'>
                    <i style={{ transform: `scaleX(${scoreProgress})` }} />
                  </div>
                </div>
                <div className='meter-card meter-card--small'>
                  <span className='meter-card__label'>phase</span>
                  <strong>{snapshot.phase}</strong>
                </div>
              </aside>
            </>
          )}

          <section className='center-panel' aria-live='polite'>
            {showLobby && (
              <article className='story-card story-card--ready'>
                <p className='story-card__kicker'>launch sequence</p>
                <h2>Run through the temple.</h2>
                <p>
                  Swipe or use the controls to dodge obstacles, jump logs, slide under gates, and collect relics.
                  The interface is now built as a polished stone-and-gold game screen, not a browser overlay.
                </p>
                <div className='hint-row'>
                  <span>swipe left / right</span>
                  <span>tap to begin</span>
                  <span>up = jump</span>
                  <span>down = slide</span>
                </div>
                <button type='button' className='primary-action' onClick={() => engineRef.current?.control('start')}>
                  Enter the ruins
                </button>
              </article>
            )}

            {showCrash && (
              <article className='story-card story-card--crash'>
                <p className='story-card__kicker story-card__kicker--danger'>run ended</p>
                <h2>Temple run failed.</h2>
                <div className='result-grid'>
                  <div>
                    <span>score</span>
                    <strong>{snapshot.score}</strong>
                  </div>
                  <div>
                    <span>best</span>
                    <strong>{snapshot.bestScore}</strong>
                  </div>
                  <div>
                    <span>distance</span>
                    <strong>{snapshot.distance.toFixed(1)} m</strong>
                  </div>
                </div>
                <p>{snapshot.message}</p>
                <div className='action-row'>
                  <button type='button' className='primary-action' onClick={() => engineRef.current?.control('restart')}>
                    Run again
                  </button>
                  <button type='button' className='secondary-action' onClick={() => engineRef.current?.control('start')}>
                    Continue
                  </button>
                </div>
              </article>
            )}
          </section>

          {!isRunning && (
            <footer className='bottom-dock'>
              <div className='dock-card dock-card--status'>
                <span>lane</span>
                <strong>{snapshot.lane + 1} / 3</strong>
              </div>

              <div className='dock-controls' aria-label='game controls'>
                {controls.map((control) => (
                  <button
                    key={control.label}
                    type='button'
                    className='control-button'
                    onClick={() => engineRef.current?.control(control.action)}
                    aria-label={control.label}
                  >
                    <span className='control-button__icon'>{control.icon}</span>
                    <span className='control-button__label'>{control.label}</span>
                  </button>
                ))}
              </div>

              <div className='dock-card dock-card--meter'>
                <span>momentum</span>
                <div className='momentum-track'>
                  <i style={{ transform: `scaleX(${speedProgress})` }} />
                </div>
              </div>
            </footer>
          )}
        </div>

        {!isRunning && (
          <div className='frame-overlay' aria-hidden='true'>
            <span className='frame-overlay__corner frame-overlay__corner--tl' />
            <span className='frame-overlay__corner frame-overlay__corner--tr' />
            <span className='frame-overlay__corner frame-overlay__corner--bl' />
            <span className='frame-overlay__corner frame-overlay__corner--br' />
          </div>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
