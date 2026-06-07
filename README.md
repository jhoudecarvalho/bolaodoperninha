# 🏆 Bolão Copa do Mundo 2026

Sistema web completo de bolão da Copa do Mundo FIFA 2026. Participantes ilimitados
palpitam nos 72 jogos da fase de grupos. Placar exato vale **3 pontos**. Palpites
são bloqueados no apito inicial de cada jogo, os placares são buscados
automaticamente via API e o ranking é calculado em tempo real.

## Stack

- **Backend:** Node.js + Express (ESM) + MySQL 8 (`mysql2/promise`)
- **Frontend:** React 18 + Vite + Tailwind CSS + React Router
- **Fonte dos jogos:** openfootball/worldcup.json (fixtures com fuso → UTC confiável)
- **Fonte dos placares:** worldcup26.ir (primária) + openfootball (fallback)
- **Tempo real:** sync de placares a cada 2 min no backend; polling de 60s no frontend

## De onde vêm os dados

- **Jogos (fixtures):** importados da API openfootball por `npm run seed` (ou
  `npm run sync:matches`). Os times (nome em PT + bandeira) são locais, pois a API
  só traz o nome em inglês. O import é **não-destrutivo** (atualiza data/horário/
  estádio sem apagar jogos nem palpites). Admin também sincroniza pela tela
  📊 Resultados → "🗓️ Atualizar jogos (API)".
- **Sync automático no login:** a cada login (de qualquer usuário) os jogos são
  atualizados em segundo plano — o login não espera a API. Há trava contra syncs
  simultâneos e um intervalo mínimo (`FIXTURES_LOGIN_SYNC_MIN_MS`, padrão 60s)
  que coalesce logins próximos.
- **Placares:** buscados do worldcup26.ir a cada 2 min; resultado manual (admin)
  tem prioridade e nunca é sobrescrito.

## Estrutura

```
.
├── backend/    # API Express + MySQL
├── frontend/   # SPA React/Vite
└── docker-compose.yml
```

## Setup local (já configurado nesta máquina)

Pré-requisitos: Node 20+, MySQL 8/9 rodando.

```bash
# 1. Banco e usuário (uma vez)
mysql -u root <<'SQL'
CREATE DATABASE IF NOT EXISTS bolao_copa2026 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'bolao'@'localhost' IDENTIFIED BY 'bolao2026';
GRANT ALL PRIVILEGES ON bolao_copa2026.* TO 'bolao'@'localhost';
FLUSH PRIVILEGES;
SQL

# 2. Backend
cd backend
npm install
npm run migrate     # aplica o schema (tabelas + view)
npm run seed        # popula 12 grupos, 48 seleções e 72 jogos
npm run seed:users  # cria o usuário de acesso (login)
npm run dev         # http://localhost:3001

# 3. Frontend (em outro terminal)
cd frontend
npm install
npm run dev       # http://localhost:5180  (proxia /api -> :3001)
```

> A porta padrão 5173 estava ocupada por outro projeto nesta máquina, então o
> frontend foi fixado em **5180** (`frontend/vite.config.js`).

## Docker (alternativa)

```bash
docker compose up --build
# frontend: http://localhost:5173 | backend: http://localhost:3001
```

## 🔐 Login / Acesso

O sistema é fechado por autenticação (telefone + senha). Toda a API (exceto
`/api/health` e `/api/auth/login`) exige um Bearer token JWT, e o frontend
redireciona para `/login` enquanto não houver sessão válida.

**Papéis:**

- `user` — participante: dá palpites e acompanha tudo.
- `admin` — cadastra jogadores e vê tudo, mas **não dá palpites**.

**Vínculo automático user ↔ player:** no primeiro login de um `user`, o sistema
cria automaticamente o `player` correspondente no bolão (ou reaproveita um de
mesmo nome, se o admin já tiver criado). A coluna `users.player_id` guarda esse
vínculo, e em `/palpites` o jogador do usuário já vem pré-selecionado. A tela
`/jogadores` lista participantes (logins) que ainda não têm jogador, para o admin
adicionar rapidamente.

**Credenciais NÃO ficam no repositório.** Defina-as em `backend/.env`
(copie de `backend/.env.example`) e crie os usuários com `npm run seed:users`:

```env
SEED_USER_NAME=...
SEED_USER_PHONE=...
SEED_USER_PASSWORD=...
SEED_ADMIN_NAME=Admin
SEED_ADMIN_PHONE=...
SEED_ADMIN_PASSWORD=...
```

- O telefone aceita qualquer formatação (espaços, hífen, parênteses) — é
  normalizado para dígitos no login.
- Senhas ficam com hash `bcrypt` na tabela `users`.
- `npm run seed:users` recria a tabela `users` a partir do `.env`
  (não afeta jogadores, palpites ou jogos).
- Token e expiração configuráveis em `backend/.env` (`JWT_SECRET`, `JWT_EXPIRES`).

## Regras de negócio

- Jogadores ilimitados; nome único.
- Um palpite por jogador por jogo (constraint `UNIQUE`).
- Palpites de cada jogo ficam ocultos até o apito inicial (revelados no kick-off).
- O administrador não dá palpites; apenas gerencia jogadores e acompanha tudo.
- Palpite só é aceito **antes** do `kick_off_utc` — validado no backend
  (`middleware/lockCheck.js`), retornando `403` após o início.
- Placar exato → 3 pontos; qualquer outro → 0.
- Resultado manual (`result_source='manual'`) tem prioridade e nunca é
  sobrescrito pela API.
- Status do jogo evolui por tempo: `scheduled → live → finished`.
- Horários armazenados em UTC e exibidos no fuso local do usuário.

## Endpoints principais

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Health check |
| GET | `/api/matches?group=C&status=live` | Jogos (com filtros) |
| GET | `/api/matches/upcoming?limit=10` | Próximos jogos |
| GET | `/api/matches/:id` | Detalhe + palpites |
| GET/POST/DELETE | `/api/players` | CRUD jogadores (máx 15) |
| GET/POST | `/api/predictions` | Palpites (com bloqueio por horário) |
| POST | `/api/predictions/bulk` | Salvar vários palpites |
| GET | `/api/results` | Resultados oficiais |
| POST | `/api/results/:match_id` | Resultado manual |
| POST | `/api/results/sync` | Trigger de sync com a API |
| GET | `/api/ranking` | Ranking (via view MySQL) |
| GET | `/api/ranking/:player_id/detail` | Palpites vs resultados |

## Variáveis de ambiente (`backend/.env`)

Veja o arquivo `backend/.env`. Principais: `DB_*`, `PORT`, `FRONTEND_URL`,
`SCORES_API_PRIMARY`, `SCORES_API_FALLBACK`, `SCORES_SYNC_INTERVAL_MS`.
