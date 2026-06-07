import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

export const TOKEN_KEY = 'bolao_token';

// Anexa o Bearer token em toda requisição
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Em 401, limpa a sessão e redireciona para o login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(err);
  }
);

export default api;

export const AuthAPI = {
  login: (phone, password, fingerprint) =>
    api.post('/auth/login', { phone, password, fingerprint }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// Helpers de domínio
export const PlayersAPI = {
  list: () => api.get('/players').then((r) => r.data),
  suggestions: () => api.get('/players/suggestions').then((r) => r.data),
  create: (data) => api.post('/players', data).then((r) => r.data),
  remove: (id) => api.delete(`/players/${id}`).then((r) => r.data),
};

// Participantes (login + jogador) — gerenciado pelo admin
export const UsersAPI = {
  list: () => api.get('/users').then((r) => r.data),
  create: (data) => api.post('/users', data).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`).then((r) => r.data),
  resetDevice: (id) => api.delete(`/users/${id}/device`).then((r) => r.data),
};

export const MatchesAPI = {
  list: (params) => api.get('/matches', { params }).then((r) => r.data),
  upcoming: (limit = 10) =>
    api.get('/matches/upcoming', { params: { limit } }).then((r) => r.data),
  detail: (id) => api.get(`/matches/${id}`).then((r) => r.data),
  sync: () => api.post('/matches/sync').then((r) => r.data),
};

export const PredictionsAPI = {
  byPlayer: (player_id) =>
    api.get('/predictions', { params: { player_id } }).then((r) => r.data),
  byMatch: (match_id) =>
    api.get('/predictions', { params: { match_id } }).then((r) => r.data),
  byGroup: (group) =>
    api.get('/predictions', { params: { group } }).then((r) => r.data),
  save: (data) => api.post('/predictions', data).then((r) => r.data),
  saveBulk: (data) => api.post('/predictions/bulk', data).then((r) => r.data),
};

export const ResultsAPI = {
  list: () => api.get('/results').then((r) => r.data),
  sync: () => api.post('/results/sync').then((r) => r.data),
  acertadores: (group) =>
    api.get('/results/acertadores', { params: group ? { group } : {} }).then((r) => r.data),
};

export const RankingAPI = {
  list: () => api.get('/ranking').then((r) => r.data),
  detail: (player_id) => api.get(`/ranking/${player_id}/detail`).then((r) => r.data),
};
