// src/pages/UploadPage.jsx
import React, { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import { apiFetch, extractRecordsWithGemini } from '../lib/api.js'

/**
 * ============================
 *  DB 구조 기준 설계 메모
 * ============================
 *
 * - ingest_uploads
 *    id           : uuid  → 업로드 ID
 *    file_name    : text
 *    status       : text  → queued / processing / success / failed
 *    progress     : int   → 0~100
 *    student_id   : uuid? (대표 학생)
 *    created_at   : timestamptz → 업로드 시각
 *
 * - log_entries
 *    id              : uuid
 *    log_date        : date
 *    student_id      : uuid
 *    emotion_tag     : text (대표 감정)
 *    activity_tags   : text[] (활동 유형 태그)
 *    log_content     : text (텍스트 전체 or 요약)
 *    related_metrics : jsonb (점수, 소요시간, 능력 등 복합 구조)
 *
 * - emotion_keywords
 *    id        : uuid
 *    name      : text (감정 키워드)
 *
 * 이 UploadPage에서는 /uploads/:id/log 로 아래처럼 저장합니다:
 *
 * POST /uploads/:id/log
 * {
 *   upload_id: <ingest_uploads.id>,
 *   file_name: <ingest_uploads.file_name>,
 *   raw_text: "<공통 편집 텍스트>",
 *   log_entries: [
 *     {
 *       student_id: "<학생 uuid>",
 *       student_name: "학생 이름(프론트 표시용)",
 *       log_date: "YYYY-MM-DD",
 *       emotion_tag: "감정 요약 한 줄",
 *       emotion_tags: ["즐거움", "긴장" ...],
 *       activity_tags: ["수확", "파종" ...],
 *       log_content: "<공통 텍스트 또는 학생별 텍스트>",
 *       related_metrics: {
 *         duration_minutes: 90,
 *         activity_name: "...",
 *         activity_type: "...",
 *         note: "...",
 *         level: "...",
 *         ability: ["집중력", "소근육"],
 *         score: 85,
 *         score_explanation: "..."
 *       }
 *     },
 *     ...
 *   ]
 * }
 */

// -------------------- 업로드 목록 전역 캐시 --------------------
let uploadsCache = null

// -------------------- 헬퍼 / 상수 --------------------

const STEP_DEFS = [
  { key: 'extract', label: '텍스트 추출' },
  { key: 'ai', label: 'AI 자동 분석' },
  { key: 'save', label: '데이터베이스 저장' },
]

// 단계별 진행률로 전체 진행률 계산
function computeOverallFromSteps(steps, fallbackProgress) {
  const keys = STEP_DEFS.map(s => s.key)
  if (!keys.length) {
    return typeof fallbackProgress === 'number' ? fallbackProgress : 0
  }
  let sum = 0
  keys.forEach(k => {
    const v = steps && typeof steps[k] === 'number' ? steps[k] : 0
    sum += v
  })
  return Math.round(sum / keys.length)
}

// 업로드 목록 응답 포맷 정규화
function normalizeUploads(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.items)) return data.items
  if (data && Array.isArray(data.uploads)) return data.uploads
  return []
}

// 감정 태그 정규화
function normalizeEmotionTags(rawValue) {
  if (!rawValue) return []
  if (Array.isArray(rawValue)) {
    return rawValue
      .map(v => String(v || '').trim())
      .filter(Boolean)
  }
  if (typeof rawValue === 'string') {
    return rawValue
      .split(/[,\s/]+/)
      .map(v => v.trim())
      .filter(Boolean)
  }
  return []
}

// 분석 필드 정규화
function normalizeAnalysis(raw) {
  const a = raw.analysis || {}
  const legacyEmotion =
    raw.emotion_tag || a.emotion || a.emotionSummary

  const emotionTagsRaw =
    a.emotionTags ||
    raw.emotion_tags ||
    a.emotion_keywords ||
    raw.emotion_keywords ||
    null

  return {
    students: a.students || raw.students || [],
    date: a.date || raw.date || raw.log_date || null,
    activityName:
      a.activityName || raw.activityName || raw.activity_name || raw.title || '',
    durationMinutes:
      a.durationMinutes ||
      raw.durationMinutes ||
      raw.duration_minutes ||
      null,
    activityType: a.activityType || raw.activityType || raw.activity_type || '',
    note: a.note || raw.note || '',
    level: a.level || raw.level || '',
    ability: a.ability || a.abilities || raw.ability || raw.abilities || [],
    score:
      typeof a.score === 'number'
        ? a.score
        : typeof raw.score === 'number'
        ? raw.score
        : null,
    scoreExplanation:
      a.scoreExplanation || raw.scoreExplanation || raw.score_explanation || '',
    emotionSummary: a.emotionSummary || legacyEmotion || '',
    emotionCause: a.emotionCause || a.emotion_reason || raw.emotionCause || '',
    observedBehaviors:
      a.observedBehaviors ||
      a.behavior ||
      raw.observedBehaviors ||
      '',
    emotionTags: normalizeEmotionTags(emotionTagsRaw),
    rawTextCleaned:
      a.rawTextCleaned ||
      raw.rawTextCleaned ||
      raw.log_content ||
      raw.raw_text_cleaned ||
      raw.raw_text ||
      '',
  }
}

// 업로드 아이템 정규화
function hydrateUpload(raw) {
  const id =
    raw.id ||
    raw.upload_id ||
    raw.uuid ||
    String(raw.file_name || raw.filename || raw.name || Math.random())

  const fileName = raw.file_name || raw.filename || raw.name || '이름 없는 파일'

  const studentName =
    raw.student_name || raw.student?.name || raw.meta?.student_name || '학생 미확인'

  const uploadedAt =
    raw.created_at || raw.uploaded_at || raw.uploadDate || raw.createdAt || null

  const status = raw.status || 'queued'
  const progress =
    typeof raw.progress === 'number' ? raw.progress : raw.overall_progress

  let steps = raw.steps
  if (!steps) {
    const base = typeof progress === 'number' ? progress : 0
    steps = {
      upload: base,
      // 업로드 카드가 생성되는 시점에는 텍스트 추출이 끝난 것으로 간주
      extract: 100,
      ocr: base,
      sentiment: base,
    }
  }

  const overall =
    typeof progress === 'number'
      ? progress
      : Math.round((steps.upload + steps.extract + steps.ocr + steps.sentiment) / 4)

  const analysis = normalizeAnalysis(raw)

  return {
    ...raw,
    id,
    file_name: fileName,
    student_name: studentName,
    uploaded_at: uploadedAt,
    status,
    steps,
    overall_progress: overall,
    raw_text: analysis.rawTextCleaned || raw.raw_text || '',
    analysis,
  }
}

function formatDate(value) {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toISOString().slice(0, 10)
  } catch {
    return String(value)
  }
}

function splitDuration(mins) {
  const total = Number(mins)
  if (Number.isNaN(total) || total < 0) {
    return { hours: 0, minutes: 0 }
  }
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return { hours, minutes }
}

