import { useEffect, useMemo, useState } from 'react';
import { ChampionAPI } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Confetti from '../components/Confetti.jsx';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// ── Tela de celebração pós-final ─────────────────────────────────────────────
function CelebrationScreen({ champion, players, playerId }) {
  const winners = players.filter((p) => p.acertou_campeao);
  const iWon    = winners.some((p) => p.player_id === playerId);
  const hasWinners = winners.length > 0;

  return (
    <>
      <Confetti active={hasWinners} />

      {/* Banner principal */}
      <div className="relative overflow-hidden rounded-2xl border border-gold bg-gradient-to-b from-gold/30 via-gold/10 to-transparent p-8 text-center">
        {/* Brilho de fundo */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        </div>

        <div className="relative space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold/70">
            🏆 Copa do Mundo FIFA 2026
          </p>
          <div className="text-8xl leading-none drop-shadow-lg">{champion.flag_emoji}</div>
          <h2 className="font-display text-4xl font-black text-gold drop-shadow">
            {champion.team_name}
          </h2>
          <p className="text-xl font-bold text-ink">É CAMPEÃ DO MUNDO!</p>

          {iWon && (
            <div className="mt-4 inline-block rounded-xl border border-gold bg-gold/20 px-6 py-3">
              <p className="font-display text-lg font-bold text-gold">🎉 Você acertou! +10 pts</p>
            </div>
          )}
        </div>
      </div>

      {/* Quem acertou */}
      {hasWinners && (
        <div className="space-y-3">
          <h2 className="font-medium text-sm text-ink-mut">
            🎯 Acertaram o campeão — {winners.length} {winners.length === 1 ? 'pessoa' : 'pessoas'}
          </h2>
          <div className="flex flex-wrap gap-3">
            {winners.map((w) => (
              <div
                key={w.player_id}
                className="flex items-center gap-3 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3"
              >
                <span
                  className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-bold text-bg-900 text-sm"
                  style={{ backgroundColor: w.avatar_color || '#c8aa6e' }}
                >
                  {w.player_name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-bold text-gold">{w.player_name}</p>
                  <p className="text-xs text-ink-dim">+10 pts no ranking</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasWinners && (
        <div className="card p-4 text-center text-sm text-ink-mut">
          Ninguém acertou o campeão desta vez. 😅
        </div>
      )}

      {/* Todas as escolhas reveladas */}
      <div className="space-y-2">
        <h2 className="text-sm text-ink-mut font-medium">Escolhas de todos</h2>
        <div className="card divide-y divide-line">
          {players.map((p) => {
            const isMe = p.player_id === playerId;
            return (
              <div
                key={p.player_id}
                className={`flex items-center gap-3 px-4 py-3 ${p.acertou_campeao ? 'bg-gold/5' : ''}`}
              >
                <span
                  className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-bg-900"
                  style={{ backgroundColor: p.avatar_color || '#c8aa6e' }}
                >
                  {p.player_name.charAt(0).toUpperCase()}
                </span>
                <span className={`flex-1 text-sm ${isMe ? 'font-semibold text-gold' : ''}`}>
                  {p.player_name}
                  {isMe && <span className="ml-1 text-ink-dim font-normal">(você)</span>}
                </span>
                {p.picked ? (
                  <span className={`flex items-center gap-1.5 text-sm ${p.acertou_campeao ? 'text-gold font-semibold' : 'text-ink-mut'}`}>
                    <span className="text-xl leading-none">{p.flag_emoji}</span>
                    <span>{p.team_name}</span>
                    {p.acertou_campeao && <span className="text-ok">✓ +10</span>}
                  </span>
                ) : (
                  <span className="badge bg-bg-800 text-ink-dim text-xs">não apostou</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Tela normal (fase de grupos / mata-mata em andamento) ─────────────────────
function PickScreen({ teams, picks, playerId, isAdmin }) {
  const [group,  setGroup]  = useState('A');
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState(null);

  const teamsByGroup = useMemo(
    () =>
      GROUPS.reduce((acc, g) => {
        acc[g] = teams.filter((t) => t.group_id === g);
        return acc;
      }, {}),
    [teams]
  );

  const myPick     = picks.find((p) => p.player_id === playerId && p.picked) ?? null;
  const pickedCount = picks.filter((p) => p.picked).length;

  async function handlePick(team) {
    if (!playerId || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      await ChampionAPI.save({ player_id: playerId, team_id: team.id });
      // Atualiza myPick localmente (o pai vai recarregar na próxima visita)
      picks.forEach((p) => {
        if (p.player_id === playerId) {
          p.picked     = true;
          p.team_id    = team.id;
          p.team_name  = team.name;
          p.flag_emoji = team.flag_emoji;
          p.group_id   = team.group_id;
        }
      });
      setMsg({ type: 'ok', text: `${team.flag_emoji} ${team.name} escolhida como campeã!` });
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.error || 'Erro ao salvar' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Regras */}
      <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 space-y-2">
        <p className="text-sm font-semibold text-gold">📋 Como funciona</p>
        <ul className="space-y-2 text-sm text-ink-mut">
          <li className="flex items-start gap-2">
            <span className="mt-0.5">⚽</span>
            <span>Escolha a seleção que você acredita que vai <b className="text-ink">ser campeã da Copa do Mundo 2026</b>.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">✏️</span>
            <span>Você pode <b className="text-ink">trocar sua escolha à vontade</b> até o início do Mata-Mata. Aproveite a fase de grupos para reavaliar!</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-danger">🔒</span>
            <span>No início do Mata-Mata as escolhas são <b className="text-danger">bloqueadas definitivamente</b> — depois disso nenhuma troca é permitida.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-warn">⚠️</span>
            <span className="text-warn">Atenção: as seleções precisam <b>se classificar</b> para continuar na Copa. Se sua escolha cair na fase de grupos, o palpite fica sem efeito — fique de olho na classificação e mude se precisar!</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-ok">🏆</span>
            <span>Quem acertar o campeão ganha <b className="text-gold text-base">+10 pontos</b> no ranking final — pode ser a virada do bolão!</span>
          </li>
        </ul>
      </div>

      {/* Minha escolha */}
      <div className={`card p-4 ${myPick ? 'border-gold/50' : 'border-warn/30'}`}>
        {myPick ? (
          <div className="flex items-center gap-4">
            <span className="text-5xl leading-none">{myPick.flag_emoji}</span>
            <div className="flex-1">
              <p className="text-xs text-ink-mut">Sua seleção campeã</p>
              <p className="font-display text-xl font-bold text-gold">{myPick.team_name}</p>
              <p className="text-xs text-ink-dim">Grupo {myPick.group_id}</p>
            </div>
            {!isAdmin && (
              <p className="text-xs text-ink-dim hidden sm:block">Escolha outro grupo abaixo para mudar</p>
            )}
          </div>
        ) : isAdmin ? (
          <p className="text-sm text-ink-mut">🛡️ O administrador acompanha as escolhas mas não participa.</p>
        ) : (
          <p className="text-sm text-warn">⚠️ Você ainda não escolheu sua seleção campeã. Navegue pelos grupos abaixo e clique em uma seleção.</p>
        )}
      </div>

      {/* Seletor de grupo + times */}
      {!isAdmin && (
        <div className="card p-4 space-y-4">
          <div>
            <h2 className="mb-2 text-sm text-ink-mut">Selecione o grupo</h2>
            <div className="flex flex-wrap gap-2">
              {GROUPS.map((g) => {
                const hasMyPickHere = myPick?.group_id === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className={`btn relative h-10 w-10 ${
                      group === g ? 'bg-gold text-bg-900' : 'border border-line-light hover:bg-bg-800'
                    }`}
                  >
                    {g}
                    {hasMyPickHere && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-ok border border-bg-800" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm text-ink-mut">Grupo {group} — clique para escolher como campeã</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(teamsByGroup[group] || []).map((team) => {
                const isMyPick = myPick?.team_id === team.id;
                return (
                  <button
                    key={team.id}
                    onClick={() => handlePick(team)}
                    disabled={saving}
                    className={`card flex flex-col items-center gap-2 p-4 text-center transition-all hover:border-gold/60 active:scale-95 ${
                      isMyPick ? 'border-gold bg-gold/10 ring-1 ring-gold/40' : 'hover:bg-bg-800'
                    } ${saving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className="text-4xl leading-none">{team.flag_emoji}</span>
                    <span className={`text-sm font-medium leading-tight ${isMyPick ? 'text-gold' : ''}`}>
                      {team.name}
                    </span>
                    {isMyPick && <span className="badge bg-gold/20 text-gold text-xs">✓ sua escolha</span>}
                  </button>
                );
              })}
            </div>
            {msg && (
              <p className={`mt-3 text-sm ${msg.type === 'ok' ? 'text-ok' : 'text-danger'}`}>
                {msg.type === 'ok' ? '✓ ' : '✗ '}{msg.text}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Lista de participantes */}
      <div className="space-y-3">
        <h2 className="font-medium text-sm text-ink-mut">
          Participantes — {pickedCount} de {picks.length} já escolheram
        </h2>
        {picks.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink-dim">Carregando...</div>
        ) : (
          <div className="card divide-y divide-line">
            {picks.map((p) => {
              const isMe = p.player_id === playerId;
              return (
                <div key={p.player_id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-bg-900"
                    style={{ backgroundColor: p.avatar_color || '#c8aa6e' }}
                  >
                    {p.player_name.charAt(0).toUpperCase()}
                  </span>
                  <span className={`flex-1 text-sm ${isMe ? 'font-semibold text-gold' : ''}`}>
                    {p.player_name} {isMe && <span className="text-ink-dim font-normal">(você)</span>}
                  </span>
                  {p.picked ? (
                    isMe ? (
                      <span className="flex items-center gap-1.5 text-sm">
                        <span className="text-xl leading-none">{p.flag_emoji}</span>
                        <span className="font-medium text-gold">{p.team_name}</span>
                      </span>
                    ) : (
                      <span className="badge bg-ok/10 text-ok text-xs">✓ já escolheu</span>
                    )
                  ) : (
                    <span className="badge bg-bg-800 text-ink-dim text-xs">aguardando</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Champion() {
  const { user }  = useAuth();
  const isAdmin   = user?.role === 'admin';
  const playerId  = user?.player_id ?? null;

  const [champion, setChampion] = useState(null);
  const [players,  setPlayers]  = useState([]);
  const [teams,    setTeams]    = useState([]);

  useEffect(() => {
    Promise.all([ChampionAPI.teams(), ChampionAPI.list()]).then(([t, data]) => {
      setTeams(t);
      setChampion(data.champion ?? null);
      setPlayers(data.players ?? []);
    });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">🏅 Campeão do Mundo</h1>

      {champion ? (
        <CelebrationScreen champion={champion} players={players} playerId={playerId} />
      ) : (
        <PickScreen teams={teams} picks={players} playerId={playerId} isAdmin={isAdmin} />
      )}
    </div>
  );
}
