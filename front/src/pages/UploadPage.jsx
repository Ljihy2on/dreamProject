import React, { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import Layout from '../components/Layout'

// ---------- 헬퍼들 ----------

function normalizeUploads(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.items)) return data.items
  if (data && Array.isArray(data.uploads)) return data.uploads
  return []
}

function normalizeAnalysis(raw) {
  const a = raw.analysis || {}
  const legacyEmotion = raw.emotion_tag || a.emotion || a.emotionSummary

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
    rawTextCleaned:
      a.rawTextCleaned ||
      raw.rawTextCleaned ||
      raw.raw_text_cleaned ||
      raw.raw_text ||
      '',
  }
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
    '학생 미지정'
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

function formatDuration(mins) {
  if (mins == null) return ''
  const total = Number(mins)
  if (Number.isNaN(total) || total <= 0) return ''
  if (total < 60) return `${total}분`
  const h = Math.floor(total / 60)
  const m = total % 60
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

// 분 → { hours, minutes } 로 나누기
function splitDuration(mins) {
  const total = Number(mins)
  if (Number.isNaN(total) || total < 0) {
    return { hours: 0, minutes: 0 }
  }
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return { hours, minutes }
}

// 분 → "HH:MM" 문자열
function durationToHHMM(mins) {
  const total = Number(mins)
  if (Number.isNaN(total) || total < 0) return null
  const h = Math.floor(total / 60)
  const m = total % 60
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}`
}

const STEP_DEFS = [
  { key: 'upload', label: '파일 업로드' },
  { key: 'extract', label: '텍스트 추출' },
  { key: 'ocr', label: 'OCR 분석' },
  { key: 'sentiment', label: '감정 분석' },
]

// ---------- 페이지 컴포넌트 ----------

export default function UploadPage() {
  const fileRef = useRef(null)

  const [uploads, setUploads] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const [detail, setDetail] = useState({
    open: false,
    loading: false,
    upload: null,
    error: '',
    saving: false,
    saved: false,
    editing: false,
    editedText: '',
    editedAnalysis: null,
  })

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

  useEffect(() => {
    fetchUploads()
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
        setUploads(prev =>
          prev.map(u => (u.id === tempId ? { ...u, status: 'failed' } : u)),
        )
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

  function openDetail(upload) {
    setDetail({
      open: true,
      loading: true,
      upload: null,
      error: '',
      saving: false,
      saved: false,
      editing: false,
      editedText: '',
      editedAnalysis: null,
    })

    apiFetch(`/uploads/${upload.id}`)
      .then(data => {
        const hydrated = hydrateUpload({ ...upload, ...(data || {}) })
        const initialText =
          hydrated.raw_text ||
          hydrated.analysis?.rawTextCleaned ||
          ''
        const initialAnalysis = { ...(hydrated.analysis || {}) }

        setDetail({
          open: true,
          loading: false,
          upload: hydrated,
          error: '',
          saving: false,
          saved: false,
          editing: false,
          editedText: initialText,
          editedAnalysis: initialAnalysis,
        })
      })
      .catch(err => {
        console.error(err)
        const initialText =
          upload.raw_text ||
          upload.analysis?.rawTextCleaned ||
          ''
        const initialAnalysis = { ...(upload.analysis || {}) }

        setDetail({
          open: true,
          loading: false,
          upload,
          error: '상세 정보를 불러오지 못했습니다. 기본 정보만 표시합니다.',
          saving: false,
          saved: false,
          editing: false,
          editedText: initialText,
          editedAnalysis: initialAnalysis,
        })
      })
  }

  function closeDetail() {
    setDetail({
      open: false,
      loading: false,
      upload: null,
      error: '',
      saving: false,
      saved: false,
      editing: false,
      editedText: '',
      editedAnalysis: null,
    })
  }

  // editedAnalysis 일부 필드 업데이트
  function updateEditedAnalysis(patch) {
    setDetail(prev => ({
      ...prev,
      editedAnalysis: {
        ...(prev.editedAnalysis || prev.upload?.analysis || {}),
        ...patch,
      },
    }))
  }

  // ---------- log_entries 저장 ----------

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

    const payload = {
      log_date: editedAnalysis.date || u.log_date || today,
      student_id: studentId,
      observer_id: observerId,
      emotion_tag: editedAnalysis.emotionSummary || null,
      activity_tags: {
        activityType: editedAnalysis.activityType || null,
        note: editedAnalysis.note || null,
        ability: editedAnalysis.ability || [],
        // ⬇ 여기 두 개가 새로 저장되는 값
        duration_minutes: durationMinutes,
        duration_hhmm: durationHHMM,
      },
      log_content: logText,
      related_metrics: {
        score: editedAnalysis.score ?? null,
        level: editedAnalysis.level || null,
      },
      source_file_path: u.storage_key || u.file_name || null,
    }

    try {
      setDetail(prev => ({ ...prev, saving: true }))

      await apiFetch('/rest/v1/log_entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(payload),
      })

      // 모달 상태 업데이트 (텍스트 + 분석 값 반영)
      setDetail(prev => ({
        ...prev,
        saving: false,
        saved: true,
        editing: false,
        upload: {
          ...prev.upload,
          raw_text: logText,
          analysis: editedAnalysis,
        },
      }))

      // 리스트 쪽 uploads 도 동기화
      setUploads(prev =>
        prev.map(item =>
          item.id === u.id
            ? { ...item, raw_text: logText, analysis: editedAnalysis }
            : item,
        ),
      )

      alert('활동 기록이 저장되었습니다.')
    } catch (e) {
      console.error(e)
      setDetail(prev => ({ ...prev, saving: false, saved: false }))
      alert('저장 중 오류가 발생했습니다.')
    }
  }

  // ---------- 리스트 + 예시 ----------

  const safeUploads = Array.isArray(uploads) ? uploads : []

  const SAMPLE_UPLOADS = [
    {
      id: 'sample-1',
      file_name: '활동기록_배짱_2025-10-27.pdf',
      student_name: '배짱(김배짱)',
      uploaded_at: '2025-10-27',
      status: 'done',
      steps: { upload: 100, extract: 100, ocr: 100, sentiment: 100 },
      overall_progress: 100,
      demo: true,
    },
    {
      id: 'sample-2',
      file_name: '활동기록_팽팽_2025-10-26.pdf',
      student_name: '팽팽(박팽팽)',
      uploaded_at: '2025-10-26',
      status: 'processing',
      steps: { upload: 100, extract: 80, ocr: 60, sentiment: 20 },
      overall_progress: 65,
      demo: true,
    },
    {
      id: 'sample-3',
      file_name: '활동기록_지원_2025-10-25.pdf',
      student_name: '지원(우지원)',
      uploaded_at: '2025-10-25',
      status: 'failed',
      steps: { upload: 100, extract: 40, ocr: 0, sentiment: 0 },
      overall_progress: 40,
      demo: true,
    },
  ]

  const hasRealUploads = safeUploads.length > 0
  const listToRender = hasRealUploads ? safeUploads : SAMPLE_UPLOADS

  // ---------- 렌더 ----------

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
          ></div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            PDF 파일을 선택하거나 드래그하세요
          </div>
          <div className="muted">최대 10MB</div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
      </section>

      {/* 처리 현황 */}
      <section className="upload-status-section">
        <div className="section-header">
          <h2>처리 현황</h2>
          <p className="muted">
            업로드된 파일의 처리 상태를 확인하세요. 완료된 항목을 클릭하면
            상세 내용을 확인할 수 있습니다.
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
          {!hasRealUploads && !loading && !error && (
            <div className="muted" style={{ marginBottom: 10, fontSize: 13 }}>
              아직 업로드된 파일이 없습니다. 아래 예시는 실제 업로드 시
              표시되는 처리 현황의 예시입니다.
            </div>
          )}

          {listToRender.map(upload => {
            const rawStatus = upload.status
            const isDone =
              rawStatus === 'done' ||
              rawStatus === 'success' ||
              rawStatus === 'completed'
            const isFailed = rawStatus === 'failed' || rawStatus === 'error'

            const isDemo = upload.demo

            const cardClass = isFailed
              ? 'upload-card upload-card-failed'
              : isDone
              ? 'upload-card upload-card-success'
              : 'upload-card upload-card-processing'

            const expanded = expandedId === upload.id

            return (
              <div key={upload.id} className={cardClass}>
                <div className="upload-card-header">
                  <div className="upload-card-main">
                    <div className="upload-card-title-row">
                      <span className="status-icon">
                        {isDone ? '✅' : isFailed ? '❌' : '🔄'}
                      </span>
                      <span className="upload-file-name">
                        {upload.file_name}
                      </span>
                      {isDemo && <span className="demo-label">예시</span>}
                    </div>

                    <div className="upload-card-meta">
                      <span>
                        학생: <strong>{upload.student_name}</strong>
                      </span>
                      {upload.uploaded_at && (
                        <>
                          <span className="meta-sep">|</span>
                          <span>업로드: {formatDate(upload.uploaded_at)}</span>
                        </>
                      )}
                    </div>

                    <div className="upload-card-progress-row">
                      <span className="muted">전체 진행률</span>
                      <span className="muted">
                        {upload.overall_progress ?? 0}%
                      </span>
                    </div>
                    
                    <div className="progress overall-progress">
                      <i
                        style={{
                          width: `${upload.overall_progress ?? 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="upload-card-actions">
                    {/* 완료된 항목만 상세보기 노출 */}
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

                    <span
                      className={
                        isDone
                          ? 'status-pill status-pill-success'
                          : isFailed
                          ? 'status-pill status-pill-failed'
                          : 'status-pill status-pill-processing'
                      }
                    >
                      {isDone ? '완료' : isFailed ? '실패' : '처리중'}
                    </span>
                  </div>
                </div>

                {isDone && !isDemo && expanded && (
                  <div className="upload-card-steps">
                    {STEP_DEFS.map(step => {
                      const value = upload.steps?.[step.key] ?? 0
                      return (
                        <div key={step.key} className="step-row">
                          <div className="step-label">{step.label}</div>
                          <div className="step-progress-wrap">
                            <div className="progress step-progress">
                              <i style={{ width: `${value}%` }} />
                            </div>
                            <span className="step-percent">{value}%</span>
                          </div>
                        </div>
                      )
                    })}
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
          <div className="modal-card modal-card-wide">
            <button
              className="modal-close"
              aria-label="닫기"
              onClick={closeDetail}
            >
              ✕
            </button>

            <div className="detail-header-row">
              <h3>텍스트 추출 및 분석 결과</h3>
              <div className="detail-header-actions">
                <button
                  type="button"
                  className={
                    detail.editing ? 'btn secondary active' : 'btn secondary'
                  }
                  onClick={() =>
                    setDetail(prev => ({
                      ...prev,
                      editing: !prev.editing,
                    }))
                  }
                >
                  {detail.editing ? '수정 중' : '수정'}
                </button>

                <button
                  className="btn"
                  onClick={handleSaveLogEntry}
                  disabled={detail.saving || detail.saved}
                >
                  {detail.saved
                    ? '저장됨'
                    : detail.saving
                    ? '저장 중...'
                    : '저장'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 4 }}>
              <span className="muted">{detail.upload.file_name}</span>
            </div>
            {detail.error && (
              <div className="error" style={{ marginBottom: 8 }}>
                {detail.error}
              </div>
            )}

            {detail.loading ? (
              <div className="muted">불러오는 중입니다...</div>
            ) : (
              <div className="detail-layout">
                {/* 왼쪽: 추출 텍스트 */}
                <section className="detail-left">
                  <h4>추출된 텍스트</h4>

                  {detail.editing ? (
                    <textarea
                      className="detail-textarea"
                      value={detail.editedText}
                      onChange={e =>
                        setDetail(prev => ({
                          ...prev,
                          editedText: e.target.value,
                        }))
                      }
                      placeholder="추출된 텍스트를 편집할 수 있습니다."
                    />
                  ) : (
                    <div className="detail-text-box">
                      {(
                        detail.editedText ||
                        detail.upload.raw_text ||
                        detail.upload.analysis?.rawTextCleaned ||
                        ''
                      ) || '아직 추출된 텍스트가 없습니다.'}
                    </div>
                  )}
                </section>

                {/* 오른쪽: 활동 정보 + 수행/능력 + 감정 분석 */}
                <section className="detail-right">
                  {(() => {
                    const a =
                      detail.editedAnalysis ||
                      detail.upload.analysis ||
                      {}

                    // ----- 활동 정보 카드 -----
                    const abilityList = Array.isArray(a.ability)
                      ? a.ability
                      : []

                    const abilityString = abilityList.join(', ')

                    const students =
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

                    return (
                      <>
                        {/* 활동 정보 */}
                        <div className="analysis-card activity-info-card">
                          <h5>활동 정보</h5>
                          <dl className="activity-info-grid">
                            <div>
                              <dt>학생</dt>
                              <dd>{students || '-'}</dd>
                            </div>
                            <div>
                              <dt>날짜</dt>
                              <dd>
                                {detail.editing ? (
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
                                ) : (
                                  dateValue || '-'
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>활동명</dt>
                              <dd>
                                {detail.editing ? (
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
                                ) : (
                                  a.activityName || '-'
                                )}
                              </dd>
                            </div>

                            <div>
                              <dt>소요 시간</dt>
                              <dd>
                                {detail.editing ? (
                                  (() => {
                                    const { hours, minutes } = splitDuration(a.durationMinutes)

                                    const safeHours = Number.isNaN(hours) ? 0 : hours
                                    const safeMinutes = Number.isNaN(minutes) ? 0 : minutes

                                    return (
                                    <div className="time-input-group">
                                      <input
                                        type="number"
                                        min="0"
                                        className="analysis-input time-input"
                                        value={safeHours}
                                        onChange={e => {
                                          const h = Math.max(0, Number(e.target.value || 0))
                                          const newMinutes = safeMinutes
                                          updateEditedAnalysis({
                                          durationMinutes: h * 60 + newMinutes,
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
                                        let m = Math.max(0, Number(e.target.value || 0))
                                        if (m > 59) m = 59
                                        const h = safeHours
                                        updateEditedAnalysis({
                                        durationMinutes: h * 60 + m,
                                      })
                                    }}
                                  />
                                  <span className="time-separator">분</span>
                                </div>
                                  )
                                })()
                              ) : (
                                (a.durationMinutes && formatDuration(a.durationMinutes)) || '-'
                              )}
                              </dd>
                            </div>

                            <div>
                              <dt>활동 유형</dt>
                              <dd>
                                {detail.editing ? (
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
                                ) : (
                                  a.activityType || '-'
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>비고</dt>
                              <dd>
                                {detail.editing ? (
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
                                ) : (
                                  a.note || '-'
                                )}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {/* 수행 수준 & 능력 */}
                        <div className="analysis-card performance-card">
                          <h5>활동 수행 & 능력 분석</h5>

                          <div className="performance-row">
                            <div className="performance-item">
                              <span className="label">수행 수준</span>
                              <span className="value">
                                {detail.editing ? (
                                  <input
                                    type="text"
                                    className="analysis-input"
                                    value={a.level || ''}
                                    onChange={e =>
                                      updateEditedAnalysis({
                                        level: e.target.value,
                                      })
                                    }
                                  />
                                ) : (
                                  a.level || '평가 없음'
                                )}
                              </span>
                            </div>
                            <div className="performance-item">
                              <span className="label">종합 점수</span>
                              <span className="value score">
                                {detail.editing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    className="analysis-input"
                                    value={a.score ?? ''}
                                    onChange={e =>
                                      updateEditedAnalysis({
                                        score:
                                          e.target.value === ''
                                            ? null
                                            : Number(e.target.value),
                                      })
                                    }
                                  />
                                ) : a.score != null ? (
                                  `${a.score}점`
                                ) : (
                                  '점수 없음'
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="ability-chips-row">
                            <span className="label">주요 능력</span>
                            <div className="chips">
                              {detail.editing ? (
                                <input
                                  type="text"
                                  className="analysis-input"
                                  value={abilityString}
                                  placeholder="예: 협동, 소근육, 집중력"
                                  onChange={e =>
                                    updateEditedAnalysis({
                                      ability: e.target.value
                                        .split(',')
                                        .map(s => s.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                />
                              ) : abilityList.length > 0 ? (
                                abilityList.map((ab, idx) => (
                                  <span key={idx} className="skill-chip">
                                    {ab}
                                  </span>
                                ))
                              ) : (
                                <span className="muted">
                                  표시할 능력이 없습니다.
                                </span>
                              )}
                            </div>
                          </div>

                          {detail.editing ? (
                            <textarea
                              className="analysis-textarea"
                              placeholder="점수가 어떻게 산출되었는지 설명을 적어주세요."
                              value={a.scoreExplanation || ''}
                              onChange={e =>
                                updateEditedAnalysis({
                                  scoreExplanation: e.target.value,
                                })
                              }
                            />
                          ) : (
                            a.scoreExplanation && (
                              <p className="performance-explain">
                                {a.scoreExplanation}
                              </p>
                            )
                          )}
                        </div>

                        {/* 감정 / 감정 원인 / 관찰된 행동 */}
                        <div className="analysis-card">
                          <h5>감정</h5>
                          {detail.editing ? (
                            <textarea
                              className="analysis-textarea"
                              placeholder="예: 기쁨, 뿌듯함, 만족감"
                              value={a.emotionSummary || ''}
                              onChange={e =>
                                updateEditedAnalysis({
                                  emotionSummary: e.target.value,
                                })
                              }
                            />
                          ) : (
                            <p>{a.emotionSummary || '분석 결과 없음'}</p>
                          )}
                        </div>

                        <div className="analysis-card">
                          <h5>감정 원인 (추정)</h5>
                          {detail.editing ? (
                            <textarea
                              className="analysis-textarea"
                              placeholder="감정이 생기게 된 상황을 요약해서 적어주세요."
                              value={a.emotionCause || ''}
                              onChange={e =>
                                updateEditedAnalysis({
                                  emotionCause: e.target.value,
                                })
                              }
                            />
                          ) : (
                            <p>{a.emotionCause || '분석 결과 없음'}</p>
                          )}
                        </div>

                        <div className="analysis-card">
                          <h5>관찰된 행동</h5>
                          {detail.editing ? (
                            <textarea
                              className="analysis-textarea"
                              placeholder="관찰된 행동을 구체적으로 적어주세요."
                              value={a.observedBehaviors || ''}
                              onChange={e =>
                                updateEditedAnalysis({
                                  observedBehaviors: e.target.value,
                                })
                              }
                            />
                          ) : (
                            <p>{a.observedBehaviors || '분석 결과 없음'}</p>
                          )}
                        </div>
                      </>
                    )
                  })()}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
