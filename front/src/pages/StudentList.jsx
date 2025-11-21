// src/pages/StudentDetail.jsx
import React, { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import Layout from '../components/Layout'
import { useParams } from 'react-router-dom'

function normalizeStudentResponse(res, studentId) {
  if (!res) return { id: studentId, name: '데모 학생' }

  // server.js 에서 { data: {...} } 또는 { data: [...] } 형태일 수 있음
  if (Array.isArray(res?.data)) {
    return res.data[0] || { id: studentId, name: '데모 학생' }
  }
  if (res?.data && typeof res.data === 'object') {
    return res.data
  }

  // 단순 배열 응답
  if (Array.isArray(res)) {
    return res[0] || { id: studentId, name: '데모 학생' }
  }

  // 그냥 객체 하나 내려온 경우
  return res
}

function normalizeLogsResponse(res) {
  if (!res) return []

  // { items: [...] }
  if (Array.isArray(res.items)) return res.items

  // { data: [...] }
  if (Array.isArray(res.data)) return res.data

  // 단순 배열
  if (Array.isArray(res)) return res

  return []
}

export default function StudentDetail(props) {
  const params = useParams()
  const effectiveStudentId = props.studentId ?? params.studentId

  const [student, setStudent] = useState(null)
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!effectiveStudentId) return

    ;(async () => {
      try {
        setLoading(true)
        setError('')

        // ✅ 학생 정보 불러오기
        const resStudent = await apiFetch(
          `/api/students/${effectiveStudentId}`,
        ).catch(() => null)
        const normalizedStudent = normalizeStudentResponse(
          resStudent,
          effectiveStudentId,
        )
        setStudent(normalizedStudent)

        // ✅ 활동 로그 불러오기
        const logsRes = await apiFetch(
          `/api/log_entries?student_id=${effectiveStudentId}&limit=50&offset=0`,
        ).catch(() => null)
        const acts = normalizeLogsResponse(logsRes)
        setActivities(acts)
      } catch (e) {
        console.error(e)
        setError('학생 정보 또는 활동 기록을 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    })()
  }, [effectiveStudentId])

  // 이름/별명 매핑 (StudentList 와 동일한 규칙)
  const nickname = student?.nickname ?? student?.notes ?? ''
  const realName = student?.realName ?? student?.name ?? ''
  const displayName =
    nickname && realName
      ? `${nickname}(${realName})`
      : nickname || realName || '학생 상세'

  // 기타 필드들
  const school = student?.school || '학교 정보 없음'
  const grade = student?.grade || ''
  const status = student?.status || '재학중'

  const admissionDate = student?.admission_date
    ? new Date(student.admission_date).toLocaleDateString('ko-KR')
    : null
  const birthDate = student?.birth_date
    ? new Date(student.birth_date).toLocaleDateString('ko-KR')
    : null

  if (!effectiveStudentId) {
    return (
      <Layout title="학생 상세">
        <div style={{ padding: 16 }}>학생 ID가 필요합니다.</div>
      </Layout>
    )
  }

  return (
    <Layout title={displayName}>
      {/* 상단 학생 요약 카드 */}
      <div
        style={{
          marginBottom: 16,
          padding: 20,
          borderRadius: 18,
          border: '1px solid #e5e7eb',
          background: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 600,
              background: '#f9fafb',
            }}
          >
            {(nickname || realName || '학').charAt(0)}
          </div>
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {displayName}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {school}
              {grade ? ` · ${grade}` : ''}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 13,
          }}
        >
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              background: '#eff6ff',
              color: '#1d4ed8',
            }}
          >
            상태: {status}
          </div>
          {admissionDate && (
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: '#f9fafb',
              }}
            >
              입학일: {admissionDate}
            </div>
          )}
          {birthDate && (
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: '#f9fafb',
              }}
            >
              생년월일: {birthDate}
            </div>
          )}
          {student?.notes && (
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: '#f3f4f6',
              }}
            >
              별명 메모: {student.notes}
            </div>
          )}
        </div>
      </div>

      {/* 로딩 / 에러 */}
      {loading && (
        <div className="muted" style={{ marginBottom: 8 }}>
          불러오는 중...
        </div>
      )}
      {error && (
        <div
          className="error"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 10,
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* 활동 리스트 */}
      <section>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          활동 기록
        </h3>

        {activities.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            활동 기록이 없습니다.
          </div>
        ) : (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            {activities.map(a => {
              const dateLabel =
                a.log_date || a.created_at || a.activity_date || ''
              const textSnippet =
                (a.log_content ||
                  a.content ||
                  a.raw_text ||
                  a.text ||
                  '') || ''

              return (
                <div
                  key={a.id}
                  className="list-item"
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #f3f4f6',
                    background: '#ffffff',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      marginBottom: 4,
                      color: '#6b7280',
                    }}
                  >
                    {dateLabel}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                    {textSnippet.slice(0, 200)}
                    {textSnippet.length > 200 && '…'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </Layout>
  )
}

export { StudentDetail }
