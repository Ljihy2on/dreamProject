// src/components/upload/EmotionKeywordSelector.jsx
import React, { useState } from 'react'

export default function EmotionKeywordSelector({ masterList, selected, onToggle, onAddNew }) {
  const [inputValue, setInputValue] = useState('')
  const safeSelected = Array.isArray(selected) ? selected : []
  const safeMaster = Array.isArray(masterList) ? masterList : []

  const handleSubmit = e => {
    e.preventDefault()
    const value = inputValue.trim()
    if (!value) return

    const existing = safeMaster.find(item => (item.label || item.name) === value)
    if (existing) onToggle && onToggle(existing.label || existing.name)
    else onAddNew && onAddNew(value)
    setInputValue('')
  }

  const suggestions = inputValue.trim().length === 0 ? [] : safeMaster.filter(item => {
    const label = (item.label || item.name || '').trim()
    if (!label || safeSelected.includes(label)) return false
    return label.includes(inputValue.trim())
  })

  return (
    <div>
      <div className="emotion-chips-row">
        {safeSelected.map(label => (
          <button key={label} type="button" className="emotion-chip emotion-chip-selected" onClick={() => onToggle && onToggle(label)}>
            <span className="emotion-chip-label">{label}</span>
            <span className="emotion-chip-icon">✓</span>
          </button>
        ))}
      </div>
      <form className="emotion-chip-add-row" onSubmit={handleSubmit}>
        <input type="text" className="analysis-input emotion-chip-input" placeholder="키워드 입력" value={inputValue} onChange={e => setInputValue(e.target.value)} />
        <button type="submit" className="btn ghost small">+ 추가</button>
      </form>
      {suggestions.length > 0 && (
        <div className="emotion-chips-row" style={{ marginTop: 6 }}>
          {suggestions.map(item => (
            <button key={item.id} type="button" className="emotion-chip emotion-chip-unselected" onClick={() => onToggle && onToggle(item.label || item.name)}>
              <span className="emotion-chip-label">{item.label || item.name}</span>
              <span className="emotion-chip-icon">+</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}