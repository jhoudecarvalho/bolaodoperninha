import { useEffect, useState } from 'react';
import { StandingsAPI } from '../api/client.js';

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'];
const VIEWS = ['grupos', 'classificados', 'artilheiros'];

// Indicador de classificação por posição/status
function ClassifBadge({ classif, position }) {
  if (classif === 'direct') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ok/20 text-ok text-xs font-bold">
        {position}
      </span>
    );
  }
  if (classif === 'best3rd') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-warn/20 text-warn text-xs font-bold">
        {position}
      </span>
    );
  }
  return <span className="text-ink-dim text-xs w-5 text-center">{position}</span>;
}

function GroupTable({ table }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-dim">
            <th className="pb-2 text-left w-7">#</th>
            <th className="pb-2 text-left">Time</th>
            <th className="pb-2 text-center w-7" title="Jogos">J</th>
            <th className="pb-2 text-center w-7" title="Vitórias">V</th>
            <th className="pb-2 text-center w-7" title="Empates">E</th>
            <th className="pb-2 text-center w-7" title="Derrotas">D</th>
            <th className="pb-2 text-center w-9" title="Gols Pró">GP</th>
            <th className="pb-2 text-center w-9" title="Gols Contra">GC</th>
            <th className="pb-2 text-center w-9" title="Saldo">SG</th>
            <th className="pb-2 text-center w-9 text-gold font-bold" title="Pontos">Pts</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row) => (
            <tr key={row.team} className="border-b border-line/30">
              <td className="py-2">
                <ClassifBadge classif={row.classif} position={row.position} />
              </td>
              <td className={`py-2 ${row.classif === 'out' ? 'text-ink-mut' : ''}`}>
                <span className="flex items-center gap-2">
                  <span>{row.flag}</span>
                  <span className={row.classif !== 'out' ? 'font-medium' : ''}>{row.team}</span>
                </span>
              </td>
              <td className="py-2 text-center tabular-nums text-ink-mut">{row.played}</td>
              <td className="py-2 text-center tabular-nums">{row.won}</td>
              <td className="py-2 text-center tabular-nums">{row.draw}</td>
              <td className="py-2 text-center tabular-nums">{row.lost}</td>
              <td className="py-2 text-center tabular-nums">{row.goalsFor}</td>
              <td className="py-2 text-center tabular-nums">{row.goalsAgainst}</td>
              <td className={`py-2 text-center tabular-nums ${row.goalDifference > 0 ? 'text-ok' : row.goalDifference < 0 ? 'text-danger' : 'text-ink-mut'}`}>
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="py-2 text-center tabular-nums font-bold text-gold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-3 text-xs text-ink-dim">
        <span><span className="text-ok font-bold">■</span> Classificado direto</span>
        <span><span className="text-warn font-bold">■</span> Melhor 3º (provisório)</span>
      </div>
    </div>
  );
}

