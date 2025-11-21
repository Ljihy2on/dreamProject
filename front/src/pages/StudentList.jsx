// src/pages/StudentList.jsx
import React, { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { apiFetch } from '../lib/api.js'

/**
 * 관리자 – 학생 관리 페이지 (Supabase students 테이블 기반)
 *
 * students 테이블 스키마 (요약)
 * - id: uuid (PK)
 * - name: text            // 학생 본명
 * - status: text          // 재학중 / 휴학 / 졸업 등
 * - admission_date: date  // 입학일
 * - birth_date: date      // 생년월일
 * - notes: text           // 별명 등 메모
 *
 * API 스펙(예시)
 * GET    /api/students
 *   -> [{ id, name, status, admission_date, birth_date, notes }]
 *
 * POST   /api/students
 *   body: {
 *     name,             // 본명
 *     notes,            // 별명
 *     status,
 *     admission_date,
 *     birth_date
 *   }
 *
 * PUT    /api/students/:id
 *   body 동일
 *
 * DELETE /api/students/:id
 */

const STATUS_OPTIONS = ['재학중', '휴학', '졸업']

// UI에서 사용하기 위한 label
function formatStudentLabel(s) {
  const realName = s.name || ''
  const nickname = s.notes || ''
  if (nickname && realName) return `${nickname}(${realName})`
  if (realName) return realName
  return nickname || '이름 없음'
}

export default function StudentList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 신규 학생 추가용
  const [newNickname, setNewNickname] = useState('')
  const [newRealName, setNewRealName] = useState('')
  const [newStatus, setNewStatus] = useState('재학중')
  const [newAdmissionDate, setNewAdmissionDate] = useState('')
  const [newBirthDate, setNewBirthDate] = useState('')
  const [creating, setCreating] = useState(false)

  // 수정 모달
  const [editingStudent, setEditingStudent] = useState(null)
  const [editNickname, setEditNickname] = useState('')
  const [editRealName, setEditRealName] = useState('')
  const [editStatus, setEditStatus] = useState('재학중')
  const [editAdmissionDate, setEditAdmissionDate] = useState('')
  const [editBirthDate, setEditBirthDate] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // 삭제 모달
  const [deletingStudent, setDeletingStudent] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchStudents()
  }, [])

  // ───────────────── fetch 목록 ─────────────────
  async function fetchStudents() {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/students', { method: 'GET' })

      // 백엔드 응답은 { count, items: [...] } 형태이므로 여기서 정규화
      let rawList = []
      if (Array.isArray(res)) {
        rawList = res
      } else if (Array.isArray(res?.items)) {
        rawList = res.items
      } else if (Array.isArray(res?.data)) {
        rawList = res.data
      } else {
        throw new Error('학생 목록 응답 형식이 올바르지 않습니다.')
      }

      const normalized = rawList.map(s => ({
        id: s.id,
        // 별명은 nickname / nick_name / notes 순으로 우선 사용
        nickname: s.nickname ?? s.nick_name ?? s.notes ?? '',
        // 본명은 realName / real_name / full_name / name 순으로 우선 사용
        realName: s.realName ?? s.real_name ?? s.full_name ?? s.name ?? '',
      }))

      setStudents(normalized)
    } catch (e) {
      console.error(e)
      setError(e.message || '학생 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // ───────────────── 신규 학생 추가 ─────────────────
  async function handleCreate(e) {
    e.preventDefault()
    if (!newNickname.trim() || !newRealName.trim()) return

    setCreating(true)
    setError('')

    try {
      const body = {
        // 백엔드 /api/students 는 name, status, notes 를 사용하므로
        // 본명 -> name, 별명 -> notes 에 저장한다.
        name: newRealName.trim(),
        status: '재학중',
        notes: newNickname.trim(),
      }

      const res = await apiFetch('/api/students', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const createdRaw =
        res?.data && res.data.id
          ? res.data
          : res // 공통 래퍼/직접 응답 둘 다 대응

      const created = {
        id: createdRaw.id,
        nickname:
          createdRaw.nickname ??
          createdRaw.nick_name ??
          createdRaw.notes ??
          newNickname.trim(),
        realName:
          createdRaw.realName ??
          createdRaw.real_name ??
          createdRaw.full_name ??
          createdRaw.name ??
          newRealName.trim(),
      }

      setStudents(prev => [...prev, created])
      setNewNickname('')
      setNewRealName('')
    } catch (e) {
      console.error(e)
      setError(e.message || '학생 추가 중 오류가 발생했습니다.')
    } finally {
      setCreating(false)
    }
  }


  // ───────────────── 수정 모달 ─────────────────
  function openEditModal(student) {
    setEditingStudent(student)
    setEditNickname(student.notes || '')
    setEditRealName(student.name || '')
    setEditStatus(student.status || '재학중')
    setEditAdmissionDate(student.admission_date || '')
    setEditBirthDate(student.birth_date || '')
  }

  function closeEditModal() {
    setEditingStudent(null)
    setEditNickname('')
    setEditRealName('')
    setEditStatus('재학중')
    setEditAdmissionDate('')
    setEditBirthDate('')
    setSavingEdit(false)
  }

  async function handleSaveEdit() {
    if (!editingStudent) return
    if (!editNickname.trim() || !editRealName.trim()) return

    setSavingEdit(true)
    setError('')

    try {
      const body = {
        // 서버에서는 name/notes 만 업데이트하면 되도록 맞춘다.
        name: editRealName.trim(),
        notes: editNickname.trim(),
      }

      const res = await apiFetch(`/api/students/${editingStudent.id}`, {
        method: 'PATCH',              // 서버는 PATCH 사용 중
        body: JSON.stringify(body),
      })

      const updatedRaw =
        res?.data && res.data.id
          ? res.data
          : { id: editingStudent.id, ...body }

      const updated = {
        id: updatedRaw.id,
        nickname:
          updatedRaw.nickname ??
          updatedRaw.nick_name ??
          updatedRaw.notes ??
          editNickname.trim(),
        realName:
          updatedRaw.realName ??
          updatedRaw.real_name ??
          updatedRaw.full_name ??
          updatedRaw.name ??
          editRealName.trim(),
      }

      setStudents(prev =>
        prev.map(s => (s.id === editingStudent.id ? updated : s)),
      )
      closeEditModal()
    } catch (e) {
      console.error(e)
      setError(e.message || '학생 정보 수정 중 오류가 발생했습니다.')
      setSavingEdit(false)
    }
  }

  // ───────────────── 삭제 모달 ─────────────────
  function openDeleteModal(student) {
    setDeletingStudent(student)
  }

  function closeDeleteModal() {
    setDeletingStudent(null)
    setDeleting(false)
  }

  async function handleConfirmDelete() {
    if (!deletingStudent) return
    setDeleting(true)
    setError('')

    try {
      await apiFetch(`/api/students/${deletingStudent.id}`, {
        method: 'DELETE',
      })
      setStudents(prev => prev.filter(s => s.id !== deletingStudent.id))
      closeDeleteModal()
    } catch (e) {
      console.error(e)
      setError(e.message || '학생 삭제 중 오류가 발생했습니다.')
      setDeleting(false)
    }
  }

  const studentCount = students.length

  // ───────────────── 렌더 ─────────────────
  return (
    <Layout title="관리자">
      <div className="report-page">
        <div className="report-header">
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            학생 정보를 관리하세요
          </p>
        </div>

        {/* 에러 */}
        {error && (
          <div
            style={{
              marginTop: 12,
              marginBottom: 4,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* 신규 학생 추가 카드 */}
        <section
          style={{
            marginTop: 16,
            padding: 24,
            borderRadius: 18,
            border: '1px solid #e5e7eb',
            background: '#ffffff',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            신규 학생 추가
          </h2>
          <p
            className="muted"
            style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}
          >
            새로운 학생의 본명과 별명을 입력하여 추가하세요
          </p>

          <form
            onSubmit={handleCreate}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr 1.1fr 0.9fr 0.9fr auto',
              gap: 16,
              alignItems: 'flex-end',
            }}
          >
            {/* 별명 */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  marginBottom: 6,
                  color: '#111827',
                }}
              >
                학생 별명
              </label>
              <input
                type="text"
                placeholder="예: 배짱"
                value={newNickname}
                onChange={e => setNewNickname(e.target.value)}
                style={{
                  width: '50%',
                  padding: '14px 18px',
                  borderRadius: 16,
                  border: '1px solid transparent',
                  background: '#f3f4f6',
                  fontSize: 14,
                }}
              />
            </div>

            {/* 본명 */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  marginBottom: 6,
                  color: '#111827',
                }}
              >
                학생 본명
              </label>
              <input
                type="text"
                placeholder="예: 김배짱"
                value={newRealName}
                onChange={e => setNewRealName(e.target.value)}
                style={{
                  width: '50%',
                  padding: '14px 18px',
                  borderRadius: 16,
                  border: '1px solid transparent',
                  background: '#f3f4f6',
                  fontSize: 14,
                }}
              />
            </div>

            {/* 상태 */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  marginBottom: 6,
                  color: '#111827',
                }}
              >
                상태
              </label>
              <select
                value={newStatus}
                onChange={e => setNewStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: 16,
                  border: '1px solid transparent',
                  background: '#f3f4f6',
                  fontSize: 14,
                  appearance: 'none',
                }}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* 입학일 */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  marginBottom: 6,
                  color: '#111827',
                }}
              >
                입학일
              </label>
              <input
                type="date"
                value={newAdmissionDate}
                onChange={e => setNewAdmissionDate(e.target.value)}
                style={{
                  width: '70%',
                  padding: '12px 14px',
                  borderRadius: 16,
                  border: '1px solid transparent',
                  background: '#f3f4f6',
                  fontSize: 14,
                }}
              />
            </div>

            {/* 추가 버튼 (생년월일은 수정 모달에서도 입력 가능하도록 옵션) */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <button
                type="submit"
                disabled={creating}
                style={{
                  borderRadius: 999,
                  padding: '12px 22px',
                  border: 'none',
                  background: '#020617',
                  color: '#ffffff',
                  fontSize: 14,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: creating ? 'default' : 'pointer',
                  opacity: creating ? 0.7 : 1,
                }}
              >
                <span>👤+</span>
                <span>추가</span>
              </button>
            </div>
          </form>
        </section>

        {/* 학생 목록 카드 */}
        <section
          style={{
            marginTop: 18,
            padding: 24,
            borderRadius: 18,
            border: '1px solid #e5e7eb',
            background: '#ffffff',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              학생 목록
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              현재 등록된 학생: {studentCount}명
            </div>
          </div>

          {/* 헤더 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 120px',
              padding: '8px 16px',
              fontSize: 13,
              color: '#6b7280',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <div style={{ textAlign: 'left' }}>#</div>
            <div>학생 정보</div>
            <div style={{ textAlign: 'right' }}>작업</div>
          </div>

          {/* 목록 */}
          {loading ? (
            <div style={{ padding: 16, fontSize: 13 }}>불러오는 중…</div>
          ) : students.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13 }} className="muted">
              등록된 학생이 없습니다. 위에서 학생을 추가해 주세요.
            </div>
          ) : (
            students.map((s, index) => {
              const label = formatStudentLabel(s)
              const initial = label.charAt(0)
              const isEven = (index + 1) % 2 === 0
              const admission = s.admission_date || ''
              const status = s.status || '재학중'

              return (
                <div
                  key={s.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 120px',
                    alignItems: 'center',
                    padding: '10px 16px',
                    fontSize: 14,
                    background: isEven ? '#f9fafb' : 'transparent',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  {/* 번호 */}
                  <div>{index + 1}</div>

                  {/* 학생 정보 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        border: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        background: '#ffffff',
                      }}
                    >
                      {initial}
                    </div>
                    <div>
                      <div>{label}</div>
                      <div
                        className="muted"
                        style={{ fontSize: 12, marginTop: 2 }}
                      >
                        {status}
                        {admission && ` · 입학일 ${admission}`}
                      </div>
                    </div>
                  </div>

                  {/* 작업 버튼 */}
                  <div
                    style={{
                      textAlign: 'right',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 12,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openEditModal(s)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#2563eb',
                        fontSize: 14,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      ✏️ 수정
                    </button>
                    <button
                      type="button"
                      onClick={() => openDeleteModal(s)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#ef4444',
                        fontSize: 14,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      🗑 삭제
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </section>

        {/* 주의 카드 */}
        <section
          style={{
            marginTop: 16,
            padding: 18,
            borderRadius: 18,
            border: '1px solid #fee2e2',
            background: '#fef2f2',
            fontSize: 12,
            color: '#b91c1c',
          }}
        >
          <strong style={{ marginRight: 4 }}>주의:</strong>
          학생을 삭제하면 해당 학생의 모든 데이터가 대시보드와 업로드 화면에서
          제거됩니다.
        </section>
      </div>

      {/* 수정 모달 */}
      {editingStudent && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 520 }}>
            <h3>학생 정보 수정</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
              학생의 본명, 별명 및 상태를 수정할 수 있습니다
            </p>

            <div className="modal-form">
              <label>
                학생 별명
                <input
                  type="text"
                  value={editNickname}
                  onChange={e => setEditNickname(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>

              <label>
                학생 본명
                <input
                  type="text"
                  value={editRealName}
                  onChange={e => setEditRealName(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>

              <label>
                상태
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                  style={{ marginTop: 4 }}
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                입학일
                <input
                  type="date"
                  value={editAdmissionDate || ''}
                  onChange={e => setEditAdmissionDate(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>

              <label>
                생년월일
                <input
                  type="date"
                  value={editBirthDate || ''}
                  onChange={e => setEditBirthDate(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={closeEditModal}
                disabled={savingEdit}
              >
                취소
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deletingStudent && (
        <div className="modal-backdrop">
          <div
            className="modal-card"
            style={{
              maxWidth: 520,
              textAlign: 'left',
            }}
          >
            <h3>학생을 삭제하시겠습니까?</h3>
            <p
              className="muted"
              style={{ fontSize: 13, marginBottom: 18, marginTop: 8 }}
            >
              <strong>{formatStudentLabel(deletingStudent)}</strong> 학생을
              삭제하면 모든 관련 데이터가 제거됩니다. 이 작업은 되돌릴 수
              없습니다.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                취소
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#ef4444' }}
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export { StudentList }
