require('dotenv').config()
const express = require('express')
const { supabase } = require('./supabaseClient')
const multer = require('multer')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const {
  PDF_TXT_EXTRACTION_PROMPT,
  REPORT_GENERATION_PROMPT,
} = require('./prompts')

const app = express()
const port = process.env.PORT || 3000

// -------------------- Gemini 클라이언트 설정 --------------------

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
let gemini = null

if (geminiApiKey) {
  gemini = new GoogleGenerativeAI(geminiApiKey)
} else {
  console.warn(
    '⚠️ GEMINI_API_KEY 또는 GOOGLE_API_KEY 환경변수가 설정되어 있지 않습니다. Gemini 기반 기능이 비활성화됩니다.',
  )
}

// ```json 코드블록 등을 제거하면서 JSON 파싱하는 유틸
function parseJsonFromText(text) {
  if (!text) return null
  try {
    let cleaned = text.trim()
    cleaned = cleaned.replace(/^```json\s*/i, '')
    cleaned = cleaned.replace(/^```\s*/i, '')
    cleaned = cleaned.replace(/```$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (e) {
    console.error('Gemini JSON 파싱 에러:', e)
    return null
  }
}

// 파일 업로드용 multer (메모리 저장)
const upload = multer({ storage: multer.memoryStorage() })

// JSON 파싱
app.use(express.json())

// CORS 허용
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  )
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With',
  )
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

// -------------------- 헬스 체크 --------------------

app.get('/', (req, res) => {
  res.send('Node + Supabase 서버가 실행 중입니다.')
})

// -------------------- 로그인 (/auth/login) --------------------
/**
 * 프론트: POST {API_BASE}/auth/login 또는 {API_BASE}/api/auth/login
 */
app.post(['/auth/login', '/api/auth/login'], async (req, res) => {
  try {
    const { email } = req.body || {}

    if (!email) {
      return res
        .status(400)
        .json({ message: '이메일을 입력해 주세요.', code: 'NO_EMAIL' })
    }

    // Supabase Admin API 로 전체 유저를 받아서 email 로 필터
    const { data, error } = await supabase.auth.admin.listUsers()
    if (error) {
      console.error('auth.admin.listUsers 에러:', error)
      return res.status(500).json({ message: 'Auth Admin Error', error })
    }

    const user =
      data?.users?.find(
        u => (u.email || '').toLowerCase() === email.toLowerCase(),
      ) || null

    if (!user) {
      return res.status(401).json({
        message:
          '해당 이메일의 계정을 찾을 수 없습니다. Supabase Auth에서 유저를 먼저 생성해 주세요.',
        code: 'USER_NOT_FOUND',
      })
    }

    const devUser = {
      id: user.id,
      email: user.email,
      display_name:
        user.user_metadata?.full_name ||
        (user.email ? user.email.split('@')[0] : '교사'),
      role: 'observer',
    }

    return res.json({
      token: 'local-dev-token',
      user: devUser,
    })
  } catch (e) {
    console.error('POST /auth/login 에러:', e)
    return res.status(500).json({ message: 'Login Error', error: e.toString() })
  }
})

// -------------------- 업로드 API (/uploads, /api/uploads) --------------------
/**
 * POST /uploads, /api/uploads
 * - 프론트에서 FormData 로 file 하나만 보냄
 * - Supabase ingest_uploads 에 메타데이터만 기록 (Storage 업로드는 생략)
 */
app.post(
  ['/uploads', '/api/uploads'],
  upload.single('file'),
  async (req, res) => {
    try {
      const file = req.file
      if (!file) {
        return res.status(400).json({ message: '파일이 필요합니다.' })
      }

      // multer가 latin1 인코딩으로 이름을 줄 수 있어서 UTF-8로 복원
      const originalName = Buffer.from(file.originalname, 'latin1').toString(
        'utf8',
      )

      const now = new Date().toISOString()
      const storageKey = `uploads/${Date.now()}-${originalName}`

      const { data, error } = await supabase
        .from('ingest_uploads')
        .insert([
          {
            file_name: originalName,
            storage_key: storageKey,
            student_id: null,
            uploaded_by: null, // 로그인 유저와 연결하려면 Authorization 헤더에서 id를 꺼내서 넣으면 됨
            status: 'queued',
            progress: 0,
            error: null,
            created_at: now,
            updated_at: now,
          },
        ])
        .select()
        .single()

      if (error) {
        console.error('ingest_uploads insert 에러:', error)
        return res.status(500).json({ message: 'DB Error', error })
      }

      res.status(201).json(data)
    } catch (e) {
      console.error('POST /uploads 에러:', e)
      res.status(500).json({ message: 'Upload Error', error: e.toString() })
    }
  },
)

/**
 * GET /uploads, /api/uploads
 * - ingest_uploads + students 를 조합해서
 *   UploadPage.jsx 의 hydrateUpload 가 이해할 수 있는 형태로 반환
 */
app.get(['/uploads', '/api/uploads'], async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ingest_uploads')
      .select('id, file_name, status, progress, error, created_at, student_id')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('ingest_uploads 목록 조회 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    const studentIds = [...new Set(data.map(u => u.student_id).filter(Boolean))]

    let studentsById = {}
    if (studentIds.length > 0) {
      const { data: students, error: sErr } = await supabase
        .from('students')
        .select('id, name')
        .in('id', studentIds)

      if (sErr) {
        console.error('students 조회 에러:', sErr)
      } else if (students) {
        studentsById = Object.fromEntries(students.map(s => [s.id, s.name]))
      }
    }

    const uploads = data.map(u => ({
      id: u.id,
      file_name: u.file_name,
      status: u.status,
      progress: u.progress,
      error: u.error,
      created_at: u.created_at,
      uploaded_at: u.created_at,
      student_id: u.student_id,
      student_name: studentsById[u.student_id] || '학생 미확인',
    }))

    res.json(uploads)
  } catch (e) {
    console.error('GET /uploads 에러:', e)
    res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() })
  }
})

/**
 * GET /uploads/:id, /api/uploads/:id
 * - 단일 업로드 정보
 */
app.get(['/uploads/:id', '/api/uploads/:id'], async (req, res) => {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('ingest_uploads')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      console.error('uploads 단일 조회 에러:', error)
      return res.status(404).json({ message: '업로드를 찾을 수 없습니다.' })
    }

    res.json(data)
  } catch (e) {
    console.error('GET /uploads/:id 에러:', e)
    res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() })
  }
})

/**
 * DELETE /uploads/:id, /api/uploads/:id
 * - ingest_uploads 행 삭제
 */
app.delete(['/uploads/:id', '/api/uploads/:id'], async (req, res) => {
  const { id } = req.params

  try {
    const { error } = await supabase
      .from('ingest_uploads')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('ingest_uploads 삭제 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    return res.status(204).send()
  } catch (e) {
    console.error('DELETE /uploads/:id 에러:', e)
    return res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() })
  }
})

// -------------------- 업로드 로그 저장 (/uploads/:id/log) --------------------
/**
 * POST /uploads/:id/log, /api/uploads/:id/log
 *
 * body 예시:
 * {
 *   upload_id: "...",
 *   file_name: "파일명.pdf",
 *   raw_text: "텍스트 전문",
 *   log_entries: [
 *     {
 *       student_id: "...",
 *       log_date: "2025-11-21",
 *       emotion_tag: "기쁨",
 *       activity_tags: ["미술", "글쓰기"],
 *       log_content: "...",
 *       related_metrics: { score: 85, minutes: 30 }
 *     },
 *     ...
 *   ]
 * }
 */
app.post(['/uploads/:id/log', '/api/uploads/:id/log'], async (req, res) => {
  const { id } = req.params
  const { upload_id, file_name, raw_text, log_entries } = req.body || {}

  if (!Array.isArray(log_entries) || log_entries.length === 0) {
    return res
      .status(400)
      .json({ message: 'log_entries 배열이 필요합니다.' })
  }

  try {
    const rows = log_entries
      .filter(e => e && e.student_id)
      .map(e => ({
        log_date: e.log_date || new Date().toISOString().slice(0, 10),
        student_id: e.student_id,
        emotion_tag: e.emotion_tag || null,
        activity_tags: e.activity_tags || null, // text[]
        log_content: e.log_content || null,
        related_metrics: e.related_metrics || null, // jsonb
        source_file_path: file_name || null,
      }))

    if (rows.length === 0) {
      return res
        .status(400)
        .json({ message: '학생 정보가 있는 기록이 없습니다.' })
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('log_entries')
      .insert(rows)
      .select()

    if (insertErr) {
      console.error('log_entries insert 에러:', insertErr)
      return res.status(500).json({
        message: 'log_entries 저장 중 오류',
        error: insertErr,
      })
    }

    const firstStudentId = rows[0].student_id

    const { error: upErr } = await supabase
      .from('ingest_uploads')
      .update({
        student_id: firstStudentId,
        status: 'success',
        progress: 100,
      })
      .eq('id', id)

    if (upErr) {
      console.error('ingest_uploads 업데이트 에러:', upErr)
    }

    return res.status(201).json({
      upload_id: id,
      file_name,
      raw_text,
      log_entries: inserted,
    })
  } catch (e) {
    console.error('POST /uploads/:id/log 에러:', e)
    return res.status(500).json({
      message: 'Upload log save error',
      error: e.toString(),
    })
  }
})

// -------------------- log_entries 조회 (UploadPage 상세용) --------------------
/**
 * GET /log_entries?upload_id=...
 * - upload_id 로 ingest_uploads 를 찾고, 해당 student_id 의 로그를 최근 순으로 반환
 */
app.get('/log_entries', async (req, res) => {
  const { upload_id } = req.query

  try {
    let studentId = null

    if (upload_id) {
      const { data: upload, error: uErr } = await supabase
        .from('ingest_uploads')
        .select('student_id')
        .eq('id', upload_id)
        .single()

      if (uErr) {
        console.error('ingest_uploads 조회 에러:', uErr)
      } else {
        studentId = upload?.student_id || null
      }
    }

    let query = supabase
      .from('log_entries')
      .select('*')
      .order('log_date', { ascending: false })
      .limit(20)

    if (studentId) {
      query = query.eq('student_id', studentId)
    }

    const { data, error } = await query

    if (error) {
      console.error('log_entries 조회 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    res.json(data || [])
  } catch (e) {
    console.error('GET /log_entries 에러:', e)
    res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() })
  }
})

// -------------------- Supabase 스타일 REST 프록시 --------------------

/**
 * POST /rest/v1/log_entries
 * - body 전체를 log_entries 에 insert(1건)
 */
app.post('/rest/v1/log_entries', async (req, res) => {
  try {
    const body = req.body || {}

    const { data, error } = await supabase
      .from('log_entries')
      .insert([body])
      .select()
      .single()

    if (error) {
      console.error('log_entries insert 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    res.status(201).json(data)
  } catch (e) {
    console.error('POST /rest/v1/log_entries 에러:', e)
    res
      .status(500)
      .json({ message: 'DB Error', error: e.toString() })
  }
})

/**
 * POST /rest/v1/log_entry_tags
 * - body: [{ log_entry_id, tag_id }, ...]
 */
app.post('/rest/v1/log_entry_tags', async (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : []
    if (rows.length === 0) {
      return res.status(400).json({ message: '배열 형태의 body가 필요합니다.' })
    }

    const { data, error } = await supabase
      .from('log_entry_tags')
      .insert(rows)
      .select()

    if (error) {
      console.error('log_entry_tags insert 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    res.status(201).json(data)
  } catch (e) {
    console.error('POST /rest/v1/log_entry_tags 에러:', e)
    res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() })
  }
})

/**
 * GET /rest/v1/tags?select=*
 * - 감정 키워드 전체 조회용 간단 프록시
 */
app.get('/rest/v1/tags', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tags')
      .select('id, name')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('tags 조회 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    const rows = (data || []).map(t => ({
      id: t.id,
      name: t.name,
      label: t.name,
    }))

    res.json(rows)
  } catch (e) {
    console.error('GET /rest/v1/tags 에러:', e)
    res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() })
  }
})

/**
 * POST /rest/v1/tags
 * - 새로운 감정 키워드 추가
 */
app.post('/rest/v1/tags', async (req, res) => {
  try {
    const { name } = req.body || {}
    if (!name) {
      return res.status(400).json({ message: 'name 필드가 필요합니다.' })
    }

    const { data, error } = await supabase
      .from('tags')
      .insert([{ name }])
      .select()
      .single()

    if (error) {
      console.error('tags insert 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    res.status(201).json(data)
  } catch (e) {
    console.error('POST /rest/v1/tags 에러:', e)
    res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() })
  }
})

// -------------------- /api/students, /api/log_entries --------------------
// (Dashboard, StudentList 페이지에서 사용)

app.get('/api/students', async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query

  let query = supabase
    .from('students')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('students 목록 조회 에러:', error)
    return res.status(500).json({ message: 'DB Error', error })
  }

  res.json({
    count,
    items: data,
  })
})

app.get('/api/students/:id', async (req, res) => {
  const { id } = req.params

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('students 상세 조회 에러:', error)
    return res.status(404).json({ message: '학생을 찾을 수 없습니다.', error })
  }

  res.json(data)
})

// StudentDetail 에서 사용하는 더미용(또는 확장용) 엔드포인트
app.get('/students/:id/activities', async (req, res) => {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('log_entries')
      .select('*')
      .eq('student_id', id)
      .order('log_date', { ascending: false })
      .limit(50)

    if (error) {
      console.error('students/:id/activities 조회 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    res.json(data || [])
  } catch (e) {
    console.error('GET /students/:id/activities 에러:', e)
    res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() })
  }
})

app.post('/api/students', async (req, res) => {
  const { name, status = '재학중', admission_date, birth_date, notes } = req.body

  if (!name) {
    return res.status(400).json({ message: 'name은 필수입니다.' })
  }

  const { data, error } = await supabase
    .from('students')
    .insert([
      {
        name,
        status,
        admission_date,
        birth_date,
        notes,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error('students 추가 에러:', error)
    return res.status(500).json({ message: 'DB Error', error })
  }

  res.status(201).json(data)
})

app.patch('/api/students/:id', async (req, res) => {
  const { id } = req.params
  const { name, status, admission_date, birth_date, notes } = req.body

  const updateData = {}
  if (name !== undefined) updateData.name = name
  if (status !== undefined) updateData.status = status
  if (admission_date !== undefined) updateData.admission_date = admission_date
  if (birth_date !== undefined) updateData.birth_date = birth_date
  if (notes !== undefined) updateData.notes = notes

  const { data, error } = await supabase
    .from('students')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('students 수정 에러:', error)
    return res.status(500).json({ message: 'DB Error', error })
  }

  res.json(data)
})

app.delete('/api/students/:id', async (req, res) => {
  const { id } = req.params

  const { error } = await supabase.from('students').delete().eq('id', id)

  if (error) {
    console.error('students 삭제 에러:', error)
    return res.status(500).json({ message: 'DB Error', error })
  }

  res.status(204).send()
})

// log_entries 목록/상세/추가/수정/삭제
app.get('/api/log_entries', async (req, res) => {
  const {
    student_id,
    from, // 시작 날짜
    to, // 종료 날짜
    status,
    limit = 50,
    offset = 0,
  } = req.query

  let query = supabase
    .from('log_entries')
    .select('*', { count: 'exact' })
    .order('log_date', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (student_id) {
    query = query.eq('student_id', student_id)
  }
  if (from) {
    query = query.gte('log_date', from)
  }
  if (to) {
    query = query.lte('log_date', to)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('log_entries 목록 조회 에러:', error)
    return res.status(500).json({ message: 'DB Error', error })
  }

  res.json({
    count,
    items: data,
  })
})

app.get('/api/log_entries/:id', async (req, res) => {
  const { id } = req.params

  const { data, error } = await supabase
    .from('log_entries')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('log_entries 상세 조회 에러:', error)
    return res.status(404).json({ message: '기록을 찾을 수 없습니다.', error })
  }

  res.json(data)
})

app.patch('/api/log_entries/:id', async (req, res) => {
  const { id } = req.params
  const {
    log_date,
    student_id,
    observer_id,
    emotion_tag,
    activity_tags,
    log_content,
    related_metrics,
    status,
    source_file_path,
  } = req.body

  const updateData = {}
  if (log_date !== undefined) updateData.log_date = log_date
  if (student_id !== undefined) updateData.student_id = student_id
  if (observer_id !== undefined) updateData.observer_id = observer_id
  if (emotion_tag !== undefined) updateData.emotion_tag = emotion_tag
  if (activity_tags !== undefined) updateData.activity_tags = activity_tags
  if (log_content !== undefined) updateData.log_content = log_content
  if (related_metrics !== undefined) updateData.related_metrics = related_metrics
  if (status !== undefined) updateData.status = status
  if (source_file_path !== undefined) updateData.source_file_path = source_file_path

  const { data, error } = await supabase
    .from('log_entries')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('log_entries 수정 에러:', error)
    return res.status(500).json({ message: 'DB Error', error })
  }

  res.json(data)
})

app.delete('/api/log_entries/:id', async (req, res) => {
  const { id } = req.params

  const { error } = await supabase.from('log_entries').delete().eq('id', id)

  if (error) {
    console.error('log_entries 삭제 에러:', error)
    return res.status(500).json({ message: 'DB Error', error })
  }

  res.status(204).send()
})

// -------------------- Gemini AI 연동 API --------------------

/**
 * POST /ai/extract-records 또는 /api/ai/extract-records
 * body: { raw_text: string, file_name?: string }
 *
 * PDF/TXT에서 추출한 원본 텍스트를 기반으로
 * PDF_TXT_EXTRACTION_PROMPT 를 사용해 활동 레코드 JSON을 생성
 */
app.post(
  ['/ai/extract-records', '/api/ai/extract-records'],
  async (req, res) => {
    if (!gemini) {
      return res.status(500).json({
        ok: false,
        code: 'NO_GEMINI_KEY',
        message:
          'Gemini API key(GEMINI_API_KEY/GOOGLE_API_KEY)가 설정되어 있지 않습니다.',
      })
    }

    const { raw_text, file_name } = req.body || {}

    if (!raw_text || typeof raw_text !== 'string') {
      return res
        .status(400)
        .json({ ok: false, message: 'raw_text 문자열이 필요합니다.' })
    }

    try {
      const input = {
        raw_text,
        file_name: file_name || null,
      }

      const modelName =
        process.env.GEMINI_EXTRACTION_MODEL || 'gemini-1.5-flash'

      const model = gemini.getGenerativeModel({
        model: modelName,
        generationConfig: {
          // JSON 모드
          responseMimeType: 'application/json',
        },
      })

      const prompt =
        PDF_TXT_EXTRACTION_PROMPT +
        '\n\n[입력 JSON]\n' +
        JSON.stringify(input)

      const result = await model.generateContent(prompt)
      const raw = result.response.text()
      const parsed = parseJsonFromText(raw)

      return res.json({
        ok: true,
        model: modelName,
        raw,
        parsed,
      })
    } catch (e) {
      console.error('POST /ai/extract-records 에러:', e)
      return res.status(500).json({
        ok: false,
        message: 'Gemini 추출 중 오류가 발생했습니다.',
        error: e.toString(),
      })
    }
  },
)

/**
 * POST /ai/generate-report 또는 /api/ai/generate-report
 *
 * body 예시:
 * {
 *   student_profile: {...},
 *   date_range: {...},
 *   summary_stats: {...},
 *   activity_samples: [...],
 *   report_options: {...}
 * }
 *
 * REPORT_GENERATION_PROMPT 를 사용해 PDF용 Markdown 리포트 본문 생성
 */
app.post(
  ['/ai/generate-report', '/api/ai/generate-report'],
  async (req, res) => {
    if (!gemini) {
      return res.status(500).json({
        ok: false,
        code: 'NO_GEMINI_KEY',
        message:
          'Gemini API key(GEMINI_API_KEY/GOOGLE_API_KEY)가 설정되어 있지 않습니다.',
      })
    }

    try {
      const {
        student_profile,
        date_range,
        summary_stats,
        activity_samples,
        report_options,
      } = req.body || {}

      const payload = {
        student_profile: student_profile || null,
        date_range: date_range || null,
        summary_stats: summary_stats || null,
        activity_samples: activity_samples || [],
        report_options: report_options || {},
      }

      const modelName = process.env.GEMINI_REPORT_MODEL || 'gemini-1.5-pro'

      const model = gemini.getGenerativeModel({
        model: modelName,
      })

      const prompt =
        REPORT_GENERATION_PROMPT +
        '\n\n[입력 JSON]\n' +
        JSON.stringify(payload, null, 2)

      const result = await model.generateContent(prompt)
      const markdown = result.response.text()

      return res.json({
        ok: true,
        model: modelName,
        markdown,
      })
    } catch (e) {
      console.error('POST /ai/generate-report 에러:', e)
      return res.status(500).json({
        ok: false,
        message: 'Gemini 리포트 생성 중 오류가 발생했습니다.',
        error: e.toString(),
      })
    }
  },
)

// -------------------- 대시보드 집계 API (/api/dashboard) --------------------
/**
 * GET /api/dashboard?studentId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Dashboard.jsx 에서 사용
 */
app.get('/api/dashboard', async (req, res) => {
  const { studentId, from, to } = req.query

  try {
    let query = supabase
      .from('log_entries')
      .select('log_date, emotion_tag, related_metrics, activity_tags, created_at')

    if (studentId) {
      query = query.eq('student_id', studentId)
    }
    if (from) {
      query = query.gte('log_date', from)
    }
    if (to) {
      query = query.lte('log_date', to)
    }

    const { data, error } = await query

    if (error) {
      console.error('GET /api/dashboard DB 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    const logs = data || []
    const recordCount = logs.length

    // ---- 감정 분포 (긍정/부정/중립 단순 분류) ----
    let pos = 0
    let neg = 0
    let neu = 0

    logs.forEach(l => {
      const tag = (l.emotion_tag || '').toString()

      if (!tag) {
        neu++
        return
      }

      if (/(기쁨|행복|만족|즐거움|긍정|편안)/.test(tag)) {
        pos++
      } else if (/(불안|걱정|우울|슬픔|화|짜증|분노|부정)/.test(tag)) {
        neg++
      } else {
        neu++
      }
    })

    const positivePercent =
      recordCount > 0 ? Math.round((pos / recordCount) * 100) : 0

    const emotionDistribution = [
      { name: '긍정', value: pos },
      { name: '부정', value: neg },
      { name: '중립', value: neu },
    ]

    // ---- 날짜별 활동 시간 ----
    const byDate = {}
    logs.forEach(l => {
      const date =
        l.log_date ||
        (l.created_at ? String(l.created_at).slice(0, 10) : null)
      if (!date) return

      const rm = l.related_metrics || {}
      const minutes =
        typeof rm.minutes === 'number'
          ? rm.minutes
          : typeof rm.duration_minutes === 'number'
          ? rm.duration_minutes
          : 30 // 기본값 30분

      byDate[date] = (byDate[date] || 0) + minutes
    })

    const activitySeries = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, minutes]) => ({ date, minutes }))

    // ---- 평균 점수 (related_metrics.score 기준) ----
    let sumScore = 0
    let scoreCount = 0
    logs.forEach(l => {
      const rm = l.related_metrics || {}
      const s =
        typeof rm.score === 'number'
          ? rm.score
          : typeof rm.level_score === 'number'
          ? rm.level_score
          : null
      if (typeof s === 'number') {
        sumScore += s
        scoreCount++
      }
    })

    const averageScore =
      scoreCount > 0 ? Math.round(sumScore / scoreCount) : 0

    const metrics = {
      recordCount,
      positivePercent,
      averageScore,
    }

    // 활동별 능력 리스트 (지금은 아직 정의 안 되어 있으므로 빈 배열)
    const activityAbilityList = []

    return res.json({
      metrics,
      emotionDistribution,
      activitySeries,
      activityAbilityList,
    })
  } catch (e) {
    console.error('GET /api/dashboard 에러:', e)
    return res
      .status(500)
      .json({ message: 'Dashboard Error', error: e.toString() })
  }
})

// -------------------- 리포트 실행 이력 API (/api/report-runs, /report-runs) --------------------
// (Report.jsx 에서 사용)

// 목록 조회: GET /report-runs 또는 /api/report-runs
app.get(['/report-runs', '/api/report-runs'], async (req, res) => {
  const { limit = 50, offset = 0 } = req.query

  try {
    const { data, error, count } = await supabase
      .from('report_runs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1)

    if (error) {
      console.error('report_runs 목록 조회 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    // ⚠️ Report.jsx 가 data.runs 를 우선 사용하므로 여기에 맞춰줌
    res.json({
      runs: data || [],
      count,
    })
  } catch (e) {
    console.error('GET /report-runs 에러:', e)
    res
      .status(500)
      .json({ message: 'Report runs Error', error: e.toString() })
  }
})

// 단건 조회: GET /report-runs/:id 또는 /api/report-runs/:id
app.get(['/report-runs/:id', '/api/report-runs/:id'], async (req, res) => {
  const { id } = req.params

  try {
    const { data, error } = await supabase
      .from('report_runs')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      console.error('report_runs 상세 조회 에러:', error)
      return res
        .status(404)
        .json({ message: '리포트를 찾을 수 없습니다.', error })
    }

    res.json(data)
  } catch (e) {
    console.error('GET /report-runs/:id 에러:', e)
    res
      .status(500)
      .json({ message: 'Report runs Error', error: e.toString() })
  }
})

// 생성: POST /report-runs 또는 /api/report-runs
app.post(['/report-runs', '/api/report-runs'], async (req, res) => {
  const { title, description, filters } = req.body || {}

  if (!title) {
    return res.status(400).json({ message: 'title 은 필수입니다.' })
  }

  try {
    const now = new Date().toISOString()
    const payload = {
      title,
      description: description || null,
      filters: filters || {},
      status: 'queued',
      created_at: now,
      updated_at: now,
    }

    const { data, error } = await supabase
      .from('report_runs')
      .insert([payload])
      .select()
      .single()

    if (error) {
      console.error('report_runs insert 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    res.status(201).json(data)
  } catch (e) {
    console.error('POST /report-runs 에러:', e)
    res
      .status(500)
      .json({ message: 'Report create Error', error: e.toString() })
  }
})

// 삭제: DELETE /report-runs/:id 또는 /api/report-runs/:id
// (Report.jsx handleDelete 에서 사용)
app.delete(
  ['/report-runs/:id', '/api/report-runs/:id'],
  async (req, res) => {
    const { id } = req.params

    try {
      const { error } = await supabase
        .from('report_runs')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('report_runs 삭제 에러:', error)
        return res.status(500).json({ message: 'DB Error', error })
      }

      res.status(204).send()
    } catch (e) {
      console.error('DELETE /report-runs/:id 에러:', e)
      res
        .status(500)
        .json({ message: 'Report delete Error', error: e.toString() })
    }
  },
)

// 다운로드: GET /report-runs/:id/download 또는 /api/report-runs/:id/download
app.get(
  ['/report-runs/:id/download', '/api/report-runs/:id/download'],
  async (req, res) => {
    const { id } = req.params

    try {
      const { data, error } = await supabase
        .from('report_runs')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        console.error('report_runs 다운로드 조회 에러:', error)
        return res
          .status(404)
          .json({ message: '리포트를 찾을 수 없습니다.', error })
      }

      // 지금은 CSV로 간단히 응답 (나중에 진짜 PDF로 교체 가능)
      const csvContent = [
        'title,created_at,status',
        `"${data.title}",${data.created_at},${data.status}`,
      ].join('\n')

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="report-${id}.csv"`,
      )
      res.send(csvContent)
    } catch (e) {
      console.error('GET /report-runs/:id/download 에러:', e)
      res
        .status(500)
        .json({ message: 'Report download error', error: e.toString() })
    }
  },
)

