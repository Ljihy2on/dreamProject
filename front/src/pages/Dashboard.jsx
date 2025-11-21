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
  { name: '기쁜', value: 95 },
  { name: '행복한', value: 90 },
  { name: '즐거운', value: 88 },
  { name: '신나는', value: 86 },
  { name: '황홀한', value: 84 },
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
    activity: '수확 활동',
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
    activity: '파종 활동',
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
    activity: '관리 활동',
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

// 감정 색상 (상세 보기 카드 등에서 사용)
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

  // 상세 모달
  const [emotionModalOpen, setEmotionModalOpen] = useState(false)
  const [activityModalOpen, setActivityModalOpen] = useState(false)

  // 🔹 시작일 > 종료일인지 여부 (검증용)
  const isInvalidRange =
    startDate && endDate && startDate > endDate

  // 요약 숫자 계산
  const recordCount = metrics?.recordCount ?? demoMetrics.recordCount
  const positivePercent = metrics?.positivePercent ?? demoMetrics.positivePercent

  // Emotion 차트용 원본 데이터 (없으면 데모)
  const emotionChartData =
    emotionData && emotionData.length > 0 ? emotionData : demoEmotion

  // 감정 점수(0~10 스케일)로 변환 + Top5 리스트 (메인 카드 & 상세 모달에서 같이 사용)
  const emotionScaleItems = useMemo(() => {
    const base = emotionChartData.slice(0, 5)
    return base.map(item => {
      const raw = typeof item.value === 'number' ? item.value : 0
      // 0~100 값이면 0~10으로, 0~10이면 그대로 사용
      const scoreFromPercent = raw > 10 ? raw / 10 : raw
      const score10 = Math.max(0, Math.min(10, Math.round(scoreFromPercent * 10) / 10))
      return {
        ...item,
        score10,
      }
    })
  }, [emotionChartData])

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

  // 감정 상세 모달용 행 데이터 (비율/횟수/간단 설명)
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

  // 활동별 대표 감정 카드 구성 (메인 카드 하단 + 상세 모달에서 함께 사용)
  const activityEmotionCards = useMemo(() => {
    if (!abilityList.length) return []

    const baseEmotions =
      emotionScaleItems.length > 0
        ? emotionScaleItems
        : emotionChartData.map(e => ({
            ...e,
            score10:
              typeof e.value === 'number'
                ? Math.max(
                    0,
                    Math.min(10, e.value > 10 ? e.value / 10 : e.value),
                  )
                : 8,
          }))

    const icons = ['🧺', '🌱', '🧹', '🔍']

    return abilityList.slice(0, 4).map((act, idx) => {
      const emo = baseEmotions[idx % baseEmotions.length] ?? {
        name: '긍정',
        score10: 8,
      }
      return {
        id: act.id,
        icon: icons[idx % icons.length],
        activity: act.activity,
        emotion: emo.name,
        score10: emo.score10,
        description: act.date ? `${act.date} 활동` : '',
      }
    })
  }, [abilityList, emotionScaleItems, emotionChartData])

  // 감정 상세 모달용 요약 문장
  const emotionSummaryText = useMemo(() => {
    const positiveItem =
      emotionScaleItems[0] || emotionChartData[0]
    const pos = positiveItem?.score10 ?? positivePercent / 10

    return `${selectedStudentLabel} 학생은 선택한 기간 동안 전반적으로 긍정적인 감정을 많이 경험했습니다. 특히 평균 감정 강도는 약 ${pos.toFixed(
      1,
    )}/10 수준으로, 안정적인 정서 상태가 유지되고 있습니다.`
  }, [emotionScaleItems, emotionChartData, positivePercent, selectedStudentLabel])

  // 활동별 감정 분석 요약 문장
  const activityEmotionSummaryText = useMemo(() => {
    if (!activityEmotionCards.length) {
      return `${selectedStudentLabel} 학생의 활동별 감정 데이터가 아직 충분하지 않습니다.`
    }
    const sorted = [...activityEmotionCards].sort(
      (a, b) => b.score10 - a.score10,
    )
    const best = sorted[0]
    return `${selectedStudentLabel} 학생은 특히 「${best.activity}」 활동에서 ${best.emotion} 감정을 가장 강하게 느꼈습니다(강도 약 ${best.score10.toFixed(
      1,
    )}/10). 수확·관리·관찰 등 다양한 활동에서 전반적으로 긍정적인 감정이 고르게 나타나고 있습니다.`
  }, [activityEmotionCards, selectedStudentLabel])

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
      {/* 메인 컨테이너 */}
      <div className="dashboard-page">
        <div className="dashboard-inner">
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
                            <div className="metric-label">긍정 감정 비율</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 오른쪽: 기간 선택 패널 */}
                  <form
                    className="filter-calendar-panel"
                    onSubmit={handleSearch}
                  >
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
                          max={endDate || undefined} // 종료일보다 늦게 선택 못 하도록 제한
                          onChange={e => setStartDate(e.target.value)}
                        />
                      </div>
                      <div className="calendar-field">
                        <label>종료일</label>
                        <input
                          type="date"
                          value={endDate}
                          min={startDate || undefined} // 시작일보다 빠르게 선택 못 하도록 제한
                          onChange={e => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* 기간 오류 표시 */}
                    {isInvalidRange && (
                      <div
                        className="muted"
                        style={{
                          fontSize: 12,
                          color: '#EF4444',
                          marginTop: 4,
                        }}
                      >
                        시작일이 종료일보다 늦을 수 없습니다. 날짜를 다시 선택해
                        주세요.
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

              {/* 2) 감정 척도 카드 (메인) */}
              <section className="dashboard-card wide-card emotion-scale-card">
                <div className="emotion-scale-header">
                  <div>
                    <div className="emotion-scale-title">
                      <span role="img" aria-label="감정">
                        😺
                      </span>
                      <span>감정 척도</span>
                    </div>
                    <div className="emotion-scale-subtitle">
                      선택 기간의 평균 감정 강도 (0~10)
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn secondary emotion-detail-btn"
                    onClick={() => setEmotionModalOpen(true)}
                  >
                    클릭하여 상세보기
                  </button>
                </div>

                {/* 전체 평균 감정 Top5 */}
                <div className="emotion-scale-section">
                  <div className="emotion-scale-section-title">
                    전체 평균 감정 Top 5
                  </div>
                  <div className="emotion-scale-list">
                    {emotionScaleItems.map(item => (
                      <div
                        key={item.name}
                        className="emotion-scale-row"
                      >
                        <div className="emotion-scale-label">
                          <div className="emotion-name">{item.name}</div>
                          <div className="emotion-scale-minmax">
                            나쁨
                          </div>
                        </div>
                        <div className="emotion-scale-bar-wrap">
                          <div className="emotion-score-info">
                            <span className="emotion-score-main">
                              {item.score10.toFixed(1)}/10
                            </span>
                            <span className="emotion-score-state">
                              좋음
                            </span>
                          </div>
                          <div className="emotion-score-bar">
                            <div
                              className="emotion-score-bar-fill"
                              style={{
                                width: `${(item.score10 / 10) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 활동별 대표 감정 */}
                <div className="activity-emotion-section">
                  <div className="activity-emotion-header">
                    활동별 대표 감정
                  </div>
                  <div className="activity-emotion-grid">
                    {activityEmotionCards.map(card => (
                      <div
                        key={card.id}
                        className="activity-emotion-card"
                      >
                        <div className="activity-emotion-card-top">
                          <div className="activity-emotion-icon">
                            {card.icon}
                          </div>
                          <div>
                            <div className="activity-emotion-activity">
                              {card.activity}
                            </div>
                            {card.description && (
                              <div className="activity-emotion-sub muted">
                                {card.description}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="activity-emotion-body">
                          <div className="activity-emotion-row">
                            <span className="activity-emotion-label">
                              {card.emotion}
                            </span>
                            <span className="activity-emotion-score">
                              {card.score10.toFixed(1)}/10
                            </span>
                          </div>
                          <div className="activity-emotion-bar">
                            <div
                              className="activity-emotion-bar-fill"
                              style={{
                                width: `${(card.score10 / 10) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {!activityEmotionCards.length && (
                      <div className="activity-emotion-empty muted">
                        선택한 기간에 활동 데이터가 없습니다.
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 3) 활동 유형 분포 (막대 그래프) */}
              <section className="dashboard-card wide-card">
                <div className="activity-card-header">
                  <div>
                    <div className="card-title">활동 유형 분포</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      선택한 기간 동안 기록된 활동 시간을 요일·유형별로
                      살펴볼 수 있어요.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn secondary emotion-detail-btn"
                    onClick={() => setActivityModalOpen(true)}
                  >
                    상세보기
                  </button>
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
                    <Tooltip
                      formatter={value => [`${value}분`, '활동 시간']}
                    />
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
                <div
                  className="muted"
                  style={{ fontSize: 13, marginBottom: 16 }}
                >
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
                        <div className="activity-name">
                          {item.activity}
                        </div>
                        <div className="activity-date muted">
                          {item.date}
                        </div>
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
                            style={{
                              width: `${item.difficultyRatio}%`,
                            }}
                          />
                          <span
                            className="bar-seg bar-normal"
                            style={{
                              width: `${item.normalRatio}%`,
                            }}
                          />
                          <span
                            className="bar-seg bar-good"
                            style={{
                              width: `${item.goodRatio}%`,
                            }}
                          />
                        </div>
                        <div className="ability-bar-labels">
                          <span>어려움 {item.difficultyRatio}%</span>
                          <span>보통 {item.normalRatio}%</span>
                          <span>잘함 {item.goodRatio}%</span>
                        </div>
                      </div>

                      <div className="col-score">
                        <div className="score-main">
                          {item.totalScore}점
                        </div>
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

                {/* 하단 3개 요약 카드 (평균 수행 점수 제거) */}
                <div className="ability-summary-grid">
                  <div className="ability-summary-card summary-excellent">
                    <div className="summary-title">매우 우수 활동</div>
                    <div className="summary-main">{excellentCount}개</div>
                    <div className="summary-sub">
                      빠르고 효율적으로 수행한 활동
                    </div>
                  </div>
                  <div className="ability-summary-card summary-good">
                    <div className="summary-title">우수 활동</div>
                    <div className="summary-main">{goodCount}개</div>
                    <div className="summary-sub">
                      안정적으로 수행한 활동
                    </div>
                  </div>
                  <div className="ability-summary-card summary-challenge">
                    <div className="summary-title">도전적 활동</div>
                    <div className="summary-main">{challengeCount}개</div>
                    <div className="summary-sub">
                      추가적인 지원이 필요한 활동
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* 감정 척도 / 활동별 감정 상세 모달 */}
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

            <div className="emotion-detail-header">
              <div>
                <div className="emotion-detail-title">
                  🧠 감정 키워드 상세보기
                </div>
                <p className="muted">
                  {selectedStudentLabel} 학생의 선택 기간 감정 키워드와
                  활동별 감정 척도를 한눈에 볼 수 있는 화면입니다.
                </p>
              </div>
              <div className="emotion-detail-badge">
                총 {emotionScaleItems.length}개 키워드
              </div>
            </div>

            <div className="emotion-detail-scroll">
              {/* 전체 평균 감정 척도 */}
              <section className="emotion-detail-section">
                <h4 className="emotion-detail-section-title">
                  전체 평균 감정 척도
                </h4>
                <div className="emotion-detail-grid">
                  {emotionScaleItems.map(item => {
                    const row = emotionDetailRows.find(
                      r => r.type === item.name,
                    )
                    const count = row?.count ?? 0
                    return (
                      <div
                        key={item.name}
                        className="emotion-detail-card"
                      >
                        <div className="emotion-detail-card-header">
                          <div className="emotion-detail-name">
                            {item.name}
                          </div>
                          <div className="emotion-detail-count-pill">
                            {count}회
                          </div>
                        </div>
                        <div className="emotion-detail-score-row">
                          <span className="emotion-detail-label">
                            나쁨
                          </span>
                          <span className="emotion-detail-score">
                            {item.score10.toFixed(1)}/10
                          </span>
                          <span className="emotion-detail-label">
                            좋음
                          </span>
                        </div>
                        <div className="emotion-detail-bar">
                          <div
                            className="emotion-detail-bar-fill"
                            style={{
                              width: `${(item.score10 / 10) * 100}%`,
                            }}
                          />
                        </div>
                        {row?.desc && (
                          <div className="emotion-detail-desc-text">
                            {row.desc}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* 전체 분석 요약 */}
              <section className="emotion-detail-section">
                <h4 className="emotion-detail-section-title">
                  전체 분석 요약
                </h4>
                <div className="emotion-detail-summary-text">
                  {emotionSummaryText}
                </div>
              </section>

              {/* 활동별 감정 척도 */}
              <section className="emotion-detail-section">
                <h4 className="emotion-detail-section-title">
                  활동별 감정 척도
                </h4>
                <div className="activity-emotion-detail-grid">
                  {activityEmotionCards.map(card => (
                    <div
                      key={card.id}
                      className="activity-emotion-detail-card"
                    >
                      <div className="activity-emotion-detail-top">
                        <div className="activity-emotion-detail-icon">
                          {card.icon}
                        </div>
                        <div>
                          <div className="activity-emotion-detail-activity">
                            {card.activity}
                          </div>
                          {card.description && (
                            <div className="activity-emotion-detail-sub muted">
                              {card.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="activity-emotion-detail-row">
                        <span className="activity-emotion-detail-label">
                          {card.emotion}
                        </span>
                        <span className="activity-emotion-detail-score">
                          {card.score10.toFixed(1)}/10
                        </span>
                      </div>
                      <div className="activity-emotion-detail-bar">
                        <div
                          className="activity-emotion-detail-bar-fill"
                          style={{
                            width: `${(card.score10 / 10) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {!activityEmotionCards.length && (
                    <div className="activity-detail-empty">
                      선택한 기간에 활동 데이터가 없습니다.
                    </div>
                  )}
                </div>
              </section>

              {/* 활동별 감정 분석 요약 */}
              <section className="emotion-detail-section">
                <h4 className="emotion-detail-section-title">
                  활동별 감정 분석
                </h4>
                <div className="emotion-detail-summary-text">
                  {activityEmotionSummaryText}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* 활동 유형 분포 상세 모달 */}
      {activityModalOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setActivityModalOpen(false)}
        >
          <div
            className="modal-card activity-detail-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="닫기"
              type="button"
              onClick={() => setActivityModalOpen(false)}
            >
              ✕
            </button>

            <h3>활동 유형 분포 상세보기</h3>
            <p className="muted">
              {selectedStudentLabel} 학생의 활동 유형별 수행 수준과 대표
              감정을 한눈에 볼 수 있는 화면입니다.
            </p>

            <div className="activity-detail-table">
              <div className="activity-detail-table-head">
                <div>활동</div>
                <div>대표 감정</div>
                <div>수행 수준</div>
                <div>비고</div>
              </div>

              {activityEmotionCards.length === 0 ? (
                <div className="activity-detail-empty">
                  선택한 기간에 대한 활동 데이터가 충분하지 않습니다.
                </div>
              ) : (
                activityEmotionCards.map(card => {
                  const source = abilityList.find(a => a.id === card.id)
                  const levelType = source?.levelType || 'good'
                  const levelLabel = source?.levelLabel || '보통'
                  return (
                    <div
                      key={card.id}
                      className="activity-detail-row"
                    >
                      <div>{card.activity}</div>
                      <div>
                        <div>{card.emotion}</div>
                        <div className="activity-emotion-detail-bar">
                          <div
                            className="activity-emotion-detail-bar-fill"
                            style={{
                              width: `${(card.score10 / 10) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <span
                          className={
                            'level-badge ' +
                            (levelType === 'excellent'
                              ? 'level-excellent'
                              : levelType === 'challenge'
                              ? 'level-challenge'
                              : 'level-good')
                          }
                        >
                          {levelLabel}
                        </span>
                      </div>
                      <div className="muted">
                        {source?.hours || source?.date || ''}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="activity-analysis-box">
              {activityEmotionSummaryText}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export { Dashboard }
