// src/components/Layout.jsx
import React from 'react'
import Header from './TopNav'

export default function Layout({ title, children }) {
  return (
    <div className="app-root">
      {/* 상단 공통 네비게이션 */}
      <Header />

      {/* 모든 페이지 공통: 왼쪽 여백 + 중앙 정렬 */}
      <main className="dashboard-page">
        <div className="dashboard-inner">
          {title && <h1 className="page-title">{title}</h1>}

          {/* 실제 각 페이지의 내용 */}
          <div className="page-body">
            {children}
          </div>
        </div>
      </main>

      <footer className="app-footer">© 꿈이 자라는 뜰</footer>
    </div>
  )
}
