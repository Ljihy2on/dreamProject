// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router-dom'

import Login from './pages/Login.jsx'
import StudentList from './pages/StudentList.jsx'
import StudentDetail from './pages/StudentDetail.jsx'
import UploadPage from './pages/UploadPage.jsx'
import TextViewer from './pages/TextViewer.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ReportPreview from './pages/Report.jsx'
import RequireAuth from './components/RequireAuth'

// /students/:id → StudentDetail에 id props로 넘기는 래퍼
function StudentDetailWrapper() {
  const { id } = useParams()
  return <StudentDetail studentId={id} />
}

// /text/:uploadId → TextViewer에 uploadId props로 넘기는 래퍼
function TextViewerWrapper() {
  const { uploadId } = useParams()
  return <TextViewer uploadId={uploadId} />
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 로그인 페이지 */}
        <Route path="/login" element={<Login />} />

        {/* 루트는 대시보드로 리다이렉트 */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 인증 필요한 페이지들 */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />

        <Route
          path="/students"
          element={
            <RequireAuth>
              <StudentList />
            </RequireAuth>
          }
        />

        <Route
          path="/students/:id"
          element={
            <RequireAuth>
              <StudentDetailWrapper />
            </RequireAuth>
          }
        />

        {/* 업로드 페이지 (정식 경로) */}
        <Route
          path="/upload"
          element={
            <RequireAuth>
              <UploadPage />
            </RequireAuth>
          }
        />

        {/* ✅ 옛날에 잘못 쓴 '/UploadPage'로 들어오면 /upload 로 보내기 */}
        <Route
          path="/UploadPage"
          element={<Navigate to="/upload" replace />}
        />

        <Route
          path="/text/:uploadId"
          element={
            <RequireAuth>
              <TextViewerWrapper />
            </RequireAuth>
          }
        />

        <Route
          path="/report"
          element={
            <RequireAuth>
              <ReportPreview />
            </RequireAuth>
          }
        />

        {/* ✅ 나머지 이상한 주소들은 전부 대시보드로 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
