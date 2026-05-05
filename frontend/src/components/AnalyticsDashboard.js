import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  FunnelChart, Funnel, LabelList,
} from 'recharts';

const API = '';
const ZAR = n => `R ${(parseFloat(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#8b5cf6','#ec4899','#14b8a6'];

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background:'#fff', borderRadius:12, padding:'20px 24px',
      boxShadow:'0 1px 4px rgba(0,0,0,0.08)', borderTop:`4px solid ${color||'#6366f1'}`,
      flex:1, minWidth:160,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        <span style={{fontSize:22}}>{icon}</span>
        <span style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:0.5}}>{label}</span>
      </div>
      <div style={{fontSize:28,fontWeight:900,color:'#0f172a',lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:12,color:'#94a3b8',marginTop:6}}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 style={{color:'#1e3a5f',fontSize:16,fontWeight:800,margin:'32px 0 14px',borderBottom:'2px solid #e2e8f0',paddingBottom:8}}>
      {children}
    </h3>
  );
}

const CustomTooltip = ({ active, payload, label, prefix='' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:'#1e293b',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#e2e8f0'}}>
      <div style={{fontWeight:700,marginBottom:6}}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{color:p.color}}>
          {p.name}: <strong>{prefix}{typeof p.value === 'number' ? p.value.toLocaleString('en-ZA') : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

export default function AnalyticsDashboard({ token }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [tab, setTab]       = useState('overview');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API}/api/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) return <div style={{padding:40,textAlign:'center',color:'#64748b'}}>Loading analytics…</div>;
  if (error)   return <div style={{padding:40,textAlign:'center',color:'#ef4444'}}>Error: {error}</div>;
  if (!data)   return null;

  const { kpis, revenueByMonth, jobsByServiceType, leadFunnel, subStats, recentActivity } = data;

  const tabs = ['overview','revenue','jobs','subcontractors','activity'];

  return (
    <div style={{padding:'24px 28px',background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h2 style={{margin:0,fontSize:24,fontWeight:900,color:'#1e3a5f'}}>📊 Analytics & Revenue</h2>
          <div style={{color:'#64748b',fontSize:13,marginTop:4}}>Live business intelligence across all pipelines</div>
        </div>
        <button onClick={load} style={{background:'#6366f1',color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontWeight:700,cursor:'pointer',fontSize:13}}>
          ↺ Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:28}}>
        <KpiCard label="Total Revenue" value={ZAR(kpis.totalRevenue)} sub="All time" color="#10b981" icon="💰"/>
        <KpiCard label="Monthly Revenue" value={ZAR(kpis.monthlyRevenue)} sub="This month" color="#6366f1" icon="📈"/>
        <KpiCard label="Total Jobs" value={(kpis.totalJobs||0).toLocaleString()} sub={`${kpis.completedJobs||0} completed`} color="#f59e0b" icon="📋"/>
        <KpiCard label="Active Subs" value={(kpis.activeSubs||0).toLocaleString()} sub={`Avg quality ${(kpis.avgQuality||0).toFixed(1)}%`} color="#0ea5e9" icon="🤝"/>
        <KpiCard label="Total Leads" value={(kpis.totalLeads||0).toLocaleString()} sub={`${kpis.respondedLeads||0} responded`} color="#8b5cf6" icon="🎯"/>
        <KpiCard label="Profit Margin" value={`${kpis.marginPct||0}%`} sub="Revenue − payouts" color="#ec4899" icon="📊"/>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,borderBottom:'2px solid #e2e8f0',marginBottom:24}}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab===t ? '#6366f1' : 'transparent',
            color: tab===t ? '#fff' : '#64748b',
            border:'none', borderRadius:'8px 8px 0 0', padding:'9px 20px',
            fontWeight:700, cursor:'pointer', fontSize:13, transition:'all 0.2s',
            textTransform:'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div>
          <SectionTitle>Revenue vs Payouts (Last 12 Months)</SectionTitle>
          <div style={{background:'#fff',borderRadius:12,padding:'20px 8px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',marginBottom:24}}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueByMonth} margin={{top:5,right:20,left:10,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="month" tick={{fontSize:11,fill:'#64748b'}}/>
                <YAxis tick={{fontSize:11,fill:'#64748b'}} tickFormatter={v=>`R${(v/1000).toFixed(0)}k`}/>
                <Tooltip content={<CustomTooltip prefix="R "/>}/>
                <Legend/>
                <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} dot={{r:4}} name="Revenue (ZAR)"/>
                <Line type="monotone" dataKey="payouts" stroke="#f59e0b" strokeWidth={2} dot={{r:3}} name="Payouts (ZAR)" strokeDasharray="5 5"/>
                <Line type="monotone" dataKey="margin" stroke="#10b981" strokeWidth={2} dot={{r:3}} name="Margin (ZAR)"/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            <div>
              <SectionTitle>Jobs by Service Type</SectionTitle>
              <div style={{background:'#fff',borderRadius:12,padding:'20px 8px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={jobsByServiceType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({type,percent})=>`${type} ${(percent*100).toFixed(0)}%`}>
                      {jobsByServiceType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                    </Pie>
                    <Tooltip/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <SectionTitle>Lead Conversion Funnel</SectionTitle>
              <div style={{background:'#fff',borderRadius:12,padding:'20px 8px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                <ResponsiveContainer width="100%" height={220}>
                  <FunnelChart>
                    <Tooltip/>
                    <Funnel dataKey="value" data={leadFunnel} isAnimationActive>
                      <LabelList position="right" fill="#374151" style={{fontSize:12}}/>
                      {leadFunnel.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REVENUE ── */}
      {tab === 'revenue' && (
        <div>
          <SectionTitle>Monthly Revenue Breakdown</SectionTitle>
          <div style={{background:'#fff',borderRadius:12,padding:'20px 8px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',marginBottom:24}}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenueByMonth} margin={{top:5,right:20,left:10,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="month" tick={{fontSize:11,fill:'#64748b'}}/>
                <YAxis tick={{fontSize:11,fill:'#64748b'}} tickFormatter={v=>`R${(v/1000).toFixed(0)}k`}/>
                <Tooltip content={<CustomTooltip prefix="R "/>}/>
                <Legend/>
                <Bar dataKey="revenue" fill="#6366f1" name="Revenue (ZAR)" radius={[4,4,0,0]}/>
                <Bar dataKey="payouts" fill="#f59e0b" name="Payouts (ZAR)" radius={[4,4,0,0]}/>
                <Bar dataKey="margin" fill="#10b981" name="Margin (ZAR)" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'#1e3a5f',color:'#fff'}}>
                  {['Month','Revenue','Payouts','Margin','Margin %'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left',fontWeight:700}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revenueByMonth.map((r,i)=>(
                  <tr key={i} style={{background:i%2===0?'#fff':'#f8fafc'}}>
                    <td style={{padding:'9px 14px',fontWeight:600}}>{r.month}</td>
                    <td style={{padding:'9px 14px',color:'#6366f1',fontWeight:700}}>{ZAR(r.revenue)}</td>
                    <td style={{padding:'9px 14px',color:'#f59e0b'}}>{ZAR(r.payouts)}</td>
                    <td style={{padding:'9px 14px',color:'#10b981',fontWeight:700}}>{ZAR(r.margin)}</td>
                    <td style={{padding:'9px 14px',color:'#64748b'}}>{r.revenue>0?`${((r.margin/r.revenue)*100).toFixed(1)}%`:'-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── JOBS ── */}
      {tab === 'jobs' && (
        <div>
          <SectionTitle>Jobs by Service Type — Volume & Value</SectionTitle>
          <div style={{background:'#fff',borderRadius:12,padding:'20px 8px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',marginBottom:24}}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={jobsByServiceType} layout="vertical" margin={{top:5,right:40,left:80,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                <XAxis type="number" tick={{fontSize:11,fill:'#64748b'}}/>
                <YAxis type="category" dataKey="type" tick={{fontSize:11,fill:'#64748b'}}/>
                <Tooltip/>
                <Legend/>
                <Bar dataKey="count" fill="#6366f1" name="Job Count" radius={[0,4,4,0]}/>
                <Bar dataKey="totalValue" fill="#10b981" name="Total Value (ZAR)" radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
            {jobsByServiceType.map((s,i) => (
              <div key={i} style={{background:'#fff',borderRadius:10,padding:'14px 18px',boxShadow:'0 1px 4px rgba(0,0,0,0.06)',borderLeft:`4px solid ${COLORS[i%COLORS.length]}`}}>
                <div style={{fontSize:11,color:'#64748b',fontWeight:700,textTransform:'uppercase',marginBottom:6}}>{s.type||'Other'}</div>
                <div style={{fontSize:22,fontWeight:800,color:'#0f172a'}}>{s.count}</div>
                <div style={{fontSize:12,color:COLORS[i%COLORS.length],fontWeight:600}}>{ZAR(s.totalValue)}</div>
                <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>Avg: {ZAR(s.avgValue)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUBCONTRACTORS ── */}
      {tab === 'subcontractors' && (
        <div>
          <SectionTitle>Subcontractor Performance Overview</SectionTitle>
          <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:24}}>
            <KpiCard label="Total Subs" value={subStats.total||0} color="#6366f1" icon="👥"/>
            <KpiCard label="Active Subs" value={subStats.active||0} sub="Have completed jobs" color="#10b981" icon="✅"/>
            <KpiCard label="Avg Quality Score" value={`${(subStats.avgQuality||0).toFixed(1)}%`} sub="AI-graded" color="#f59e0b" icon="⭐"/>
            <KpiCard label="Avg On-Time Rate" value={`${(subStats.avgOnTime||0).toFixed(0)}%`} color="#0ea5e9" icon="⏱"/>
            <KpiCard label="Total Paid Out" value={ZAR(subStats.totalPaid)} sub="All time" color="#8b5cf6" icon="💸"/>
          </div>
          {subStats.topPerformers?.length > 0 && (
            <>
              <SectionTitle>Top Performers</SectionTitle>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#1e3a5f',color:'#fff'}}>
                      {['Rank','Name','Jobs Done','Avg Quality','On-Time %','Total Earned','Tier'].map(h=>(
                        <th key={h} style={{padding:'10px 14px',textAlign:'left',fontWeight:700}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subStats.topPerformers.map((s,i) => {
                      const tier = s.avgQuality >= 90 ? { label:'⭐ Gold', color:'#f59e0b' }
                                 : s.avgQuality >= 75 ? { label:'🥈 Silver', color:'#94a3b8' }
                                 : { label:'🥉 Bronze', color:'#cd7f32' };
                      return (
                        <tr key={i} style={{background:i%2===0?'#fff':'#f8fafc'}}>
                          <td style={{padding:'9px 14px',fontWeight:800,color:'#6366f1'}}>#{i+1}</td>
                          <td style={{padding:'9px 14px',fontWeight:600}}>{s.name}</td>
                          <td style={{padding:'9px 14px'}}>{s.jobsDone}</td>
                          <td style={{padding:'9px 14px'}}>
                            <span style={{background: s.avgQuality>=80?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.1)',color: s.avgQuality>=80?'#10b981':'#f59e0b',padding:'2px 8px',borderRadius:6,fontWeight:700}}>
                              {(s.avgQuality||0).toFixed(1)}%
                            </span>
                          </td>
                          <td style={{padding:'9px 14px'}}>{(s.onTimeRate||0).toFixed(0)}%</td>
                          <td style={{padding:'9px 14px',color:'#10b981',fontWeight:700}}>{ZAR(s.totalEarned)}</td>
                          <td style={{padding:'9px 14px',color:tier.color,fontWeight:700}}>{tier.label}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ACTIVITY ── */}
      {tab === 'activity' && (
        <div>
          <SectionTitle>Recent Activity Log</SectionTitle>
          <div style={{background:'#fff',borderRadius:12,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',overflow:'hidden'}}>
            {recentActivity.length === 0 ? (
              <div style={{padding:40,textAlign:'center',color:'#94a3b8'}}>No recent activity</div>
            ) : recentActivity.map((a,i) => (
              <div key={i} style={{
                display:'flex',alignItems:'center',gap:14,padding:'12px 18px',
                borderBottom:i<recentActivity.length-1?'1px solid #f1f5f9':'none',
                background: i%2===0?'#fff':'#fafbff',
              }}>
                <span style={{fontSize:20}}>{a.icon||'📌'}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>{a.event}</div>
                  <div style={{fontSize:11,color:'#94a3b8'}}>{new Date(a.date).toLocaleString('en-ZA')}</div>
                </div>
                {a.amount != null && (
                  <div style={{fontWeight:800,color:'#10b981',fontSize:14}}>{ZAR(a.amount)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
