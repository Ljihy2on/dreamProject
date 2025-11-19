// src/pages/Dashboard.jsx
import React, { useEffect, useState, useMemo } from 'react'
import Layout from '../components/Layout'
import { apiFetch } from '../lib/api.js'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

/**
 * 백엔드 대시보드 API 계약 정리 (간단 버전)
 *
 * GET /api/dashboard?studentId={id}&from={YYYY-MM-DD}&to={YYYY-MM-DD}
 */

// Demo data – API 없을 때 사용
const demoStudents = [
  { id: '1', name: '지우' },
  { id: '2', name: '민서' },
]

const demoMetrics = {
  recordCount: 12,
  positivePercent: 78,
  averageScore: 85,
}

const demoEmotion = [
  { name: '긍정', value: 78 },
  { name: '부정', value: 12 },
  { name: '중립', value: 10 },
]

const demoActivitySeries = [
  { date: '2025-11-10', minutes: 30 },
  { date: '2025-11-11', minutes: 45 },
  { date: '2025-11-12', minutes: 20 },
  { date: '2025-11-13', minutes: 50 },
  { date: '2025-11-14', minutes: 35 },
]

const demoActivityAbilityList = [
  {
    id: 'a1',
    activity: '땅콩껍질까기',
    date: '10/20',
    levelType: 'good',
    levelLabel: '우수',
    difficultyRatio: 7,
    normalRatio: 17,
    goodRatio: 76,
    totalScore: 90,
    hours: '2.5시간',
    mainSkills: ['소근육', '집중력'],
  },
  {
    id: 'a2',
    activity: '밭 가꾸기',
    date: '10/21',
    levelType: 'challenge',
    levelLabel: '도전적',
    difficultyRatio: 9,
    normalRatio: 25,
    goodRatio: 66,
    totalScore: 71,
    hours: '3시간',
    mainSkills: ['책임감', '인내'],
  },
  {
    id: 'a3',
    activity: '고구마 수확',
    date: '10/22',
    levelType: 'good',
    levelLabel: '우수',
    difficultyRatio: 2,
    normalRatio: 16,
    goodRatio: 82,
    totalScore: 83,
    hours: '2시간',
    mainSkills: ['협동', '체력'],
  },
]

// Pie 차트 색상
const EMOTION_COLORS = ['#10b981', '#ef4444', '#f59e0b']

