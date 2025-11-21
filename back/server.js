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
app.post(['/uploads', '/api/uploads'], upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ message: '파일이 필요합니다.' })
    }

    // multer가 latin1 인코딩으로 이름을 줄 수 있어서 UTF-8로 복원
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')

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
})

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
    res.status(500).json({ message: 'Server Error', error: e.toString() })
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
    res.status(500).json({ message: 'Server Error', error: e.toString() })
  }
})

// -------------------- 업로드 로그 저장 (/uploads/:id/log) --------------------
/**
 * POST /uploads/:id/log, /api/uploads/:id/log
 *
 * payload 형식 (UploadPage.jsx 기준):
 * {
 *   upload_id: "업로드 UUID",
 *   file_name: "파일명.pdf",
 *   raw_text: "원본/정제 텍스트",
 *   log_entries: [
 *     {
 *       student_id: "...",
 *       student_name: "...",   // 프론트 표시용 (DB에는 안 씀)
 *       log_date: "2025-11-21",
 *       emotion_tag: "기쁨",
 *       emotion_tags: ["기쁨", "안정"],  // 아직은 DB에 직접 안 씀
 *       activity_tags: ["미술", "글쓰기"],
 *       log_content: "...",
 *       related_metrics: { ... } // jsonb
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
    // 1) log_entries 테이블에 기록할 값 정리
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

    // 2) log_entries 여러 건 insert
    const { data: inserted, error: insertErr } = await supabase
      .from('log_entries')
      .insert(rows)
      .select()

    if (insertErr) {
      console.error('log_entries insert 에러:', insertErr)
      return res
        .status(500)
        .json({ message: 'log_entries 저장 중 오류', error: insertErr })
    }

    // 3) ingest_uploads 에 대표 student_id / 상태 업데이트
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
      // 치명적이진 않으니 에러 로그만 남기고 계속 진행
    }

    return res.status(201).json({
      upload_id: id,
      file_name,
      raw_text,
      log_entries: inserted,
    })
  } catch (e) {
    console.error('POST /uploads/:id/log 에러:', e)
    return res
      .status(500)
      .json({ message: 'Upload log save error', error: e.toString() })
  }
})

// -------------------- log_entries 조회 (UploadPage 상세용) --------------------
/**
 * GET /log_entries?upload_id=...
 * - upload_id 로 ingest_uploads 를 찾고, 해당 student_id 의 로그를 최근 순으로 반환
 * - UploadPage.jsx 에서 상세 보기 시 사용
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
    res.status(500).json({ message: 'Server Error', error: e.toString() })
  }
})

// -------------------- Supabase 스타일 REST 프록시 (UploadPage 저장용) --------------------
/**
 * POST /rest/v1/log_entries
 * - body 전체를 log_entries 에 insert(1건) 하는 간단 프록시
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
    res.status(500).json({ message: 'DB Error', error: e.toString() })
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
    res.status(500).json({ message: 'Server Error', error: e.toString() })
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
    res.status(500).json({ message: 'Server Error', error: e.toString() })
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
    res.status(500).json({ message: 'Server Error', error: e.toString() })
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

// -------------------- 서버 시작 --------------------

app.listen(port, () => {
  console.log(`서버 실행중: http://localhost:${port}`)
})
