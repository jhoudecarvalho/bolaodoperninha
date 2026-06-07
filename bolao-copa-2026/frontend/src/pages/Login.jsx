import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatPhoneBR } from '../utils/phone.js';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Já logado → manda pra home
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(phone, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8 animate-slideUp">
        <div className="mb-6 text-center">
          <div className="text-5xl">🏆</div>
          <h1 className="mt-2 font-display text-2xl font-black text-gold">Bolão Copa 2026</h1>
          <p className="mt-1 text-sm text-ink-mut">Entre para acessar o bolão</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-ink-mut">Telefone</label>
            <input
              type="tel"
              autoFocus
              inputMode="numeric"
              maxLength={16}
              className="w-full rounded-lg border border-line-light bg-bg-900 px-3 py-2 focus:border-gold focus:outline-none"
              placeholder="(11) 91234-5678"
              value={phone}
              onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-ink-mut">Senha</label>
            <input
              type="password"
              className="w-full rounded-lg border border-line-light bg-bg-900 px-3 py-2 focus:border-gold focus:outline-none"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button className="btn-gold w-full" disabled={loading || !phone || !password}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
