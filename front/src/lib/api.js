// 백엔드 기본 URL
// - 개발/배포 환경 모두에서 VITE_API_BAS 를 우선 사용
//   예) http://localhost:3000, https://dreamproject-ia6s.onrender.com
// - 없으면 VITE_API_BASE 를 쓰고, 그것도 없으면 '/api' 를 기본값으로 사용
const RAW_BASE =
  import.meta.env.VITE_API_BAS ||
  import.meta.env.VITE_API_BASE ||
  '/api'

// 끝에 붙은 슬래시는 제거 (ex: https://.../ -> https://...)
const API_BASE = RAW_BASE.replace(/\/+$/, '')

// 모킹 사용 여부
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK || '0') === '1'

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function mockResponse(path, options) {
  // 아주 간단한 데모 모킹 (기존 코드 유지)
  await sleep(120)

  if (path.startsWith('/students')) {
    if (path === '/students' || path.startsWith('/students?')) {
      return {
        items: [
          { id: '1', name: '홍길동', school: '꿈초등학교', grade: '3' },
          { id: '2', name: '김미희', school: '꿈초등학교', grade: '2' },
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
        name: '샘플 학생',
        school: '샘플학교',
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
      return { text: '여기에 OCR 결과 텍스트가 표시됩니다(모킹).' }
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

  // Gemini 관련 모킹 응답
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
      markdown: '# Mock 리포트\n\n(이것은 목업 응답입니다)',
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

  // If body is a plain object (and not FormData/Blob/etc), JSON-encode it
  const isPlainObject =
    options.body &&
    typeof options.body === 'object' &&
    !isForm &&
    !(typeof Blob !== 'undefined' && options.body instanceof Blob) &&
    !(typeof ArrayBuffer !== 'undefined' &&
      options.body instanceof ArrayBuffer) &&
    !(
      typeof URLSearchParams !== 'undefined' &&
      options.body instanceof URLSearchParams
    )

  const fetchOpts = { ...options, headers }
  if (isForm) {
    // ensure we don't override headers
    delete fetchOpts.headers['Content-Type']
  } else if (isPlainObject) {
    // ★ 여기서 JS 객체 body를 JSON 문자열로 변환
    fetchOpts.body = JSON.stringify(options.body)
    if (!fetchOpts.headers['Content-Type']) {
      fetchOpts.headers['Content-Type'] = 'application/json'
    }
  }

  // URL 조합:
  // - p 가 절대 URL이면 그대로 사용
  // - 아니면 API_BASE 를 prefix 로 붙임
  let url
  if (/^https?:\/\//.test(p)) {
    url = p
  } else if (API_BASE) {
    url = API_BASE + p
  } else {
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
 * prompts.js 의 PDF_TXT_EXTRACTION_PROMPT 기반 JSON records 를 받는 헬퍼
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
 * Dashboard/Report 에서 집계된 데이터를 기반으로
 * prompts.js 의 GET_REPORT_PROMPT 기반 Markdown 리포트를 생성
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
