// src/pages/Report.jsx
import React, { useEffect, useState, useMemo } from 'react'
import Layout from '../components/Layout.jsx'
import { apiFetch } from '../lib/api.js'

// 프론트 단에서 env 그대로 다시 읽어옴 (api.js 안과 동일한 규칙)
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK || '0') === '1'

/**
 * 리포트 센터
 * - report_runs + report_outputs 기반으로
 *   "생성된 리포트(PDF)" 목록을 보여주고,
 *   필터/다운로드/삭제를 지원한다.
 */
export default function Report() {
  const [filterMode, setFilterMode] = useState('range') // 'range' | 'single'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [singleDate, setSingleDate] = useState('')
  const [category, setCategory] = useState('all')
  const [studentId, setStudentId] = useState('all')
  const [purpose, setPurpose] = useState('all') // 학부모 상담용 / 학교 제출용 등

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [nowTs, setNowTs] = useState(Date.now()) // 남은 시간 계산용 시각

  // 🔹 시작일 > 종료일인 경우 검증
  const isInvalidRange =
    filterMode === 'range' &&
    startDate &&
    endDate &&
    startDate > endDate

  // 데모용 더미 데이터 (백엔드가 아직 없어도 UI 확인 가능)
  const demoReports = [
    {
      id: 'demo-1',
      templateCode: 'full_summary',
      templateName: '전체 리포트',
      studentName: '배짱(김배짱)',
      periodLabel: '분석 기간: 2025-10-01 ~ 2025-10-31',
      categoryLabel: '카테고리: 전체',
      purposeCode: 'parent',
      purposeLabel: '학부모 상담용',
      status: 'completed',
      createdAt: '2025-10-24T10:00:00+09:00',
      expiresAt: '2025-10-31T10:00:00+09:00',
      outputs: ['pdf'],
    },
    {
      id: 'demo-2',
      templateCode: 'school_submit',
      templateName: '학교 제출용 리포트',
      studentName: '팽팽(박팽팽)',
      periodLabel: '분석 기간: 2025-10-15 ~ 2025-11-15',
      categoryLabel: '카테고리: 전체',
      purposeCode: 'school',
      purposeLabel: '학교 제출용',
      status: 'completed',
      createdAt: '2025-11-08T14:00:00+09:00',
      expiresAt: '2025-11-15T14:00:00+09:00',
      outputs: ['pdf'],
    },
  ]

  // 상태 → 라벨/색 구하기 (필요 시 카드에서 사용)
  function getStatusLabel(status) {
    switch (status) {
      case 'completed':
      case 'ready':
        return '준비됨'
      case 'running':
      case 'processing':
        return '생성 중'
      case 'queued':
        return '대기 중'
      case 'failed':
        return '실패'
      default:
        return status || ''
    }
  }

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'completed':
      case 'ready':
        return 'report-status-badge success'
      case 'running':
      case 'processing':
        return 'report-status-badge running'
      case 'queued':
        return 'report-status-badge queued'
      case 'failed':
        return 'report-status-badge failed'
      default:
        return 'report-status-badge'
    }
  }

  // 🔹 남은 시간 / 만료 여부 계산
  function getRemainingInfo(report) {
    const created = new Date(report.createdAt)
    const expires = report.expiresAt
      ? new Date(report.expiresAt)
      : new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000)

    const totalMs = Math.max(0, expires.getTime() - created.getTime())
    const now = nowTs
    const remainingMs = Math.max(0, expires.getTime() - now)
    const expired = remainingMs <= 0

    // 진행률: 남은 비율(0~1)
    const ratio = totalMs > 0 ? remainingMs / totalMs : 0
    const percent = Math.round(ratio * 100)

    // 시/분/초로 표시
    const sec = Math.floor(remainingMs / 1000)
    const hours = Math.floor(sec / 3600)
    const minutes = Math.floor((sec % 3600) / 60)
    const seconds = sec % 60

    let label = ''
    if (expired) {
      label = '만료됨'
    } else {
      label = `${hours}시간 ${minutes}분 ${seconds}초`
    }

    return {
      label,
      expired,
      percent,
    }
  }

  // 실제로는 report_runs + report_outputs join 결과를
  // 리턴하는 API를 붙이면 됨.
  async function fetchReports() {
    setLoading(true)
    setError(null)

    try {
      const qs = new URLSearchParams()

      if (filterMode === 'range') {
        if (startDate) qs.append('from', startDate)
        if (endDate) qs.append('to', endDate)
      } else if (filterMode === 'single' && singleDate) {
        qs.append('on', singleDate)
      }

      if (category && category !== 'all') {
        qs.append('category', category)
      }
      if (studentId && studentId !== 'all') {
        qs.append('student_id', studentId)
      }
      if (purpose && purpose !== 'all') {
        qs.append('purpose', purpose)
      }

      const url = qs.toString() ? `/report-runs?${qs}` : '/report-runs'
      let data = null

      try {
        data = await apiFetch(url)
      } catch (e) {
        // 아직 API 없을 수 있으니, 아래 catch에서 예시 데이터로 대체
        throw e
      }

      const runs = Array.isArray(data?.runs) ? data.runs : data || []

      const normalized = runs.map(run => {
        const params = run.params || {}
        const template = run.template || {}
        const outputs = run.outputs || []

        const hasPdf = outputs.some(o => o.kind === 'pdf')
        const hasXlsx =
          outputs.some(o => o.kind === 'xlsx' || o.kind === 'excel')

        const from = params.from ?? params.start_date
        const to = params.to ?? params.end_date

        const purposeCode =
          run.purpose_code ?? params.purpose_code ?? params.purpose
        const purposeLabel =
          run.purpose_label ??
          params.purpose_label ??
          (purposeCode === 'parent'
            ? '학부모 상담용'
            : purposeCode === 'school'
            ? '학교 제출용'
            : '리포트')

        const createdAt = run.created_at
        const expiresAt =
          run.expires_at ??
          (createdAt
            ? new Date(
                new Date(createdAt).getTime() +
                  7 * 24 * 60 * 60 * 1000,
              ).toISOString()
            : null)

        const firstPdf = outputs.find(o => o.kind === 'pdf') || null

        return {
          id: run.id,
          templateCode: template.code ?? run.template_code,
          templateName: template.name ?? run.template_name ?? '리포트',
          studentName:
            params.student_name ?? params.student_label ?? '학생',
          periodLabel:
            from && to
              ? `분석 기간: ${from} ~ ${to}`
              : from
              ? `분석 기간: ${from} ~`
              : '',
          categoryLabel:
            params.category_label ??
            (params.category ? `카테고리: ${params.category}` : ''),
          purposeCode,
          purposeLabel,
          status: run.status,
          createdAt,
          expiresAt,
          outputs: [
            hasPdf ? 'pdf' : null,
            hasXlsx ? 'xlsx' : null,
          ].filter(Boolean),
          // 백엔드에서 직접 download_url 을 내려주면 그것을 사용
          downloadPath:
            firstPdf?.download_url ||
            (firstPdf?.id
              ? `/report-outputs/${firstPdf.id}/download`
              : null),
        }
      })

      // API에서 아무것도 안 오면 데모 데이터 사용
      setReports(normalized.length ? normalized : demoReports)
    } catch (err) {
      console.error(err)
      setError(
        '리포트 목록을 불러오지 못했습니다. (예시 데이터를 표시합니다)',
      )
      setReports(demoReports)
    } finally {
      setLoading(false)
    }
  }

  // 최초 진입 시 목록 조회
  useEffect(() => {
    fetchReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 남은 시간 표시용 타이머 (1초마다 nowTs 갱신)
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTs(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 만료된 리포트는 목록에서 제거 (보이지 않음)
  const activeReports = useMemo(
    () =>
      reports.filter(r => {
        const { expired } = getRemainingInfo(r)
        return !expired
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, nowTs],
  )

  const totalCount = activeReports.length

  function handleFilterSubmit(e) {
    e.preventDefault()

    if (filterMode === 'range' && isInvalidRange) {
      alert(
        '시작일이 종료일보다 늦을 수 없습니다. 기간을 다시 선택해주세요.',
      )
      return
    }

    // 여기서는 "조회" 역할만 수행.
    // 실제 백엔드에서는 이 필터 정보로 AI 리포트 생성 + 저장까지 처리.
    fetchReports()
  }

  function handleResetFilters() {
    setFilterMode('range')
    setStartDate('')
    setEndDate('')
    setSingleDate('')
    setCategory('all')
    setStudentId('all')
    setPurpose('all')
    fetchReports()
  }

  // 상세보기는 아직 UI/UX 미정이므로 자리만 만들어두기
  function handleViewDetail(report) {
    console.log('리포트 상세보기 (추후 구현 예정): ', report.id)
    alert('상세보기 페이지는 추후에 구현할 예정입니다.')
  }

  // 삭제 버튼
  async function handleDelete(report) {
    if (
      !window.confirm(
        '해당 리포트를 삭제하시겠습니까? (삭제 후에는 다시 다운로드할 수 없습니다.)',
      )
    )
      return

    try {
      if (!USE_MOCK) {
        await apiFetch(`/report-runs/${report.id}`, {
          method: 'DELETE',
        })
      }
      setReports(prev => prev.filter(r => r.id !== report.id))
    } catch (e) {
      console.error(e)
      alert('리포트 삭제 중 오류가 발생했습니다.')
    }
  }

  // PDF 다운로드
  async function handleDownload(report) {
    const { expired } = getRemainingInfo(report)
    if (expired) {
      alert('이미 만료된 리포트입니다. 다시 생성해 주세요.')
      return
    }

    try {
      // 데모 모드에서는 간단한 PDF 비슷한 파일을 생성해서 다운로드
      if (USE_MOCK) {
        const content = [
          `데모 리포트 (PDF 형식 아님)`,
          '',
          `템플릿: ${report.templateName}`,
          `학생: ${report.studentName}`,
          report.periodLabel,
          report.categoryLabel,
          `용도: ${report.purposeLabel}`,
        ].join('\n')

        const blob = new Blob([content], {
          type: 'application/pdf',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${report.studentName}_${report.templateName}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        return
      }

      // 실제 백엔드 연동 시
      const token = localStorage.getItem('token') || ''
      const headers = token
        ? { Authorization: `Bearer ${token}` }
        : {}

      const path =
        report.downloadPath ||
        `/report-runs/${report.id}/download?format=pdf`

      const res = await fetch(
        path.startsWith('http') ? path : API_BASE + path,
        {
          method: 'GET',
          headers,
        },
      )

      if (!res.ok) {
        throw new Error('리포트 파일을 다운로드할 수 없습니다.')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${report.studentName}_${report.templateName}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('다운로드 중 오류가 발생했습니다.')
    }
  }

  return (
    <Layout title="">
      <div className="main-shell">
        <div className="main-inner report-page">
          {/* 상단 설명 */}
          <header className="report-header">
            <p className="muted">
              날짜와 카테고리를 선택하여 리포트를 필터링하고 다운로드할
              수 있습니다.
            </p>
          </header>

          {/* 필터 카드 */}
          <section className="report-filter-card">
            <form onSubmit={handleFilterSubmit}>
              <div className="report-filter-title-row">
                <div className="filter-icon">🧾</div>
                <div>
                  <div className="card-title">필터 설정</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    날짜, 카테고리, 학생을 선택하여 원하는 리포트만 모아볼 수
                    있어요.
                  </div>
                </div>
              </div>

              {/* 날짜 필터 방식 */}
              <div className="report-filter-block">
                <div className="filter-label-row">
                  <span className="filter-label">날짜 필터 방식</span>
                  <span className="filter-mode-text muted">
                    리포트를 생성한 날짜 기준으로 검색합니다.
                  </span>
                </div>
                <div className="filter-radio-row">
                  <button
                    type="button"
                    className={
                      filterMode === 'range'
                        ? 'filter-toggle active'
                        : 'filter-toggle'
                    }
                    onClick={() => setFilterMode('range')}
                  >
                    날짜 범위
                  </button>
                  <button
                    type="button"
                    className={
                      filterMode === 'single'
                        ? 'filter-toggle active'
                        : 'filter-toggle'
                    }
                    onClick={() => setFilterMode('single')}
                  >
                    특정 날짜
                  </button>
                </div>
              </div>

              {/* 날짜 + 카테고리 + 학생 + 용도 */}
              <div className="report-filter-grid">
                {filterMode === 'range' ? (
                  <>
                    <div className="filter-field">
                      <label>시작 날짜</label>
                      <input
                        type="date"
                        value={startDate}
                        max={endDate || undefined}
                        onChange={e => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="filter-field">
                      <label>종료 날짜</label>
                      <input
                        type="date"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={e => setEndDate(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="filter-field">
                    <label>특정 날짜</label>
                    <input
                      type="date"
                      value={singleDate}
                      onChange={e => setSingleDate(e.target.value)}
                    />
                  </div>
                )}

                <div className="filter-field">
                  <label>카테고리</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="report-select"
                  >
                    <option value="all">전체</option>
                    <option value="full">전체 리포트</option>
                    <option value="emotion">감정 변화</option>
                    <option value="activity_ratio">활동 비율 변화</option>
                    <option value="ability_growth">능력 성장 곡선</option>
                  </select>
                </div>

                <div className="filter-field">
                  <label>학생</label>
                  <select
                    value={studentId}
                    onChange={e => setStudentId(e.target.value)}
                    className="report-select"
                  >
                    <option value="all">전체</option>
                    <option value="jiwon-u">지원(우지원)</option>
                    <option value="jiwon-a">지원(안지원)</option>
                  </select>
                </div>

                <div className="filter-field">
                  <label>용도</label>
                  <select
                    value={purpose}
                    onChange={e => setPurpose(e.target.value)}
                    className="report-select"
                  >
                    <option value="all">전체</option>
                    <option value="parent">학부모 상담용</option>
                    <option value="school">학교 제출용</option>
                  </select>
                </div>
              </div>

              {/* 하단: 개수 + 버튼들 */}
              <div className="report-filter-footer">
                <span className="muted">
                  총 <strong>{totalCount}</strong>개의 리포트
                </span>

                <div className="report-filter-actions">
                  <button
                    type="button"
                    className="btn secondary report-reset-btn"
                    onClick={handleResetFilters}
                  >
                    필터 초기화
                  </button>
                  <button type="submit" className="btn">
                    적용하기
                  </button>
                </div>
              </div>

              {isInvalidRange && (
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    color: '#EF4444',
                    marginTop: 4,
                  }}
                >
                  시작일이 종료일보다 늦을 수 없습니다. 날짜를 다시
                  선택해 주세요.
                </div>
              )}
            </form>
          </section>

          {/* 리포트 카드 리스트 */}
          <section>
            {loading ? (
              <div style={{ marginTop: 16 }}>불러오는 중...</div>
            ) : (
              <>
                {error && (
                  <div className="error" style={{ marginBottom: 10 }}>
                    {error}
                  </div>
                )}

                <div className="report-list-grid">
                  {activeReports.map(report => {
                    const remaining = getRemainingInfo(report)
                    const canDownload = report.outputs.includes('pdf')

                    return (
                      <article key={report.id} className="report-card">
                        <div className="report-card-header">
                          <div className="report-card-icon-wrap">
                            <div className="report-card-icon">📄</div>
                          </div>
                          <div className="report-card-title-block">
                            <div className="report-card-title">
                              {report.studentName}
                            </div>
                            <div className="report-purpose-badge">
                              {report.purposeLabel}
                            </div>
                            <div className="report-card-meta">
                              <div>{report.periodLabel}</div>
                              <div>{report.categoryLabel}</div>
                            </div>
                          </div>
                          <div className="report-card-status">
                            <span
                              className={getStatusBadgeClass(report.status)}
                            >
                              {getStatusLabel(report.status)}
                            </span>
                          </div>
                        </div>

                        {/* 남은 시간 + 진행 바 */}
                        <div className="report-remaining-row">
                          <span className="muted">
                            ⏱ 남은 시간: {remaining.label}
                          </span>
                        </div>
                        <div className="report-deadline-progress">
                          <div className="report-deadline-bar">
                            <div
                              className="report-deadline-inner"
                              style={{
                                width: `${remaining.percent}%`,
                              }}
                            />
                          </div>
                        </div>

                        <div className="report-card-footer">
                          <div className="report-card-footer-left">
                            <span className="muted report-created-at">
                              생성일:{' '}
                              {report.createdAt
                                ? report.createdAt.slice(0, 10)
                                : '-'}
                            </span>
                          </div>
                          <div className="report-card-actions report-card-actions-col">
                            <button
                              type="button"
                              className="btn report-btn"
                              onClick={() => handleViewDetail(report)}
                            >
                              상세보기
                            </button>
                            <button
                              type="button"
                              className="btn secondary report-btn"
                              disabled={!canDownload}
                              onClick={() => handleDownload(report)}
                            >
                              다운로드
                            </button>
                            <button
                              type="button"
                              className="btn danger-outline report-btn"
                              onClick={() => handleDelete(report)}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </Layout>
  )
}

export { Report }
