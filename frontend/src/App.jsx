import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import OnlineBar from './components/OnlineBar.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Players from './pages/Players.jsx';
import Predictions from './pages/Predictions.jsx';
import Results from './pages/Results.jsx';
import Ranking from './pages/Ranking.jsx';
import Detail from './pages/Detail.jsx';
import Standings from './pages/Standings.jsx';

function Layout({ children }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <OnlineBar />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <footer className="border-t border-line py-6 text-center text-xs text-ink-dim">
        🏆 Bolão Copa do Mundo FIFA 2026 · 3 pontos por placar exato
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/jogadores" element={<Players />} />
                <Route path="/palpites" element={<Predictions />} />
                <Route path="/resultados" element={<Results />} />
                <Route path="/ranking" element={<Ranking />} />
                <Route path="/detalhes" element={<Detail />} />
                <Route path="/classificacao" element={<Standings />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
