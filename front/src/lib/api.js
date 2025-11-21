// 백엔드 기본 URL
// - 개발/배포 환경 모두에서 VITE_API_BAS 를 우선 사용
//   예) http://localhost:3000, https://dreamproject-ia6s.onrender.com
// - 없으면 VITE_API_BASE → 마지막으로 '/api' 를 기본값으로 사용
const RAW_BASE =
  import.meta.env.VITE_API_BAS ||
  import.meta.env.VITE_API_BASE ||
  '/api'

// 끝에 붙은 슬래시는 제거 (ex: https://.../ -> https://...)
const API_BASE = RAW_BASE.replace(/\/+$/, '')

// 목 사용 여부
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK || '0') === '1'

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function mockResponse(path, options) {
  // 아주 간단한 데모 목 (기존 내용 유지)
  await sleep(120)

  if (path.startsWith('/students')) {
    if (path === '/students' || path.startsWith('/students?')) {
      return {
        items: [
          { id: '1', name: '홍길동', school: '꿈초등학교', grade: '3' },
          { id: '2', name: '김영희', school: '꿈초등학교', grade: '2' },
        ],
      }
    }
    const m = path.match(/^\/students\/(\w+)(?:\/activities)?/)
    if (m) {
      if (path.endsWith('/activities')) {
        return [
          { id: 'a1', log_date: '2025-11-01', log_content: '미술 활동 참여' },
          { id: 'a2', log_date: '2025-10-28', log_content: '글쓰기 활동' },
        ]
      }
      return {
        id: m[1],
        name: '데모 학생',
        school: '데모학교',
        grade: '4',
      }
    }
  }

  if (path === '/metrics') {
    return { activities: 42, uploads: 7, engagement: '78%' }
  }

  if (path.startsWith('/uploads')) {
    if (options && options.method === 'POST') {
      return {
        id: `u-${Date.now()}`,
        file_name: options._formName || 'file.pdf',
        status: 'processing',
      }
    }
    if (/^\/uploads\/[^/]+\/text/.test(path)) {
      return { text: '이곳에 OCR 결과 텍스트가 표시됩니다 (데모).' }
    }
    return [{ id: 'u1', file_name: 'report1.pdf', status: 'done' }]
  }

  if (path === '/auth/login' && options && options.method === 'POST') {
    try {
      const body = JSON.parse(options.body || '{}')
      return {
        token: 'demo-token',
        user: {
          username: body.username || 'demo',
          role: body.role || 'teacher',
        },
      }
    } catch (e) {
      return {
        token: 'demo-token',
        user: { username: 'demo', role: 'teacher' },
      }
    }
  }

  // Gemini 관련 목 응답
  if (path === '/ai/extract-records' && options && options.method === 'POST') {
    return {
      ok: true,
      model: 'mock-gemini',
      raw: JSON.stringify({ records: [] }),
      parsed: { records: [] },
    }
  }

  if (path === '/ai/generate-report' && options && options.method === 'POST') {
    return {
      ok: true,
      model: 'mock-gemini',
      markdown: '# Mock 리포트\n\n(이것은 목업 응답입니다.)',
    }
  }

  // default mock
  return {}
}

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token')

  // Support passing absolute path without leading slash
  const p = path.startsWith('/') ? path : '/' + path

  if (USE_MOCK) {
    return mockResponse(p, options)
  }

  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  // If body is FormData, do not set Content-Type header (browser will set it)
  const isForm =
    typeof FormData !== 'undefined' && options.body instanceof FormData

  const fetchOpts = { ...options, headers }
  if (isForm) {
    // ensure we don't override headers
    delete fetchOpts.headers['Content-Type']
  }

  // URL 조합: 
  // - p 가 절대 URL이면 그대로 사용
  // - 아니면 API_BASE 를 prefix 로 붙임
  let url
  if (/^https?:\/\//.test(p)) {
    url = p
  } else if (API_BASE) {
    // API_BASE 가 'https://...' 이든 '/api' 이든 끝에 슬래시 제거되어 있고,
    // p 는 항상 '/' 로 시작하므로 그냥 이어 붙이면 됨.
    url = API_BASE + p
  } else {
    // 최후의 수단 (동일 오리진)
    url = p
  }

  const res = await fetch(url, fetchOpts)

  if (!res.ok) {
    const text = await res.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch (e) {
      body = { message: text }
    }
    const err = new Error(body?.message || res.statusText || 'API error')
    err.status = res.status
    err.body = body
    throw err
  }

  if (res.status === 204) return null

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

// -------------------- Gemini AI helper APIs --------------------

/**
 * PDF/TXT 원본 텍스트를 Gemini로 분석해서
 * prompts.js의 PDF_TXT_EXTRACTION_PROMPT 기준 JSON records를 받는 헬퍼
 *
 * payload: { raw_text: string, file_name?: string }
 */
export async function extractRecordsWithGemini(payload) {
  return apiFetch('/ai/extract-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
}

/**
 * Dashboard/Report 에서 집계한 데이터를 기반으로
 * prompts.js의 REPORT_GENERATION_PROMPT 기준 Markdown 리포트 생성
 *
 * payload: {
 *   student_profile,
 *   date_range,
 *   summary_stats,
 *   activity_samples,
 *   report_options
 * }
 */
export async function generateReportWithGemini(payload) {
  return apiFetch('/ai/generate-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
}

export { apiFetch }
