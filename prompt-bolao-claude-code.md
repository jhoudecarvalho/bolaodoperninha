# 🏆 BOLÃO COPA DO MUNDO 2026 — Sistema Completo

## Visão Geral

Crie um sistema web completo de **Bolão da Copa do Mundo FIFA 2026** onde até 15 participantes fazem palpites nos jogos da fase de grupos. O sistema busca placares automaticamente via API, bloqueia palpites após o início de cada jogo, calcula pontuações e exibe um ranking em tempo real.

---

## Stack Tecnológica

- **Backend:** Node.js + Express
- **Banco de dados:** MySQL 8
- **Frontend:** React 18 (Vite)
- **Estilização:** Tailwind CSS
- **API de placares:** worldcup26.ir (gratuita, sem auth) + openfootball/worldcup.json (GitHub, fallback)
- **Tempo real:** polling a cada 60s no frontend (ou WebSocket com socket.io se preferir)

---

## Estrutura do Projeto

```
bolao-copa-2026/
├── backend/
│   ├── src/
│   │   ├── server.js                # Entry point Express
│   │   ├── config/
│   │   │   └── database.js          # Conexão MySQL (pool)
│   │   ├── routes/
│   │   │   ├── players.js           # CRUD jogadores
│   │   │   ├── predictions.js       # CRUD palpites
│   │   │   ├── results.js           # Resultados (API + manual)
│   │   │   ├── ranking.js           # Ranking calculado
│   │   │   └── matches.js           # Lista de jogos + status
│   │   ├── services/
│   │   │   ├── scoresFetcher.js     # Busca placares das APIs externas
│   │   │   └── scoringEngine.js     # Cálculo de pontos
│   │   ├── middleware/
│   │   │   └── lockCheck.js         # Middleware que impede palpites após kick-off
│   │   └── seeds/
│   │       └── seedMatches.js       # Seed com todos os 72 jogos
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api/
│   │   │   └── client.js            # Axios instance
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── Players.jsx
│   │   │   ├── Predictions.jsx
│   │   │   ├── Results.jsx
│   │   │   ├── Ranking.jsx
│   │   │   └── MatchDetail.jsx
│   │   └── components/
│   │       ├── MatchCard.jsx
│   │       ├── ScoreInput.jsx
│   │       ├── PlayerSelector.jsx
│   │       ├── RankingTable.jsx
│   │       ├── LiveBanner.jsx
│   │       ├── CountdownTimer.jsx
│   │       └── Navbar.jsx
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml               # MySQL + backend + frontend
└── README.md
```

---

## Banco de Dados MySQL

### Tabelas

```sql
CREATE DATABASE IF NOT EXISTS bolao_copa2026
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE bolao_copa2026;

-- ==========================================
-- TABELA: groups (12 grupos, A-L)
-- ==========================================
CREATE TABLE `groups` (
  id CHAR(1) PRIMARY KEY,           -- 'A', 'B', ..., 'L'
  name VARCHAR(20) NOT NULL         -- 'Grupo A', 'Grupo B', etc.
);

-- ==========================================
-- TABELA: teams (48 seleções)
-- ==========================================
CREATE TABLE teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,           -- 'Brasil', 'Argentina', etc.
  name_en VARCHAR(50) NOT NULL,        -- 'Brazil', 'Argentina' (para match com API)
  flag_emoji VARCHAR(10) NOT NULL,     -- '🇧🇷'
  group_id CHAR(1) NOT NULL,
  FOREIGN KEY (group_id) REFERENCES `groups`(id)
);

-- ==========================================
-- TABELA: matches (72 jogos fase de grupos)
-- ==========================================
CREATE TABLE matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id CHAR(1) NOT NULL,
  home_team_id INT NOT NULL,
  away_team_id INT NOT NULL,
  match_date DATE NOT NULL,
  kick_off_utc DATETIME NOT NULL,       -- Horário UTC do início
  venue VARCHAR(100),
  status ENUM('scheduled', 'live', 'finished') DEFAULT 'scheduled',

  -- Resultado oficial (preenchido via API ou manual)
  home_score INT DEFAULT NULL,
  away_score INT DEFAULT NULL,
  result_source ENUM('api', 'manual') DEFAULT NULL,
  result_updated_at DATETIME DEFAULT NULL,

  FOREIGN KEY (group_id) REFERENCES `groups`(id),
  FOREIGN KEY (home_team_id) REFERENCES teams(id),
  FOREIGN KEY (away_team_id) REFERENCES teams(id),

  INDEX idx_kickoff (kick_off_utc),
  INDEX idx_status (status),
  INDEX idx_group (group_id)
);

-- ==========================================
-- TABELA: players (até 15 participantes)
-- ==========================================
CREATE TABLE players (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE,
  pin VARCHAR(4) DEFAULT NULL,          -- PIN opcional de 4 dígitos
  avatar_color VARCHAR(7) DEFAULT '#c8aa6e',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_name (name)
);

-- ==========================================
-- TABELA: predictions (palpites)
-- ==========================================
CREATE TABLE predictions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT NOT NULL,
  match_id INT NOT NULL,
  home_score INT NOT NULL,
  away_score INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id),

  -- Um palpite por jogador por jogo
  UNIQUE KEY uq_player_match (player_id, match_id)
);

-- ==========================================
-- VIEW: ranking calculado automaticamente
-- ==========================================
CREATE OR REPLACE VIEW ranking_view AS
SELECT
  p.id AS player_id,
  p.name AS player_name,
  p.avatar_color,
  COUNT(CASE
    WHEN pr.home_score = m.home_score AND pr.away_score = m.away_score
    THEN 1
  END) AS acertos_exatos,
  COUNT(CASE
    WHEN pr.home_score = m.home_score AND pr.away_score = m.away_score
    THEN 1
  END) * 3 AS pontos,
  COUNT(CASE
    WHEN m.home_score IS NOT NULL THEN 1
  END) AS jogos_com_resultado,
  COUNT(pr.id) AS total_palpites
FROM players p
LEFT JOIN predictions pr ON pr.player_id = p.id
LEFT JOIN matches m ON m.id = pr.match_id
GROUP BY p.id, p.name, p.avatar_color
ORDER BY pontos DESC, acertos_exatos DESC, p.name ASC;
```

