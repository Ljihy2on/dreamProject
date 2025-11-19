// server.js
require('dotenv').config();
const express = require('express');
const { supabase } = require('./supabaseClient'); // 공용 클라이언트 불러오기

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// 기본 동작 확인용 엔드포인트
app.get('/', (req, res) => {
  res.send('Node + Supabase 서버 동작 중');
});

// DB 연결 테스트용 API
app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase
    .from('user_profiles') // 나중에 students, log_entries 등으로 변경
    .select('*')
    .limit(20);

  if (error) {
    console.error('DB 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.json(data);
});

app.listen(port, () => {
  console.log(`서버 실행됨: http://localhost:${port}`);
});


// 1. students API
// 학생 목록 조회
// 예시: GET /api/students?status=재학중
app.get('/api/students', async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('students')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('students 목록 조회 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.json({
    count,
    items: data,
  });
});

// 학생 한 명 상세 조회
// GET /api/students/:id
app.get('/api/students/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('students 상세 조회 에러:', error);
    return res.status(404).json({ message: '학생을 찾을 수 없습니다.', error });
  }

  res.json(data);
});

// 학생 추가 코드
// POST /api/students
// body 예시:
// {
//   "name": "배짱",
//   "status": "재학중",
//   "admission_date": "2023-03-02",
//   "birth_date": "2010-01-01",
//   "notes": "테스트용"
// }

app.post('/api/students', async (req, res) => {
  const { name, status = '재학중', admission_date, birth_date, notes } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'name은 필수입니다.' });
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
    .single();

  if (error) {
    console.error('students 추가 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.status(201).json(data);
});

// 학생 정보 수정
// PATCH /api/students/:id
// body에 온 필드만 선택적으로 업데이트
app.patch('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  const { name, status, admission_date, birth_date, notes } = req.body;

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (status !== undefined) updateData.status = status;
  if (admission_date !== undefined) updateData.admission_date = admission_date;
  if (birth_date !== undefined) updateData.birth_date = birth_date;
  if (notes !== undefined) updateData.notes = notes;

  const { data, error } = await supabase
    .from('students')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('students 수정 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.json(data);
});

// 학생 삭제
// DELETE /api/students/:id
app.delete('/api/students/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('students 삭제 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.status(204).send();
});

// 2. log_entries API
// 일지 목록 조회
// 예시: GET /api/log_entries?student_id=...&from=2025-01-01&to=2025-01-31
app.get('/api/log_entries', async (req, res) => {
  const {
    student_id,
    from, // 시작 날짜 (log_date >= from)
    to,   // 끝 날짜 (log_date <= to)
    status,
    limit = 50,
    offset = 0,
  } = req.query;

  let query = supabase
    .from('log_entries')
    .select('*', { count: 'exact' })
    .order('log_date', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (student_id) {
    query = query.eq('student_id', student_id);
  }
  if (from) {
    query = query.gte('log_date', from);
  }
  if (to) {
    query = query.lte('log_date', to);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('log_entries 목록 조회 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.json({
    count,
    items: data,
  });
});

// 일지 한 건 상세 조회
// GET /api/log_entries/:id
app.get('/api/log_entries/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('log_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('log_entries 상세 조회 에러:', error);
    return res.status(404).json({ message: '일지를 찾을 수 없습니다.', error });
  }

  res.json(data);
});

// 일지 추가 코드
// POST /api/log_entries
// body 예시:
// {
//   "log_date": "2025-11-19",
//   "student_id": "학생 uuid",
//   "observer_id": "교사 uuid (옵션)",
//   "emotion_tag": "기쁨",
//   "activity_tags": ["물주기", "정리"],
//   "log_content": "오늘은 ~~~",
//   "related_metrics": ["집중도:높음"],
//   "status": "success",
//   "source_file_path": null
// }
app.post('/api/log_entries', async (req, res) => {
  const body = req.body || {}; // req.body unifined 방지
  const {
    log_date,
    student_id,
    observer_id,
    emotion_tag,
    activity_tags,
    log_content,
    related_metrics,
    status = 'success',
    source_file_path,
  } = req.body;

  if (!log_date || !student_id) {
    return res.status(400).json({ message: 'log_date와 student_id는 필수입니다.' });
  }

  const { data, error } = await supabase
    .from('log_entries')
    .insert([
      {
        log_date,
        student_id,
        observer_id,
        emotion_tag,
        activity_tags,
        log_content,
        related_metrics,
        status,
        source_file_path,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('log_entries 추가 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.status(201).json(data);
});

// 일지 수정
// PATCH /api/log_entries/:id
app.patch('/api/log_entries/:id', async (req, res) => {
  const { id } = req.params;
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
  } = req.body;

  const updateData = {};
  if (log_date !== undefined) updateData.log_date = log_date;
  if (student_id !== undefined) updateData.student_id = student_id;
  if (observer_id !== undefined) updateData.observer_id = observer_id;
  if (emotion_tag !== undefined) updateData.emotion_tag = emotion_tag;
  if (activity_tags !== undefined) updateData.activity_tags = activity_tags;
  if (log_content !== undefined) updateData.log_content = log_content;
  if (related_metrics !== undefined) updateData.related_metrics = related_metrics;
  if (status !== undefined) updateData.status = status;
  if (source_file_path !== undefined) updateData.source_file_path = source_file_path;

  const { data, error } = await supabase
    .from('log_entries')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('log_entries 수정 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.json(data);
});

// 일지 삭제
// DELETE /api/log_entries/:id
app.delete('/api/log_entries/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('log_entries')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('log_entries 삭제 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.status(204).send();
});



