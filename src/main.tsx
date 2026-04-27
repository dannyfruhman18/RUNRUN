import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

function App() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">RUNRUN</p>
        <h1>GitHub-first mobile runner prototype shell</h1>
        <p className="lede">This is the initial architecture foundation for a Subway-Surfers-style runner game with Capacitor, Supabase highscores, and a Vercel final deployment path.</p>
      </section>
      <section className="panel">
        <h2>Build status</h2>
        <ul>
          <li>Core app shell initialized</li>
          <li>Mobile packaging scaffolded</li>
          <li>Supabase and score architecture reserved</li>
          <li>Ready for gameplay systems and squad execution</li>
        </ul>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