---

## API Endpoints

### Players

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/players` | Lista todos os jogadores |
| POST | `/api/players` | Cadastra jogador `{ name, pin? }` |
| DELETE | `/api/players/:id` | Remove jogador (e seus palpites) |

### Matches

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/matches` | Todos os jogos (com times, grupo, status) |
| GET | `/api/matches?group=C` | Jogos filtrados por grupo |
| GET | `/api/matches?status=live` | Jogos ao vivo |
| GET | `/api/matches/upcoming?limit=10` | Próximos N jogos |
| GET | `/api/matches/:id` | Detalhe de um jogo + todos os palpites |

### Predictions

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/predictions?player_id=1` | Todos os palpites de um jogador |
| GET | `/api/predictions?match_id=5` | Todos os palpites de um jogo |
| POST | `/api/predictions` | Criar/atualizar palpite `{ player_id, match_id, home_score, away_score }` |
| POST | `/api/predictions/bulk` | Salvar múltiplos palpites de uma vez |

> **REGRA CRÍTICA no POST:** O backend DEVE verificar se `NOW() < match.kick_off_utc`. Se o jogo já começou, retornar `403 { error: "Jogo já iniciou. Palpite bloqueado." }`. Essa validação é no BACKEND, nunca confiar no frontend.

### Results

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/results` | Todos os resultados oficiais |
| POST | `/api/results/:match_id` | Inserir resultado manual `{ home_score, away_score }` |
| POST | `/api/results/sync` | Trigger manual para buscar da API |

### Ranking

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/ranking` | Ranking geral (usa a VIEW do MySQL) |
| GET | `/api/ranking/:player_id/detail` | Detalhe: cada palpite vs resultado |

---

## Serviço de Busca de Placares (scoresFetcher.js)

### Fontes de dados (em ordem de prioridade)

1. **worldcup26.ir** — `GET https://worldcup26.ir/get/games` (gratuita, sem auth, tempo real)
2. **openfootball** — `GET https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json` (gratuita, atualização mais lenta)

### Lógica

```
A cada 2 minutos (cron job ou setInterval no backend):

1. Fetch da API primária (worldcup26.ir)
   - Se falhar, tentar a secundária (openfootball)

2. Para cada jogo retornado pela API:
   a. Mapear nome do time em inglês → ID do time no banco
      (usar tabela teams.name_en para o match)
   b. Se o jogo tem placar e nosso banco ainda não tem (ou é diferente):
      - UPDATE matches SET home_score=X, away_score=Y,
        status='finished', result_source='api',
        result_updated_at=NOW()
      - Se o jogo está rolando: status='live'

3. Atualizar status de jogos:
   - Se NOW() > kick_off_utc e status='scheduled' → status='live'
   - Se NOW() > kick_off_utc + 2h30 e status='live' → status='finished'

4. Log: "Sincronização concluída: X resultados atualizados"
```

