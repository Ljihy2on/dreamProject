// API helper with env-based base URL and optional mock responses for development.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK || '0') === '1';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function mockResponse(path, options) {
  // very small demo mocks to make UI work without a backend
  await sleep(120);
  if (path.startsWith('/students')) {
    if (path === '/students' || path.startsWith('/students?')) {
      return { items: [ { id: '1', name: '홍길동', school: '꿈초등학교', grade: '3' }, { id: '2', name: '김영희', school: '꿈초등학교', grade: '2' } ] };
    }
    const m = path.match(/^\/students\/(\w+)(?:\/activities)?/);
    if (m) {
      if (path.endsWith('/activities')) {
        return [ { id: 'a1', log_date: '2025-11-01', log_content: '미술 활동 참여' }, { id: 'a2', log_date: '2025-10-28', log_content: '글쓰기 활동' } ];
      }
      return { id: m[1], name: '데모 학생', school: '데모학교', grade: '4' };
    }
  }
  if (path === '/metrics') {
    return { activities: 42, uploads: 7, engagement: '78%' };
  }
  if (path.startsWith('/uploads')) {
    if (options && options.method === 'POST') {
      return { id: `u-${Date.now()}`, file_name: (options._formName || 'file.pdf'), status: 'processing' };
    }
    if (/^\/uploads\/[^/]+\/text/.test(path)) {
      return { text: '이곳에 OCR 결과 텍스트가 표시됩니다 (데모).' };
    }
    return [ { id: 'u1', file_name: 'report1.pdf', status: 'done' } ];
  }
  if (path === '/auth/login' && options && options.method === 'POST') {
    try {
      const body = JSON.parse(options.body || '{}');
      return { token: 'demo-token', user: { username: body.username || 'demo', role: body.role || 'teacher' } };
    } catch (e) {
      return { token: 'demo-token', user: { username: 'demo', role: 'teacher' } };
    }
  }
  // default mock
  return {};
}

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');

  // Support passing absolute path without leading slash
  const p = path.startsWith('/') ? path : '/' + path;

  if (USE_MOCK) {
    return mockResponse(p, options);
  }

  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  // If body is FormData, do not set Content-Type header (browser will set it)
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const fetchOpts = { ...options, headers };
  if (isForm) {
    // ensure we don't override headers
    delete fetchOpts.headers['Content-Type'];
  }

  const res = await fetch(API_BASE + p, fetchOpts);
  if (!res.ok) {
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch (e) { body = { message: text }; }
    const err = new Error(body?.message || res.statusText || 'API error');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export { apiFetch };