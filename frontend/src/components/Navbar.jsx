import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const LINKS = [
  { to: '/', label: '🏠 Home', end: true },
  { to: '/jogadores', label: '👥 Jogadores' },
  { to: '/palpites', label: '🎯 Palpites' },
  { to: '/resultados', label: '📊 Resultados' },
  { to: '/ranking', label: '🏆 Ranking' },
  { to: '/detalhes', label: '🔍 Detalhes' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg-900/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
        <NavLink to="/" className="mr-2 flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          <span className="font-display text-lg font-bold text-gold">Bolão Copa 2026</span>
        </NavLink>
        <div className="flex flex-wrap gap-1">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-gold text-bg-900' : 'text-ink-mut hover:bg-bg-800 hover:text-ink'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>

        {user && (
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-sm text-ink-mut sm:inline-flex">
              {user.role === 'admin' ? '🛡️' : '👤'} {user.name}
              {user.role === 'admin' && (
                <span className="badge bg-gold/20 text-gold">admin</span>
              )}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-line-light px-3 py-1.5 text-sm text-ink-mut transition-colors hover:bg-bg-800 hover:text-danger"
            >
              Sair
            </button>
          </div>
        )}
      </nav>
    </header>
  );
}