### Mapeamento de times (name_en → name)

```javascript
const TEAM_MAP = {
  // O backend precisa mapear nomes vindos da API para os IDs do banco.
  // A tabela teams já tem name_en para isso.
  // Variações comuns:
  "Korea Republic": "South Korea",
  "Türkiye": "Turkey",
  "IR Iran": "Iran",
  "Côte d'Ivoire": "Ivory Coast",
  "Congo DR": "DR Congo",
  "Cabo Verde": "Cape Verde",
  // ... normalizar antes de buscar no banco
};
```

---

## Middleware de Bloqueio (lockCheck.js)

```javascript
// Aplicar em POST /api/predictions e POST /api/predictions/bulk
//
// 1. Receber match_id do body
// 2. SELECT kick_off_utc FROM matches WHERE id = match_id
// 3. Se NOW() >= kick_off_utc:
//    return res.status(403).json({
//      error: 'Palpite bloqueado',
//      message: 'Este jogo já começou. Não é possível alterar o palpite.'
//    })
// 4. Caso contrário: next()
```

---

## Sistema de Pontuação (scoringEngine.js)

### Regras

| Condição | Pontos |
|----------|--------|
| Placar exato (ex: palpitou 2×1 e deu 2×1) | **3 pontos** |
| Qualquer outro resultado | **0 pontos** |

### Query de ranking

```sql
SELECT
  p.name,
  SUM(
    CASE
      WHEN pr.home_score = m.home_score
       AND pr.away_score = m.away_score
      THEN 3
      ELSE 0
    END
  ) AS pontos,
  SUM(
    CASE
      WHEN pr.home_score = m.home_score
       AND pr.away_score = m.away_score
      THEN 1
      ELSE 0
    END
  ) AS acertos,
  COUNT(CASE WHEN m.home_score IS NOT NULL THEN 1 END) AS jogos_apurados
FROM players p
LEFT JOIN predictions pr ON pr.player_id = p.id
LEFT JOIN matches m ON m.id = pr.match_id
GROUP BY p.id
ORDER BY pontos DESC, acertos DESC;
```

---

## Seed dos 72 Jogos (seedMatches.js)

Ao rodar `npm run seed`, popular o banco com:

### 12 Grupos e 48 Times

```
Grupo A: México 🇲🇽, África do Sul 🇿🇦, Coreia do Sul 🇰🇷, Tchéquia 🇨🇿
Grupo B: Canadá 🇨🇦, Bósnia 🇧🇦, Catar 🇶🇦, Suíça 🇨🇭
Grupo C: Brasil 🇧🇷, Marrocos 🇲🇦, Haiti 🇭🇹, Escócia 🏴󠁧󠁢󠁳󠁣󠁴󠁿
Grupo D: EUA 🇺🇸, Paraguai 🇵🇾, Austrália 🇦🇺, Turquia 🇹🇷
Grupo E: Alemanha 🇩🇪, Curaçao 🇨🇼, Costa do Marfim 🇨🇮, Equador 🇪🇨
Grupo F: Holanda 🇳🇱, Japão 🇯🇵, Suécia 🇸🇪, Tunísia 🇹🇳
Grupo G: Bélgica 🇧🇪, Egito 🇪🇬, Irã 🇮🇷, Nova Zelândia 🇳🇿
Grupo H: Espanha 🇪🇸, Cabo Verde 🇨🇻, Arábia Saudita 🇸🇦, Uruguai 🇺🇾
Grupo I: França 🇫🇷, Senegal 🇸🇳, Iraque 🇮🇶, Noruega 🇳🇴
Grupo J: Argentina 🇦🇷, Argélia 🇩🇿, Áustria 🇦🇹, Jordânia 🇯🇴
Grupo K: Portugal 🇵🇹, RD Congo 🇨🇩, Uzbequistão 🇺🇿, Colômbia 🇨🇴
Grupo L: Inglaterra 🏴󠁧󠁢󠁥󠁮󠁧󠁿, Croácia 🇭🇷, Gana 🇬🇭, Panamá 🇵🇦
```

### 72 Jogos com horários UTC

Cada grupo tem 6 jogos (3 rodadas × 2 jogos). Horários de kick-off em UTC:

