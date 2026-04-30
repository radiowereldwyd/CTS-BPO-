/**
 * Client Portal — CTS BPO
 * Accessible via token link sent in delivery emails.
 * Route: /client/portal/:token
 */

import React, { useState, useEffect, useRef } from 'react';

const API = '';

const ZAR = n => `R ${(parseFloat(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

const STATUS_COLORS = {
  pending:     { bg:'rgba(245,158,11,0.12)', color:'#f59e0b' },
  assigned:    { bg:'rgba(99,102,241,0.12)', color:'#6366f1' },
  in_progress: { bg:'rgba(14,165,233,0.12)', color:'#0ea5e9' },
  submitted:   { bg:'rgba(245,158,11,0.12)', color:'#f59e0b' },
  delivered:   { bg:'rgba(16,185,129,0.12)', color:'#10b981' },
  confirmed:   { bg:'rgba(34,197,94,0.12)',  color:'#22c55e' },
  paid:        { bg:'rgba(34,197,94,0.12)',  color:'#22c55e' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg:'#f1f5f9', color:'#64748b' };
  return (
    <span style={{
      background:s.bg, color:s.color, fontWeight:700, fontSize:11,
      padding:'3px 10px', borderRadius:10, textTransform:'uppercase', letterSpacing:0.5,
    }}>{status?.replace(/_/g,' ')}</span>
  );
}

function Card({ children, style={} }) {
  return (
    <div style={{background:'#fff',borderRadius:14,padding:'22px 26px',boxShadow:'0 1px 6px rgba(0,0,0,0.08)',...style}}>
      {children}
    </div>
  );
}

export default function ClientPortal() {
  const token = window.location.pathname.split('/').pop();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [tab,     setTab]     = useState('jobs');
  const [upload,  setUpload]  = useState({ file:null, uploading:false, msg:'' });
  const fileRef = useRef();

  useEffect(() => {
    if (!token || token === 'portal') { setError('Invalid access link.'); setLoading(false); return; }
    fetch(`${API}/api/client/portal/${token}`)
      .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t); }))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [token]);

  async function handleUpload() {
    if (!upload.file) return;
    setUpload(u => ({ ...u, uploading:true, msg:'' }));
    const fd = new FormData();
    fd.append('sourceFile', upload.file);
    try {
      const r = await fetch(`${API}/api/client/portal/${token}/upload`, { method:'POST', body:fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setUpload({ file:null, uploading:false, msg:j.message || 'File uploaded successfully!' });
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setUpload(u => ({ ...u, uploading:false, msg:`Error: ${e.message}` }));
    }
  }

  if (loading) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f8fafc'}}>
      <div style={{textAlign:'center',color:'#6366f1'}}>
        <div style={{fontSize:40,marginBottom:12}}>⏳</div>
        <div style={{fontSize:16,fontWeight:600}}>Loading your portal…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f8fafc'}}>
      <Card style={{maxWidth:480,textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:16}}>🔒</div>
        <h2 style={{color:'#ef4444',margin:'0 0 12px'}}>Access Denied</h2>
        <p style={{color:'#64748b'}}>{error}</p>
        <p style={{color:'#94a3b8',fontSize:13}}>Please use the link in your delivery email. Contact <a href="mailto:info@ctsbpo.com">info@ctsbpo.com</a> for help.</p>
      </Card>
    </div>
  );

  const { client, jobs, currentJob } = data;

  return (
    <div style={{minHeight:'100vh',background:'#f8fafc'}}>
      {/* Header */}
      <div style={{background:'#1e3a5f',padding:'0 32px',boxShadow:'0 2px 8px rgba(0,0,0,0.15)'}}>
        <div style={{maxWidth:1100,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 0'}}>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <div style={{width:40,height:40,borderRadius:10,background:'linear-gradient(135deg,#6366f1,#8b5cf6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>🏢</div>
            <div>
              <div style={{color:'#fff',fontWeight:900,fontSize:18}}>CTS BPO Client Portal</div>
              <div style={{color:'#93c5fd',fontSize:12}}>AI-Driven Business Process Outsourcing</div>
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{color:'#fff',fontWeight:700,fontSize:14}}>{client.name}</div>
            <div style={{color:'#93c5fd',fontSize:12}}>{client.email}</div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 24px'}}>

        {/* Welcome banner for current job */}
        {currentJob && (
          <Card style={{marginBottom:24,borderLeft:'5px solid #6366f1',background:'linear-gradient(135deg,#f0f1fe,#fff)'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
              <div>
                <div style={{fontSize:12,color:'#6366f1',fontWeight:700,textTransform:'uppercase',marginBottom:6}}>Current Job</div>
                <div style={{fontSize:20,fontWeight:900,color:'#1e3a5f',marginBottom:8}}>{currentJob.title}</div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
                  <StatusBadge status={currentJob.status||currentJob.job_status}/>
                  {currentJob.service_type && (
                    <span style={{fontSize:12,color:'#64748b',background:'#f1f5f9',padding:'2px 10px',borderRadius:8}}>{currentJob.service_type}</span>
                  )}
                  {currentJob.due_date && (
                    <span style={{fontSize:12,color:'#64748b'}}>Due: {new Date(currentJob.due_date).toLocaleDateString('en-ZA')}</span>
                  )}
                </div>
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                {(currentJob.status === 'delivered' || currentJob.job_status === 'delivered' || currentJob.confirmed_at) && (
                  <>
                    <a href={`/api/sub/download/${token}`} target="_blank" rel="noopener noreferrer"
                       style={{background:'#10b981',color:'#fff',padding:'9px 18px',borderRadius:8,textDecoration:'none',fontWeight:700,fontSize:13}}>
                      ⬇ Download Work
                    </a>
                    <a href={`/api/client/invoice/${token}/pdf`} target="_blank" rel="noopener noreferrer"
                       style={{background:'#6366f1',color:'#fff',padding:'9px 18px',borderRadius:8,textDecoration:'none',fontWeight:700,fontSize:13}}>
                      🧾 Download Invoice
                    </a>
                  </>
                )}
                {currentJob.status === 'delivered' && !currentJob.confirmed_at && (
                  <a href={`/api/sub/client-confirm/${token}`}
                     style={{background:'#1e3a5f',color:'#fff',padding:'9px 18px',borderRadius:8,textDecoration:'none',fontWeight:700,fontSize:13}}>
                    ✅ Confirm Receipt
                  </a>
                )}
              </div>
            </div>
            {currentJob.description && (
              <p style={{color:'#64748b',fontSize:13,margin:'14px 0 0',borderTop:'1px solid #e2e8f0',paddingTop:12}}>{currentJob.description}</p>
            )}
          </Card>
        )}

        {/* Tabs */}
        <div style={{display:'flex',gap:4,borderBottom:'2px solid #e2e8f0',marginBottom:24}}>
          {['jobs','upload','invoices'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background:tab===t?'#6366f1':'transparent',
              color:tab===t?'#fff':'#64748b',
              border:'none',borderRadius:'8px 8px 0 0',padding:'9px 22px',
              fontWeight:700,cursor:'pointer',fontSize:13,textTransform:'capitalize',
            }}>{t==='jobs'?'📋 My Jobs':t==='upload'?'📤 Upload Files':'🧾 Invoices'}</button>
          ))}
        </div>

        {/* JOBS TAB */}
        {tab === 'jobs' && (
          <div>
            {jobs.length === 0 ? (
              <Card style={{textAlign:'center',color:'#94a3b8',padding:40}}>No jobs found for your account.</Card>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {jobs.map((j, i) => (
                  <Card key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{fontWeight:700,color:'#1e3a5f',fontSize:15,marginBottom:4}}>{j.title}</div>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                        <StatusBadge status={j.status||j.job_status}/>
                        {j.service_type && <span style={{fontSize:11,color:'#94a3b8'}}>{j.service_type}</span>}
                        {j.delivered_at && <span style={{fontSize:11,color:'#94a3b8'}}>Delivered: {new Date(j.delivered_at).toLocaleDateString('en-ZA')}</span>}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                      {j.job_value && <span style={{fontWeight:800,color:'#6366f1',fontSize:16}}>{ZAR(j.job_value)}</span>}
                      {j.delivery_token && (j.status==='delivered'||j.confirmed_at) && (
                        <>
                          <a href={`/api/sub/download/${j.delivery_token}`} target="_blank" rel="noopener noreferrer"
                             style={{background:'#10b981',color:'#fff',padding:'6px 12px',borderRadius:6,textDecoration:'none',fontWeight:600,fontSize:12}}>
                            ⬇ Download
                          </a>
                          <a href={`/api/client/invoice/${j.delivery_token}/pdf`} target="_blank" rel="noopener noreferrer"
                             style={{background:'#6366f1',color:'#fff',padding:'6px 12px',borderRadius:6,textDecoration:'none',fontWeight:600,fontSize:12}}>
                            🧾 Invoice
                          </a>
                        </>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* UPLOAD TAB */}
        {tab === 'upload' && (
          <Card>
            <h3 style={{margin:'0 0 8px',color:'#1e3a5f',fontSize:17,fontWeight:800}}>📤 Upload Source Files</h3>
            <p style={{color:'#64748b',fontSize:13,margin:'0 0 20px'}}>
              Upload documents, audio, spreadsheets or any source material for your current job. Max 100 MB per file.
            </p>
            <div style={{border:'2px dashed #c7d2fe',borderRadius:10,padding:'30px 20px',textAlign:'center',background:'#f8fafc',marginBottom:16}}>
              <div style={{fontSize:36,marginBottom:8}}>📁</div>
              <input ref={fileRef} type="file" onChange={e=>setUpload(u=>({...u,file:e.target.files[0],msg:''}))}
                     style={{display:'none'}} id="file-input"/>
              <label htmlFor="file-input" style={{background:'#6366f1',color:'#fff',padding:'9px 22px',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:13}}>
                Choose File
              </label>
              {upload.file && (
                <div style={{marginTop:12,fontSize:13,color:'#374151',fontWeight:600}}>
                  Selected: {upload.file.name} ({(upload.file.size/1024/1024).toFixed(2)} MB)
                </div>
              )}
            </div>
            <button onClick={handleUpload} disabled={!upload.file||upload.uploading}
              style={{background:upload.file&&!upload.uploading?'#1e3a5f':'#94a3b8',color:'#fff',border:'none',borderRadius:8,padding:'10px 28px',fontWeight:700,cursor:upload.file&&!upload.uploading?'pointer':'not-allowed',fontSize:14,width:'100%'}}>
              {upload.uploading ? 'Uploading…' : '⬆ Upload File'}
            </button>
            {upload.msg && (
              <div style={{marginTop:14,padding:'10px 16px',borderRadius:8,
                background:upload.msg.startsWith('Error')?'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)',
                color:upload.msg.startsWith('Error')?'#ef4444':'#10b981',
                fontWeight:600,fontSize:13}}>
                {upload.msg}
              </div>
            )}
          </Card>
        )}

        {/* INVOICES TAB */}
        {tab === 'invoices' && (
          <div>
            {jobs.filter(j => j.delivered_at || j.confirmed_at).length === 0 ? (
              <Card style={{textAlign:'center',color:'#94a3b8',padding:40}}>No invoices available yet.</Card>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {jobs.filter(j => j.delivery_token && (j.delivered_at || j.confirmed_at)).map((j, i) => {
                  const ref = `INV-${String(j.job_id||i).padStart(5,'0')}`;
                  return (
                    <Card key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
                      <div>
                        <div style={{fontWeight:700,color:'#1e3a5f',fontSize:14,marginBottom:4}}>{ref}</div>
                        <div style={{fontSize:13,color:'#374151',marginBottom:4}}>{j.title}</div>
                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                          <StatusBadge status={j.confirmed_at?'confirmed':'delivered'}/>
                          <span style={{fontSize:11,color:'#94a3b8'}}>
                            {j.delivered_at ? new Date(j.delivered_at).toLocaleDateString('en-ZA') : ''}
                          </span>
                        </div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:14}}>
                        {j.job_value && <span style={{fontWeight:900,color:'#10b981',fontSize:18}}>{ZAR(j.job_value)}</span>}
                        <a href={`/api/client/invoice/${j.delivery_token}/pdf`} target="_blank" rel="noopener noreferrer"
                           style={{background:'#6366f1',color:'#fff',padding:'9px 18px',borderRadius:8,textDecoration:'none',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                          🧾 Download PDF
                        </a>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{marginTop:40,textAlign:'center',color:'#94a3b8',fontSize:12,borderTop:'1px solid #e2e8f0',paddingTop:20}}>
          <p>CTS BPO Solutions · info@ctsbpo.com · Powered by AI</p>
          <p>This portal is secure and unique to your account. Do not share this link.</p>
        </div>
      </div>
    </div>
  );
}
