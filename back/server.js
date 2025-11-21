// back/server.js
require('dotenv').config()
const express = require('express')
const { supabase } = require('./supabaseClient')
const multer = require('multer')

const app = express()
const port = process.env.PORT || 3000

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
      res
        .status(500)
        .json({ message: 'Upload Error', error: e.toString() })
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

// -------------------- 업로드 로그 저장 (/uploads/:id/log) --------------------
/**
 * POST /uploads/:id/log, /api/uploads/:id/log
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
        activity_tags: e.activity_tags || null,
        log_content: e.log_content || null,
        related_metrics: e.related_metrics || null,
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

app.post('/rest/v1/tags', async (req, res) => {
  try {
    const { name } = req.body || {}
 
::contentReference[oaicite:1]{index=1}
