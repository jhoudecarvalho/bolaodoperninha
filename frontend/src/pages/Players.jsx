import { useEffect, useState } from 'react';
import { UsersAPI } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatPhoneBR } from '../utils/phone.js';

export default function Players() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [participants, setParticipants] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!isAdmin) return;
    setParticipants(await UsersAPI.list().catch(() => []));
  }
  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      await UsersAPI.create({ name: name.trim(), phone, password });
      setName('');
      setPhone('');
      setPassword('');
      setOk('Participante cadastrado! Ele já pode entrar com o celular e a senha.');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id, pname) {
    if (!confirm(`Remover ${pname}? O login, o jogador e todos os palpites dele serão apagados.`)) return;
    await UsersAPI.remove(id);
    await load();
  }

  async function handleResetDevice(id, pname) {
    if (!confirm(`Liberar dispositivo de ${pname}? O próximo login dela será registrado como o novo dispositivo.`)) return;
    try {
      await UsersAPI.resetDevice(id);
      setOk(`Dispositivo de ${pname} liberado com sucesso.`);
    } catch {
      setError('Erro ao liberar dispositivo.');
    }
  }

  async function handleResetAllDevices() {
    if (!confirm('Limpar dispositivos de TODOS os participantes? Cada um precisará fazer login novamente para registrar o novo dispositivo.')) return;
    try {
      const { count } = await UsersAPI.resetAllDevices();
      setOk(`Dispositivos de ${count} participante(s) liberados.`);
    } catch {
      setError('Erro ao liberar dispositivos.');
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">👥 Participantes</h1>
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          🛡️ Apenas o administrador cadastra e gerencia os participantes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">👥 Participantes</h1>
      <p className="text-sm text-ink-mut">
        Cadastre cada pessoa com <b>nome</b>, <b>celular</b> e <b>senha</b>. O sistema cria o
        login e o jogador do bolão automaticamente — ela entra e palpita por si mesma.
      </p>

      <form onSubmit={handleAdd} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-xs text-ink-mut">Nome</label>
          <input
            className="w-full rounded-lg border border-line-light bg-bg-900 px-3 py-2 focus:border-gold focus:outline-none"
            value={name}
            maxLength={60}
            placeholder="Nome do participante"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-xs text-ink-mut">Celular</label>
          <input
            className="w-full rounded-lg border border-line-light bg-bg-900 px-3 py-2 focus:border-gold focus:outline-none"
            value={phone}
            inputMode="numeric"
            maxLength={16}
            placeholder="(11) 91234-5678"
            onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
          />
        </div>
        <div className="w-36">
          <label className="mb-1 block text-xs text-ink-mut">Senha</label>
          <input
            type="text"
            className="w-full rounded-lg border border-line-light bg-bg-900 px-3 py-2 focus:border-gold focus:outline-none"
            value={password}
            placeholder="senha"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn-gold" disabled={loading || !name.trim() || !phone || !password}>
          {loading ? '...' : '+ Cadastrar'}
        </button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}
      {ok && <p className="text-sm text-ok">{ok}</p>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-mut">
          {participants.length} {participants.length === 1 ? 'participante' : 'participantes'}
        </p>
      </div>

      {participants.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-warn/30 bg-warn/5 p-4">
          <div>
            <p className="text-sm font-medium text-warn">📱 Dispositivos autorizados</p>
            <p className="text-xs text-ink-mut mt-0.5">
              Se alguém receber "Dispositivo não autorizado", libere o acesso aqui.
            </p>
          </div>
          <button
            onClick={handleResetAllDevices}
            className="btn border border-warn/50 text-warn hover:bg-warn/10 text-sm"
          >
            🔓 Liberar todos os dispositivos
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {participants.map((p) => (
          <div key={p.id} className="card flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full font-bold text-bg-900"
                style={{ backgroundColor: p.avatar_color || '#c8aa6e' }}
              >
                {p.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-ink-mut">{formatPhoneBR(p.phone)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleResetDevice(p.id, p.name)}
                className="text-xs text-ink-mut hover:text-gold"
                title="Liberar dispositivo"
              >
                📱
              </button>
              <button
                onClick={() => handleRemove(p.id, p.name)}
                className="text-danger hover:text-danger-bright"
                title="Remover"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
        {!participants.length && <p className="text-ink-mut">Nenhum participante cadastrado.</p>}
      </div>
    </div>
  );
}
