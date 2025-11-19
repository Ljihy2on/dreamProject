import React, { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import Layout from '../components/Layout'

export default function StudentDetail({ studentId }) {
  const [student, setStudent] = useState(null);
  const [activities, setActivities] = useState([]);

  useEffect(()=>{
    if (!studentId) return;
    (async ()=>{
      try {
        const s = await apiFetch(`/students/${studentId}`).catch(()=>null);
        setStudent(s || { id: studentId, name: '데모 학생' });
        const acts = await apiFetch(`/students/${studentId}/activities`).catch(()=>[]);
        setActivities(acts || []);
      } catch(e){ console.error(e); }
    })();
  }, [studentId]);

  if (!studentId) return <Layout title="학생 상세"><div>학생 ID가 필요합니다</div></Layout>;

  return (
    <Layout title={student ? student.name : '학생 상세'}>
      <div style={{marginBottom:12}}>요약: {student?.school || '학교 없음'} · {student?.grade || ''}</div>
      <h3>활동</h3>
      <div>
        {activities.length === 0 ? <div className="muted">활동 없음 (데모)</div> : activities.map(a => (
          <div key={a.id} className="list-item">
            <div style={{fontSize:12}}>{a.log_date}</div>
            <div>{a.log_content?.slice(0,200)}</div>
          </div>
        ))}
      </div>
    </Layout>
  )
}
 

export { StudentDetail }
