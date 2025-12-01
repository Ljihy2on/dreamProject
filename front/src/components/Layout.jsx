// src/components/Layout.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logoImg from '../assets/logo.png' // 이미지 경로 확인

// --- 프로필 설정 모달 (TopNav에서 가져옴) ---
function ProfileModal({ user, onClose, onSave }) {
  const [nickname, setNickname] = useState(user?.display_name || user?.name || '사용자')
  
  function handleSubmit(e) {
    e.preventDefault()
    const nextUser = {
      ...(user || {}),
      display_name: nickname,
      name: nickname,
    }
    onSave(nextUser)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>프로필 설정</h3>
        <p style={{color:'#666', fontSize:14, marginBottom:20}}>화면에 표시될 이름을 변경할 수 있습니다.</p>
        
        <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:15}}>
          <div>
            <label style={{display:'block', marginBottom:5, fontWeight:600}}>별명</label>
            <input 
              value={nickname} 
              onChange={e => setNickname(e.target.value)} 
              style={{width:'100%', padding:10, border:'1px solid #ddd', borderRadius:8}}
            />
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:10}}>
            <button type="button" onClick={onClose} style={{padding:'10px 20px', borderRadius:8, border:'1px solid #ddd', background:'white', cursor:'pointer'}}>취소</button>
            <button type="submit" style={{padding:'10px 20px', borderRadius:8, border:'none', background:'#1F2937', color:'white', cursor:'pointer'}}>저장</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- 메인 레이아웃 (사이드바 포함) ---
export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  
  const [user, setUser] = useState(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  // 사용자 정보 불러오기
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user')
      if (raw) setUser(JSON.parse(raw))
    } catch (e) {
      console.error(e)
    }
  }, [])

  // 로그아웃 처리
  function handleLogout() {
    if(window.confirm('로그아웃 하시겠습니까?')){
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      navigate('/login')
    }
  }

  // 프로필 저장 처리
  function handleSaveProfile(nextUser) {
    setUser(nextUser)
    localStorage.setItem('user', JSON.stringify(nextUser))
  }

  const menuItems = [
    { label: '대시보드', path: '/dashboard', icon: '🖥️' },
    { label: '업로드', path: '/upload', icon: '📁' },
    { label: '리포트', path: '/report', icon: '📊' },
    { label: '학생 관리', path: '/students', icon: '👥' },
  ]

  return (
    <div className="app-container">
      {/* 1. 왼쪽 사이드바 */}
      <nav className="sidebar">
        <div className="brand-logo" onClick={() => navigate('/dashboard')}>
        </div>

        {/* 사용자 프로필 (클릭 시 모달 열림) */}
        <div className="user-profile-mini">
          <div className="avatar-circle">
            <img src={logoImg} alt="Profile" className="user-avatar-img" />
          </div>
          <div style={{fontWeight: 700, fontSize: 16, marginTop: 5}}>
            {user ? (user.display_name || user.name) : '선생님'}
          </div>
          <button 
            onClick={() => setIsProfileOpen(true)}
            style={{border:'none', background:'none', color:'#666', fontSize:12, cursor:'pointer', textDecoration:'underline', marginTop:5}}
          >
            프로필 설정
          </button>
        </div>

        {/* 메뉴 리스트 */}
        <div className="nav-menu">
          {menuItems.map((item) => (
            <div 
              key={item.label}
              className={`nav-item ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>

        {/* 하단 로그아웃 */}
        <div style={{marginTop: 'auto', paddingLeft: 20}}>
          <div className="nav-item" onClick={handleLogout} style={{color: '#FF6B6B'}}>
            <span>🚪</span> 로그아웃
          </div>
        </div>
      </nav>

      {/* 2. 메인 콘텐츠 영역 */}
      <div className="page-wrapper">
        {children}
      </div>

      {/* 프로필 수정 모달 */}
      {isProfileOpen && (
        <ProfileModal 
          user={user} 
          onClose={() => setIsProfileOpen(false)} 
          onSave={handleSaveProfile} 
        />
      )}
    </div>
  )
}