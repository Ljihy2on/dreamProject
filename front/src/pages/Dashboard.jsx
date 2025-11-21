// src/pages/Dashboard.jsx
import React, { useEffect, useState, useMemo } from 'react'
import Layout from '../components/Layout'
import { apiFetch } from '../lib/api.js'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

export default function Dashboard() {
  // 🔹 학생 목록 (supabase)
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('') // 처음엔 아무 학생도 선택 X

  // 🔹 기간 필터 (사용자가 직접 선택)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // 🔹 실제로 조회된 조건(학생/기간)을 별도 저장
  const [queriedStudent, setQueriedStudent] = useState(null)
  const [queriedStartDate, setQueriedStartDate] = useState('')
  const [queriedEndDate, setQueriedEndDate] = useState('')

  // 🔹 대시보드 데이터
  const [metrics, setMetrics] = useState({
    recordCount: 0,
    positivePercent: 0,
  })
  const [emotionData, setEmotionData] = useState([])
  const [activitySeries, setActivitySeries] = useState([])
  const [activityAbilityList, setActivityAbilityList] = useState([])

  // 🔹 상태
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 🔹 모달
  const [emotionModalOpen, setEmotionModalOpen] = useState(false)
  const [activityModalOpen, setActivityModalOpen] = useState(false)

  // 🔹 유효성 검사
  const isInvalidRange = startDate && endDate && startDate > endDate

  const recordCount = metrics?.recordCount ?? 0
  const positivePercent = metrics?.positivePercent ?? 0

  const emotionChartData = Array.isArray(emotionData) ? emotionData : []

  // 🔹 감정 점수(0~10 스케일)로 변환 + Top5
  const emotionScaleItems = useMemo(() => {
    if (!emotionChartData.length) return []
    const base = emotionChartData.slice(0, 5)
    return base.map(item => {
      const raw = typeof item.value === 'number' ? item.value : 0
      const scoreFromPercent = raw > 10 ? raw / 10 : raw
      const score10 = Math.max(
        0,
        Math.min(10, Math.round(scoreFromPercent * 10) / 10),
      )
      return { ...item, score10 }
    })
  }, [emotionChartData])

  const seriesData = Array.isArray(activitySeries) ? activitySeries : []
  const abilityList = Array.isArray(activityAbilityList)
    ? activityAbilityList
    : []

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId),
    [students, selectedStudentId],
  )

  const queriedStudentLabel =
    queriedStudent?.name ||
    selectedStudent?.name ||
    (selectedStudentId ? '선택된 학생' : '해당')

  // 🔹 감정 상세 모달용 보조 데이터
  const emotionDetailRows = useMemo(() => {
    if (!emotionChartData.length) return []
    const baseCount = recordCount || 100

    return emotionChartData.map(item => {
      const ratio = item?.value ?? 0
      const count = Math.round((ratio / 100) * baseCount)
      let desc = ''
      if (item.name?.includes('긍정')) desc = '기쁨, 만족, 뿌듯함, 즐거움 등'
      else if (item.name?.includes('부정'))
        desc = '걱정, 불안, 당황, 짜증 등'
      else desc = '평온, 집중, 관찰 등'

      return { type: item.name, ratio, count, desc }
    })
  }, [emotionChartData, recordCount])

  const activityEmotionCards = useMemo(() => {
    if (!abilityList.length || !emotionScaleItems.length) return []
    const baseEmotions = emotionScaleItems
    const icons = ['🧺', '🌱', '🧹', '🔍']
    return abilityList.slice(0, 4).map((act, idx) => {
      const emo = baseEmotions[idx % baseEmotions.length]
      return {
        id: act.id,
        icon: icons[idx % icons.length],
        activity: act.activity,
        emotion: emo?.name ?? '감정',
        score10: emo?.score10 ?? 0,
        description: act.date ? `${act.date} 활동` : '',
      }
    })
  }, [abilityList, emotionScaleItems])

  const emotionSummaryText = useMemo(() => {
    if (!emotionScaleItems.length) {
      return `${queriedStudentLabel} 학생의 감정 데이터가 아직 충분하지 않습니다.`
    }
    const positiveItem = emotionScaleItems[0]
    const pos = positiveItem?.score10 ?? positivePercent / 10
    return `${queriedStudentLabel} 학생은 선택한 기간 동안 전반적으로 긍정적인 감정을 많이 경험했습니다. 특히 평균 감정 강도는 약 ${pos.toFixed(
      1,
    )}/10 수준으로, 안정적인 정서 상태가 유지되고 있습니다.`
  }, [emotionScaleItems, positivePercent, queriedStudentLabel])

  const activityEmotionSummaryText = useMemo(() => {
    if (!activityEmotionCards.length) {
      return `${queriedStudentLabel} 학생의 활동별 감정 데이터가 아직 충분하지 않습니다.`
    }
    const sorted = [...activityEmotionCards].sort(
      (a, b) => b.score10 - a.score10,
    )
    const best = sorted[0]
    return `${queriedStudentLabel} 학생은 특히 「${best.activity}」 활동에서 ${best.emotion} 감정을 가장 강하게 느꼈습니다(강도 약 ${best.score10.toFixed(
      1,
    )}/10). 수확·관리·관찰 등 다양한 활동에서 전반적으로 긍정적인 감정이 고르게 나타나고 있습니다.`
  }, [activityEmotionCards, queriedStudentLabel])

  // 🔹 학생 목록 가져오기 (supabase)
  async function fetchStudents() {
    try {
      setError(null)
      const res = await apiFetch('/api/students?limit=1000&offset=0', {
        method: 'GET',
      })

      let list = []
      if (res && Array.isArray(res.items)) list = res.items
      else if (Array.isArray(res)) list = res

      // supabase 쿼리가 같은 학생을 여러 번 반환해도
      // 👉 id 기준으로 한 번만 나오도록 dedupe
      const normalized = (list || [])
        .map(item => {
          const id =
            item.id ??
            item.student_id ??
            item.studentId ??
            item.uuid ??
            null
          const name =
            item.name ??
            item.student_name ??
            item.full_name ??
            item.display_name ??
            '이름 없음'
          return id ? { id: String(id), name } : null
        })
        .filter(Boolean)

      const seen = new Set()
      const unique = []
      for (const s of normalized) {
        if (!seen.has(s.id)) {
          seen.add(s.id)
          unique.push(s)
        }
      }

      setStudents(unique)
      // ❌ 자동으로 첫 번째 학생 선택하지 않음
      //    사용자가 직접 클릭해서 선택해야 함
    } catch (e) {
      console.error(e)
      setError('학생 목록을 불러오는 중 오류가 발생했습니다.')
      setStudents([])
      setSelectedStudentId('')
    }
  }

  // 🔹 특정 학생 + 기간의 대시보드 데이터 가져오기
  async function fetchDashboardData({ studentId, startDate, endDate }) {
    if (!studentId || !startDate || !endDate) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('studentId', studentId)
      params.set('startDate', startDate)
      params.set('endDate', endDate)

      // 백엔드: 이 파라미터로 supabase에서 조회
      const res = await apiFetch(`/api/dashboard?${params.toString()}`)

      if (!res) throw new Error('대시보드 데이터를 불러오지 못했습니다.')

      setMetrics({
        recordCount: res.metrics?.recordCount ?? 0,
        positivePercent: res.metrics?.positivePercent ?? 0,
      })

      setEmotionData(
        Array.isArray(res.emotionDistribution)
          ? res.emotionDistribution
          : [],
      )
      setActivitySeries(
        Array.isArray(res.activitySeries) ? res.activitySeries : [],
      )

      if (Array.isArray(res.activityAbilityList)) {
        setActivityAbilityList(
          res.activityAbilityList.map(item => ({
            id: item.id ?? item.activity_id,
            activity: item.activity ?? item.activity_name ?? '활동',
            date: item.date_label ?? item.date ?? '',
            levelType: item.level_type ?? item.levelType ?? 'good',
            levelLabel: item.level_label ?? item.levelLabel ?? '우수',
            difficultyRatio: item.difficulty_ratio ?? item.difficultyRatio ?? 0,
            normalRatio: item.normal_ratio ?? item.normalRatio ?? 0,
            goodRatio: item.good_ratio ?? item.goodRatio ?? 0,
            totalScore: item.total_score ?? item.totalScore ?? 0,
            hours: item.hours_label ?? item.hours ?? '',
            mainSkills: item.main_skills ?? item.mainSkills ?? [],
          })),
        )
      } else {
        setActivityAbilityList([])
      }

      // 실제 조회에 사용된 학생/기간 저장
      const qStudent =
        students.find(s => s.id === studentId) || selectedStudent || null
      setQueriedStudent(qStudent)
      setQueriedStartDate(startDate)
      setQueriedEndDate(endDate)
    } catch (e) {
      console.error(e)
      setError(e.message || '대시보드 조회 중 오류가 발생했습니다.')
      setMetrics({ recordCount: 0, positivePercent: 0 })
      setEmotionData([])
      setActivitySeries([])
      setActivityAbilityList([])
    } finally {
      setLoading(false)
    }
  }

  // 🔹 첫 진입 시: 학생 목록만 가져오기
  useEffect(() => {
    fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🔹 검색 버튼 클릭
  function handleSearch(e) {
    e.preventDefault()
    if (!selectedStudentId) {
      alert('학생을 선택해 주세요.')
      return
    }
    if (!startDate || !endDate) {
      alert('시작일과 종료일을 모두 선택해 주세요.')
      return
    }
    if (isInvalidRange) {
      alert('시작일이 종료일보다 늦을 수 없습니다. 기간을 다시 선택해 주세요.')
      return
    }

    fetchDashboardData({
      studentId: selectedStudentId,
      startDate,
      endDate,
    })
  }

  const excellentCount = abilityList.filter(
    a => a.levelType === 'excellent',
  ).length
  const goodCount = abilityList.filter(a => a.levelType === 'good').length
  const challengeCount = abilityList.filter(
    a => a.levelType === 'challenge',
  ).length

  return (
    <Layout title="">
      <div className="dashboard-page">
        <div className="dashboard-inner">
          {loading && (
            <div style={{ marginTop: 12 }} className="muted">
              데이터를 불러오는 중입니다...
            </div>
          )}
          {error && (
            <div className="muted" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}

          {/* 상단: 학생 선택 + 기간 선택 */}
          <section className="dashboard-filter-card">
            <div className="dashboard-filter-grid">
              {/* 왼쪽: 학생 패널 */}
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
                      {queriedStudent
                        ? `${queriedStudent.name}님의 ${
                            queriedStartDate && queriedEndDate
                              ? `${queriedStartDate} ~ ${queriedEndDate}`
                              : '선택 기간'
                          } 기록 요약`
                        : '학생과 기간을 선택한 뒤 검색을 누르면 기록 요약이 표시됩니다.'}
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
                      max={endDate || undefined}
                      onChange={e => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="calendar-field">
                    <label>종료일</label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={e => setEndDate(e.target.value)}
                    />
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
                    시작일이 종료일보다 늦을 수 없습니다. 날짜를 다시 선택해
                    주세요.
                  </div>
                )}

                <div className="calendar-actions">
                  <button
                    type="submit"
                    className="btn"
                    disabled={!selectedStudentId}
                  >
                    검색
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* 감정 척도 카드 */}
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
                disabled={!emotionScaleItems.length}
              >
                상세보기
              </button>
            </div>

            <div className="emotion-scale-section">
              <div className="emotion-scale-section-title">
                전체 평균 감정 Top 5
              </div>
              {emotionScaleItems.length === 0 ? (
                <div className="muted">
                  감정 데이터가 아직 없습니다. 학생과 기간을 선택해 검색해
                  주세요.
                </div>
              ) : (
                <div className="emotion-scale-list">
                  {emotionScaleItems.map(item => (
                    <div key={item.name} className="emotion-scale-row">
                      <div className="emotion-scale-label">
                        <div className="emotion-name">{item.name}</div>
                        <div className="emotion-scale-minmax">나쁨</div>
                      </div>
                      <div className="emotion-scale-bar-wrap">
                        <div className="emotion-score-info">
                          <span className="emotion-score-main">
                            {item.score10.toFixed(1)}/10
                          </span>
                          <span className="emotion-score-state">좋음</span>
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
              )}
            </div>

            {/* 활동별 대표 감정 */}
            <div className="activity-emotion-section">
              <div className="activity-emotion-header">
                활동별 대표 감정
              </div>
              <div className="activity-emotion-grid">
                {activityEmotionCards.map(card => (
                  <div key={card.id} className="activity-emotion-card">
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

          {/* 활동 유형 분포 */}
          <section className="dashboard-card wide-card">
            <div className="activity-card-header">
              <div>
                <div className="card-title">활동 유형 분포</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  선택한 기간 동안 기록된 활동 시간을 날짜별로 살펴볼 수 있어요.
                </div>
              </div>
            </div>

            <div className="activity-chart-wrapper">
              {seriesData.length === 0 ? (
                <div className="muted">
                  활동 기록이 없습니다. 학생과 기간을 선택해 검색해 주세요.
                </div>
              ) : (
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
              )}
            </div>
          </section>

          {/* 활동별 능력 분석 */}
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

              {abilityList.length === 0 ? (
                <div className="activity-detail-empty">
                  활동별 능력 데이터가 없습니다.
                </div>
              ) : (
                abilityList.map(item => (
                  <div key={item.id} className="ability-table-row">
                    <div className="col-activity">
                      <div className="activity-name">{item.activity}</div>
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
                ))
              )}
            </div>

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
                <div className="summary-sub">안정적으로 수행한 활동</div>
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
        </div>
      </div>

      {/* 감정 상세 모달 */}
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
                  {queriedStudentLabel} 학생의 선택 기간 감정 키워드와
                  활동별 감정 척도를 한눈에 볼 수 있는 화면입니다.
                </p>
              </div>
              <div className="emotion-detail-badge">
                총 {emotionScaleItems.length}개 키워드
              </div>
            </div>

            <div className="emotion-detail-scroll">
              <section className="emotion-detail-section">
                <h4 className="emotion-detail-section-title">
                  전체 평균 감정 척도
                </h4>
                {emotionScaleItems.length === 0 ? (
                  <div className="muted">감정 데이터가 아직 없습니다.</div>
                ) : (
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
                )}
              </section>

              <section className="emotion-detail-section">
                <h4 className="emotion-detail-section-title">
                  전체 분석 요약
                </h4>
                <div className="emotion-detail-summary-text">
                  {emotionSummaryText}
                </div>
              </section>

              <section className="emotion-detail-section">
                <h4 className="emotion-detail-section-title">
                  활동별 감정 척도
                </h4>
                {activityEmotionCards.length === 0 ? (
                  <div className="activity-detail-empty">
                    활동별 감정 데이터가 충분하지 않습니다.
                  </div>
                ) : (
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
                  </div>
                )}
              </section>

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
              {queriedStudentLabel} 학생의 활동 유형별 수행 수준과 대표 감정을
              한눈에 볼 수 있는 화면입니다.
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
                    <div key={card.id} className="activity-detail-row">
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