```
-- GRUPO A
('A', 'México',        'África do Sul',   '2026-06-11 21:00:00'),
('A', 'Coreia do Sul', 'Tchéquia',        '2026-06-12 02:00:00'),
('A', 'Tchéquia',      'África do Sul',   '2026-06-18 21:00:00'),
('A', 'México',        'Coreia do Sul',   '2026-06-19 02:00:00'),
('A', 'África do Sul', 'Coreia do Sul',   '2026-06-24 22:00:00'),
('A', 'Tchéquia',      'México',          '2026-06-24 22:00:00'),

-- GRUPO B
('B', 'Canadá',  'Bósnia',  '2026-06-12 19:00:00'),
('B', 'Catar',   'Suíça',   '2026-06-13 19:00:00'),
('B', 'Suíça',   'Bósnia',  '2026-06-19 00:00:00'),
('B', 'Canadá',  'Catar',   '2026-06-18 22:00:00'),
('B', 'Bósnia',  'Catar',   '2026-06-25 22:00:00'),
('B', 'Suíça',   'Canadá',  '2026-06-25 22:00:00'),

-- GRUPO C
('C', 'Brasil',   'Marrocos',  '2026-06-13 22:00:00'),
('C', 'Haiti',    'Escócia',   '2026-06-14 01:00:00'),
('C', 'Escócia',  'Marrocos',  '2026-06-19 22:00:00'),
('C', 'Brasil',   'Haiti',     '2026-06-20 01:00:00'),
('C', 'Marrocos', 'Haiti',     '2026-06-25 20:00:00'),
('C', 'Escócia',  'Brasil',    '2026-06-26 00:00:00'),

-- GRUPO D
('D', 'EUA',       'Paraguai',   '2026-06-13 01:00:00'),
('D', 'Austrália', 'Turquia',    '2026-06-14 04:00:00'),
('D', 'Turquia',   'Paraguai',   '2026-06-20 04:00:00'),
('D', 'EUA',       'Austrália',  '2026-06-19 19:00:00'),
('D', 'Paraguai',  'Austrália',  '2026-06-26 02:00:00'),
('D', 'Turquia',   'EUA',        '2026-06-26 02:00:00'),

-- GRUPO E
('E', 'Alemanha',        'Curaçao',          '2026-06-14 17:00:00'),
('E', 'Costa do Marfim', 'Equador',          '2026-06-14 23:00:00'),
('E', 'Alemanha',        'Costa do Marfim',  '2026-06-20 20:00:00'),
('E', 'Equador',         'Curaçao',          '2026-06-21 00:00:00'),
('E', 'Curaçao',         'Costa do Marfim',  '2026-06-26 22:00:00'),
('E', 'Equador',         'Alemanha',         '2026-06-26 22:00:00'),

-- GRUPO F
('F', 'Holanda',  'Japão',    '2026-06-14 20:00:00'),
('F', 'Suécia',   'Tunísia',  '2026-06-15 02:00:00'),
('F', 'Holanda',  'Suécia',   '2026-06-20 17:00:00'),
('F', 'Tunísia',  'Japão',    '2026-06-21 04:00:00'),
('F', 'Japão',    'Suécia',   '2026-06-27 00:00:00'),
('F', 'Tunísia',  'Holanda',  '2026-06-27 00:00:00'),

-- GRUPO G
('G', 'Bélgica',       'Egito',          '2026-06-15 22:00:00'),
('G', 'Irã',           'Nova Zelândia',  '2026-06-16 01:00:00'),
('G', 'Bélgica',       'Irã',            '2026-06-21 17:00:00'),
('G', 'Nova Zelândia', 'Egito',          '2026-06-21 23:00:00'),
('G', 'Egito',         'Irã',            '2026-06-27 20:00:00'),
('G', 'Nova Zelândia', 'Bélgica',        '2026-06-27 20:00:00'),

-- GRUPO H
('H', 'Espanha',        'Cabo Verde',      '2026-06-15 16:00:00'),
('H', 'Arábia Saudita', 'Uruguai',         '2026-06-15 22:00:00'),
('H', 'Espanha',        'Arábia Saudita',  '2026-06-21 20:00:00'),
('H', 'Uruguai',        'Cabo Verde',      '2026-06-22 02:00:00'),
('H', 'Cabo Verde',     'Arábia Saudita',  '2026-06-27 22:00:00'),
('H', 'Uruguai',        'Espanha',         '2026-06-27 22:00:00'),

-- GRUPO I
('I', 'França',   'Senegal',  '2026-06-16 19:00:00'),
('I', 'Iraque',   'Noruega',  '2026-06-16 22:00:00'),
('I', 'França',   'Iraque',   '2026-06-22 17:00:00'),
('I', 'Noruega',  'Senegal',  '2026-06-22 23:00:00'),
('I', 'Senegal',  'Iraque',   '2026-06-26 20:00:00'),
('I', 'Noruega',  'França',   '2026-06-26 20:00:00'),

-- GRUPO J
('J', 'Argentina', 'Argélia',   '2026-06-17 01:00:00'),
('J', 'Áustria',   'Jordânia',  '2026-06-17 04:00:00'),
('J', 'Argentina', 'Áustria',   '2026-06-22 20:00:00'),
('J', 'Jordânia',  'Argélia',   '2026-06-23 02:00:00'),
('J', 'Argélia',   'Áustria',   '2026-06-27 16:00:00'),
('J', 'Jordânia',  'Argentina', '2026-06-27 16:00:00'),

-- GRUPO K
('K', 'Portugal',     'RD Congo',      '2026-06-17 17:00:00'),
('K', 'Uzbequistão', 'Colômbia',      '2026-06-18 02:00:00'),
('K', 'Portugal',     'Uzbequistão',  '2026-06-23 17:00:00'),
('K', 'Colômbia',     'RD Congo',      '2026-06-23 23:00:00'),
('K', 'RD Congo',     'Uzbequistão',  '2026-06-28 00:00:00'),
('K', 'Colômbia',     'Portugal',      '2026-06-28 00:00:00'),

-- GRUPO L
('L', 'Inglaterra', 'Croácia',  '2026-06-17 20:00:00'),
('L', 'Gana',       'Panamá',   '2026-06-17 23:00:00'),
('L', 'Inglaterra', 'Gana',     '2026-06-23 20:00:00'),
('L', 'Panamá',     'Croácia',  '2026-06-24 02:00:00'),
('L', 'Croácia',    'Gana',     '2026-06-28 02:00:00'),
('L', 'Panamá',     'Inglaterra','2026-06-28 02:00:00'),
```

