// src/pages/Login.jsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// 🔹 환경변수에서 백엔드 기본 URL 가져오기
// 예: https://dreamproject-ia6s.onrender.com
const API_BASE = (import.meta.env.VITE_API_BAS || '').replace(/\/+$/, '')

// 🔹 이 파일에서만 쓸 간단한 fetch 래퍼
async function apiRequest(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = `${API_BASE}${normalizedPath}`

  const res = await fetch(url, {
    // 기본 옵션 합치기
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  let body = null
  try {
    body = await res.json()
  } catch {
    // JSON 아니면 body는 null로 둠
  }

  if (!res.ok) {
    const error = new Error(body?.message || `Request failed: ${res.status}`)
    error.status = res.status
    error.body = body
    throw error
  }

  return body
}

// .env 에서 VITE_DEMO_MODE=true 로 두면
// 백엔드가 없어도 데모 로그인 허용
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

function SignupModal({ onClose }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    password2: '',
    name: '',
    phone: '',
    role: 'observer', // 'observer' | 'teacher'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function update(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSignup(e) {
    e.preventDefault()
    setError('')

    if (!form.email || !form.password || !form.password2 || !form.name) {
      setError('필수 항목을 모두 입력해주세요.')
      return
    }
    if (form.password !== form.password2) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    const payload = {
      email: form.email,
      password: form.password,
      display_name: form.name,
      phone: form.phone || null,
      role: form.role,
    }

    try {
      setLoading(true)

      // ✅ Render에 올려둔 백엔드로 직접 호출
      await apiRequest('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      alert('회원가입이 완료되었습니다. 이제 로그인해주세요.')
      onClose()
    } catch (err) {
      console.error(err)
      const msg = String(err?.message || '')
      const isBackendMissing =
        err?.status === 404 ||
        msg.includes('Not Found') ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError')

      // 데모 모드 + 백엔드 없음 → 안내만 하고 닫기
      if (DEMO_MODE && isBackendMissing) {
        alert(
          '데모 환경에서는 회원가입 정보가 실제로 저장되지는 않습니다.\n' +
            '방금 입력한 이메일/비밀번호로 바로 로그인해 보세요.'
        )
        onClose()
        return
      }

      setError(err?.body?.message || msg || '회원가입 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <button
          className="modal-close"
          aria-label="닫기"
          onClick={onClose}
          type="button"
        >
          ✕
        </button>

        <h3>회원가입</h3>
        <div className="muted">꿈이자라는뜰 플랫폼에 가입하세요</div>

        <form className="modal-form" onSubmit={handleSignup}>
          <label>이메일 *</label>
          <input
            type="email"
            value={form.email}
            onChange={e => update('email', e.target.value)}
            placeholder="example@email.com"
          />

          <label>비밀번호 *</label>
          <input
            type="password"
            value={form.password}
            onChange={e => update('password', e.target.value)}
            placeholder="비밀번호를 입력하세요"
          />

          <label>비밀번호 확인 *</label>
          <input
            type="password"
            value={form.password2}
            onChange={e => update('password2', e.target.value)}
            placeholder="비밀번호를 다시 입력하세요"
          />

          <label>이름 *</label>
          <input
            value={form.name}
            onChange={e => update('name', e.target.value)}
            placeholder="이름을 입력하세요"
          />

          <label>전화번호</label>
          <input
            value={form.phone}
            onChange={e => update('phone', e.target.value)}
            placeholder="010-1234-5678"
          />

          <label>유형 *</label>
          <div className="role-toggle">
            <button
              type="button"
              className={
                form.role === 'observer' ? 'role-btn active' : 'role-btn'
              }
              onClick={() => update('role', 'observer')}
            >
              꿈뜰 활동자
            </button>
            <button
              type="button"
              className={
                form.role === 'teacher' ? 'role-btn active' : 'role-btn'
              }
              onClick={() => update('role', 'teacher')}
            >
              교사
            </button>
          </div>

          {error && (
            <div className="error" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={onClose}
              disabled={loading}
            >
              취소
            </button>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? '가입 중...' : '가입하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSignup, setShowSignup] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.')
      return
    }

    try {
      setLoading(true)

      // ✅ Render 백엔드로 직접 로그인 요청
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      const token = res?.token
      const user = res?.user

      if (!token || !user) {
        if (!DEMO_MODE) {
          throw new Error('로그인 정보를 확인할 수 없습니다.')
        }
        // 데모 모드이면 아래 catch 에서 데모 로그인 처리
        throw new Error('Invalid login response')
      }

      // 정상 로그인
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      navigate('/upload')
    } catch (err) {
      console.error(err)
      const msg = String(err?.message || '')
      const isBackendMissing =
        err?.status === 404 ||
        msg.includes('Not Found') ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError')

      // 데모 모드 + 백엔드 없음/404 → 데모 로그인
      if (DEMO_MODE && isBackendMissing) {
        const demoUser = {
          id: 'demo-user-id',
          email,
          display_name: email ? email.split('@')[0] : '데모 사용자',
          role: 'observer',
        }
        localStorage.setItem('token', 'demo-token')
        localStorage.setItem('user', JSON.stringify(demoUser))
        alert('데모 모드로 로그인했습니다.')
        navigate('/upload')
        return
      }

      setError(err?.body?.message || msg || '로그인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // ✅ Layout/TopNav 없이 로그인 전용 화면만 렌더링
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">꿈이자라는뜰</div>
        <h2>로그인</h2>
        <div className="subtitle">
          플랫폼에 접속하려면 계정 정보로 로그인하세요.
        </div>

        <form className="auth-form" onSubmit={handleLogin}>
          <label>이메일</label>
          <input
            type="email"
            value={email}
            placeholder="example@email.com"
            onChange={e => setEmail(e.target.value)}
          />

          <label>비밀번호</label>
          <input
            type="password"
            value={password}
            placeholder="비밀번호"
            onChange={e => setPassword(e.target.value)}
          />

          <div className="auth-actions">
            <button className="btn" type="submit" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowSignup(true)}
            >
              회원가입
            </button>
          </div>

          {error && (
            <div className="error" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}
        </form>
      </div>

      {showSignup && <SignupModal onClose={() => setShowSignup(false)} />}
    </div>
  )
}
