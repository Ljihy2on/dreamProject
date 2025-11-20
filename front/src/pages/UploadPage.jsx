// front/src/pages/UploadPage.jsx
import React, { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import { apiFetch } from '../lib/api.js'

// -------------------- 헬퍼 / 상수 --------------------

const STEP_DEFS = [
  { key: 'upload', label: '파일 업로드' },
  { key: 'extract', label: '텍스트 추출' },
  { key: 'ocr', label: 'OCR 분석' },
  { key: 'sentiment', label: '감정 분석' },
]

// 감정 키워드 기본 세트(태그 테이블이 비어 있을 때만 사용)
const DEFAULT_EMOTION_KEYWORDS = [
  '흐뭇한',
  '힘든',
  '혼란스러운',
  '황홀한',
  '감격스러운',
  '희망에 찬',
  '당당한',
  '자신감 있는',
  '사랑하는',
  '공허한',
  '허탈한',
  '쓸쓸한',
  '서글픈',
  '억울한',
  '무서운',
  '좌절한',
  '분한',
  '후회한',
  '두려운',
  '서러운',
  '걱정되는',
  '긴장한',
  '짜증나는',
  '지루한',
  '허전한',
  '심심한',
  '기분 좋은',
  '행복한',
  '설레는',
  '신나는',
  '즐거운',
  '감사한',
  '따뜻한',
  '고마운',
  '상쾌한',
  '유쾌한',
  '후련한',
  '든든한',
  '홀가분한',
  '자유로운',
  '여유로운',
  '감탄한',
  '훈훈한',
  '몽롱한',
  '쑥스러운',
  '명랑한',
  '들뜬',
  '두근거리는',
  '짜릿한',
  '화나는',
  '분노한',
  '피곤한',
  '졸린',
  '불안한',
  '당황스러운',
  '놀란',
  '기쁜',
  '뿌듯한',
  '안도된',
  '만족스러운',
  '감동받은',
  '기대에 부푼',
  '가벼운',
  '활기찬',
  '차분한',
  '평온한',
  '편안한',
  '부끄러운',
  '민망한',
  '죄책감',
  '미안한',
  '초조한',
  '답답한',
  '우울한',
  '무기력한',
  '허무한',
  '멍한',
  '지친',
  '귀찮은',
  '게으른',
  '재미있는',
  '신기한',
  '이색한',
  '의욕적인',
  '충만한',
  '통쾌한',
  '의로운',
  '자랑스러운',
  '용기있는',
  '사랑받는',
  '소중한',
  '기특한',
  '존경스러운',
]

// 업로드 목록 응답 포맷 정규화
function normalizeUploads(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.items)) return data.items
  if (data && Array.isArray(data.uploads)) return data.uploads
  return []
}

// 분석 필드 정규화
function normalizeAnalysis(raw) {
  const a = raw.analysis || {}
  const legacyEmotion = raw.emotion_tag || a.emotion || a.emotionSummary

  const emotionTagsRaw =
    a.emotionTags ||
    raw.emotion_tags ||
    a.emotion_keywords ||
    raw.emotion_keywords ||
    null

  return {
    students: a.students || raw.students || [],
    date: a.date || raw.date || null,
    activityName:
      a.activityName ||
      raw.activityName ||
      raw.activity_name ||
      raw.title ||
      '',
    durationMinutes:
      a.durationMinutes ||
      raw.durationMinutes ||
      raw.duration_minutes ||
      null,
    activityType:
      a.activityType ||
      raw.activityType ||
      raw.activity_type ||
      '',
    note: a.note || raw.note || '',
    level: a.level || raw.level || '',
    ability:
      a.ability ||
      a.abilities ||
      raw.ability ||
      raw.abilities ||
      [],
    score:
      typeof a.score === 'number'
        ? a.score
        : typeof raw.score === 'number'
        ? raw.score
        : null,
    scoreExplanation:
      a.scoreExplanation ||
      raw.scoreExplanation ||
      raw.score_explanation ||
      '',
    emotionSummary: a.emotionSummary || legacyEmotion || '',
    emotionCause:
      a.emotionCause || a.emotion_reason || raw.emotionCause || '',
    observedBehaviors:
      a.observedBehaviors ||
      a.behavior ||
      raw.observedBehaviors ||
      '',
    emotionTags: normalizeEmotionTags(emotionTagsRaw),
    rawTextCleaned:
      a.rawTextCleaned ||
      raw.rawTextCleaned ||
      raw.raw_text_cleaned ||
      raw.raw_text ||
      '',
  }
}

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

