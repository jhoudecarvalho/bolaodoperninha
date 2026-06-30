CREATE DATABASE IF NOT EXISTS bolao_copa2026
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE bolao_copa2026;

-- Recriar do zero (ordem respeita FKs). A tabela `users` referencia `players`,
-- então desabilitamos a checagem de FK durante os DROPs.
SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW  IF EXISTS ranking_view;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS predictions;
DROP TABLE IF EXISTS champion_picks;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS `groups`;
SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================
-- TABELA: groups (12 grupos, A-L)
-- ==========================================
CREATE TABLE `groups` (
  id CHAR(1) PRIMARY KEY,
  name VARCHAR(20) NOT NULL
);

-- ==========================================
-- TABELA: teams (48 seleções)
-- ==========================================
CREATE TABLE teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  name_en VARCHAR(50) NOT NULL,
  flag_emoji VARCHAR(16) NOT NULL,
  group_id CHAR(1) NOT NULL,
  FOREIGN KEY (group_id) REFERENCES `groups`(id)
);

-- ==========================================
-- TABELA: matches (fase de grupos + mata-mata)
-- ==========================================
CREATE TABLE matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id CHAR(1) NULL,
  stage VARCHAR(20) NOT NULL DEFAULT 'GROUP_STAGE',
  fd_match_id INT NULL UNIQUE,
  home_team_id INT NOT NULL,
  away_team_id INT NOT NULL,
  match_date DATE NOT NULL,
  kick_off_utc DATETIME NOT NULL,
  venue VARCHAR(100),
  status ENUM('scheduled', 'live', 'paused', 'finished') DEFAULT 'scheduled',

  home_score INT DEFAULT NULL,
  away_score INT DEFAULT NULL,
  result_source ENUM('api', 'manual') DEFAULT NULL,
  result_updated_at DATETIME DEFAULT NULL,
  live_minute TINYINT UNSIGNED DEFAULT NULL,
  live_injury_time TINYINT UNSIGNED DEFAULT NULL,
  home_scorers JSON DEFAULT NULL,
  away_scorers JSON DEFAULT NULL,
  winner ENUM('home','away') DEFAULT NULL,

  FOREIGN KEY (group_id) REFERENCES `groups`(id),
  FOREIGN KEY (home_team_id) REFERENCES teams(id),
  FOREIGN KEY (away_team_id) REFERENCES teams(id),

  INDEX idx_kickoff (kick_off_utc),
  INDEX idx_status (status),
  INDEX idx_group (group_id),
  INDEX idx_stage (stage)
);

-- ==========================================
-- TABELA: players (até 15 participantes)
-- ==========================================
CREATE TABLE players (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE,
  pin VARCHAR(4) DEFAULT NULL,
  avatar_color VARCHAR(7) DEFAULT '#c8aa6e',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_name (name)
);

-- ==========================================
-- TABELA: users (acesso ao sistema / login)
-- Criada após `players` por causa da FK player_id.
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  username VARCHAR(40) DEFAULT NULL UNIQUE,   -- login alternativo (ex.: 'Admin')
  phone VARCHAR(20) DEFAULT NULL UNIQUE,      -- apenas dígitos (normalizado)
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  player_id INT DEFAULT NULL,                 -- vínculo com o participante (bolão)
  device_fingerprint VARCHAR(64) DEFAULT NULL, -- fingerprint do dispositivo autorizado
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_users_player
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL
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

  UNIQUE KEY uq_player_match (player_id, match_id)
);

-- ==========================================
-- TABELA: champion_picks (palpite de campeão)
-- ==========================================
CREATE TABLE champion_picks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT NOT NULL UNIQUE,
  team_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- ==========================================
-- TABELA: chat_messages
-- ==========================================
CREATE TABLE chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  player_name VARCHAR(30) NOT NULL,
  avatar_color VARCHAR(7) NOT NULL DEFAULT '#c8aa6e',
  message TEXT NOT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- VIEW: ranking calculado automaticamente
--
-- Pontos de "vencedor" usam o avanço real (coluna `winner`), não só o sinal do
-- placar. No mata-mata decidido nos pênaltis o placar fica empatado (ex: 1×1)
-- mas `winner` aponta quem passou — então quem apostou no time que avançou leva
-- os pontos de vencedor. Em jogos sem `winner` (grupos), cai no sinal do placar.
-- ==========================================
CREATE OR REPLACE VIEW ranking_view AS
SELECT
  p.id AS player_id,
  p.name AS player_name,
  p.avatar_color,
  SUM(CASE
    WHEN pr.home_score = m.home_score AND pr.away_score = m.away_score
         AND m.home_score IS NOT NULL
    THEN 1 ELSE 0
  END) AS acertos_exatos,
  SUM(CASE
    WHEN m.home_score IS NOT NULL AND
         SIGN(pr.home_score - pr.away_score) =
           (CASE WHEN m.winner = 'home' THEN 1
                 WHEN m.winner = 'away' THEN -1
                 ELSE SIGN(m.home_score - m.away_score) END) AND
         NOT (pr.home_score = m.home_score AND pr.away_score = m.away_score)
    THEN 1 ELSE 0
  END) AS acertos_vencedor,
  SUM(CASE
    WHEN pr.home_score = m.home_score AND pr.away_score = m.away_score
         AND m.home_score IS NOT NULL
    THEN CASE m.stage
      WHEN 'GROUP_STAGE'    THEN 3
      WHEN 'LAST_32'        THEN 5
      WHEN 'LAST_16'        THEN 8
      WHEN 'QUARTER_FINALS' THEN 10
      WHEN 'SEMI_FINALS'    THEN 13
      WHEN 'THIRD_PLACE'    THEN 10
      WHEN 'FINAL'          THEN 16
      ELSE 3
    END
    WHEN m.home_score IS NOT NULL AND
         SIGN(pr.home_score - pr.away_score) =
           (CASE WHEN m.winner = 'home' THEN 1
                 WHEN m.winner = 'away' THEN -1
                 ELSE SIGN(m.home_score - m.away_score) END) AND
         NOT (pr.home_score = m.home_score AND pr.away_score = m.away_score)
    THEN CASE m.stage
      WHEN 'GROUP_STAGE'    THEN 1
      WHEN 'LAST_32'        THEN 3
      WHEN 'LAST_16'        THEN 5
      WHEN 'QUARTER_FINALS' THEN 6
      WHEN 'SEMI_FINALS'    THEN 8
      WHEN 'THIRD_PLACE'    THEN 6
      WHEN 'FINAL'          THEN 10
      ELSE 1
    END
    ELSE 0
  END) AS pontos,
  SUM(CASE
    WHEN m.home_score IS NOT NULL THEN 1 ELSE 0
  END) AS jogos_com_resultado,
  COUNT(pr.id) AS total_palpites
FROM players p
LEFT JOIN predictions pr ON pr.player_id = p.id
LEFT JOIN matches m ON m.id = pr.match_id
GROUP BY p.id, p.name, p.avatar_color
ORDER BY pontos DESC, acertos_exatos DESC, p.name ASC;