const ACTIVITY_TYPE_PRESETS = {
  harvest: {
    label: '수확',
    icon: '🍅',
    placeholder: '예: 토마토 수확, 감자 캐기',
  },
  sowing: {
    label: '파종',
    icon: '🌱',
    placeholder: '예: 씨앗 뿌리기, 모종 심기',
  },
  manage: {
    label: '관리',
    icon: '🧺',
    placeholder: '예: 물주기, 잡초 제거, 비료 주기',
  },
  observe: {
    label: '관찰',
    icon: '👀',
    placeholder: '예: 작물 상태 관찰, 날씨 관찰',
  },
  etc: {
    label: '기타',
    icon: '✏️',
    placeholder: '예: 활동 기록 작성, 그림 그리기',
  },
}

// 활동 유형 상태 객체 생성
function buildActivityTypeState(rawTypes = null, rawDetails = null) {
  const base = {}
  Object.entries(ACTIVITY_TYPE_PRESETS).forEach(([key, config]) => {
    let selected = false
    let detail = ''

    if (rawTypes && Object.prototype.hasOwnProperty.call(rawTypes, key)) {
      const item = rawTypes[key]
      if (typeof item === 'object' && item !== null) {
        selected = item.selected ?? !!item.detail ?? false
        detail = item.detail || item.description || ''
      } else if (typeof item === 'boolean') {
        selected = item
      } else if (typeof item === 'string') {
        selected = true
        detail = item
      }
    }

    if (rawDetails && Object.prototype.hasOwnProperty.call(rawDetails, key) && !detail) {
      detail = rawDetails[key] || ''
    }

    base[key] = {
      ...config,
      selected,
      detail,
    }
  })

  return base
}

// 감정 태그 직렬화
function serializeEmotionTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags
    .map(v => String(v || '').trim())
    .filter(Boolean)
}

// 상세 모달 상태 기본값
function createDetailState(overrides = {}) {
  return {
    open: false,
    loading: false,
    upload: null,
    error: '',
    saving: false,
    saved: false,

    editedText: '',

    students: [],
    activeStudentId: null,
    analysisByStudent: {},

    ...overrides,
  }
}

const INITIAL_ACTIVITY_DETAIL_MODAL = {
  open: false,
  loading: false,
  records: [],
  summary: null,
  analysisText: '',
  error: '',
}

function getActiveStudentState(detail) {
  const students = detail.students || []
  const map = detail.analysisByStudent || {}

  let activeId = detail.activeStudentId
  if (!activeId && students.length > 0) {
    activeId = students[0].id
  }

  const current = map[activeId] || {
    analysis: {},
    activityTypes: buildActivityTypeState(),
  }

  return {
    activeId,
    analysis: current.analysis || {},
    activityTypes: current.activityTypes || buildActivityTypeState(),
  }
}

// -------------------- 페이지 컴포넌트 --------------------

