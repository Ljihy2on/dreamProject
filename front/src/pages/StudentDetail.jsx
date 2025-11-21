import React, { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import Layout from '../components/Layout'

export default function StudentDetail({ studentId }) {
  const [student, setStudent] = useState(null)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!studentId) return

    (async () => {
      try {
        setLoading(true)
        setError('')

        // ✅ 학생 정보 불러오기: GET /api/students/:id
        const s = await apiFetch(`/api/students/${studentId}`).catch(() => null)
        setStudent(s || { id: studentId, name: '데모 학생' })

        // ✅ 활동 로그 불러오기: GET /api/log_entries?student_id=...
        const logsRes = await apiFetch(
          `/api/log_entries?student_id=${studentId}&limit=50&offset=0`
        ).catch(() => null)

        let acts = []
        if (logsRes) {
          // server.js에서 { count, items } 형태로 응답하는 경우
          if (Array.isArray(logsRes.items)) {
            acts = logsRes.items
          }
          // 단순 배열 응답인 경우까지 커버
          else if (Array.isArray(logsRes)) {
            acts = logsRes
          }
        }

        setActivities(acts || [])
      } catch (e) {
        console.error(e)
        setError('학생 정보 또는 활동 기록을 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    })()
  }, [studentId])

  if (!studentId) {
    return (
      <Layout title="학생 상세">
        <div>학생 ID가 필요합니다.</div>
      </Layout>
    )
  }

  return (
    <Layout title={student ? student.name : '학생 상세'}>
      <div style={{ marginBottom: 12 }}>
        요약: {student?.school || '학교 없음'} · {student?.grade || ''}
      </div>

      {loading && <div className="muted">불러오는 중...</div>}
      {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}

      <h3>활동</h3>
      <div>
        {activities.length === 0 ? (
          <div className="muted">활동 기록이 없습니다.</div>
        ) : (
          activities.map(a => (
            <div key={a.id} className="list-item">
              <div style={{ fontSize: 12 }}>
                {a.log_date || a.created_at || ''}
              </div>
              <div>{(a.log_content || a.content || '').slice(0, 200)}</div>
            </div>
          ))
        )}
      </div>
    </Layout>
  )
}

export { StudentDetail }