export default function Dashboard() {
  // 학생 목록 (DB + 데모)
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')

  // 기간 필터
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // 대시보드 데이터
  const [metrics, setMetrics] = useState(null)
  const [emotionData, setEmotionData] = useState([])
  const [activitySeries, setActivitySeries] = useState([])
  const [activityAbilityList, setActivityAbilityList] = useState([])

  // 상태
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 감정 상세 모달
  const [emotionModalOpen, setEmotionModalOpen] = useState(false)

  // 🔹 시작일 > 종료일인지 여부 (검증용)
  const isInvalidRange =
    startDate && endDate && startDate > endDate

  // 요약 숫자 계산
  const recordCount = metrics?.recordCount ?? demoMetrics.recordCount
  const positivePercent = metrics?.positivePercent ?? demoMetrics.positivePercent
  const avgScore = metrics?.averageScore ?? demoMetrics.averageScore

  // Emotion 차트 데이터 (없으면 데모)
  const emotionChartData =
    emotionData && emotionData.length > 0 ? emotionData : demoEmotion

  // 활동 그래프 데이터 (없으면 데모)
  const seriesData =
    activitySeries && activitySeries.length > 0
      ? activitySeries
      : demoActivitySeries

  // 활동별 능력 리스트 (없으면 데모)
  const abilityList =
    activityAbilityList && activityAbilityList.length > 0
      ? activityAbilityList
      : demoActivityAbilityList

  // 학생 이름 표시용
  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId),
    [students, selectedStudentId],
  )

  const selectedStudentLabel = selectedStudent?.name || '해당'

  // 감정 상세 모달용 행 데이터
  const emotionDetailRows = useMemo(() => {
    const baseCount = recordCount || 100

    return emotionChartData.map(item => {
      const ratio = item?.value ?? 0
      const count = Math.round((ratio / 100) * baseCount)
      let desc = ''

      if (item.name?.includes('긍정')) {
        desc = '기쁨, 만족, 뿌듯함, 즐거움 등'
      } else if (item.name?.includes('부정')) {
        desc = '걱정, 불안, 당황 등'
      } else {
        // 중립
        desc = '평온, 집중, 관찰 등'
      }

      return {
        type: item.name,
        ratio,
        count,
        desc,
      }
    })
  }, [emotionChartData, recordCount])

  // 감정 상세 모달용 요약 문장
  const emotionSummaryText = useMemo(() => {
    const positiveItem =
      emotionChartData.find(e => e.name?.includes('긍정')) ||
      emotionChartData[0]
    const pos = positiveItem?.value ?? positivePercent

    return `${selectedStudentLabel} 학생은 최근 활동에서 전반적으로 긍정적인 감정을 보였습니다. 긍정 감정 비율이 약 ${pos}% 수준으로 나타나며, 전반적으로 안정적인 정서 상태를 유지하고 있습니다.`
  }, [emotionChartData, positivePercent, selectedStudentLabel])

  // 학생 목록 불러오기
  async function fetchStudents() {
    try {
      const res = await apiFetch('/api/students', { method: 'GET' })
      if (Array.isArray(res)) {
        setStudents(res)
        if (res.length > 0) {
          setSelectedStudentId(res[0].id)
        }
      } else {
        setStudents(demoStudents)
        setSelectedStudentId(demoStudents[0].id)
      }
    } catch (e) {
      console.error(e)
      setStudents(demoStudents)
      setSelectedStudentId(demoStudents[0].id)
    }
  }

  // 대시보드 데이터 불러오기
  async function fetchDashboardData({ studentId, from, to }) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('studentId', studentId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)

      const res = await apiFetch(`/api/dashboard?${params.toString()}`)
      if (!res) {
        throw new Error('대시보드 데이터를 불러오지 못했습니다.')
      }

      setMetrics(res.metrics ?? demoMetrics)
      setEmotionData(res.emotionDistribution ?? demoEmotion)
      setActivitySeries(res.activitySeries ?? demoActivitySeries)

      if (Array.isArray(res.activityAbilityList)) {
        setActivityAbilityList(
          res.activityAbilityList.map(item => ({
            id: item.id,
            activity: item.activity,
            date: item.date_label ?? item.date,
            levelType: item.level_type,
            levelLabel: item.level_label,
            difficultyRatio: item.difficulty_ratio,
            normalRatio: item.normal_ratio,
            goodRatio: item.good_ratio,
            totalScore: item.total_score,
            hours: item.hours_label,
            mainSkills: item.main_skills ?? [],
          })),
        )
      } else {
        setActivityAbilityList(demoActivityAbilityList)
      }
    } catch (e) {
      console.error(e)
      setError(e.message || '대시보드 조회 중 오류가 발생했습니다.')
      setMetrics(demoMetrics)
      setEmotionData(demoEmotion)
      setActivitySeries(demoActivitySeries)
      setActivityAbilityList(demoActivityAbilityList)
    } finally {
      setLoading(false)
    }
  }

  // 최초 진입: 학생 목록 먼저 불러오기
  useEffect(() => {
    fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 학생이 선택되면, 해당 학생 기준으로 기본 대시보드 조회
  useEffect(() => {
    if (selectedStudentId) {
      fetchDashboardData({ studentId: selectedStudentId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId])

  // 검색 버튼
  function handleSearch(e) {
    e.preventDefault()
    if (!selectedStudentId) return

    // 🔹 기간 검증: 시작일이 종료일보다 늦으면 막기
    if (isInvalidRange) {
      alert('시작일이 종료일보다 늦을 수 없습니다. 기간을 다시 선택해주세요.')
      return
    }

    fetchDashboardData({
      studentId: selectedStudentId,
      from: startDate || undefined,
      to: endDate || undefined,
    })
  }

  // 활동별 능력 분석 요약 박스
  const excellentCount = abilityList.filter(
    a => a.levelType === 'excellent',
  ).length
  const goodCount = abilityList.filter(a => a.levelType === 'good').length
  const challengeCount = abilityList.filter(
    a => a.levelType === 'challenge',
  ).length

  return (
    <Layout title="">
      {loading && !metrics ? (
        <div style={{ marginTop: 24 }}>로딩 중...</div>
      ) : (
        <>
          {error && (
            <div className="muted" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          {/* 1) 상단: 학생(왼쪽) + 기간 선택(오른쪽) */}
          <section className="dashboard-filter-card">
            <div className="dashboard-filter-grid">
              {/* 왼쪽: 학생 정보 패널 */}
              <div className="filter-student-panel">
                <div className="student-summary-top">
                  <div className="student-avatar">
                    {selectedStudent?.name?.charAt(0) ?? '학'}
                  </div>

                  <div className="student-header-right">
                    <div className="student-select-row">
                      <select
                        className="student-select"
                        value={selectedStudentId}
                        onChange={e => setSelectedStudentId(e.target.value)}
                      >
                        <option value="">학생 선택</option>
                        {students.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="student-more-btn"
                        aria-label="학생 설정"
                      >
                        👤
                      </button>
                    </div>

                    <div className="student-tagline">
                      {selectedStudent
                        ? `${selectedStudent.name}님의 최근 기록 요약`
                        : '학생을 선택하면 최근 기록 요약이 표시됩니다.'}
                    </div>

                    <div className="student-divider" />

                    <div className="student-metrics-row">
                      <div className="student-metric">
                        <div className="metric-number metric-blue">
                          {recordCount}
                        </div>
                        <div className="metric-label">기록 수</div>
                      </div>
                      <div className="student-metric">
                        <div className="metric-number metric-green">
                          {positivePercent}%
                        </div>
                        <div className="metric-label">긍정 감정</div>
                      </div>
                      <div className="student-metric">
                        <div className="metric-number metric-purple">
                          {avgScore}
                        </div>
                        <div className="metric-label">평균 점수</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 오른쪽: 기간 선택 패널 */}
              <form className="filter-calendar-panel" onSubmit={handleSearch}>
                <div className="calendar-card-header">
                  <div>
                    <div className="card-title">기간 선택</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      조회할 날짜 범위를 선택한 뒤 검색을 눌러주세요.
                    </div>
                  </div>
                  <span className="calendar-icon">📅</span>
                </div>

                <div className="calendar-fields">
                  <div className="calendar-field">
                    <label>시작일</label>
                    <input
                      type="date"
                      value={startDate}
                      max={endDate || undefined} // 🔹 종료일보다 늦게 선택 못 하도록 제한
                      onChange={e => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="calendar-field">
                    <label>종료일</label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined} // 🔹 시작일보다 빠르게 선택 못 하도록 제한
                      onChange={e => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* 기간 오류 표시 */}
                {isInvalidRange && (
                  <div
                    className="muted"
                    style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}
                  >
                    시작일이 종료일보다 늦을 수 없습니다. 날짜를 다시 선택해 주세요.
                  </div>
                )}

                <div className="calendar-actions">
                  <button type="submit" className="btn">
                    검색
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* 2) 감정 분포 카드 */}
          <section className="dashboard-card wide-card">
            <div className="emotion-card-header">
              <div>
                <div className="card-title">감정 분포</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  선택한 기간 동안의 감정 비율
                </div>
              </div>
              <button
                type="button"
                className="btn secondary emotion-detail-btn"
                onClick={() => setEmotionModalOpen(true)}
              >
                상세보기
              </button>
            </div>

            <div className="emotion-chart-row">
              <div>
                <div className="emotion-main-label">긍정 감정이 많아요</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  긍정 / 부정 / 중립 감정 비율을 한눈에 볼 수 있어요.
                </div>
              </div>

              <div className="emotion-chart">
                <PieChart width={360} height={260}>
                  <Pie
                    data={emotionChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    stroke="none"
                    labelLine={false}
                  >
                    {emotionChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={EMOTION_COLORS[index]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value}%`, name]} />
                </PieChart>
              </div>
            </div>

            <div className="emotion-legend">
              <div className="legend-item">
                <span className="legend-dot legend-positive" />
                긍정
              </div>
              <div className="legend-item">
                <span className="legend-dot legend-negative" />
                부정
              </div>
              <div className="legend-item">
                <span className="legend-dot legend-neutral" />
                중립
              </div>
            </div>
          </section>

          {/* 3) 활동 시간 그래프  */}
          <section className="dashboard-card wide-card">
            <div className="card-title">활동 그래프</div>
            <div className="muted" style={{ fontSize: 13 }}>
              선택한 기간 동안 학생이 기록한 활동 시간을 보여줍니다.
            </div>

            <div className="activity-chart-wrapper">
              <BarChart
                width={720}
                height={260}
                data={seriesData}
                margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis unit="분" />
                <Tooltip formatter={value => [`${value}분`, '활동 시간']} />
                <Bar
                  dataKey="minutes"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </div>
          </section>

          {/* 4) 활동별 능력 분석 */}
          <section className="dashboard-card wide-card">
            <div className="card-title">활동별 능력 분석</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              각 활동에서 나타나는 능력 수행 수준과 상세 분석
            </div>

            <div className="activity-ability-table">
              <div className="ability-table-header">
                <div className="col-activity">활동</div>
                <div className="col-level">수행 수준</div>
                <div className="col-distribution">능력 분포</div>
                <div className="col-score">종합 점수</div>
                <div className="col-main-skills">주요 능력</div>
              </div>

              {abilityList.map(item => (
                <div key={item.id} className="ability-table-row">
                  <div className="col-activity">
                    <div className="activity-name">{item.activity}</div>
                    <div className="activity-date muted">{item.date}</div>
                  </div>

                  <div className="col-level">
                    <span
                      className={
                        'level-badge ' +
                        (item.levelType === 'excellent'
                          ? 'level-excellent'
                          : item.levelType === 'challenge'
                          ? 'level-challenge'
                          : 'level-good')
                      }
                    >
                      {item.levelLabel}
                    </span>
                  </div>

                  <div className="col-distribution">
                    <div className="ability-bar">
                      <span
                        className="bar-seg bar-hard"
                        style={{ width: `${item.difficultyRatio}%` }}
                      />
                      <span
                        className="bar-seg bar-normal"
                        style={{ width: `${item.normalRatio}%` }}
                      />
                      <span
                        className="bar-seg bar-good"
                        style={{ width: `${item.goodRatio}%` }}
                      />
                    </div>
                    <div className="ability-bar-labels">
                      <span>어려움 {item.difficultyRatio}%</span>
                      <span>보통 {item.normalRatio}%</span>
                      <span>잘함 {item.goodRatio}%</span>
                    </div>
                  </div>

                  <div className="col-score">
                    <div className="score-main">{item.totalScore}점</div>
                    <div className="muted">{item.hours}</div>
                  </div>

                  <div className="col-main-skills">
                    {item.mainSkills?.map(skill => (
                      <span key={skill} className="skill-chip">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 하단 4개 요약 카드 */}
            <div className="ability-summary-grid">
              <div className="ability-summary-card summary-excellent">
                <div className="summary-title">매우 우수 활동</div>
                <div className="summary-main">{excellentCount}개</div>
                <div className="summary-sub">빠르고 효율적으로 수행</div>
              </div>
              <div className="ability-summary-card summary-good">
                <div className="summary-title">우수 활동</div>
                <div className="summary-main">{goodCount}개</div>
                <div className="summary-sub">안정적인 수행력</div>
              </div>
              <div className="ability-summary-card summary-challenge">
                <div className="summary-title">도전적 활동</div>
                <div className="summary-main">{challengeCount}개</div>
                <div className="summary-sub">노력이 필요한 영역</div>
              </div>
              <div className="ability-summary-card summary-average">
                <div className="summary-title">평균 수행 점수</div>
                <div className="summary-main">
                  {typeof avgScore === 'number' ? `${avgScore}점` : avgScore}
                </div>
                <div className="summary-sub">전반적으로 양호</div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* 감정 분포 상세 모달 */}
      {emotionModalOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setEmotionModalOpen(false)}
        >
          <div
            className="modal-card emotion-detail-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="닫기"
              type="button"
              onClick={() => setEmotionModalOpen(false)}
            >
              ✕
            </button>

            <h3>감정 분포 상세 집계</h3>
            <p className="muted">
              {selectedStudentLabel} 학생의 데이터 집계 결과입니다.
            </p>

            <div className="emotion-detail-table-card">
              <table className="emotion-detail-table">
                <thead>
                  <tr>
                    <th className="emotion-detail-type">감정 유형</th>
                    <th className="emotion-detail-ratio">비율</th>
                    <th className="emotion-detail-count">횟수</th>
                    <th className="emotion-detail-desc">설명</th>
                  </tr>
                </thead>
                <tbody>
                  {emotionDetailRows.map(row => (
                    <tr key={row.type}>
                      <td className="emotion-detail-type">{row.type}</td>
                      <td className="emotion-detail-ratio">
                        {row.ratio}%
                      </td>
                      <td className="emotion-detail-count">
                        {row.count}회
                      </td>
                      <td className="emotion-detail-desc">{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="emotion-detail-summary-card">
              <div className="emotion-detail-summary-title">분석 요약</div>
              <div className="emotion-detail-summary-text">
                {emotionSummaryText}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export { Dashboard }