export default function UploadPage() {
  const fileRef = useRef(null)

  const [uploads, setUploads] = useState(() => uploadsCache || [])
  const [loading, setLoading] = useState(() => !uploadsCache)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const [detail, setDetail] = useState(() => createDetailState())
  const [activityDetailModal, setActivityDetailModal] = useState(
    INITIAL_ACTIVITY_DETAIL_MODAL,
  )
  const [downloading, setDownloading] = useState(false)
  const [emotionKeywords, setEmotionKeywords] = useState([])

  // Supabase 학생 목록 (드롭다운용)
  const [studentsMaster, setStudentsMaster] = useState([])
  const [studentPickerOpen, setStudentPickerOpen] = useState(false)
  const [studentPickerValue, setStudentPickerValue] = useState('')

  // Gemini AI 관련 상태
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  // 업로드 + 캐시 동시 갱신
  function updateUploads(updater) {
    setUploads(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      uploadsCache = next
      return next
    })
  }

  // 개별 업로드의 단계(progress)를 업데이트하는 헬퍼
  function updateUploadSteps(uploadId, stepUpdater) {
    updateUploads(prev =>
      prev.map(item => {
        if (item.id !== uploadId) return item
        const prevSteps = item.steps || {}
        const nextSteps =
          typeof stepUpdater === 'function'
            ? stepUpdater(prevSteps)
            : { ...prevSteps, ...stepUpdater }
        const overall = computeOverallFromSteps(
          nextSteps,
          item.overall_progress,
        )
        return {
          ...item,
          steps: nextSteps,
          overall_progress: overall,
        }
      }),
    )
  }

  // 업로드 목록 로드
  async function fetchUploads() {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/uploads')
      const items = normalizeUploads(data).map(hydrateUpload)
      updateUploads(items)
    } catch (e) {
      console.error(e)
      setError('업로드 목록을 불러오는 중 오류가 발생했습니다.')
      updateUploads([])
    } finally {
      setLoading(false)
    }
  }

  // 감정 키워드 세트 로드 (emotion_keywords)
  async function loadEmotionKeywords() {
    try {
      const data = await apiFetch('/rest/v1/tags?select=*')

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : []

      const normalized = rows
        .map(row => ({
          id: row.id || row.key || row.value || row.name,
          label: row.name || row.label || row.value || row.key,
        }))
        .filter(item => item.label)

      if (normalized.length > 0) {
        setEmotionKeywords(normalized)
      } else {
        setEmotionKeywords([])
      }
    } catch (e) {
      console.error(e)
      setEmotionKeywords([])
    }
  }

  // Supabase 학생 목록 로드
  async function loadStudentsMaster() {
    try {
      const data = await apiFetch('/api/students?limit=500')
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
      const mapped = items
        .map(stu => ({
          id: String(stu.id),
          name: stu.name || stu.real_name || stu.nickname || '이름 없는 학생',
        }))
        .filter(s => s.id && s.name)
      setStudentsMaster(mapped)
    } catch (e) {
      console.error('학생 목록 로드 오류:', e)
      setStudentsMaster([])
    }
  }

  useEffect(() => {
    if (!uploadsCache) {
      fetchUploads()
    } else {
      updateUploads(uploadsCache)
      setLoading(false)
    }
    loadEmotionKeywords()
    loadStudentsMaster()
  }, [])

  // ---------- 파일 업로드 ----------

  async function handleFiles(files) {
    // 파일 배열로 변환
    const list = Array.from(files || [])
    if (list.length === 0) return

    // 이미 업로드/변환이 진행 중이면 중복 실행 방지
    if (uploading) return

    setError('')
    setUploading(true)

    try {
      for (const file of list) {
        const form = new FormData()
        form.append('file', file)

        try {
          setLoading(true)
          await apiFetch('/uploads', {
            method: 'POST',
            body: form,
            _formName: file.name,
          })
          // 업로드가 완료된 뒤에만 목록을 갱신해서 카드가 생성되도록
          await fetchUploads()
        } catch (e) {
          console.error(e)
          setError('파일 업로드 중 오류가 발생했습니다.')
        } finally {
          setLoading(false)
        }
      }
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files)
    }
  }

  // ---------- 업로드 삭제 ----------

  async function handleDeleteUpload(uploadId) {
    if (!uploadId) return
    const ok = window.confirm('해당 업로드 기록을 삭제하시겠습니까?')
    if (!ok) return

    try {
      setLoading(true)
      await apiFetch(`/uploads/${uploadId}`, {
        method: 'DELETE',
      })
      updateUploads(prev => prev.filter(u => u.id !== uploadId))
    } catch (e) {
      console.error(e)
      alert('업로드 삭제 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // ---------- 상세보기 모달 초기화 ----------

  async function openDetail(upload) {
    setDetail(createDetailState({ open: true, loading: true }))
    setAiError('')
    setStudentPickerOpen(false)
    setStudentPickerValue('')

    try {
      const uploadRes = await apiFetch(`/uploads/${upload.id}`)

      const hydrated = hydrateUpload({ ...upload, ...(uploadRes || {}) })

      const initialText =
        uploadRes?.rawText ||
        uploadRes?.raw_text ||
        hydrated.raw_text ||
        hydrated.analysis?.rawTextCleaned ||
        ''

      const serverLogEntries = uploadRes?.log_entries || uploadRes?.entries || []

      const serverStudents =
        (uploadRes && (uploadRes.students || uploadRes.student_list || [])) ||
        hydrated.analysis?.students ||
        []

      let students = []

      const fromEntries = Array.isArray(serverLogEntries) ? serverLogEntries : []
      const entryStudents = fromEntries.map((entry, idx) => ({
        id: String(entry.student_id || entry.student?.id || `stu-entry-${idx + 1}`),
        name: entry.student_name || entry.student?.name || `학생 ${idx + 1}`,
      }))

      const explicitStudents = Array.isArray(serverStudents)
        ? serverStudents.map((s, idx) => ({
            id: String(s.id || s.student_id || s.uuid || s.key || `stu-${idx + 1}`),
            name: s.name || s.student_name || s.realName || s.label || `학생 ${idx + 1}`,
          }))
        : []

      if (entryStudents.length === 0 && explicitStudents.length === 0) {
        const fallbackName = hydrated.student_name || '학생'
        const fallbackId = hydrated.student_id || hydrated.student?.id || 'stu-1'
        students = [
          {
            id: String(fallbackId),
            name: fallbackName,
          },
        ]
      } else {
        const map = new Map()
        ;[...explicitStudents, ...entryStudents].forEach(stu => {
          if (!map.has(stu.id)) {
            map.set(stu.id, stu)
          }
        })
        students = Array.from(map.values())
      }

      const analysisByStudent = {}

      if (fromEntries.length > 0) {
        fromEntries.forEach(entry => {
          const stuId = String(entry.student_id || entry.student?.id || students[0]?.id)
          if (!stuId) return

          const normalized = normalizeAnalysis(entry)

          const activityTags = Array.isArray(entry.activity_tags) ? entry.activity_tags : []
          const activityTypesFromTags = {}
          activityTags.forEach(tagLabel => {
            const key = Object.keys(ACTIVITY_TYPE_PRESETS).find(
              k => ACTIVITY_TYPE_PRESETS[k].label === tagLabel,
            )
            if (!key) return
            activityTypesFromTags[key] = {
              ...ACTIVITY_TYPE_PRESETS[key],
              selected: true,
              detail: '',
            }
          })

          analysisByStudent[stuId] = {
            analysis: normalized,
            activityTypes: {
              ...buildActivityTypeState(),
              ...activityTypesFromTags,
            },
          }
        })
      }

      if (Object.keys(analysisByStudent).length === 0) {
        const base = hydrated.analysis || {}
        students.forEach(stu => {
          analysisByStudent[stu.id] = {
            analysis: { ...base },
            activityTypes: buildActivityTypeState(
              uploadRes?.activity_types || uploadRes?.activityTypes,
              uploadRes?.activity_type_details || uploadRes?.activityTypeDetails,
            ),
          }
        })
      }

      const activeStudentId =
        uploadRes?.activeStudentId ||
        uploadRes?.active_student_id ||
        (students[0] && students[0].id)

      setDetail(
        createDetailState({
          open: true,
          loading: false,
          upload: hydrated,
          editedText: initialText,
          students,
          activeStudentId,
          analysisByStudent,
        }),
      )
      // 텍스트를 불러온 시점에서 "텍스트 추출" 단계 완료로 간주
      if (initialText && initialText.trim()) {
        updateUploadSteps(hydrated.id, prevSteps => ({
          ...prevSteps,
          extract: 100,
        }))
      }
    } catch (err) {
      console.error(err)

      const hydrated = hydrateUpload(upload)
      const initialText =
        hydrated.raw_text || hydrated.analysis?.rawTextCleaned || ''

      const fallbackName = hydrated.student_name || '학생'
      const fallbackId = hydrated.student_id || hydrated.student?.id || 'stu-1'

      const students = [
        {
          id: String(fallbackId),
          name: fallbackName,
        },
      ]

      const base = hydrated.analysis || {}

      const analysisByStudent = {
        [String(fallbackId)]: {
          analysis: { ...base },
          activityTypes: buildActivityTypeState(),
        },
      }

      setDetail(
        createDetailState({
          open: true,
          loading: false,
          upload: hydrated,
          editedText: initialText,
          error: '상세 정보를 불러오지 못했습니다. 기본 정보만 표시합니다.',
          students,
          activeStudentId: String(fallbackId),
        }),
      )
      if (initialText && initialText.trim()) {
        updateUploadSteps(hydrated.id, prevSteps => ({
          ...prevSteps,
          extract: 100,
        }))
      }
    }
  }

  function closeDetail() {
    setDetail(createDetailState())
    setAiError('')
    setStudentPickerOpen(false)
    setStudentPickerValue('')
  }

  // ---------- 학생 탭 ----------

  function handleSelectStudent(studentId) {
    setDetail(prev => {
      if (!prev.students.find(s => s.id === studentId)) return prev
      return {
        ...prev,
        activeStudentId: studentId,
        saved: false,
      }
    })
  }

  // 학생 추가 버튼 클릭 시: Supabase 학생 목록이 있으면 드롭다운 노출, 없으면 기존 prompt fallback
  function handleAddStudent() {
    if (studentsMaster && studentsMaster.length > 0) {
      setStudentPickerOpen(prev => !prev)
      return
    }

    const name = window.prompt('추가할 학생 이름을 입력하세요.')
    if (!name || !name.trim()) return

    const trimmed = name.trim()

    setDetail(prev => {
      const exists = (prev.students || []).find(s => s.name === trimmed)
      if (exists) {
        return {
          ...prev,
          activeStudentId: exists.id,
          saved: false,
        }
      }

      const id = `local-${Date.now()}`
      const map = prev.analysisByStudent || {}

      let baseState = {
        analysis: {},
        activityTypes: buildActivityTypeState(),
      }

      if (prev.activeStudentId && map[prev.activeStudentId]) {
        const from = map[prev.activeStudentId]
        baseState = {
          analysis: { ...(from.analysis || {}) },
          activityTypes: { ...(from.activityTypes || {}) },
        }
      }

      return {
        ...prev,
        students: [...(prev.students || []), { id, name: trimmed }],
        analysisByStudent: {
          ...map,
          [id]: baseState,
        },
        activeStudentId: id,
        saved: false,
      }
    })
  }

  // 드롭다운에서 선택한 Supabase 학생을 실제 탭으로 추가
  function handleAddStudentFromPicker() {
    if (!studentPickerValue) {
      alert('학생을 선택해 주세요.')
      return
    }

    const master = studentsMaster.find(
      s => String(s.id) === String(studentPickerValue),
    )
    if (!master) return

    setDetail(prev => {
      const existing = (prev.students || []).find(
        s => String(s.id) === String(master.id),
      )

      const map = prev.analysisByStudent || {}

      let baseState = {
        analysis: {},
        activityTypes: buildActivityTypeState(),
      }

      if (prev.activeStudentId && map[prev.activeStudentId]) {
        const from = map[prev.activeStudentId]
        baseState = {
          analysis: { ...(from.analysis || {}) },
          activityTypes: { ...(from.activityTypes || {}) },
        }
      }

      const nextStudents = existing
        ? prev.students
        : [...(prev.students || []), { id: String(master.id), name: master.name }]

      const nextAnalysisByStudent = existing
        ? map
        : {
            ...map,
            [String(master.id)]: baseState,
          }

      return {
        ...prev,
        students: nextStudents,
        analysisByStudent: nextAnalysisByStudent,
        activeStudentId: String(master.id),
        saved: false,
      }
    })

    setStudentPickerOpen(false)
    setStudentPickerValue('')
  }

  function handleRemoveStudent(studentId) {
    setDetail(prev => {
      const nextStudents = (prev.students || []).filter(
        s => s.id !== studentId,
      )
      const nextAnalysisByStudent = { ...(prev.analysisByStudent || {}) }
      delete nextAnalysisByStudent[studentId]

      let nextActiveId = prev.activeStudentId
      if (studentId === prev.activeStudentId) {
        nextActiveId = nextStudents[0]?.id || null
      }

      return {
        ...prev,
        students: nextStudents,
        analysisByStudent: nextAnalysisByStudent,
        activeStudentId: nextActiveId,
        saved: false,
      }
    })
  }

  // ---------- 학생별 분석 업데이트 ----------

  function updateActiveStudent(updater) {
    setDetail(prev => {
      const students = prev.students || []
      let activeId = prev.activeStudentId
      if (!activeId && students.length > 0) {
        activeId = students[0].id
      }
      if (!activeId) return prev

      const map = prev.analysisByStudent || {}
      const current =
        map[activeId] || {
          analysis: {},
          activityTypes: buildActivityTypeState(),
        }

      const next = updater(current)

      return {
        ...prev,
        activeStudentId: activeId,
        analysisByStudent: {
          ...map,
          [activeId]: {
            ...current,
            ...next,
          },
        },
        saved: false,
      }
    })
  }

  function toggleEmotionTagInDetail(label) {
    const trimmed = String(label || '').trim()
    if (!trimmed) return

    updateActiveStudent(current => {
      const baseAnalysis = current.analysis || {}
      const currentTags = Array.isArray(baseAnalysis.emotionTags)
        ? baseAnalysis.emotionTags
        : []
      const exists = currentTags.includes(trimmed)
      const nextTags = exists
        ? currentTags.filter(item => item !== trimmed)
        : [...currentTags, trimmed]

      return {
        ...current,
        analysis: {
          ...baseAnalysis,
          emotionTags: nextTags,
        },
      }
    })
  }

  async function addEmotionKeywordInSupabase(label) {
    const trimmed = String(label || '').trim()
    if (!trimmed) return

    const exists = emotionKeywords.find(item => item.label === trimmed)
    if (exists) {
      toggleEmotionTagInDetail(trimmed)
      return
    }

    try {
      const response = await apiFetch('/rest/v1/tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ name: trimmed }),
      })

      const saved = Array.isArray(response) ? response[0] : response
      const newItem = {
        id: saved?.id || trimmed,
        label: saved?.name || saved?.label || trimmed,
      }

      setEmotionKeywords(prev => [...prev, newItem])
      toggleEmotionTagInDetail(newItem.label)
    } catch (e) {
      console.error(e)
      const fallbackItem = { id: trimmed, label: trimmed }
      setEmotionKeywords(prev => [...prev, fallbackItem])
      toggleEmotionTagInDetail(trimmed)
    }
  }

  function toggleActivityTypeSelection(key) {
    updateActiveStudent(current => {
      const nextMap = { ...(current.activityTypes || {}) }
      const currentItem =
        nextMap[key] || ACTIVITY_TYPE_PRESETS[key] || { label: key }
      nextMap[key] = {
        ...currentItem,
        selected: !currentItem.selected,
      }
      return {
        ...current,
        activityTypes: nextMap,
      }
    })
  }

  function updateActivityTypeDetail(key, detailText) {
    updateActiveStudent(current => ({
      ...current,
      activityTypes: {
        ...(current.activityTypes || {}),
        [key]: {
          ...(current.activityTypes?.[key] ||
            ACTIVITY_TYPE_PRESETS[key] || {
              label: key,
            }),
          detail: detailText,
        },
      },
    }))
  }

  function updateEditedAnalysis(patch) {
    updateActiveStudent(current => ({
      ...current,
      analysis: {
        ...(current.analysis || {}),
        ...patch,
      },
    }))
  }

  // ---------- 텍스트 다운로드 ----------

  async function handleDownloadOriginal() {
    if (!detail.upload || downloading) return
    setDownloading(true)
    try {
      const text =
        (detail.editedText && detail.editedText.trim()) ||
        detail.upload.raw_text ||
        detail.upload.analysis?.rawTextCleaned ||
        ''

      const blob = new Blob([text], {
        type: 'text/plain;charset=utf-8',
      })

      const url = URL.createObjectURL(blob)
      const baseName =
        detail.upload.file_name?.replace(/\.[^.]+$/, '') || 'extracted-text'
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      console.error(err)
      alert('텍스트 파일을 다운로드하는 중 오류가 발생했습니다.')
    } finally {
      setDownloading(false)
    }
  }

  // ---------- Gemini AI: 텍스트 → 활동 레코드 자동 구조화 ----------

  function applyAiExtraction(records) {
    if (!Array.isArray(records) || records.length === 0) return

    setDetail(prev => {
      if (!prev.upload) return prev

      let students = [...(prev.students || [])]
      const analysisByStudent = { ...(prev.analysisByStudent || {}) }

      // Supabase 학생 목록(studentsMaster)과 이름 매칭 → 있으면 해당 id 사용
      function ensureStudentId(name) {
        const trimmed = String(name || '').trim()
        const displayName = trimmed || '학생'

        // 1) Supabase 학생 이름과 매칭
        let master = null
        if (studentsMaster && studentsMaster.length > 0 && trimmed) {
          master = studentsMaster.find(
            s => (s.name || '').trim() === trimmed,
          )
        }

        if (master) {
          const masterId = String(master.id)
          const byId = students.find(s => String(s.id) === masterId)
          if (byId) return byId.id

          const stuObj = { id: masterId, name: master.name || displayName }
          students = [...students, stuObj]
          return masterId
        }

        // 2) 현재 모달 안에서 이름이 같은 학생이 이미 있으면 재사용
        const existingByName = students.find(s => s.name === displayName)
        if (existingByName) return existingByName.id

        // 3) 둘 다 없으면 로컬 가상 학생 생성
        const newId = `ai-${students.length + 1}-${Date.now()}`
        const newStu = { id: newId, name: displayName }
        students = [...students, newStu]
        return newId
      }

      records.forEach(rec => {
        const studentName =
          rec.student_name || prev.upload.student_name || '학생'

        const stuId = ensureStudentId(studentName)

        const firstEmotion = Array.isArray(rec.emotions)
          ? rec.emotions[0]
          : null

        const emotionTags = Array.isArray(rec.emotions)
          ? rec.emotions.map(e => e && e.label).filter(Boolean)
          : []

        const abilityAnalysis = rec.ability_analysis || {}

        let activityTypes = buildActivityTypeState()
        const actTypeText = rec.activity_type || ''

        Object.entries(ACTIVITY_TYPE_PRESETS).forEach(([key, cfg]) => {
          if (actTypeText.includes(cfg.label)) {
            activityTypes[key] = {
              ...cfg,
              selected: true,
              detail: '',
            }
          }
        })

        const analysis = {
          date: rec.date || prev.upload.uploaded_at || null,
          activityName: rec.activity_title || '',
          activityType: actTypeText || '',
          durationMinutes: null,
          note: rec.teacher_comment || '',
          level: abilityAnalysis.level || '',
          ability: Array.isArray(abilityAnalysis.main_abilities)
            ? abilityAnalysis.main_abilities
            : [],
          score: null,
          scoreExplanation: '',
          emotionSummary: firstEmotion?.label || '',
          emotionCause: firstEmotion?.reason || '',
          observedBehaviors: Array.isArray(rec.behavior_tags)
            ? rec.behavior_tags.join(', ')
            : '',
          emotionTags,
          rawTextCleaned:
            prev.editedText ||
            prev.upload.raw_text ||
            prev.upload.analysis?.rawTextCleaned ||
            '',
        }

        analysisByStudent[stuId] = {
          analysis,
          activityTypes,
        }
      })

      const nextActiveId =
        prev.activeStudentId || (students[0] && students[0].id) || null

      return {
        ...prev,
        students,
        analysisByStudent,
        activeStudentId: nextActiveId,
        saved: false,
      }
    })
  }

  async function handleRunAiExtraction() {
    if (!detail.upload || aiLoading) return

    const sourceText =
      (detail.editedText && detail.editedText.trim()) ||
      detail.upload.raw_text ||
      detail.upload.analysis?.rawTextCleaned ||
      ''

    if (!sourceText) {
      alert('분석할 텍스트가 없습니다. 먼저 업로드 텍스트를 불러오거나 작성해 주세요.')
      return
    }

    try {
      setAiLoading(true)
      setAiError('')

      const res = await extractRecordsWithGemini({
        raw_text: sourceText,
        file_name: detail.upload.file_name,
      })

      const records = res?.parsed?.records || res?.records || []

      if (!Array.isArray(records) || records.length === 0) {
        alert('AI가 활동 기록을 찾지 못했습니다. 텍스트를 다시 확인해 주세요.')
        return
      }

      applyAiExtraction(records)

      // AI 자동 분석 완료 → 두 번째 단계 100%
      if (detail.upload) {
        updateUploadSteps(detail.upload.id, prevSteps => ({
          ...prevSteps,
          ai: 100,
        }))
      }
    } catch (e) {
      console.error(e)
      setAiError('AI 분석 중 오류가 발생했습니다.')
      alert('AI 분석 중 오류가 발생했습니다.')
    } finally {
      setAiLoading(false)
    }
  }

  // ---------- 활동 유형 상세 모달 ----------

  async function openActivityTypeSummary() {
    if (!detail.upload) return
    setActivityDetailModal({
      ...INITIAL_ACTIVITY_DETAIL_MODAL,
      open: true,
      loading: true,
    })
    try {
      const data = await apiFetch(`/activity_types?upload_id=${detail.upload.id}`)
      const records = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : Array.isArray(data?.records)
        ? data.records
        : []

      setActivityDetailModal({
        open: true,
        loading: false,
        records,
        summary: data?.summary || data?.stats || null,
        analysisText:
          data?.analysis ||
          data?.description ||
          data?.insight ||
          `${detail.upload.student_name || '학생'} 활동 데이터 집계입니다.`,
        error: '',
      })
    } catch (err) {
      console.error(err)
      setActivityDetailModal({
        open: true,
        loading: false,
        records: [],
        summary: null,
        analysisText: '',
        error: '활동 유형 상세 데이터를 불러오지 못했습니다.',
      })
    }
  }

  function closeActivityTypeModal() {
    setActivityDetailModal(INITIAL_ACTIVITY_DETAIL_MODAL)
  }

  // ---------- DB 저장 ----------

  async function handleSaveLogEntry() {
    if (!detail.upload || detail.saving) return

    const { activeId } = getActiveStudentState(detail)
    if (!activeId) {
      alert('학생 정보가 없어 저장할 수 없습니다. (학생 탭 필요)')
      return
    }

    const rawText =
      (detail.editedText && detail.editedText.trim()) ||
      detail.upload.raw_text ||
      detail.upload.analysis?.rawTextCleaned ||
      ''

    const todayStr = new Date().toISOString().slice(0, 10)

    const logEntries = (detail.students || []).map(stu => {
      const state = detail.analysisByStudent?.[stu.id] || {}
      const analysis = state.analysis || {}
      const activityTypes = state.activityTypes || buildActivityTypeState()

      const selectedActivityLabels = Object.entries(activityTypes)
        .filter(([, item]) => item.selected)
        .map(([, item]) => item.label || '')
        .filter(Boolean)

      const emotionTags = serializeEmotionTags(analysis.emotionTags)

      const { hours, minutes } = splitDuration(analysis.durationMinutes)
      const durationMinutes =
        typeof analysis.durationMinutes === 'number'
          ? analysis.durationMinutes
          : hours * 60 + minutes

      const logDate =
        analysis.date ||
        detail.upload?.uploaded_at ||
        detail.upload?.created_at ||
        todayStr

      const relatedMetrics = {
        duration_minutes: durationMinutes || null,
        activity_name: analysis.activityName || '',
        activity_type: analysis.activityType || '',
        note: analysis.note || '',
        level: analysis.level || '',
        ability: Array.isArray(analysis.ability) ? analysis.ability : [],
        score: typeof analysis.score === 'number' ? analysis.score : null,
        score_explanation: analysis.scoreExplanation || '',
      }

      return {
        student_id: stu.id,
        student_name: stu.name,
        log_date: logDate,
        emotion_tag: analysis.emotionSummary || '',
        emotion_tags: emotionTags,
        activity_tags: selectedActivityLabels,
        log_content: rawText,
        related_metrics: relatedMetrics,
      }
    })

    const payload = {
      upload_id: detail.upload.id,
      file_name: detail.upload.file_name,
      raw_text: rawText,
      log_entries: logEntries,
    }

    try {
      setDetail(prev => ({ ...prev, saving: true }))

      await apiFetch(`/uploads/${detail.upload.id}/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      setDetail(prev => ({
        ...prev,
        saving: false,
        saved: true,
        upload: {
          ...prev.upload,
          raw_text: rawText,
          log_entries: logEntries,
        },
      }))
      updateUploads(prev =>
        prev.map(item => {
          if (item.id !== detail.upload.id) return item
          const firstEntry = logEntries[0]
          return {
            ...item,
            raw_text: rawText,
            student_name: firstEntry?.student_name || item.student_name,
            analysis: {
              ...(item.analysis || {}),
              date: firstEntry?.log_date,
              emotionSummary: firstEntry?.emotion_tag,
              activityType:
                firstEntry?.activity_tags?.[0] || item.analysis?.activityType,
            },
            // 3개 과정(텍스트 추출, AI 분석, DB 저장)이 모두 끝난 상태로 표시
            status: 'success',
            progress: 100,
            overall_progress: 100,
            steps: {
              ...(item.steps || {}),
              upload: 100,
              extract: 100,
              ocr: 100,
              sentiment: 100,
            },
          }
        }),
      )

      alert('데이터가 데이터베이스(log_entries) 구조에 맞게 저장되었습니다.')
    } catch (e) {
      console.error(e)
      setDetail(prev => ({ ...prev, saving: false, saved: false }))
      alert('저장 요청 중 오류가 발생했습니다.')
    }
  }

  // ---------- 렌더링 ----------

  const safeUploads = Array.isArray(uploads) ? uploads : []

  return (
    <Layout title="">
      {/* 업로드 영역 */}
      <section className="upload-hero">
        <div
          className={dragOver ? 'uploader uploader-drag' : 'uploader'}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={e => {
            e.preventDefault()
            setDragOver(false)
          }}
          onDrop={handleDrop}
        >
          {uploading ? (
            <>
              <div
                style={{
                  fontSize: 40,
                  marginTop: 12,
                  marginBottom: 12,
                }}
              >
                ⏳
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                파일을 변환하는 중입니다...
              </div>
              <div className="muted">
                텍스트를 추출하고 있어요. 잠시만 기다려 주세요.
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 40,
                  marginTop: 12,
                  marginBottom: 12,
                }}
              >
                📄
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                PDF / TXT 파일을 선택하거나 드래그하세요
              </div>
              <div className="muted">최대 10MB</div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          multiple
          style={{ display: 'none' }}
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
      </section>

      {/* 업로드 현황 리스트 */}
      <section className="upload-status-section">
        <div className="upload-status-header">
          <h2 className="section-title">업로드 현황</h2>
        </div>

        {loading && (
          <div className="muted" style={{ marginTop: 8 }}>
            불러오는 중입니다...
          </div>
        )}
        {error && (
          <div className="error" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        <div className="upload-list" style={{ marginTop: 16 }}>
          {safeUploads.length === 0 && !loading && !error && (
            <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
              아직 업로드된 파일이 없습니다.
            </div>
          )}

          {safeUploads.map(upload => {
            const rawStatus = upload.status
            const isDone =
              rawStatus === 'done' ||
              rawStatus === 'success' ||
              rawStatus === 'completed'
            const isFailed = rawStatus === 'failed' || rawStatus === 'error'
            const isDemo = upload.demo

            const badgeClass = isFailed
              ? 'badge badge-error'
              : isDone
              ? 'badge badge-success'
              : 'badge badge-warning'
            // 3개 과정이 모두 끝나면 '저장완료', 그렇지 않으면 '수정중'
            const statusLabel = isFailed ? '실패' : isDone ? '저장완료' : '수정중'

            const shellClass = isFailed
              ? 'card-shell card-shell-md upload-card-shell card-shell-error'
              : isDone
              ? 'card-shell card-shell-md upload-card-shell card-shell-success'
              : 'card-shell card-shell-md upload-card-shell card-shell-processing'

            const steps = upload.steps || {}
            const stepInfoList = STEP_DEFS.map(step => ({
              ...step,
              value:
                typeof steps[step.key] === 'number' ? steps[step.key] : 0,
            }))
            const allStepsDone =
              stepInfoList.length > 0 && stepInfoList.every(s => (s.value ?? 0) >= 100)
            const firstIncompleteStep = stepInfoList.find(s => (s.value ?? 0) < 100)
            const displayStepLabel = allStepsDone
              ? '모든 단계 완료'
              : firstIncompleteStep
              ? `${firstIncompleteStep.label} 진행 중`
              : '대기 중'

            const representativeLog =
              upload.latest_log_entry ||
              upload.representative_log ||
              (Array.isArray(upload.log_entries) ? upload.log_entries[0] : null)

            const activityDate =
              representativeLog?.log_date ||
              upload.activity_date ||
              upload.analysis?.date ||
              upload.uploaded_at

            const activityType =
              representativeLog?.activity_type ||
              (Array.isArray(representativeLog?.activity_tags) &&
                representativeLog.activity_tags[0]) ||
              upload.analysis?.activityType ||
              '-'

            const emotionSummary =
              representativeLog?.emotion_tag ||
              upload.analysis?.emotionSummary ||
              '감정 정보 없음'

            const summaryName =
              representativeLog?.activity_name || upload.analysis?.activityName || '대표 활동 없음'

            return (
              <div key={upload.id} className={shellClass}>
                <div className="upload-card-shell-header">
                  <div>
                    <p className="card-title-main">{upload.file_name}</p>
                    <p className="card-subtitle">
                      {upload.student_name} · 업로드 {formatDate(upload.uploaded_at)}
                      {activityDate && (
                        <>
                          <span className="meta-sep">·</span>
                          <span>활동일 {formatDate(activityDate)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="upload-card-shell-actions">
                    <span className={badgeClass}>{statusLabel}</span>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => openDetail(upload)}
                      title="상세보기"
                    >
                      상세보기
                    </button>
                  </div>
                </div>

                <div className="upload-card-summary-row">
                  <div className="upload-card-summary">
                    <p className="card-subtitle">대표 활동</p>
                    <p className="card-title-main">{summaryName}</p>
                    <p className="card-subtitle">
                      {activityType || '활동 유형 없음'} · {emotionSummary}
                    </p>
                  </div>
                  <div className="upload-card-progress-col">
                    <div className="upload-card-progress-text">
                      <h3 className="upload-card-progress-label">현재 단계</h3>
                      <div className="upload-card-progress-status">{displayStepLabel}</div>
                    </div>
                    <button
                      type="button"
                      className="btn ghost delete-upload-btn"
                      style={{ marginTop: 8 }}
                      onClick={() => handleDeleteUpload(upload.id)}
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div className="upload-card-meta-grid">
                  <div>
                    <p className="card-subtitle">활동일</p>
                    <p className="card-title-main">
                      {activityDate ? formatDate(activityDate) : '활동일 미정'}
                    </p>
                  </div>
                  <div>
                    <p className="card-subtitle">학생</p>
                    <p className="card-title-main">{upload.student_name}</p>
                  </div>
                  <div>
                    <p className="card-subtitle">활동 유형</p>
                    <p className="card-title-main">{activityType || '-'}</p>
                  </div>
                </div>

                {!isDemo && !isDone && stepInfoList.length > 0 && (
                  <div className="upload-card-steps">
                    {stepInfoList.map(step => (
                      <div key={step.key} className="step-row">
                        <div className="step-label">{step.label}</div>
                        <div className="step-progress-wrap">
                          <div className="progress step-progress">
                            <i
                              style={{
                                width: `${step.value}%`,
                              }}
                            />
                          </div>
                          <span className="step-percent">{step.value}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* 상세보기 모달 */}
      {detail.open && detail.upload && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-card-wide detail-analysis-modal">
            <div className="detail-analysis-header">
              <div>
                <h3>상세 편집 및 AI 분석</h3>
                <p className="card-subtitle detail-analysis-meta">
                  {detail.upload.file_name} · 업로드 {formatDate(detail.upload.uploaded_at)} · ID #
                  {detail.upload.id}
                </p>
              </div>
              <div className="detail-header-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleRunAiExtraction}
                  disabled={aiLoading}
                >
                  {aiLoading ? 'AI 분석 중...' : 'AI로 자동 분석'}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleDownloadOriginal}
                  disabled={downloading}
                >
                  {downloading ? '다운로드 중...' : '텍스트 다운로드'}
                </button>
                <button type="button" className="btn ghost" onClick={closeDetail}>
                  닫기
                </button>
              </div>
            </div>

            {detail.error && (
              <div className="error" style={{ marginBottom: 8 }}>
                {detail.error}
              </div>
            )}

            {aiError && (
              <div className="error" style={{ marginBottom: 8 }}>
                {aiError}
              </div>
            )}

            <div
              className="student-tabs-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 8,
              }}
            >
              <div
                className="student-tabs"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {(detail.students || []).map(stu => {
                  const isActive = stu.id === detail.activeStudentId
                  const baseClass = 'emotion-chip'
                  const activeClass = isActive
                    ? 'emotion-chip-selected'
                    : 'emotion-chip-unselected'
                  return (
                    <button
                      key={stu.id}
                      type="button"
                      className={`${baseClass} ${activeClass} student-tab`}
                      onClick={() => handleSelectStudent(stu.id)}
                    >
                      <span className="emotion-chip-label">{stu.name}</span>
                      <span
                        className="emotion-chip-icon"
                        style={{ marginLeft: 4 }}
                        onClick={e => {
                          e.stopPropagation()
                          handleRemoveStudent(stu.id)
                        }}
                      >
                        ×
                      </span>
                    </button>
                  )
                })}
                {(!detail.students || detail.students.length === 0) && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    아직 등록된 학생이 없습니다.
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn ghost small"
                onClick={handleAddStudent}
              >
                + 학생 추가
              </button>
            </div>

            {/* Supabase 학생 선택 드롭다운 (버튼 바로 아래 위치) */}
            {studentPickerOpen && (
              <div
                className="student-picker-row"
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <select
                  className="analysis-input"
                  style={{ maxWidth: 260 }}
                  value={studentPickerValue}
                  onChange={e => setStudentPickerValue(e.target.value)}
                >
                  <option value="">학생 선택</option>
                  {studentsMaster.map(stu => (
                    <option key={stu.id} value={stu.id}>
                      {stu.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={handleAddStudentFromPicker}
                >
                  추가
                </button>
              </div>
            )}

            {detail.loading ? (
              <div className="muted">불러오는 중입니다...</div>
            ) : (
              <>
                <div className="detail-layout detail-layout-modern">
                  <section className="detail-left">
                    <div className="detail-panel">
                      <div className="detail-panel-head">
                        <h4>원본 텍스트</h4>
                        <hr></hr>
                        <p className="card-subtitle">
                          AI 분석 결과를 바탕으로 정리된 텍스트입니다.
                        </p>
                      </div>
                      <br></br>
                      <textarea
                        className="detail-textarea"
                        value={detail.editedText}
                        onChange={e =>
                          setDetail(prev => ({
                            ...prev,
                            editedText: e.target.value,
                            saved: false,
                          }))
                        }
                        placeholder="원본 텍스트를 편집하여 저장할 수 있습니다."
                      />
                      <p className="detail-helper-text"></p>
                    </div>
                  </section>

                  <section className="detail-right">
                    {(() => {
                      const { activeId, analysis: a, activityTypes } =
                        getActiveStudentState(detail)
                      const activeStudent =
                        (detail.students || []).find(s => s.id === activeId) || null

                      const studentsText =
                        activeStudent?.name || detail.upload.student_name

                      const dateValue = a.date
                        ? formatDate(a.date)
                        : formatDate(detail.upload.uploaded_at) || ''

                      const { hours, minutes } = splitDuration(a.durationMinutes)
                      const safeHours = Number.isNaN(hours) ? 0 : hours
                      const safeMinutes = Number.isNaN(minutes) ? 0 : minutes

                      return (
                        <div className="analysis-panel">
                          <div className="analysis-panel-header">
                            <h4>AI 분석 결과 (학생별 편집)</h4>
                            <p className="card-subtitle">
                              현재 선택된 학생 탭에 대해 활동 정보와 감정, 활동 유형을
                              개별적으로 수정할 수 있습니다.
                            </p>
                          </div>

                          <div className="analysis-scroll-panel">
                            <div className="analysis-section">
                              <h5>활동 기본 정보</h5>
                              <div className="analysis-grid">
                                <label>학생</label>
                                <div className="analysis-input-static">
                                  {studentsText || '-'}
                                </div>
                                <label>활동일</label>
                                <input
                                  type="date"
                                  className="analysis-input"
                                  value={dateValue}
                                  onChange={e =>
                                    updateEditedAnalysis({
                                      date: e.target.value || null,
                                    })
                                  }
                                />
                                <label>활동명</label>
                                <input
                                  type="text"
                                  className="analysis-input"
                                  value={a.activityName || ''}
                                  onChange={e =>
                                    updateEditedAnalysis({
                                      activityName: e.target.value,
                                    })
                                  }
                                />
                                <label>소요 시간</label>
                                <div className="time-input-group">
                                  <input
                                    type="number"
                                    min="0"
                                    className="analysis-input time-input"
                                    value={safeHours}
                                    onChange={e => {
                                      const h = Math.max(
                                        0,
                                        Number(e.target.value || 0),
                                      )
                                      updateEditedAnalysis({
                                        durationMinutes: h * 60 + safeMinutes,
                                      })
                                    }}
                                  />
                                  <span className="time-separator">시간</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="59"
                                    className="analysis-input time-input"
                                    value={safeMinutes}
                                    onChange={e => {
                                      let m = Math.max(
                                        0,
                                        Number(e.target.value || 0),
                                      )
                                      if (m > 59) m = 59
                                      updateEditedAnalysis({
                                        durationMinutes: safeHours * 60 + m,
                                      })
                                    }}
                                  />
                                  <span className="time-separator">분</span>
                                </div>
                                <label>활동 유형</label>
                                <input
                                  type="text"
                                  className="analysis-input"
                                  value={a.activityType || ''}
                                  onChange={e =>
                                    updateEditedAnalysis({
                                      activityType: e.target.value,
                                    })
                                  }
                                />
                                <label>비고</label>
                                <input
                                  type="text"
                                  className="analysis-input"
                                  value={a.note || ''}
                                  onChange={e =>
                                    updateEditedAnalysis({
                                      note: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>

                            <div className="analysis-section">
                              <div className="analysis-section-head">
                                <div>
                                  <h5>감정 키워드</h5>
                                  <p className="section-helper">
                                    현재 학생에 해당하는 감정 키워드를 선택하거나 직접
                                    추가할 수 있습니다. 저장 시 분석/리포트에 활용됩니다.
                                  </p>
                                </div>
                              </div>
                              <EmotionKeywordSelector
                                masterList={emotionKeywords}
                                selected={a.emotionTags || []}
                                onToggle={label => toggleEmotionTagInDetail(label)}
                                onAddNew={label =>
                                  addEmotionKeywordInSupabase(label)
                                }
                              />
                            </div>

                            <div className="analysis-section">
                              <div className="analysis-section-head">
                                <div>
                                  <h5>활동 유형 선택 (중복 선택 가능)</h5>
                                  <p className="section-helper">
                                    체크된 활동 유형은 현재 학생의 활동 기록 통계에
                                    반영됩니다.
                                  </p>
                                </div>
                              </div>
                              <div className="activity-type-grid">
                                {Object.entries(activityTypes || {}).map(
                                  ([key, item]) => (
                                    <div
                                      key={key}
                                      className={
                                        item.selected
                                          ? 'activity-type-card selected'
                                          : 'activity-type-card'
                                      }
                                    >
                                      <button
                                        type="button"
                                        className="activity-type-toggle"
                                        onClick={() =>
                                          toggleActivityTypeSelection(key)
                                        }
                                      >
                                        <span className="activity-type-icon">
                                          {item.icon || '•'}
                                        </span>
                                        <span className="activity-type-label">
                                          {item.label}
                                        </span>
                                        <span className="activity-type-check">
                                          {item.selected ? '✓' : ''}
                                        </span>
                                      </button>
                                      {item.selected && (
                                        <textarea
                                          className="activity-type-detail"
                                          value={item.detail || ''}
                                          placeholder={item.placeholder}
                                          onChange={e =>
                                            updateActivityTypeDetail(
                                              key,
                                              e.target.value,
                                            )
                                          }
                                        />
                                      )}
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </section>
                </div>

                <div className="detail-modal-footer">
                  <button
                    className="btn"
                    onClick={handleSaveLogEntry}
                    disabled={detail.saving}
                  >
                    {detail.saving ? '저장 중...' : '데이터베이스 저장'}
                  </button>
                  {detail.saved && (
                    <span className="badge badge-success">저장 완료</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ActivityTypeDetailModal
        modal={activityDetailModal}
        onClose={closeActivityTypeModal}
        studentName={detail.upload?.student_name || ''}
      />
    </Layout>
  )
}

// -------------------- 활동 유형 상세 모달 --------------------

function ActivityTypeDetailModal({ modal, onClose, studentName }) {
  if (!modal.open) return null

  const records = modal.records || []
  const summary = modal.summary || {}
  const totalActivities = summary.total || records.length
  const topActivity =
    summary.top_activity ||
    summary.topActivity ||
    records[0]?.activity_name ||
    '데이터 없음'
  const activityTypeCount =
    summary.activity_types ||
    summary.activityTypes ||
    new Set(records.map(r => r.activity_type)).size ||
    0

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card modal-card-wide activity-detail-modal">
        <div className="detail-analysis-header">
          <div>
            <h3>활동 유형 상세 집계</h3>
            <p className="card-subtitle detail-analysis-meta">
              {studentName || '학생'} 활동 데이터 집계 결과입니다.
            </p>
          </div>
          <div className="detail-header-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>

        {modal.loading ? (
          <div className="muted">상세 데이터를 불러오는 중입니다...</div>
        ) : modal.error ? (
          <div className="error">{modal.error}</div>
        ) : (
          <>
            <div className="activity-detail-table">
              <div className="activity-detail-table-head">
                <span>날짜</span>
                <span>활동명</span>
                <span>활동 유형</span>
                <span>비고</span>
              </div>
              {records.length === 0 ? (
                <div className="activity-detail-empty">
                  아직 집계된 활동이 없습니다.
                </div>
              ) : (
                records.map(item => (
                  <div
                    key={item.id || item.log_id}
                    className="activity-detail-row"
                  >
                    <span>{formatDate(item.log_date) || '-'}</span>
                    <span>{item.activity_name || '-'}</span>
                    <span>
                      <span className="activity-type-chip">
                        {item.activity_type || '미분류'}
                      </span>
                    </span>
                    <span>{item.note || item.memo || '-'}</span>
                  </div>
                ))
              )}
            </div>

            <div className="activity-summary-grid">
              <div className="activity-summary-card">
                <p className="card-subtitle">총 활동 횟수</p>
                <p className="card-title-main">{totalActivities}</p>
              </div>
              <div className="activity-summary-card">
                <p className="card-subtitle">가장 많은 활동</p>
                <p className="card-title-main">{topActivity}</p>
              </div>
              <div className="activity-summary-card">
                <p className="card-subtitle">활동 유형 수</p>
                <p className="card-title-main">{activityTypeCount}</p>
              </div>
            </div>

            <div className="activity-analysis-box">
              <h5>활동 분석</h5>
              <p>
                {modal.analysisText ||
                  `${studentName || '학생'}은 최근 활동 기간 동안 ${
                    totalActivities || 0
                  }회의 활동을 수행했으며, ${
                    activityTypeCount || 0
                  }가지 유형을 경험했습니다.`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// -------------------- 감정 키워드 선택 컴포넌트 --------------------

function EmotionKeywordSelector({ masterList, selected, onToggle, onAddNew }) {
  const [inputValue, setInputValue] = React.useState('')
  const safeSelected = Array.isArray(selected) ? selected : []
  const safeMaster = Array.isArray(masterList) ? masterList : []

  const handleSubmit = e => {
    e.preventDefault()
    const value = inputValue.trim()
    if (!value) return

    const existing = safeMaster.find(
      item => (item.label || item.name) === value,
    )

    if (existing) {
      onToggle && onToggle(existing.label || existing.name)
    } else {
      onAddNew && onAddNew(value)
    }
    setInputValue('')
  }

  const suggestions =
    inputValue.trim().length === 0
      ? []
      : safeMaster.filter(item => {
          const label = (item.label || item.name || '').trim()
          if (!label) return false
          if (safeSelected.includes(label)) return false
          return label.includes(inputValue.trim())
        })

  return (
    <div>
      <div className="emotion-chips-row">
        {safeSelected.map(label => (
          <button
            key={label}
            type="button"
            className="emotion-chip emotion-chip-selected"
            onClick={() => onToggle && onToggle(label)}
          >
            <span className="emotion-chip-label">{label}</span>
            <span className="emotion-chip-icon">✓</span>
          </button>
        ))}
      </div>

      <form className="emotion-chip-add-row" onSubmit={handleSubmit}>
        <input
          type="text"
          className="analysis-input emotion-chip-input"
          placeholder="감정 키워드 입력 또는 검색"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
        />
        <button type="submit" className="btn ghost small">
          + 추가
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="emotion-chips-row" style={{ marginTop: 6 }}>
          {suggestions.map(item => {
            const label = (item.label || item.name || '').trim()
            if (!label) return null
            return (
              <button
                key={item.id || label}
                type="button"
                className="emotion-chip emotion-chip-unselected"
                onClick={() => onToggle && onToggle(label)}
              >
                <span className="emotion-chip-label">{label}</span>
                <span className="emotion-chip-icon">+</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
