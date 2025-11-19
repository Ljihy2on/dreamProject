// src/pages/StudentList.jsx
import React, { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { apiFetch } from '../lib/api.js'

/**
 * 관리자 – 학생 관리 페이지
 *
 * API 스펙(예시)
 * GET    /api/students
 *   -> [{ id, nickname, realName }]
 *
 * POST   /api/students
 *   body: { nickname, realName }
 *
 * PUT    /api/students/:id
 *   body: { nickname, realName }
 *
 * DELETE /api/students/:id
 */

export default function StudentList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 신규 학생 추가용
  const [newNickname, setNewNickname] = useState('')
  const [newRealName, setNewRealName] = useState('')
  const [creating, setCreating] = useState(false)

  // 수정 모달
  const [editingStudent, setEditingStudent] = useState(null)
  const [editNickname, setEditNickname] = useState('')
  const [editRealName, setEditRealName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // 삭제 모달
  const [deletingStudent, setDeletingStudent] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchStudents()
  }, [])

  async function fetchStudents() {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/students', { method: 'GET' })

      if (Array.isArray(res)) {
        setStudents(res)
      } else if (Array.isArray(res?.data)) {
        setStudents(res.data)
      } else {
        throw new Error('학생 목록 응답 형식이 올바르지 않습니다.')
      }
    } catch (e) {
      console.error(e)
      setError(e.message || '학생 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 신규 학생 추가
  async function handleCreate(e) {
    e.preventDefault()
    if (!newNickname.trim() || !newRealName.trim()) return

    setCreating(true)
    setError('')

    try {
      const body = {
        nickname: newNickname.trim(),
        realName: newRealName.trim(),
      }

      const res = await apiFetch('/api/students', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const created =
        res?.data && res.data.id
          ? res.data
          : res // 공통 래퍼/직접 응답 둘 다 대응

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

  // 수정 모달 열기
  function openEditModal(student) {
    setEditingStudent(student)
    setEditNickname(student.nickname || '')
    setEditRealName(student.realName || '')
  }

  function closeEditModal() {
    setEditingStudent(null)
    setEditNickname('')
    setEditRealName('')
    setSavingEdit(false)
  }

  // 수정 저장
  async function handleSaveEdit() {
    if (!editingStudent) return
    if (!editNickname.trim() || !editRealName.trim()) return

    setSavingEdit(true)
    setError('')

    try {
      const body = {
        nickname: editNickname.trim(),
        realName: editRealName.trim(),
      }

      const res = await apiFetch(`/api/students/${editingStudent.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })

      const updated =
        res?.data && res.data.id
          ? res.data
          : { ...editingStudent, ...body }

      setStudents(prev =>
        prev.map(s => (s.id === editingStudent.id ? updated : s))
      )
      closeEditModal()
    } catch (e) {
      console.error(e)
      setError(e.message || '학생 정보 수정 중 오류가 발생했습니다.')
      setSavingEdit(false)
    }
  }

  // 삭제 모달 열기/닫기
  function openDeleteModal(student) {
    setDeletingStudent(student)
  }

  function closeDeleteModal() {
    setDeletingStudent(null)
    setDeleting(false)
  }

  // 삭제 확정
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

  return (
    <Layout title="관리자">
      {/* 페이지 제목 아래 본문 영역 */}
      <div className="report-page">
        <div className="report-header">
          {/* Layout에서 이미 h1.page-title 로 "관리자" 보여주므로
              여기서는 부제목만 표시 */}
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            학생 정보를 관리하세요
          </p>
        </div>

        {/* 에러 메시지 */}
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
              gridTemplateColumns: '1.1fr 1.1fr auto',
              gap: 16,
              alignItems: 'flex-end',
            }}
          >
            {/* 학생 별명 */}
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
                placeholder="예: 개미, 씽씽"
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

            {/* 학생 본명 */}
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
                placeholder="예: 김철수, 박영희"
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

            {/* 추가 버튼 */}
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

          {/* 헤더 row */}
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
              const initial = (s.nickname || s.realName || '?').charAt(0)
              const isEven = (index + 1) % 2 === 0
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
                      <div>
                        {s.nickname}({s.realName})
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

      {/* ───── 수정 모달 ───── */}
      {editingStudent && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 520 }}>
            <h3>학생 정보 수정</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
              학생의 본명과 별명을 수정할 수 있습니다
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

      {/* ───── 삭제 확인 모달 ───── */}
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
              <strong>
                {deletingStudent.nickname}({deletingStudent.realName})
              </strong>{' '}
              학생을 삭제하면 모든 관련 데이터가 제거됩니다. 이 작업은 되돌릴 수
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
