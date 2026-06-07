import { useEffect, useState } from 'react';
import { PlayersAPI } from '../api/client.js';

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setPlayers(await PlayersAPI.list().catch(() => []));
  }
  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await PlayersAPI.create({ name: name.trim(), pin: pin || undefined });
      setName('');
      setPin('');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id, pname) {
    if (!confirm(`Remover ${pname}? Todos os palpites dele serão apagados.`)) return;
    await PlayersAPI.remove(id);
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">👥 Jogadores</h1>

      <form onSubmit={handleAdd} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs text-ink-mut">Nome</label>
          <input
            className="w-full rounded-lg border border-line-light bg-bg-900 px-3 py-2 focus:border-gold focus:outline-none"
            value={name}
            maxLength={30}
            placeholder="Nome do participante"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs text-ink-mut">PIN (opcional)</label>
          <input
            className="w-full rounded-lg border border-line-light bg-bg-900 px-3 py-2 focus:border-gold focus:outline-none"
            value={pin}
            maxLength={4}
            inputMode="numeric"
            placeholder="0000"
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <button className="btn-gold" disabled={loading || !name.trim()}>
          {loading ? '...' : '+ Adicionar'}
        </button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-sm text-ink-mut">
        {players.length} {players.length === 1 ? 'jogador' : 'jogadores'} cadastrado
        {players.length === 1 ? '' : 's'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {players.map((p) => (
          <div key={p.id} className="card flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full font-bold text-bg-900"
                style={{ backgroundColor: p.avatar_color }}
              >
                {p.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <div className="font-medium">{p.name}</div>
                {p.has_pin && <div className="text-xs text-ink-mut">🔑 com PIN</div>}
              </div>
            </div>
            <button
              onClick={() => handleRemove(p.id, p.name)}
              className="text-danger hover:text-danger-bright"
              title="Remover"
            >
              🗑
            </button>
          </div>
        ))}
        {!players.length && <p className="text-ink-mut">Nenhum jogador cadastrado.</p>}
      </div>
    </div>
  );
}
