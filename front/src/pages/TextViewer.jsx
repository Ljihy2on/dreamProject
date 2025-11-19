import React, { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import Layout from '../components/Layout'

export default function TextViewer({ uploadId }){
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    let cancelled = false
    ;(async ()=>{
      try {
        const data = await apiFetch(`/uploads/${uploadId}/text`).catch(()=>({ text: '데모 추출 텍스트' }))
        if (!cancelled) setText(data.text || '')
      } finally { if(!cancelled) setLoading(false) }
    })()
    return ()=>{ cancelled = true }
  }, [uploadId])

  function handleSave(){
    // UI only: show saved state (no network)
    alert('저장됨 (데모)')
  }

  function handleDownload(){
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extracted-${uploadId || 'text'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div>불러오는 중...</div>

  return (
    <Layout title="텍스트 뷰어">
      <div className="text-actions">
        <button className="btn" onClick={handleSave}>저장</button>
        <button className="btn secondary" onClick={handleDownload}>다운로드(.txt)</button>
      </div>
      <textarea value={text} onChange={e=>setText(e.target.value)} style={{width:'100%', minHeight:420}} />
    </Layout>
  )
}
 

export { TextViewer }