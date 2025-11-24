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

// ---------- 헬퍼 함수들 ----------

// 배열 보정
const asArray = v => (Array.isArray(v) ? v : [])

// 학생 목록 응답 정리 + dedupe
function normalizeStudentsResponse(res) {
  let list = []

  if (res && Array.isArray(res.items)) list = res.items
  else if (Array.isArray(res)) list = res

  const normalized = list
    .map(item => {
      const id =
        item.id ?? item.student_id ?? item.studentId ?? item.uuid ?? null
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
  return unique
}

// 활동별 능력 분석 리스트 매핑
function normalizeActivityAbilityList(src) {
  const list = asArray(src)
  return list.map(item => ({
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
  }))
}

// ---------- 메인 컴포넌트 ----------

export default function Dashboard() {
  // 학생 선택/기간 선택
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // 실제 조회에 사용된 조건
  const [queriedStudent, setQueriedStudent] = useState(null)
  const [queriedStartDate, setQueriedStartDate] = useState('')
  const [queriedEndDate, setQueriedEndDate] = useState('')

  // 대시보드 데이터
  const [metrics, setMetrics] = useState({
    recordCount: 0,
  })
  const [emotionData, setEmotionData] = useState([])
  const [emotionDetails, setEmotionDetails] = useState([])
  const [activitySeries, setActivitySeries] = useState([])
  const [activityAbilityList, setActivityAbilityList] = useState([])
  const [activityDetails, setActivityDetails] = useState([])

  // 공통 상태
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 모달
  const [emotionModalOpen, setEmotionModalOpen] = useState(false)
  const [activityModalOpen, setActivityModalOpen] = useState(false)

  // 채팅
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState(null)

  // ---------- 파생 값들 ----------

  const recordCount = metrics?.recordCount ?? 0

  const emotionChartData = asArray(emotionData)
  const emotionDetailList = asArray(emotionDetails)
  const seriesData = asArray(activitySeries)
  const abilityList = asArray(activityAbilityList)
  const activityDetailRows = asArray(activityDetails)

  const isInvalidRange = startDate && endDate && startDate > endDate

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId),
    [students, selectedStudentId],
  )

  const queriedStudentLabel =
    queriedStudent?.name ||
    selectedStudent?.name ||
    (selectedStudentId ? '선택된 학생' : '해당')

  const emotionDetailsByName = useMemo(() => {
    const map = {}
    emotionDetailList.forEach(d => {
      if (d && d.emotion) {
        map[d.emotion] = d
      }
    })
    return map
  }, [emotionDetailList])

  // 감정 점수(0~10) + Top5
  // → 감정 분포(emotionDistribution)를 count 기준으로 정렬해서
  //    해당 기간 동안 "가장 많이 느낀 감정 Top 5"를 보여준다.
  const emotionScaleItems = useMemo(() => {
    if (!emotionChartData.length) return []

    // 서버에서 이미 count 기준으로 정렬되어 오지만,
    // 혹시 모를 경우를 위해 한 번 더 정렬
    const top = emotionChartData
      .slice()
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 5)

    // 가장 많이 느낀 감정을 10점, 나머지는 비율에 맞게 0~10으로 환산
    const maxCount =
      top.reduce((m, item) => Math.max(m, item.count || 0), 0) || 1

    return top.map(item => {
      const baseCount = item.count || 0
      const detail = emotionDetailsByName[item.name]
      const totalCount = detail?.totalCount ?? baseCount

      // 해당 감정이 등장한 활동 이름 모으기
      let topActivities = []
      if (detail && Array.isArray(detail.items)) {
        const actSet = new Set()
        detail.items.forEach(it => {
          if (Array.isArray(it.activities)) {
            it.activities.forEach(a => {
              if (a) actSet.add(a)
            })
          }
        })
        topActivities = Array.from(actSet).slice(0, 3)
      }

      const score10 =
        Math.round(((baseCount / (maxCount || 1)) * 10) * 10) / 10 // 소수 1자리

      return {
        ...item,
        score10,
        totalCount,
        topActivities,
      }
    })
  }, [emotionChartData, emotionDetailsByName])

  // 감정 상세 모달용 데이터
  // 서버에서 내려준 count(실제 횟수)를 그대로 사용해서
  // "해당 기간 동안 이 감정을 몇 회 느꼈는지"를 보여준다.
  const emotionDetailRows = useMemo(() => {
    if (!emotionChartData.length) return []

    return emotionChartData.map(item => {
      const count = item?.count ?? 0
      const ratio =
        recordCount > 0 ? Math.round((count / recordCount) * 100) : 0

      const desc =
        '해당 감정이 자주 등장한 날짜와 관련 활동을 함께 확인할 수 있습니다.'

      return { type: item.name, ratio, count, desc }
    })
  }, [emotionChartData, recordCount])

  // 활동별 대표 감정 카드
  const activityEmotionCards = useMemo(() => {
    if (!abilityList.length || !emotionScaleItems.length) return []
    const icons = ['🧺', '🌱', '🧹', '🔍']

    return abilityList.slice(0, 4).map((act, idx) => {
      const emo = emotionScaleItems[idx % emotionScaleItems.length]
      return {
        id: act.id,
        icon: icons[idx % icons.length],
        activity: act.activity,
        emotion: emo?.name ?? '감정',
        emotionCount: emo?.count ?? 0, // 👈 점수 대신 횟수
        description: act.date ? `${act.date} 활동` : '',
      }
    })
  }, [abilityList, emotionScaleItems])

  // 감정 요약 문장
  const emotionSummaryText = useMemo(() => {
    if (!emotionScaleItems.length) {
      return `${queriedStudentLabel} 학생의 감정 데이터가 아직 충분하지 않습니다.`
    }
    const top = emotionScaleItems[0]
    const topCount = top?.count ?? 0
    const topNames = emotionScaleItems.map(i => i.name).join(', ')
    return `${queriedStudentLabel} 학생은 선택한 기간 동안 「${top.name}」 감정을 가장 자주 경험했습니다(대략 ${topCount}회 내외). 상위 5개 주요 감정은 ${topNames} 입니다.`
  }, [emotionScaleItems, queriedStudentLabel])

  // 활동별 감정 요약 문장
  const activityEmotionSummaryText = useMemo(() => {
    if (!activityEmotionCards.length) {
      return `${queriedStudentLabel} 학생의 활동별 감정 데이터가 아직 충분하지 않습니다.`
    }

    // emotionCount 기준으로 가장 자주 등장한 활동 선택
    const sorted = [...activityEmotionCards].sort(
      (a, b) => (b.emotionCount || 0) - (a.emotionCount || 0),
    )
    const best = sorted[0]
    if (!best) {
      return `${queriedStudentLabel} 학생의 활동별 감정 데이터가 아직 충분하지 않습니다.`
    }

    return `${queriedStudentLabel} 학생은 특히 「${best.activity}」 활동에서 「${best.emotion}」 감정을 자주 경험했습니다. 수확·관리·관찰 등 다양한 활동에서 이러한 감정들이 나타나고 있습니다.`
  }, [activityEmotionCards, queriedStudentLabel])

  // 활동 상세 통계 (상세보기 모달 하단 카드용)
  const activityStats = useMemo(() => {
    if (!activityDetailRows.length) {
      return { total: 0, mostActive: null, typeCount: 0 }
    }
    const total = activityDetailRows.length
    const countByActivity = {}
    const typeSet = new Set()

    activityDetailRows.forEach(row => {
      const a = row.activity || '활동'
      countByActivity[a] = (countByActivity[a] || 0) + 1
      if (row.category) typeSet.add(row.category)
    })

    const mostActive =
      Object.entries(countByActivity).sort((a, b) => b[1] - a[1])[0][0]

    return { total, mostActive, typeCount: typeSet.size }
  }, [activityDetailRows])

  const activityDetailSummaryText = useMemo(() => {
    if (!activityDetailRows.length) {
      return `${queriedStudentLabel} 학생의 활동 데이터가 아직 충분하지 않습니다.`
    }
    const { total, mostActive, typeCount } = activityStats
    const activityLabel = mostActive || '활동'
    const typeLabel = typeCount > 0 ? `${typeCount}가지` : '여러 가지'
    return `${queriedStudentLabel} 학생은 선택한 기간 동안 총 ${total}회의 활동에 참여했습니다. 가장 자주 수행한 활동은 「${activityLabel}」이며, 총 ${typeLabel} 유형의 활동을 경험했습니다. 활동 기록을 통해 학생의 선호 활동과 강점을 더 잘 이해할 수 있습니다.`
  }, [activityDetailRows, activityStats, queriedStudentLabel])

  // 활동별 요약 카드 (매우 우수/우수/도전)
  const excellentCount = abilityList.filter(
    a => a.levelType === 'excellent',
  ).length
  const goodCount = abilityList.filter(a => a.levelType === 'good').length
  const challengeCount = abilityList.filter(
    a => a.levelType === 'challenge',
  ).length

  // ---------- 데이터 로딩 ----------

  async function fetchStudents() {
    try {
      setError(null)
      const res = await apiFetch('/api/students?limit=1000&offset=0', {
        method: 'GET',
      })
      const unique = normalizeStudentsResponse(res)
      setStudents(unique)
    } catch (e) {
      console.error(e)
      setError('학생 목록을 불러오는 중 오류가 발생했습니다.')
      setStudents([])
      setSelectedStudentId('')
    }
  }

  async function fetchDashboardData({ studentId, startDate, endDate }) {
    if (!studentId || !startDate || !endDate) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('studentId', studentId)
      params.set('startDate', startDate)
      params.set('endDate', endDate)

      const res = await apiFetch(`/api/dashboard?${params.toString()}`)
      if (!res) throw new Error('대시보드 데이터를 불러오지 못했습니다.')

      setMetrics({
        recordCount: res.metrics?.recordCount ?? 0,
      })
      setEmotionData(asArray(res.emotionDistribution))
      setEmotionDetails(asArray(res.emotionDetails))
      setActivitySeries(asArray(res.activitySeries))
      setActivityAbilityList(
        normalizeActivityAbilityList(res.activityAbilityList),
      )
      setActivityDetails(asArray(res.activityDetails))

      const qStudent =
        students.find(s => s.id === studentId) || selectedStudent || null
      setQueriedStudent(qStudent)
      setQueriedStartDate(startDate)
      setQueriedEndDate(endDate)
    } catch (e) {
      console.error(e)
      setError(e.message || '대시보드 조회 중 오류가 발생했습니다.')
      setMetrics({ recordCount: 0})
      setEmotionData([])
      setEmotionDetails([])
      setActivitySeries([])
      setActivityAbilityList([])
      setActivityDetails([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- 이벤트 핸들러 ----------

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

  // 채팅 토글
  function handleOpenChat() {
    if (isChatOpen) {
      setIsChatOpen(false)
      return
    }

    if (!queriedStudent || !queriedStartDate || !queriedEndDate) {
      alert('먼저 학생과 기간을 선택해 검색을 완료한 뒤에 채팅을 사용할 수 있습니다.')
      return
    }

    setChatError(null)
    setIsChatOpen(true)

    if (!chatMessages.length) {
      setChatMessages([
        {
          id: 'intro',
          role: 'assistant',
          content: `${queriedStudent.name} 학생의 ${queriedStartDate} ~ ${queriedEndDate} 기록을 기반으로 대화를 도와드릴게요.\n무엇이 궁금하신가요?`,
        },
      ])
    }
  }

  function handleCloseChat() {
    setIsChatOpen(false)
  }

  async function handleChatSubmit(e) {
    e.preventDefault()
    if (!chatInput.trim()) return

    if (!queriedStudent || !queriedStartDate || !queriedEndDate) {
      alert('대화를 시작하려면 먼저 학생과 기간을 선택해 검색해 주세요.')
      return
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
    }

    const nextMessages = [...chatMessages, userMessage]
    setChatMessages(nextMessages)
    setChatInput('')
    setChatLoading(true)
    setChatError(null)

    try {
      const payload = {
        studentId: queriedStudent?.id || selectedStudentId || null,
        studentName: queriedStudent?.name || null,
        startDate: queriedStartDate,
        endDate: queriedEndDate,
        message: userMessage.content,
        history: nextMessages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }

      const res = await apiFetch('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const aiText =
        (res && (res.answer || res.message || res.content || res.text)) ||
        'AI 응답을 불러오지 못했습니다. 백엔드 설정을 확인해 주세요.'

      const aiMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: aiText,
      }

      setChatMessages(prev => [...prev, aiMessage])
    } catch (err) {
      console.error(err)
      setChatError(
        err?.message ||
          '대화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      )
      const errorMessage = {
        id: `assistant-error-${Date.now()}`,
        role: 'assistant',
        content:
          '대화 중 오류가 발생했습니다. 서버 연결 상태를 확인해 주세요.',
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setChatLoading(false)
    }
  }

  // ---------- JSX ----------

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
                  <span role="img" aria-label="감정" />
                  <span>감정 척도</span>
                </div>
                <div className="emotion-scale-subtitle">
                  선택 기간 동안 자주 나타난 감정을 보여줍니다.
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
                가장 많이 느낀 감정 Top 5
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
                        <div className="emotion-count-text">
                          총 {(item.count ?? 0)}회
                        </div>
                      </div>
                      <div className="emotion-scale-bar-wrap">
                        <div className="emotion-score-info">
                          <span className="emotion-score-main">
                            {recordCount > 0
                              ? Math.round(
                                  ((item.count ?? 0) / recordCount) * 100,
                                )
                              : 0}
                            %
                          </span>
                          <span className="emotion-score-state">
                            전체 대비 빈도
                          </span>
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
                      <div className="activity-emotion-icon">{card.icon}</div>
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
                        {card.emotionCount != null && (
                          <span className="activity-emotion-score">
                            {card.emotionCount}회
                          </span>
                        )}
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
              <button
                type="button"
                className="btn secondary emotion-detail-btn"
                onClick={() => setActivityModalOpen(true)}
                disabled={!activityDetailRows.length}
              >
                상세보기
              </button>
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
                  <Tooltip formatter={value => [`${value}분`, '활동 시간']} />
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
                <div className="col-score">활동 시간</div>
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
                        {item.hours || '-'}
                      </div>
                      <div className="muted">기록된 시간/범위</div>
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
              {/* 1) 전체 평균 감정 척도 카드 */}
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
                      const ratio = row?.ratio ?? 0
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
                              전체 대비
                            </span>
                            <span className="emotion-detail-score">
                              {ratio}%
                            </span>
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

              {/* 2) 감정별 날짜/활동 내역 */}
              <section className="emotion-detail-section">
                <h4 className="emotion-detail-section-title">
                  감정별 날짜/활동 내역
                </h4>
                {emotionDetailList.length === 0 ? (
                  <div className="muted">
                    감정별 날짜/활동 데이터가 아직 없습니다.
                  </div>
                ) : (
                  <div className="emotion-timeline-grid">
                    {emotionDetailList.map(detail => (
                      <div
                        key={detail.emotion}
                        className="emotion-timeline-card"
                      >
                        <div className="emotion-timeline-header">
                          <span className="emotion-detail-name">
                            {detail.emotion}
                          </span>
                          <span className="emotion-detail-count-pill">
                            총 {detail.totalCount}회
                          </span>
                        </div>
                        <div className="emotion-timeline-list">
                          {detail.items.map(item => (
                            <div
                              key={`${detail.emotion}-${item.date}`}
                              className="emotion-timeline-row"
                            >
                              <div className="emotion-timeline-date">
                                {item.date}
                              </div>
                              <div className="emotion-timeline-count">
                                {item.count}회
                              </div>
                              <div className="emotion-timeline-activities">
                                {item.activities && item.activities.length
                                  ? item.activities.join(', ')
                                  : '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 3) 전체 분석 요약 */}
              <section className="emotion-detail-section">
                <h4 className="emotion-detail-section-title">
                  전체 분석 요약
                </h4>
                <div className="emotion-detail-summary-text">
                  {emotionSummaryText}
                </div>
              </section>

              {/* 4) 활동별 감정 척도 */}
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
                          {card.emotionCount != null && (
                            <span className="activity-emotion-detail-score">
                              {card.emotionCount}회
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 5) 활동별 감정 분석 요약 */}
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

            <div className="activity-detail-header">
              <div>
                <div className="activity-detail-title">
                  📊 활동 유형 분포
                </div>
                <div className="activity-detail-subtitle">
                  <div className="muted">활동 상세 내역</div>
                  <div className="activity-detail-student">
                    {queriedStudentLabel}의 일자별 활동 기록
                    {queriedStartDate && queriedEndDate
                      ? ` (${queriedStartDate} ~ ${queriedEndDate})`
                      : ''}
                  </div>
                </div>
              </div>
            </div>

            <div className="activity-detail-scroll">
              <section className="activity-detail-section">
                <div className="activity-detail-table">
                  <div className="activity-detail-table-head">
                    <div>날짜</div>
                    <div>활동</div>
                    <div>감정</div> 
                    <div>유형</div>
                    <div>활동 유형</div>
                    <div>학생 코멘트</div>
                  </div>

                  {activityDetailRows.length === 0 ? (
                    <div className="activity-detail-empty">
                      선택한 기간에 대한 활동 데이터가 충분하지 않습니다.
                    </div>
                  ) : (
                    activityDetailRows.map((row, idx) => (
                      <div
                        key={`${row.date}-${row.activity}-${idx}`}
                        className="activity-detail-row"
                      >
                        <div>{row.date}</div>
                        <div>{row.activity}</div>
                        <div>
                          {row.emotion && (
                            <span className="emotion-chip">
                              {row.emotion}
                            </span>
                          )}
                        </div>
                        <div>
                          {row.category && (
                            <span className="skill-chip">
                              {row.category}
                            </span>
                          )}
                        </div>
                        <div>
                          {row.activityType && (
                            <span className="skill-chip">
                              {row.activityType}
                            </span>
                          )}
                        </div>
                        <div className="activity-detail-comment">
                          {row.comment || '-'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="activity-detail-section">
                <div className="activity-detail-summary-grid">
                  <div className="ability-summary-card summary-excellent">
                    <div className="summary-title">총 활동 횟수</div>
                    <div className="summary-main">
                      {activityStats.total}
                      <span className="summary-sub">회</span>
                    </div>
                  </div>
                  <div className="ability-summary-card summary-good">
                    <div className="summary-title">가장 많은 활동</div>
                    <div className="summary-main">
                      {activityStats.mostActive || '-'}
                    </div>
                  </div>
                  <div className="ability-summary-card summary-challenge">
                    <div className="summary-title">활동 유형 수</div>
                    <div className="summary-main">
                      {activityStats.typeCount}
                      <span className="summary-sub">가지</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="activity-detail-section">
                <h4 className="activity-detail-section-title">
                  활동 분석 요약
                </h4>
                <div className="activity-analysis-box">
                  {activityDetailSummaryText}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Gemini 대시보드 채팅 패널 */}
      {isChatOpen && (
        <div className="dashboard-chat-overlay">
          <div className="dashboard-chat-window">
            <div className="dashboard-chat-header">
              <div>
                <div className="dashboard-chat-title">Gemini 대화</div>
                <div className="dashboard-chat-subtitle">
                  {queriedStudentLabel} 학생 · {queriedStartDate || '시작일'} ~{' '}
                  {queriedEndDate || '종료일'}
                </div>
              </div>
              <button
                type="button"
                className="chat-close-btn"
                onClick={handleCloseChat}
                aria-label="채팅 닫기"
              >
                ✕
              </button>
            </div>

            <div className="dashboard-chat-body">
              <div className="dashboard-chat-messages">
                {chatMessages.length === 0 ? (
                  <div className="chat-empty muted">
                    {queriedStudent && queriedStartDate && queriedEndDate
                      ? `${queriedStudentLabel} 학생의 ${queriedStartDate} ~ ${queriedEndDate} 데이터에 대해 궁금한 점을 물어보세요.`
                      : '학생과 기간을 선택해 검색한 뒤 채팅을 시작할 수 있습니다.'}
                  </div>
                ) : (
                  chatMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={
                        'chat-message ' +
                        (msg.role === 'user'
                          ? 'chat-message-user'
                          : 'chat-message-assistant')
                      }
                    >
                      <div className="chat-message-bubble">
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {chatLoading && (
                <div className="chat-status muted">
                  Gemini가 답변을 작성하고 있습니다...
                </div>
              )}
              {chatError && (
                <div className="chat-error-text">{chatError}</div>
              )}

              <form
                className="dashboard-chat-input-row"
                onSubmit={handleChatSubmit}
              >
                <textarea
                  className="dashboard-chat-input"
                  rows={2}
                  placeholder="예: 이 기간 동안 학생의 감정 변화 특징을 정리해줘"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  className="btn chat-send-btn"
                  disabled={chatLoading || !chatInput.trim()}
                >
                  {chatLoading ? '전송 중...' : '전송'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 오른쪽 하단 플로팅 채팅 버튼 */}
      <button
        type="button"
        className="floating-chat-btn"
        onClick={handleOpenChat}
        aria-label="Gemini 채팅 열기"
      >
        💬
      </button>
    </Layout>
  )
}

export { Dashboard }
