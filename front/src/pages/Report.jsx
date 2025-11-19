// src/pages/ReportPreview.jsx
import React, { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { apiFetch } from '../lib/api.js'

/**
 * 리포트 센터
 * - report_templates, report_runs, report_outputs 구조를 기준으로
 *   "리포트 실행 이력"을 카드 형태로 보여주는 페이지
 */
export default function ReportPreview() {
  const [filterMode, setFilterMode] = useState('range') // 'range' | 'single'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [singleDate, setSingleDate] = useState('')
  const [category, setCategory] = useState('all')
  const [studentId, setStudentId] = useState('all')

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 데모용 더미 데이터 (API가 아직 없어도 화면 확인 가능)
  const demoReports = [
    {
      id: 'r1',
      templateCode: 'full_summary',
      templateName: '전체 리포트',
      studentName: '지원(우지원)',
      periodLabel: '기간: 2025-10-01 ~ 2025-10-31',
      categoryLabel: '카테고리: 전체',
      status: 'completed',
      createdAt: '2025-10-31',
      outputs: ['pdf', 'xlsx'],
    },
    {
      id: 'r2',
      templateCode: 'emotion_trend',
      templateName: '감정 변화 리포트',
      studentName: '지원(우지원)',
      periodLabel: '기간: 2025-10-01 ~ 2025-10-31',
      categoryLabel: '카테고리: 감정 변화',
      status: 'completed',
      createdAt: '2025-10-31',
      outputs: ['pdf', 'xlsx'],
    },
    {
      id: 'r3',
      templateCode: 'activity_ratio',
      templateName: '활동 비율 리포트',
      studentName: '지원(우지원)',
      periodLabel: '기간: 2025-10-01 ~ 2025-10-31',
      categoryLabel: '카테고리: 활동 비율 변화',
      status: 'completed',
      createdAt: '2025-10-31',
      outputs: ['pdf', 'xlsx'],
    },
    {
      id: 'r4',
      templateCode: 'ability_growth',
      templateName: '능력 성장 리포트',
      studentName: '지원(우지원)',
      periodLabel: '기간: 2025-10-01 ~ 2025-10-31',
      categoryLabel: '카테고리: 능력 성장 곡선',
      status: 'completed',
      createdAt: '2025-10-31',
      outputs: ['pdf', 'xlsx'],
    },
    {
      id: 'r5',
      templateCode: 'full_summary',
      templateName: '전체 리포트',
      studentName: '지원(안지원)',
      periodLabel: '기간: 2025-10-01 ~ 2025-10-31',
      categoryLabel: '카테고리: 전체',
      status: 'running',
      createdAt: '2025-10-31',
      outputs: ['pdf'], // Excel 준비 중 예시
    },
  ]

  // 상태 → 라벨/색 구하기
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

  // 실제로는 report_runs + report_templates + report_outputs join 결과를
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

      // 예시: /report-runs?include=template,outputs
      const url = qs.toString() ? `/report-runs?${qs}` : '/report-runs'
      let data = null

      try {
        data = await apiFetch(url)
      } catch (e) {
        // 아직 API 없을 수 있으니, 이 에러는 아래 catch에서 처리
        throw e
      }

      const runs = Array.isArray(data?.runs) ? data.runs : data || []

      const normalized = runs.map(run => {
        const params = run.params || {}
        const template = run.template || {}
        const outputs = run.outputs || []

        const hasPdf = outputs.some(o => o.kind === 'pdf')
        const hasXlsx = outputs.some(o => o.kind === 'xlsx' || o.kind === 'excel')

        const from = params.from ?? params.start_date
        const to = params.to ?? params.end_date

        return {
          id: run.id,
          templateCode: template.code ?? run.template_code,
          templateName: template.name ?? run.template_name ?? '리포트',
          studentName: params.student_name ?? params.student_label ?? '학생',
          periodLabel:
            from && to
              ? `기간: ${from} ~ ${to}`
              : from
              ? `기간: ${from} ~`
              : '',
          categoryLabel:
            params.category_label ??
            (params.category ? `카테고리: ${params.category}` : ''),
          status: run.status,
          createdAt: run.created_at,
          outputs: [
            hasPdf ? 'pdf' : null,
            hasXlsx ? 'xlsx' : null,
          ].filter(Boolean),
        }
      })

      // API에서 아무것도 안 오면 데모 데이터 사용
      setReports(normalized.length ? normalized : demoReports)
    } catch (err) {
      console.error(err)
      setError('리포트 목록을 불러오지 못했습니다. (예시 데이터를 표시합니다)')
      setReports(demoReports)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFilterSubmit(e) {
    e.preventDefault()
    fetchReports()
  }

  function handleResetFilters() {
    setFilterMode('range')
    setStartDate('')
    setEndDate('')
    setSingleDate('')
    setCategory('all')
    setStudentId('all')
    fetchReports()
  }

  const totalCount = reports.length

  return (
    <Layout title="">
      <div className="main-shell">
        <div className="main-inner report-page">
          {/* 상단 타이틀 */}
          <header className="report-header">
            <div>
              <p className="muted">
                날짜와 카테고리를 선택하여 리포트를 필터링하고 다운로드할 수
                있습니다.
              </p>
            </div>
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

              {/* 날짜 + 카테고리 + 학생 */}
              <div className="report-filter-grid">
                {filterMode === 'range' ? (
                  <>
                    <div className="filter-field">
                      <label>시작 날짜</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className="filter-field">
                      <label>종료 날짜</label>
                      <input
                        type="date"
                        value={endDate}
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
                  {reports.map(report => (
                    <article key={report.id} className="report-card">
                      <div className="report-card-header">
                        <div className="report-card-icon-wrap">
                          <div className="report-card-icon">📄</div>
                        </div>
                        <div className="report-card-title-block">
                          <div className="report-card-title">
                            {report.templateName}
                          </div>
                          <div className="report-card-meta">
                            <div>{report.studentName}</div>
                            <div>{report.periodLabel}</div>
                            <div>{report.categoryLabel}</div>
                          </div>
                        </div>
                        <div className="report-card-status">
                          <span className={getStatusBadgeClass(report.status)}>
                            {getStatusLabel(report.status)}
                          </span>
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
                        <div className="report-card-actions">
                          <button className="btn report-btn">
                            PDF
                          </button>
                          <button
                            className="btn secondary report-btn"
                            disabled={!report.outputs.includes('xlsx')}
                          >
                            Excel
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </Layout>
  )
}

export { ReportPreview }