// -------------------- 대시보드 Gemini 채팅 API (/api/dashboard/chat) --------------------
/**
 * POST /api/dashboard/chat
 * body: {
 *   studentId: string | null,
 *   studentName: string | null,
 *   startDate: 'YYYY-MM-DD' | null,
 *   endDate: 'YYYY-MM-DD' | null,
 *   message: string,        // 사용자가 방금 입력한 질문
 *   history: [{ role: 'user'|'assistant', content: string }]
 * }
 *
 * 응답: { answer: string }
 */
app.post('/api/dashboard/chat', async (req, res) => {
  const {
    studentId,
    studentName,
    startDate,
    endDate,
    message,
    history = [],
  } = req.body || {}

  if (!message || typeof message !== 'string') {
    return res
      .status(400)
      .json({ message: 'message 필드는 필수입니다.' })
  }

  try {
    // 1) 선택된 학생/기간의 로그를 Supabase에서 조회
    let logs = []
    if (studentId && startDate && endDate) {
      let query = supabase
        .from('log_entries')
        .select(
          'log_date, emotion_tag, related_metrics, activity_tags, notes, created_at',
        )
        .eq('student_id', studentId)
        .gte('log_date', startDate)
        .lte('log_date', endDate)

      const { data, error } = await query

      if (error) {
        console.error('POST /api/dashboard/chat DB 에러:', error)
      } else {
        logs = data || []
      }
    }

    // 2) 간단한 통계/요약 만들기 (감정 비율 등)
    const recordCount = logs.length
    let pos = 0
    let neg = 0
    let neu = 0
    const emotionSamples = []

    logs.forEach((l, idx) => {
      const tag = (l.emotion_tag || '').toString()

      if (!tag) {
        neu++
      } else if (/(기쁨|행복|만족|즐거움|긍정|편안)/.test(tag)) {
        pos++
      } else if (/(불안|걱정|우울|슬픔|화|짜증|분노|부정)/.test(tag)) {
        neg++
      } else {
        neu++
      }

      // 프롬프트에 넣을 샘플 10개 정도만 추려서 전달
      if (idx < 10) {
        emotionSamples.push({
          date:
            l.log_date ||
            (l.created_at ? String(l.created_at).slice(0, 10) : null),
          emotion_tag: tag,
          activity_tags: l.activity_tags || null,
          score:
            (l.related_metrics && l.related_metrics.score) ??
            (l.related_metrics && l.related_metrics.level_score) ??
            null,
          notes: l.notes || null,
        })
      }
    })

    const positivePercent =
      recordCount > 0 ? Math.round((pos / recordCount) * 100) : 0

    // 이전 대화 내용을 문자열로 정리
    const historyText = (history || [])
      .map(h => `${h.role === 'user' ? '교사' : 'AI'}: ${h.content}`)
      .join('\n')

    const statsForPrompt = {
      studentId,
      studentName,
      period: { startDate, endDate },
      recordCount,
      emotionCounts: { positive: pos, negative: neg, neutral: neu },
      positivePercent,
      emotionSamples,
    }

    // 3) Gemini에 보낼 프롬프트 작성
    const systemPrompt = `
당신은 텃밭/농장 활동 기록을 분석해서 학생의 감정, 활동, 성장 패턴을 교사가 이해하기 쉽게 설명해 주는 한국어 AI 도우미입니다.

- 데이터에 근거해서 차분하고 구체적으로 설명하세요.
- 학부모 상담이나 기록 작성에 바로 쓸 수 있도록 요약과 해석을 제공합니다.
- 너무 장황하지 않게 3~6문단 이내로 정리하고, 필요하면 글머리 기호를 사용해 주세요.
`

    const userPrompt = `
[학생 및 기간 정보]
- 학생 이름: ${studentName || '이름 미상'}
- 학생 ID: ${studentId || 'N/A'}
- 기간: ${startDate || '-'} ~ ${endDate || '-'}

[요약 데이터(JSON)]
${JSON.stringify(statsForPrompt, null, 2)}

[이전 대화]
${historyText || '(이전 대화 없음)'}

[교사의 질문]
"""${message}"""

위 정보를 바탕으로, 교사가 이해하기 쉬운 한국어로 답변해 주세요.
데이터가 부족한 부분이 있다면 "이 부분은 데이터가 부족합니다"라고 솔직하게 말해 주세요.
`

    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY가 설정되어 있지 않습니다.')
      return res
        .status(500)
        .json({ message: 'Gemini API key not configured.' })
    }

    // 4) Gemini API 호출 (REST)
    const geminiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent' +
      `?key=${process.env.GEMINI_API_KEY}`

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [{ text: userPrompt }] },
        ],
      }),
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error(
        'Gemini API error:',
        geminiResponse.status,
        errorText,
      )
      return res.status(500).json({
        message: 'Gemini API Error',
        detail: errorText,
      })
    }

    const geminiJson = await geminiResponse.json()
    const answer =
      geminiJson?.candidates?.[0]?.content?.parts
        ?.map(p => p.text || '')
        .join('') ||
      'AI 응답을 불러오지 못했습니다. 프롬프트나 서버 설정을 확인해 주세요.'

    return res.json({ answer })
  } catch (e) {
    console.error('POST /api/dashboard/chat 에러:', e)
    return res
      .status(500)
      .json({ message: 'Chat Error', error: e.toString() })
  }
})


// -------------------- 서버 시작 --------------------

app.listen(port, () => {
  console.log(`서버 실행중: http://localhost:${port}`)
})