function ClassifiedView({ classified, best3rds }) {
  const { direct = [], best3rd = [] } = classified;
  const totalQualified = direct.length + best3rd.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-mut">
          <span className="font-bold text-ink">{totalQualified}</span> / 32 classificados definidos
        </p>
        <span className="badge bg-warn/20 text-warn text-xs">
          ⚠️ 3os sujeitos a alteração
        </span>
      </div>

      {/* Classificados diretos */}
      <div>
        <h3 className="mb-3 font-medium text-ok flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ok/20 text-xs font-bold">✓</span>
          Classificados diretos — {direct.length} / 24
        </h3>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {direct.length === 0 ? (
            <p className="col-span-full text-sm text-ink-dim">Nenhum ainda.</p>
          ) : (
            direct.map((t) => (
              <div key={t.team} className="flex items-center gap-2 rounded-lg bg-ok/5 border border-ok/20 px-3 py-2 text-sm">
                <span>{t.flag}</span>
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.team}</div>
                  <div className="text-xs text-ink-dim">Grupo {t.group} · {t.position}º</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Melhores 3os */}
      <div>
        <h3 className="mb-3 font-medium text-warn flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-warn/20 text-xs font-bold">3</span>
          Melhores 3os colocados — {best3rd.length} / 8
        </h3>

        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-dim">
                <th className="p-3 text-left w-8">Rank</th>
                <th className="p-3 text-left">Time</th>
                <th className="p-3 text-center w-12">Grupo</th>
                <th className="p-3 text-center w-8">J</th>
                <th className="p-3 text-center w-8">V</th>
                <th className="p-3 text-center w-10">SG</th>
                <th className="p-3 text-center w-10">GF</th>
                <th className="p-3 text-center w-10 text-gold font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {best3rds.map((t) => (
                <tr
                  key={t.team}
                  className={`border-b border-line/30 ${t.qualified ? '' : 'opacity-50'}`}
                >
                  <td className="p-3">
                    {t.qualified
                      ? <span className="text-warn font-bold">{t.rank}º</span>
                      : <span className="text-ink-dim">{t.rank}º</span>
                    }
                  </td>
                  <td className="p-3">
                    <span className="flex items-center gap-2">
                      <span>{t.flag}</span>
                      <span className={t.qualified ? 'font-medium' : 'text-ink-mut'}>{t.team}</span>
                    </span>
                  </td>
                  <td className="p-3 text-center text-ink-mut">{t.group}</td>
                  <td className="p-3 text-center tabular-nums">{t.played}</td>
                  <td className="p-3 text-center tabular-nums">{t.won}</td>
                  <td className={`p-3 text-center tabular-nums ${t.goalDifference > 0 ? 'text-ok' : t.goalDifference < 0 ? 'text-danger' : ''}`}>
                    {t.goalDifference > 0 ? `+${t.goalDifference}` : t.goalDifference}
                  </td>
                  <td className="p-3 text-center tabular-nums">{t.goalsFor}</td>
                  <td className="p-3 text-center tabular-nums font-bold text-gold">{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-dim">
          Desempate: pontos → saldo de gols → gols pró → vitórias
        </p>
      </div>
    </div>
  );
}

function ScorersView({ scorers }) {
  if (scorers.length === 0) {
    return <p className="text-sm text-ink-dim">Nenhum gol registrado ainda.</p>;
  }
  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-dim">
            <th className="p-3 text-left w-10">#</th>
            <th className="p-3 text-left">Jogador</th>
            <th className="p-3 text-left">Time</th>
            <th className="p-3 text-center w-14">Jogos</th>
            <th className="p-3 text-center w-14 text-gold font-bold">Gols</th>
          </tr>
        </thead>
        <tbody>
          {scorers.map((s) => (
            <tr key={s.player} className="border-b border-line/30">
              <td className={`p-3 font-bold tabular-nums ${s.rank === 1 ? 'text-gold' : 'text-ink-dim'}`}>
                {s.rank}º
              </td>
              <td className="p-3 font-medium">{s.player}</td>
              <td className="p-3">
                <span className="flex items-center gap-2 text-ink-mut">
                  <span>{s.flag}</span>
                  <span>{s.team}</span>
                </span>
              </td>
              <td className="p-3 text-center tabular-nums text-ink-mut">{s.played}</td>
              <td className="p-3 text-center tabular-nums font-bold text-gold text-base">{s.goals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Standings() {
  const [view, setView] = useState('grupos');
  const [group, setGroup] = useState('A');
  const [data, setData] = useState(null);
  const [scorers, setScorers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      StandingsAPI.groups().catch(() => null),
      StandingsAPI.scorers().catch(() => null),
    ]).then(([g, s]) => {
      if (g) setData(g);
      if (s) setScorers(s);
      if (!g && !s) setError('Classificação indisponível no momento.');
      setLoading(false);
    });
  }, []);

  const currentGroup = data?.groups?.find((g) => g.group === group);

  const VIEW_LABELS = {
    grupos: '📋 Por Grupo',
    classificados: '🎟️ Classificados',
    artilheiros: '⚽ Artilheiros',
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">🗂️ Classificação</h1>

      {/* Tabs de view */}
      <div className="flex gap-2 border-b border-line pb-1">
        {VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              view === v
                ? 'bg-gold text-bg-900'
                : 'text-ink-mut hover:text-ink'
            }`}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {loading && <p className="text-ink-mut">Carregando...</p>}
      {error && <p className="text-danger text-sm">{error}</p>}

      {!loading && !error && data && (
        <>
          {/* View: Por Grupo */}
          {view === 'grupos' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {GROUPS.map((g) => (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className={`h-9 w-9 rounded-lg text-sm font-bold transition-colors ${
                      group === g
                        ? 'bg-gold text-bg-900'
                        : 'border border-line-light hover:bg-bg-800 text-ink-mut'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="card p-4">
                <h3 className="mb-3 text-sm font-medium text-ink-mut">Grupo {group}</h3>
                {currentGroup ? (
                  <GroupTable table={currentGroup.table} />
                ) : (
                  <p className="text-sm text-ink-dim">Sem dados para o Grupo {group}.</p>
                )}
              </div>
            </div>
          )}

          {/* View: Classificados */}
          {view === 'classificados' && (
            <ClassifiedView
              classified={data.classified}
              best3rds={data.best3rds}
            />
          )}

          {/* View: Artilheiros */}
          {view === 'artilheiros' && <ScorersView scorers={scorers} />}
        </>
      )}
    </div>
  );
}
