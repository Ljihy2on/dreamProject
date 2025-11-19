import React, { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', background: '#f7fafc' }}>
      <header style={{ textAlign: 'center', marginBottom: 24 }}>
        <img src="/vite.svg" alt="Vite" style={{ width: 72, height: 72 }} />
        <h1 style={{ margin: '12px 0', fontSize: 28, color: '#0f172a' }}>TechForImpact (demo)</h1>
        <p style={{ color: '#475569', margin: 0 }}>Simple safe app to verify development server</p>
      </header>

      <main style={{ background: '#ffffff', padding: 24, borderRadius: 12, boxShadow: '0 6px 18px rgba(15,23,42,0.06)', minWidth: 320, textAlign: 'center' }}>
        <p style={{ marginBottom: 12 }}>count is {count}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={() => setCount(c => c + 1)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
            Increment
          </button>
          <button onClick={() => setCount(0)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', cursor: 'pointer' }}>
            Reset
          </button>
        </div>

        <p style={{ marginTop: 16, color: '#64748b', fontSize: 13 }}>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </main>

      <footer style={{ marginTop: 28, color: '#94a3b8', fontSize: 12 }}>
        Run: <code>npm run dev</code>
      </footer>
    </div>
  );
}

export default App;