---

## Frontend — Telas e Componentes

### Navegação Principal

```
🏠 Home
├── Banner AO VIVO (jogos em andamento com placar)
├── Hero card (regras: 3 pts exato, bloqueio no kick-off, API automática)
├── Menu de navegação (5 botões)
├── 📅 Próximos 10 jogos (com botão "🎯 Palpite" inline em cada jogo)
└── 🏆 Top 3 mini-ranking

👥 Jogadores — Cadastro e remoção (max 15)

🎯 Palpites
├── Selecionar jogador
├── Selecionar grupo (A-L) — mostra contagem X/6 feitos + quantos abertos/bloqueados
└── Formulário de palpite por grupo
    ├── Cada jogo mostra: bandeiras, times, data/hora local, countdown
    ├── Se jogo não começou: inputs de placar editáveis (🟢)
    ├── Se jogo começou: inputs bloqueados em cinza (🔒 BLOQUEADO / AO VIVO)
    └── Se tem resultado: mostra "Real: X × Y" + ✓ +3 ou ✗

📊 Resultados
├── Visão por grupo
├── Placares vindos da API marcados com "📡 API"
├── Permite edição manual (sobrescreve API)
└── Mostra fonte do resultado (api/manual)

🏆 Ranking
├── Posição, nome, pontos, acertos, jogos apurados
├── Top 3 com medalhas 🥇🥈🥉 e destaque visual
└── Atualização automática

🔍 Detalhes
├── Selecionar jogador
└── Lista todos os palpites dele com resultado:
    ├── ✓ +3 (verde) se acertou
    ├── ✗ (vermelho) se errou
    └── Sem ícone se ainda não tem resultado
```

### Componente: MatchCard (reutilizável)

```jsx
<MatchCard
  match={match}              // dados do jogo
  prediction={prediction}    // palpite do jogador (se houver)
  result={result}            // resultado oficial (se houver)
  locked={isStarted}         // jogo começou?
  onPredict={handlePredict}  // callback para salvar palpite
  showQuickPredict={true}    // mostrar form inline?
/>
```

### Componente: QuickPredict (palpite rápido na Home)

Ao clicar "🎯 Palpite" em um jogo nos próximos 10:
1. O card expande com animação
2. Se 1 jogador cadastrado → seleciona automaticamente
3. Se vários → mostra botões com nomes (bolinha verde = já fez palpite)
4. Inputs de placar + botão 💾
5. Mostra palpite existente se houver: "Palpite atual: X × Y ✓"
6. Clicar de novo no botão → fecha

---

## Design Visual

