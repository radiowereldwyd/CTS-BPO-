import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './JobSearch.css';

function getAuthHeaders() {
  const token = localStorage.getItem('cts_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const STATUS_OPTIONS = ['new', 'contacted', 'followup1_sent', 'followup2_sent', 'responded', 'in-progress', 'completed', 'bounced'];
const TYPE_OPTIONS   = ['data-entry', 'translation', 'transcription', 'virtual-assistant', 'finance-admin', 'customer-support', 'content-moderation', 'general'];

export default function JobSearch() {
  const [leads, setLeads]         = useState([]);
  const [stats, setStats]         = useState({});
  const [loading, setLoading]     = useState(false);
  const [scanning, setScanning]   = useState(false);
  const [flash, setFlash]         = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType]     = useState('');
  const [search, setSearch]             = useState('');
  const [modal, setModal]         = useState(null); // { lead }
  const [editForm, setEditForm]   = useState({});
  const [emailStatus, setEmailStatus] = useState({}); // leadId -> 'sending'|'sent'|'error'
  const [serpConfigured, setSerpConfigured] = useState(true);
  const [emailConfigured, setEmailConfigured] = useState(true);

  const showFlash = (msg, type = 'info', ms = 4000) => {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), ms);
  };

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.jobType = filterType;
      const [leadsRes, statsRes] = await Promise.all([
        axios.get('/api/jobs/leads', { headers: getAuthHeaders(), params }),
        axios.get('/api/jobs/stats', { headers: getAuthHeaders() }),
      ]);
      setLeads(leadsRes.data || []);
      setStats(statsRes.data || {});
    } catch (err) {
      showFlash('Failed to load leads: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  async function handleScan() {
    setScanning(true);
    showFlash('🔍 Scanning the web for BPO opportunities... this takes ~30 seconds', 'info', 35000);
    try {
      const res = await axios.post('/api/jobs/scan', {}, { headers: getAuthHeaders(), timeout: 60000 });
      const { total, errors } = res.data;
      setFlash(null);
      if (errors?.length) {
        showFlash(`Found ${total} new leads. ${errors[0]?.error || ''}`, total > 0 ? 'success' : 'error');
      } else {
        showFlash(`✅ Scan complete — ${total} new job leads discovered!`, 'success', 6000);
      }
      await loadLeads();
    } catch (err) {
      setFlash(null);
      const msg = err.response?.data?.error || err.message;
      if (msg.includes('SERPAPI_KEY')) {
        setSerpConfigured(false);
        showFlash('SerpApi key not configured. See instructions below.', 'error', 8000);
      } else {
        showFlash('Scan error: ' + msg, 'error');
      }
    } finally {
      setScanning(false);
    }
  }

  async function handleSendEmail(lead) {
    setEmailStatus(prev => ({ ...prev, [lead.id]: 'sending' }));
    try {
      await axios.post('/api/jobs/send-application', {
        leadId: lead.id,
        contactEmail: lead.contact_email,
        contactName: lead.contact_name,
        company: lead.company,
        title: lead.title,
      }, { headers: getAuthHeaders() });
      setEmailStatus(prev => ({ ...prev, [lead.id]: 'sent' }));
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'contacted' } : l));
      showFlash(`✅ Application sent to ${lead.company}!`, 'success');
    } catch (err) {
      setEmailStatus(prev => ({ ...prev, [lead.id]: 'error' }));
      const msg = err.response?.data?.error || err.message;
      if (msg.includes('SMTP') || msg.includes('Gmail') || msg.includes('email')) {
        setEmailConfigured(false);
      }
      showFlash('Email error: ' + msg, 'error');
    }
  }

  function openModal(lead) {
    setModal(lead);
    setEditForm({
      contact_name: lead.contact_name || '',
      contact_email: lead.contact_email || '',
      status: lead.status,
      notes: lead.notes || '',
    });
  }

  async function saveModal() {
    try {
      await axios.patch(`/api/jobs/leads/${modal.id}`, editForm, { headers: getAuthHeaders() });
      setLeads(prev => prev.map(l => l.id === modal.id ? { ...l, ...editForm } : l));
      setModal(null);
      showFlash('✅ Lead updated', 'success', 3000);
    } catch (err) {
      showFlash('Update failed: ' + (err.response?.data?.error || err.message), 'error');
    }
  }

  const filtered = leads.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (l.title + l.company + l.snippet).toLowerCase().includes(q);
  });

  return (
    <div className="jobsearch-container">
      <div className="jobsearch-header">
        <h1>🌐 AI Client Prospector</h1>
        <p>Scans the web for businesses that <strong>need to hire</strong> BPO services — law firms, clinics, e-commerce companies, startups &amp; more. Click <strong>Apply</strong> to send them a CTS BPO pitch email.</p>
      </div>

      {/* Stats */}
      <div className="js-stats">
        {[
          { label: 'Total Leads',  value: stats.total      || 0, color: '#00c8ff' },
          { label: 'New',          value: stats.new_leads  || 0, color: '#00c8ff' },
          { label: 'Contacted',    value: stats.contacted  || 0, color: '#fbbf24' },
          { label: 'Responded',    value: stats.responded  || 0, color: '#34d399' },
          { label: 'Completed',    value: stats.completed  || 0, color: '#10b981' },
        ].map(s => (
          <div className="js-stat" key={s.label}>
            <div className="js-stat-value" style={{ color: s.color }}>{s.total !== undefined ? s.total : s.value}</div>
            <div className="js-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Notices */}
      {!serpConfigured && (
        <div className="serpapi-notice">
          🔑 <strong>SerpApi key needed:</strong> Sign up free at{' '}
          <a href="https://serpapi.com" target="_blank" rel="noopener noreferrer" style={{color:'#93c5fd'}}>serpapi.com</a>
          {' '}→ copy your API key → ask your admin to add it as secret <code>SERPAPI_KEY</code> in Replit Secrets.
          Free tier gives 100 searches/month.
        </div>
      )}
      {!emailConfigured && (
        <div className="email-notice">
          📧 <strong>Gmail not configured:</strong> Add your Gmail App Password as secret <code>GMAIL_APP_PASSWORD</code> in Replit Secrets.
          Go to <strong>myaccount.google.com → Security → App Passwords</strong> to generate one.
        </div>
      )}

      {/* Flash */}
      {flash && <div className={`js-flash ${flash.type}`}>{flash.msg}</div>}

      {/* Controls */}
      <div className="js-controls">
        <button className="btn-scan" onClick={handleScan} disabled={scanning || loading}>
          {scanning ? '⏳ Scanning worldwide...' : '🔍 Scan for Clients'}
        </button>
        <select className="js-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="js-filter" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All job types</option>
          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="js-search-box" placeholder="🔎 Search leads..." value={search} onChange={e => setSearch(e.target.value)} />
        <span className="scan-info">💡 Each scan uses ~5 SerpApi credits (100 free/month)</span>
      </div>

      {/* Leads table */}
      {loading ? (
        <div className="js-empty"><h3>Loading leads...</h3></div>
      ) : filtered.length === 0 ? (
        <div className="js-empty">
          <h3>{leads.length === 0 ? '🌐 No leads yet' : '🔍 No leads match your filter'}</h3>
          <p>{leads.length === 0 ? 'Click "Scan for BPO Jobs" to start finding opportunities worldwide.' : 'Try clearing your filters.'}</p>
        </div>
      ) : (
        <div className="leads-table-wrap">
          <div className="leads-table-head">
            <div>Title / Company</div>
            <div>Source</div>
            <div>Type</div>
            <div>Status</div>
            <div>Actions</div>
          </div>
          {filtered.map(lead => (
            <div className="leads-row" key={lead.id}>
              <div>
                <div className="lead-title">{lead.title}</div>
                <div className="lead-snippet">{lead.company} · {lead.snippet?.slice(0, 80)}{lead.snippet?.length > 80 ? '…' : ''}</div>
              </div>
              <div>
                <a className="lead-url" href={lead.source_url} target="_blank" rel="noopener noreferrer">
                  {lead.source_url?.replace(/https?:\/\/(www\.)?/, '').slice(0, 40)}…
                </a>
              </div>
              <div>
                <span className="badge-type">{lead.job_type || 'general'}</span>
              </div>
              <div>
                <span className={`badge-status ${lead.status}`}>{lead.status}</span>
              </div>
              <div className="lead-actions">
                <button
                  className="btn-send-email"
                  onClick={() => handleSendEmail(lead)}
                  disabled={emailStatus[lead.id] === 'sending' || lead.status === 'contacted' || lead.status === 'responded' || lead.status === 'completed'}
                  title={!lead.contact_email ? 'Add contact email first (edit button)' : 'Send CTS BPO application email'}
                >
                  {emailStatus[lead.id] === 'sending' ? '⏳' :
                   emailStatus[lead.id] === 'sent'    ? '✅ Sent' :
                   lead.status === 'contacted'        ? '✉️ Sent' :
                   '📧 Apply'}
                </button>
                <button className="btn-edit-contact" onClick={() => openModal(lead)}>✏️ Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact edit modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="contact-modal" onClick={e => e.stopPropagation()}>
            <h3>✏️ Edit Lead — {modal.company}</h3>
            <div className="form-group">
              <label>Contact Name</label>
              <input value={editForm.contact_name} onChange={e => setEditForm(p => ({...p, contact_name: e.target.value}))} placeholder="e.g. John Smith" />
            </div>
            <div className="form-group">
              <label>Contact Email</label>
              <input value={editForm.contact_email} onChange={e => setEditForm(p => ({...p, contact_email: e.target.value}))} placeholder="e.g. jobs@company.com" type="email" />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="js-filter" style={{width:'100%'}} value={editForm.status} onChange={e => setEditForm(p => ({...p, status: e.target.value}))}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} placeholder="Any notes about this lead..." />
            </div>
            <div className="modal-actions">
              <button className="btn-modal-save" onClick={saveModal}>💾 Save</button>
              <button className="btn-modal-cancel" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