function hydrateUpload(raw) {
  const id =
    raw.id ||
    raw.upload_id ||
    raw.uuid ||
    String(raw.file_name || raw.filename || raw.name || Math.random())

  const fileName = raw.file_name || raw.filename || raw.name || '이름 없는 파일'
  const studentName =
    raw.student_name ||
    raw.student?.name ||
    raw.meta?.student_name ||
    '학생 미확인'
  const uploadedAt =
    raw.created_at || raw.uploaded_at || raw.uploadDate || raw.createdAt || null
  const status = raw.status || 'queued'

  const steps =
    raw.steps || {
      upload: status === 'failed' ? 100 : 100,
      extract: status === 'done' ? 100 : status === 'processing' ? 80 : 0,
      ocr: status === 'done' ? 100 : status === 'processing' ? 60 : 0,
      sentiment: status === 'done' ? 100 : status === 'processing' ? 40 : 0,
    }

  const overall =
    typeof raw.progress === 'number'
      ? raw.progress
      : Math.round(
          (steps.upload + steps.extract + steps.ocr + steps.sentiment) / 4,
        )

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

function durationToHHMM(mins) {
  const total = Number(mins)
  if (Number.isNaN(total) || total < 0) return null
  const h = Math.floor(total / 60)
  const m = total % 60
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}`
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

    if (
      rawDetails &&
      Object.prototype.hasOwnProperty.call(rawDetails, key) &&
      !detail
    ) {
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

function serializeActivityTypeState(state) {
  const activity_types = {}
  const activity_type_details = {}

  Object.entries(state || {}).forEach(([key, value]) => {
    activity_types[key] = {
      selected: !!value.selected,
      label: value.label,
    }
    activity_type_details[key] = value.detail || ''
  })

  return { activity_types, activity_type_details }
}

function serializeEmotionTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags
    .map(v => String(v || '').trim())
    .filter(Boolean)
}

function createDetailState(overrides = {}) {
  return {
    open: false,
    loading: false,
    upload: null,
    error: '',
    saving: false,
    saved: false,
    editedText: '',
    editedAnalysis: null,
    logEntries: [],
    activeLogEntryId: null,
    activityTypes: buildActivityTypeState(),
    emotionTags: [],
    emotionDistribution: [],
    ...overrides,
  }
}

function normalizeLogEntries(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.items)) return raw.items
  if (Array.isArray(raw.data)) return raw.data
  return []
}

const INITIAL_ACTIVITY_DETAIL_MODAL = {
  open: false,
  loading: false,
  records: [],
  summary: null,
  analysisText: '',
  error: '',
}

// -------------------- 페이지 컴포넌트 --------------------

export default function UploadPage() {
  const fileRef = useRef(null)

  const [uploads, setUploads] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const [detail, setDetail] = useState(() => createDetailState())
  const [activityDetailModal, setActivityDetailModal] = useState(
    INITIAL_ACTIVITY_DETAIL_MODAL,
  )
  const [downloading, setDownloading] = useState(false)
  const [emotionKeywords, setEmotionKeywords] = useState([])

  // ---------- 서버에서 업로드 목록 ----------

  async function fetchUploads() {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/uploads')
      const items = normalizeUploads(data).map(hydrateUpload)
      setUploads(items)
    } catch (e) {
      console.error(e)
      setError('업로드 목록을 불러오는 중 오류가 발생했습니다.')
      setUploads([])
    } finally {
      setLoading(false)
    }
  }

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
        setEmotionKeywords(
          DEFAULT_EMOTION_KEYWORDS.map((label, index) => ({
            id: `local-${index}`,
            label,
          })),
        )
      }
    } catch (e) {
      console.error(e)
      setEmotionKeywords(
        DEFAULT_EMOTION_KEYWORDS.map((label, index) => ({
          id: `local-${index}`,
          label,
        })),
      )
    }
  }

  useEffect(() => {
    fetchUploads()
    loadEmotionKeywords()
  }, [])

  // ---------- 파일 업로드 ----------

  async function handleFiles(files) {
    const list = Array.from(files || [])
    if (list.length === 0) return

    for (const file of list) {
      const tempId = `temp-${Date.now()}-${file.name}`

      const tempUpload = hydrateUpload({
        id: tempId,
        file_name: file.name,
        status: 'processing',
        steps: {
          upload: 40,
          extract: 0,
          ocr: 0,
          sentiment: 0,
        },
      })

      setUploads(prev => [tempUpload, ...prev])

      const form = new FormData()
      form.append('file', file)

      try {
        setLoading(true)
        await apiFetch('/uploads', {
          method: 'POST',
          body: form,
          _formName: file.name,
        })
        await fetchUploads()
      } catch (e) {
        console.error(e)
        setError('파일 업로드 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files)
    }
  }

  // ---------- 상세보기 모달 ----------

  async function openDetail(upload) {
    setDetail(createDetailState({ open: true, loading: true }))

    try {
      const [uploadRes, logEntriesRes] = await Promise.all([
        apiFetch(`/uploads/${upload.id}`),
        apiFetch(`/log_entries?upload_id=${upload.id}`).catch(() => []),
      ])

      const hydrated = hydrateUpload({ ...upload, ...(uploadRes || {}) })
      const initialText =
        hydrated.raw_text || hydrated.analysis?.rawTextCleaned || ''
      const initialAnalysis = { ...(hydrated.analysis || {}) }
      const logEntries = normalizeLogEntries(logEntriesRes)

      const activityTypes = buildActivityTypeState(
        uploadRes?.activity_types || uploadRes?.activityTypes,
        uploadRes?.activity_type_details || uploadRes?.activityTypeDetails,
      )

      const emotionTags =
        initialAnalysis.emotionTags ||
        uploadRes?.emotion_tags ||
        uploadRes?.emotionKeywords ||
        []

      setDetail(
        createDetailState({
          open: true,
          loading: false,
          upload: hydrated,
          editedText: initialText,
          editedAnalysis: initialAnalysis,
          logEntries,
          activeLogEntryId: logEntries[0]?.id || null,
          activityTypes,
          emotionTags: serializeEmotionTags(emotionTags),
        }),
      )
    } catch (err) {
      console.error(err)
      const initialText =
        upload.raw_text || upload.analysis?.rawTextCleaned || ''
      const initialAnalysis = { ...(upload.analysis || {}) }

      setDetail(
        createDetailState({
          open: true,
          loading: false,
          upload,
          error: '상세 정보를 불러오지 못했습니다. 기본 정보만 표시합니다.',
          editedText: initialText,
          editedAnalysis: initialAnalysis,
        }),
      )
    }
  }

  function closeDetail() {
    setDetail(createDetailState())
  }

  // 감정 키워드 수정
  function toggleEmotionTagInDetail(label) {
    const trimmed = String(label || '').trim()
    if (!trimmed) return

    setDetail(prev => {
      const baseAnalysis = prev.editedAnalysis || prev.upload?.analysis || {}
      const current = Array.isArray(baseAnalysis.emotionTags)
        ? baseAnalysis.emotionTags
        : []
      const exists = current.includes(trimmed)
      const nextTags = exists
        ? current.filter(item => item !== trimmed)
        : [...current, trimmed]

      return {
        ...prev,
        editedAnalysis: {
          ...baseAnalysis,
          emotionTags: nextTags,
        },
        emotionTags: nextTags,
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
    setDetail(prev => {
      const nextMap = { ...(prev.activityTypes || {}) }
      const current = nextMap[key] || ACTIVITY_TYPE_PRESETS[key] || { label: key }
      nextMap[key] = {
        ...current,
        selected: !current.selected,
      }
      return {
        ...prev,
        activityTypes: nextMap,
      }
    })
  }

  function updateActivityTypeDetail(key, detailText) {
    setDetail(prev => ({
      ...prev,
      activityTypes: {
        ...(prev.activityTypes || {}),
        [key]: {
          ...(prev.activityTypes?.[key] || ACTIVITY_TYPE_PRESETS[key] || {
            label: key,
          }),
          detail: detailText,
        },
      },
    }))
  }

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

  async function openActivityTypeSummary() {
    if (!detail.upload) return
    setActivityDetailModal({
      ...INITIAL_ACTIVITY_DETAIL_MODAL,
      open: true,
      loading: true,
    })
    try {
      const data = await apiFetch(
        `/activity_types?upload_id=${detail.upload.id}`,
      )
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

  // editedAnalysis 업데이트
  function updateEditedAnalysis(patch) {
    setDetail(prev => ({
      ...prev,
      editedAnalysis: {
        ...(prev.editedAnalysis || prev.upload?.analysis || {}),
        ...patch,
      },
    }))
  }

  // ---------- 로그 저장 ----------

  async function handleSaveLogEntry() {
    if (!detail.upload || detail.saving) return

    const u = detail.upload
    const editedAnalysis = detail.editedAnalysis || u.analysis || {}

    const studentId = u.student_id || u.student?.id
    if (!studentId) {
      alert('학생 정보가 없어 저장할 수 없습니다. (student_id 필요)')
      return
    }

    let observerId = null
    try {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const parsed = JSON.parse(userStr)
        observerId = parsed.id || parsed.user_id || null
      }
    } catch {
      observerId = null
    }

    const today = new Date().toISOString().slice(0, 10)

    const logText =
      detail.editedText && detail.editedText.trim().length > 0
        ? detail.editedText
        : u.raw_text || editedAnalysis.rawTextCleaned || null

    const durationMinutes = editedAnalysis.durationMinutes ?? null
    const durationHHMM = durationToHHMM(durationMinutes)

    const { activity_types, activity_type_details } = serializeActivityTypeState(
      detail.activityTypes,
    )

    const emotionTags = serializeEmotionTags(editedAnalysis.emotionTags)

    const payload = {
      upload_id: u.id,
      log_entry_id: detail.activeLogEntryId || null,
      log_date: editedAnalysis.date || u.log_date || today,
      activity_date: editedAnalysis.date || u.activity_date || today,
      student_id: studentId,
      observer_id: observerId,
      emotion_tag: editedAnalysis.emotionSummary || null,
      emotion_summary: editedAnalysis.emotionSummary || null,
      emotion_cause: editedAnalysis.emotionCause || null,
      behavior_summary: editedAnalysis.observedBehaviors || null,
      activity_tags: {
        activityType: editedAnalysis.activityType || null,
        note: editedAnalysis.note || null,
        ability: editedAnalysis.ability || [],
        duration_minutes: durationMinutes,
        duration_hhmm: durationHHMM,
        emotion_tags: emotionTags,
      },
      activity_types,
      activity_type_details,
      emotion_distribution: null,
      ability: editedAnalysis.ability || [],
      level: editedAnalysis.level || null,
      score: editedAnalysis.score ?? null,
      score_explanation: editedAnalysis.scoreExplanation || '',
      activity_name: editedAnalysis.activityName || null,
      activity_note: editedAnalysis.note || null,
      activity_duration_minutes: durationMinutes,
      log_content: logText,
      raw_text: logText,
      related_metrics: {
        score: editedAnalysis.score ?? null,
        level: editedAnalysis.level || null,
      },
      source_file_path: u.storage_key || u.file_name || null,
    }

    try {
      setDetail(prev => ({ ...prev, saving: true }))

      const response = await apiFetch('/rest/v1/log_entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      })

      const savedEntry = Array.isArray(response)
        ? response[0]
        : response || {
            id: `log-${Date.now()}`,
            ...payload,
          }

      // 감정 태그와 log_entry_tags 연결
      if (savedEntry?.id && emotionTags.length > 0) {
        const tagRows = emotionTags
          .map(label => {
            const tag = (emotionKeywords || []).find(
              t => t.label === label || t.name === label,
            )
            if (!tag?.id) return null
            return {
              log_entry_id: savedEntry.id,
              tag_id: tag.id,
            }
          })
          .filter(Boolean)

        if (tagRows.length > 0) {
          try {
            await apiFetch('/rest/v1/log_entry_tags', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify(tagRows),
            })
          } catch (tagErr) {
            console.error(tagErr)
          }
        }
      }

      setDetail(prev => ({
        ...prev,
        saving: false,
        saved: true,
        upload: {
          ...prev.upload,
          raw_text: logText,
          analysis: editedAnalysis,
          activity_types,
          activity_type_details,
        },
        logEntries: savedEntry
          ? [savedEntry, ...(prev.logEntries || [])]
          : prev.logEntries,
        activeLogEntryId: savedEntry?.id || prev.activeLogEntryId,
      }))

      setUploads(prev =>
        prev.map(item =>
          item.id === u.id
            ? {
                ...item,
                raw_text: logText,
                analysis: editedAnalysis,
                activity_types,
                emotion_tags: emotionTags,
                latest_log_entry: savedEntry || item.latest_log_entry,
              }
            : item,
        ),
      )

      alert('데이터가 데이터베이스에 저장되었습니다.')
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
          <div
            style={{
              fontSize: 40,
              marginTop: 12,
              marginBottom: 12,
            }}
          >
            📄
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            PDF 파일을 선택하거나 드래그하세요
          </div>
          <div className="muted">최대 10MB</div>
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
          <p className="section-helper">
            현재까지 업로드된 활동 기록들의 처리 현황을 확인할 수 있습니다.
          </p>
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
              아직 업로드된 파일이 없습니다. 아래 예시 카드로 처리 현황을 확인할 수 있습니다.
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
            const statusLabel = isDone
              ? '처리 완료'
              : isFailed
              ? '실패'
              : '처리 중'

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
              upload.analysis?.activityType ||
              '-'

            const emotionSummary =
              representativeLog?.emotion_tag ||
              upload.analysis?.emotionSummary ||
              '감정 정보 없음'

            const summaryName =
              representativeLog?.activity_name || '대표 활동 없음'

            const shellClass = isFailed
              ? 'card-shell card-shell-md upload-card-shell card-shell-error'
              : isDone
              ? 'card-shell card-shell-md upload-card-shell card-shell-success'
              : 'card-shell card-shell-md upload-card-shell card-shell-processing'

            const steps = upload.steps || {}
            const stepInfoList = STEP_DEFS.map(step => ({
              ...step,
              value: steps[step.key] ?? 0,
            }))
            const allStepsDone =
              stepInfoList.length > 0 &&
              stepInfoList.every(s => (s.value ?? 0) >= 100)
            const firstIncompleteStep = stepInfoList.find(
              s => (s.value ?? 0) < 100,
            )
            const displayStepLabel = allStepsDone
              ? '모든 단계 완료'
              : firstIncompleteStep
              ? `${firstIncompleteStep.label} 진행 중`
              : '대기 중'

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
                    {isDone && (
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => openDetail(upload)}
                        title="상세보기"
                      >
                        상세보기
                      </button>
                    )}
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
                    <p className="card-subtitle">전체 진행률</p>
                    <div className="progress overall-progress">
                      <i style={{ width: `${upload.overall_progress ?? 0}%` }} />
                    </div>
                    <p className="card-title-main">
                      {upload.overall_progress ?? 0}%
                    </p>
                    <p className="card-subtitle current-step-label">
                      {displayStepLabel}
                    </p>
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
                            <i style={{ width: `${step.value}%` }} />
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
                  {detail.upload.file_name} · 업로드{' '}
                  {formatDate(detail.upload.uploaded_at)} · ID #
                  {detail.upload.id}
                </p>
              </div>
              <div className="detail-header-actions">
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
              <div className="error" style={{ marginBottom: 12 }}>
                {detail.error}
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
                        <p className="card-subtitle">
                          AI 분석 결과를 바탕으로 정리된 텍스트입니다.
                        </p>
                      </div>
                      <textarea
                        className="detail-textarea"
                        value={detail.editedText}
                        onChange={e =>
                          setDetail(prev => ({
                            ...prev,
                            editedText: e.target.value,
                          }))
                        }
                        placeholder="원본 텍스트를 편집하여 저장할 수 있습니다."
                      />
                      <p className="detail-helper-text">
                        텍스트를 수정하면 활동 기록과 함께 데이터베이스에 저장됩니다.
                      </p>
                    </div>
                  </section>

                  <section className="detail-right">
                    {(() => {
                      const a =
                        detail.editedAnalysis || detail.upload.analysis || {}
                      const studentsText =
                        (a.students || [])
                          .map(s =>
                            s.realName
                              ? `${s.name || ''}(${s.realName})`
                              : s.name || s.realName || '',
                          )
                          .filter(Boolean)
                          .join(', ') || detail.upload.student_name

                      const dateValue = a.date
                        ? formatDate(a.date)
                        : formatDate(detail.upload.uploaded_at) || ''

                      const { hours, minutes } = splitDuration(
                        a.durationMinutes,
                      )
                      const safeHours = Number.isNaN(hours) ? 0 : hours
                      const safeMinutes = Number.isNaN(minutes) ? 0 : minutes

                      return (
                        <div className="analysis-panel">
                          <div className="analysis-panel-header">
                            <h4>AI 분석 결과 (편집 가능)</h4>
                            <p className="card-subtitle">
                              활동 이름, 날짜, 활동 유형을 정리할 수 있습니다.
                            </p>
                          </div>

                          <div className="analysis-scroll-panel">
                            {/* 활동 기본 정보 */}
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

                            {/* 감정 키워드 (전체 세트 X, 선택된 것만 + 검색/추가) */}
                            <div className="analysis-section">
                              <div className="analysis-section-head">
                                <div>
                                  <h5>감정 키워드</h5>
                                  <p className="section-helper">
                                    추출된 감정만 선택해서 관리하고, 입력창에서 검색 또는
                                    직접 추가할 수 있습니다.
                                  </p>
                                </div>
                              </div>
                              <EmotionKeywordSelector
                                masterList={emotionKeywords}
                                selected={
                                  (detail.editedAnalysis ||
                                    detail.upload?.analysis ||
                                    {}).emotionTags || []
                                }
                                onToggle={label =>
                                  toggleEmotionTagInDetail(label)
                                }
                                onAddNew={label =>
                                  addEmotionKeywordInSupabase(label)
                                }
                              />
                            </div>

                            {/* 활동 유형 선택 (상세보기 버튼 없음) */}
                            <div className="analysis-section">
                              <div className="analysis-section-head">
                                <div>
                                  <h5>활동 유형 선택 (중복 선택 가능)</h5>
                                  <p className="section-helper">
                                    체크된 활동 유형은 대시보드 통계에 반영됩니다.
                                  </p>
                                </div>
                              </div>
                              <div className="activity-type-grid">
                                {Object.entries(detail.activityTypes || {}).map(
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

                {/* 모달 하단 공통 저장 버튼 */}
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
                  <div key={item.id || item.log_id} className="activity-detail-row">
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
                  }회의 활동을 수행했으며, ${activityTypeCount || 0}가지 유형을 경험했습니다.`}
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
      {/* 선택된 감정만 Chip으로 표시 */}
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

      {/* 입력 + 추가/검색 */}
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

      {/* 세트에서 검색된 감정 제안 */}
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