### Tema escuro premium — inspiração troféu/ouro

```
Backgrounds:      #090916, #111128, #14142c
Borders:          #1a1a30, #1e1e3a
Dourado (accent): #c8aa6e, #a8884e
Texto principal:  #e8e8f0
Texto secundário: #888, #666, #555
Verde (sucesso):  #5cb85c, #2d6a2d
Vermelho (erro):  #d9534f, #e74c3c
Azul (API):       #3498db
Amarelo (loading):#f0ad4e

Fontes:
  - Títulos: 'Playfair Display', serif (weight 700, 900)
  - Corpo:   'DM Sans', sans-serif (weight 400, 500, 700)

Border radius:    6-14px
Cards:            background com gradient sutil, border 1px
Animações:        fadeIn, slideUp nos cards (0.3-0.5s ease)
```

### Indicadores visuais

- **🟢 Jogo aberto:** borda verde, inputs editáveis
- **🔒 Jogo bloqueado:** borda vermelha, inputs cinza desabilitados
- **🔴 AO VIVO:** pulsação vermelha no indicador, banner no topo
- **📡 API:** badge azul nos resultados vindos da API
- **⏱ Countdown:** tempo restante até o kick-off (4d, 2h30m, 15m)
- **Hoje:** card com borda/texto dourado

---

## Variáveis de Ambiente (.env)

```env
# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=bolao
DB_PASSWORD=bolao2026
DB_NAME=bolao_copa2026

# Server
PORT=3001
NODE_ENV=development

# Frontend URL (CORS)
FRONTEND_URL=http://localhost:5173

# API de placares
SCORES_API_PRIMARY=https://worldcup26.ir/get/games
SCORES_API_FALLBACK=https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json
SCORES_SYNC_INTERVAL_MS=120000
```

---

## Docker Compose

```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: bolao_copa2026
      MYSQL_USER: bolao
      MYSQL_PASSWORD: bolao2026
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    depends_on:
      - mysql
    environment:
      DB_HOST: mysql
      DB_USER: bolao
      DB_PASSWORD: bolao2026
      DB_NAME: bolao_copa2026

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    depends_on:
      - backend

volumes:
  mysql_data:
```

---

## Comandos de Setup

```bash
# 1. Instalar dependências
cd backend && npm install
cd ../frontend && npm install

# 2. Criar banco e tabelas
mysql -u root -p < backend/src/seeds/schema.sql

# 3. Popular com grupos, times e jogos
cd backend && npm run seed

# 4. Iniciar backend (porta 3001)
cd backend && npm run dev

# 5. Iniciar frontend (porta 5173)
cd frontend && npm run dev
```

---

## Regras de Negócio — Checklist

- [ ] Máximo de 15 jogadores
- [ ] Um palpite por jogador por jogo (UNIQUE constraint)
- [ ] Palpite só pode ser criado/alterado ANTES do kick_off_utc (validação no backend)
- [ ] Após kick-off, endpoint retorna 403
- [ ] Frontend desabilita inputs e mostra 🔒 para jogos iniciados
- [ ] Placares são buscados automaticamente a cada 2 min
- [ ] Resultado manual sobrescreve o da API (result_source='manual')
- [ ] Ranking recalcula em tempo real usando a VIEW do MySQL
- [ ] Horários exibidos no fuso local do usuário (converter UTC → local no frontend)
- [ ] Countdown atualiza a cada 30 segundos no frontend
- [ ] Status do jogo atualiza automaticamente (scheduled → live → finished)

---

## Ordem de Implementação Sugerida

1. **Setup do projeto** — Estrutura de pastas, package.json, configs
2. **Banco de dados** — Schema SQL, conexão MySQL, pool
3. **Seed** — Popular grupos, times e 72 jogos
4. **API de matches** — GET /matches, /matches/upcoming, filtros
5. **API de players** — CRUD com limite de 15
6. **API de predictions** — CRUD com middleware de bloqueio por horário
7. **Serviço de scores** — Fetcher das APIs externas + cron
8. **API de ranking** — Query com cálculo de pontos
9. **Frontend: estrutura** — React + Vite + Tailwind + Router
10. **Frontend: Home** — Hero, menu, próximos jogos, palpite rápido, top 3
11. **Frontend: Palpites** — Fluxo completo com bloqueio visual
12. **Frontend: Ranking e Detalhes** — Tabela e drill-down por jogador
13. **Frontend: Resultados** — Visualização + edição manual
14. **Polish** — Animações, responsivo, loading states, error handling
