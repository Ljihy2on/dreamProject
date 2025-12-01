// src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { apiFetch } from '../lib/api.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

// --- 데이터 처리 헬퍼 함수 (기존 로직 유지) ---
const asArray = v => (Array.isArray(v) ? v : [])

function normalizeStudentsResponse(res) {
  let list = []
  if (res && Array.isArray(res.items)) list = res.items
  else if (Array.isArray(res)) list = res
  return list.map(item => ({
    id: String(item.id ?? item.student_id ?? item.uuid),
    name: item.name ?? item.display_name ?? '이름 없음'
  })).filter(item => item.id)
}

function normalizeActivityAbilityList(src) {
  return asArray(src).map(item => ({
    id: item.id || Math.random(),
    activity: item.activity ?? '활동',
    date: item.date ?? '',
    levelLabel: item.levelLabel ?? '보통',
    mainSkills: item.mainSkills ?? [],
  }))
}

// --- 대시보드 컴포넌트 ---
export default function Dashboard() {
  // 상태 관리
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [metrics, setMetrics] = useState({ recordCount: 0 })
  const [activitySeries, setActivitySeries] = useState([])
  const [activityAbilityList, setActivityAbilityList] = useState([])
  
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState({ name: '선생님' })

  // 1. 초기 데이터 로드 (학생 목록, 사용자)
  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}')
    if (userData.name) setUser(userData)

    async function loadStudents() {
      try {
        const res = await apiFetch('/api/students?limit=1000')
        const list = normalizeStudentsResponse(res)
        setStudents(list)
        if(list.length > 0) setSelectedStudentId(list[0].id) // 첫 학생 자동 선택
      } catch (e) { console.error(e) }
    }
    loadStudents()
  }, [])

  // 2. 검색(조회) 핸들러
  const handleSearch = async () => {
    if(!selectedStudentId) return
    
    setLoading(true)
    try {
      const query = `studentId=${selectedStudentId}&startDate=${startDate}&endDate=${endDate}`
      const res = await apiFetch(`/api/dashboard?${query}`)
      
      setMetrics({ recordCount: res.metrics?.recordCount ?? 0 })
      setActivitySeries(asArray(res.activitySeries))
      setActivityAbilityList(normalizeActivityAbilityList(res.activityAbilityList))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // 선택된 학생 정보
  const currentStudent = students.find(s => s.id === selectedStudentId)

  return (
    <Layout>
      <div className="dashboard-layout">
        
        {/* === 중앙 메인 콘텐츠 (하늘색 배경) === */}
        <main className="dashboard-center">
          
          {/* 상단 검색바 */}
          <div className="search-bar">
            <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}>
              <option value="">학생 선택</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <span style={{color:'#888'}}>~</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            <button className="orange-btn" onClick={handleSearch} style={{padding:'8px 16px', fontSize:14}}>
              조회
            </button>
          </div>

          {/* 환영 메시지 */}
          <h1 className="welcome-title">
            좋은 아침입니다,<br />
            {user.display_name || user.name || '선생님'}! ☀️
          </h1>
          
          {/* 그래프 영역 */}
          <div className="section-title">활동 유형 분포</div>
          <div style={{height: 300, background:'rgba(255,255,255,0.5)', borderRadius:20, padding:20}}>
             {activitySeries.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={activitySeries}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} />
                   <XAxis dataKey="date" />
                   <YAxis />
                   <Tooltip />
                   <Bar dataKey="minutes" fill="#7C3AED" radius={[10, 10, 0, 0]} barSize={20} />
                 </BarChart>
               </ResponsiveContainer>
             ) : (
               <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#666'}}>
                 데이터가 없습니다. 조회 버튼을 눌러보세요.
               </div>
             )}
          </div>

          {/* 최근 활동 분석 리스트 */}
          <div className="section-title">최근 능력 분석</div>
          <div className="card-grid" style={{gridTemplateColumns: '1fr'}}>
            {activityAbilityList.slice(0, 5).map((item, idx) => (
              <div key={idx} className="schedule-card">
                <div className="date-circle">
                   {item.levelLabel.slice(0,1)}
                </div>
                <div>
                  <div style={{fontWeight: 700}}>{item.activity}</div>
                  <div style={{fontSize: 12, color: '#666'}}>{item.date}</div>
                </div>
                <div style={{marginLeft:'auto', display:'flex', gap:5}}>
                  {item.mainSkills.map(s => (
                    <span key={s} style={{background:'#fff', padding:'2px 8px', borderRadius:10, fontSize:10, border:'1px solid #eee'}}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
             {activityAbilityList.length === 0 && (
               <div style={{
                  color:'#666',
                  textAlign:'center',
                  padding:20,
                  background: 'rgba(255,255,255,0.5)', 
                  borderRadius: 20, 
                  padding: 40, 
                  textAlign: 'center', 
                  color: '#666',
                  marginTop: 10
                }}>분석된 활동 데이터가 없습니다.</div>
             )}
          </div>
        </main>

        {/* === 오른쪽 패널 (흰색 배경) === */}
        <aside className="dashboard-right">
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 15, fontSize: 20 }}>
            <span>🔔</span><span>📅</span>
          </div>

          {/* 기록 수 위젯 */}
          <div className="widget-card">
            <div style={{
              width: 100, height: 100, borderRadius: '50%', border: '8px solid #f3f3f3',
              borderTop: '8px solid #FF6B6B', margin: '0 auto', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800
            }}>
              {metrics.recordCount}건
            </div>
            <h3 style={{ margin: '15px 0 5px' }}>누적 기록</h3>
            <p style={{ fontSize: 12, color: '#888' }}>
              {currentStudent ? `${currentStudent.name} 학생` : '학생 미선택'}
            </p>
          </div>

          {/* 리포트 바로가기 카드 */}
          <div className="upgrade-card" onClick={() => window.location.href='/report'}>
             <h3>AI 리포트<br/>생성하기</h3>
             <p style={{opacity:0.8, fontSize:13, marginTop:10}}>
               클릭하여 상세 분석 리포트를<br/>확인해보세요.
             </p>
          </div>

        </aside>
      </div>
    </Layout>
  )
}