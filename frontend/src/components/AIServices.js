import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './AIServices.css';

function getAuthHeaders() {
  const token = localStorage.getItem('cts_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const LANGUAGES = [
  { code: 'af', name: 'Afrikaans' }, { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },    { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },   { code: 'pt', name: 'Portuguese' },
  { code: 'zh', name: 'Chinese' },   { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },     { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },  { code: 'ko', name: 'Korean' },
  { code: 'it', name: 'Italian' },   { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },   { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },   { code: 'uk', name: 'Ukrainian' },
  { code: 'sw', name: 'Swahili' },   { code: 'zu', name: 'Zulu' },
];

export default function AIServices() {
  const [activeTab, setActiveTab]       = useState('translate');
  const [aiStatus, setAiStatus]         = useState({});
  const [inbox, setInbox]               = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [processingReplies, setProcessingReplies] = useState(false);
  const [replyReport, setReplyReport]   = useState(null);

  // Translation state
  const [transText, setTransText]       = useState('');
  const [transTarget, setTransTarget]   = useState('fr');
  const [transResult, setTransResult]   = useState(null);
  const [translating, setTranslating]   = useState(false);

  // Transcription state
  const [audioFile, setAudioFile]       = useState(null);
  const [audioLang, setAudioLang]       = useState('en-ZA');
  const [transcript, setTranscript]     = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const fileRef = useRef();

  // NLP / Reply analysis
  const [replyText, setReplyText]       = useState('');
  const [nlpResult, setNlpResult]       = useState(null);
  const [analysing, setAnalysing]       = useState(false);

  // Document AI state
  const [docFile, setDocFile]           = useState(null);
  const [docResult, setDocResult]       = useState(null);
  const [processingDoc, setProcessingDoc] = useState(false);
  const docRef = useRef();

  useEffect(() => {
    loadStatus();
    const iv = setInterval(loadStatus, 15000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line

  async function loadStatus() {
    try {
      const res = await axios.get('/api/ai/status', { headers: getAuthHeaders() });
      setAiStatus(res.data);
    } catch { setAiStatus({}); }
  }

  // ── Translation ────────────────────────────────────────────────────────────
  async function handleTranslate(e) {
    e.preventDefault();
    if (!transText.trim()) return;
    setTranslating(true); setTransResult(null);
    try {
      const res = await axios.post('/api/ai/translate', { text: transText, targetLang: transTarget }, { headers: getAuthHeaders() });
      setTransResult(res.data);
    } catch (err) { setTransResult({ error: err.response?.data?.error || err.message }); }
    finally { setTranslating(false); }
  }

  // ── Transcription ──────────────────────────────────────────────────────────
  async function handleTranscribe(e) {
    e.preventDefault();
    if (!audioFile) return;
    setTranscribing(true); setTranscript(null);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(',')[1];
        const res = await axios.post('/api/ai/transcribe', {
          audioBase64: base64, languageCode: audioLang, encoding: 'MP3', sampleRateHertz: 16000,
        }, { headers: getAuthHeaders() });
        setTranscript(res.data);
        setTranscribing(false);
      };
      reader.readAsDataURL(audioFile);
    } catch (err) {
      setTranscript({ error: err.response?.data?.error || err.message });
      setTranscribing(false);
    }
  }

  // ── NLP Reply Analysis ─────────────────────────────────────────────────────
  async function handleAnalyse(e) {
    e.preventDefault();
    if (!replyText.trim()) return;
    setAnalysing(true); setNlpResult(null);
    try {
      const res = await axios.post('/api/ai/analyse-reply', { text: replyText }, { headers: getAuthHeaders() });
      setNlpResult(res.data);
    } catch (err) { setNlpResult({ error: err.response?.data?.error || err.message }); }
    finally { setAnalysing(false); }
  }

  // ── Document AI ────────────────────────────────────────────────────────────
  async function handleDocument(e) {
    e.preventDefault();
    if (!docFile) return;
    setProcessingDoc(true); setDocResult(null);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(',')[1];
        const mimeType = docFile.type || 'application/pdf';
        const res = await axios.post('/api/ai/document', { base64Content: base64, mimeType }, { headers: getAuthHeaders() });
        setDocResult(res.data);
        setProcessingDoc(false);
      };
      reader.readAsDataURL(docFile);
    } catch (err) {
      setDocResult({ error: err.response?.data?.error || err.message });
      setProcessingDoc(false);
    }
  }

  // ── Gmail Inbox ────────────────────────────────────────────────────────────
  async function loadInbox() {
    setLoadingInbox(true);
    try {
      const res = await axios.get('/api/gmail/inbox', { headers: getAuthHeaders() });
      setInbox(res.data.emails || []);
    } catch (err) { setInbox([]); }
    finally { setLoadingInbox(false); }
  }

  async function processReplies() {
    setProcessingReplies(true); setReplyReport(null);
    try {
      const res = await axios.post('/api/gmail/process-replies', {}, { headers: getAuthHeaders() });
      setReplyReport(res.data);
      await loadInbox();
    } catch (err) { setReplyReport({ error: err.response?.data?.error || err.message }); }
    finally { setProcessingReplies(false); }
  }

  const intentColor = { interested: '#34d399', 'needs-info': '#fbbf24', rejected: '#f87171', 'out-of-office': '#94a3b8', unknown: '#64748b' };
  const sentimentColor = { positive: '#34d399', negative: '#f87171', neutral: '#94a3b8', mixed: '#fbbf24' };

  return (
    <div className="ai-services-container">
      <div className="ai-header">
        <h1>🤖 AI Services Engine</h1>
        <p>Google Cloud AI powering CTS BPO's core services — translation, transcription, document processing &amp; inbox intelligence</p>
      </div>

      {/* Service status pills */}
      <div className="ai-status-row">
        {[
          { key: 'emailOutreach', label: '📧 Gmail Send' },
          { key: 'translation',   label: '🌐 Translation' },
          { key: 'speech',        label: '🎙️ Transcription' },
          { key: 'nlp',           label: '🧠 NLP Analysis' },
          { key: 'documentAi',    label: '📄 Document AI' },
          { key: 'gmailReader',   label: '📬 Inbox Reader' },
        ].map(s => (
          <div key={s.key} className={`ai-pill ${aiStatus[s.key] ? 'live' : 'pending'}`}>
            {s.label}
            <span className="pill-status">{aiStatus[s.key] ? '✅ LIVE' : '⏳ Setup needed'}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="ai-tabs">
        {[
          { id: 'translate',  label: '🌐 Translation' },
          { id: 'transcribe', label: '🎙️ Transcription' },
          { id: 'nlp',        label: '🧠 Reply Analysis' },
          { id: 'document',   label: '📄 Document AI' },
          { id: 'inbox',      label: '📬 Inbox' },
        ].map(t => (
          <button key={t.id} className={`ai-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(t.id); if (t.id === 'inbox') loadInbox(); }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="ai-panel">

        {/* ── TRANSLATION ── */}
        {activeTab === 'translate' && (
          <div className="ai-section">
            <h2>🌐 AI Translation Service</h2>
            <p className="ai-desc">Translate documents, emails, and content into 100+ languages. CTS BPO charges clients for this service.</p>
            <form onSubmit={handleTranslate}>
              <div className="ai-row">
                <div className="ai-field flex1">
                  <label>Text to Translate</label>
                  <textarea value={transText} onChange={e => setTransText(e.target.value)}
                    placeholder="Paste client text here..." rows={6} required />
                </div>
                <div className="ai-field" style={{minWidth:160}}>
                  <label>Target Language</label>
                  <select value={transTarget} onChange={e => setTransTarget(e.target.value)}>
                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn-ai-action" disabled={translating || !transText.trim()}>
                {translating ? '⏳ Translating...' : '🌐 Translate Now'}
              </button>
            </form>
            {transResult && (
              <div className="ai-result">
                {transResult.error ? <p className="result-error">❌ {transResult.error}</p> : (
                  <>
                    {transResult.simulated && <p className="result-simulated">⚠️ Simulated — add GOOGLE_API_KEY to go live</p>}
                    <div className="result-meta">
                      <span>Detected: <strong>{transResult.detectedSourceLanguage || 'auto'}</strong></span>
                      <span>→ Target: <strong>{transResult.targetLang}</strong></span>
                      <span>Characters: <strong>{transResult.characters}</strong></span>
                    </div>
                    <div className="result-box">{transResult.translatedText}</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TRANSCRIPTION ── */}
        {activeTab === 'transcribe' && (
          <div className="ai-section">
            <h2>🎙️ AI Audio Transcription</h2>
            <p className="ai-desc">Upload an audio file and AI converts it to text. CTS BPO delivers the transcript to the client.</p>
            <form onSubmit={handleTranscribe}>
              <div className="ai-row">
                <div className="ai-field flex1">
                  <label>Audio File (MP3, WAV, FLAC)</label>
                  <div className="file-drop" onClick={() => fileRef.current.click()}>
                    {audioFile ? `✅ ${audioFile.name} (${(audioFile.size/1024).toFixed(0)} KB)` : '📁 Click to upload audio file'}
                    <input ref={fileRef} type="file" accept="audio/*" style={{display:'none'}}
                      onChange={e => setAudioFile(e.target.files[0])} />
                  </div>
                </div>
                <div className="ai-field" style={{minWidth:180}}>
                  <label>Language</label>
                  <select value={audioLang} onChange={e => setAudioLang(e.target.value)}>
                    <option value="en-ZA">English (South Africa)</option>
                    <option value="en-US">English (USA)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="af-ZA">Afrikaans</option>
                    <option value="fr-FR">French</option>
                    <option value="de-DE">German</option>
                    <option value="es-ES">Spanish</option>
                    <option value="pt-PT">Portuguese</option>
                    <option value="zh">Chinese (Mandarin)</option>
                    <option value="ar-SA">Arabic</option>
                  </select>
                </div>
              </div>
              <button className="btn-ai-action" disabled={transcribing || !audioFile}>
                {transcribing ? '⏳ Transcribing...' : '🎙️ Transcribe Audio'}
              </button>
            </form>
            {transcript && (
              <div className="ai-result">
                {transcript.error ? <p className="result-error">❌ {transcript.error}</p> : (
                  <>
                    {transcript.simulated && <p className="result-simulated">⚠️ Simulated — add GOOGLE_API_KEY to go live</p>}
                    <div className="result-meta">
                      <span>Words: <strong>{transcript.wordCount}</strong></span>
                      <span>Confidence: <strong>{((transcript.confidence||0)*100).toFixed(1)}%</strong></span>
                      <span>Language: <strong>{transcript.languageCode}</strong></span>
                    </div>
                    <div className="result-box">{transcript.transcript}</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── NLP REPLY ANALYSIS ── */}
        {activeTab === 'nlp' && (
          <div className="ai-section">
            <h2>🧠 Email Reply Analyser</h2>
            <p className="ai-desc">Paste a client reply — AI detects sentiment, intent, and automatically updates the lead status.</p>
            <form onSubmit={handleAnalyse}>
              <div className="ai-field">
                <label>Client Reply Text</label>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                  placeholder="Paste the email reply from a potential client here..." rows={6} required />
              </div>
              <button className="btn-ai-action" disabled={analysing || !replyText.trim()}>
                {analysing ? '⏳ Analysing...' : '🧠 Analyse Reply'}
              </button>
            </form>
            {nlpResult && (
              <div className="ai-result">
                {nlpResult.error ? <p className="result-error">❌ {nlpResult.error}</p> : (
                  <>
                    {nlpResult.sentiment?.simulated && <p className="result-simulated">⚠️ Simulated — add GOOGLE_API_KEY to go live</p>}
                    <div className="nlp-grid">
                      <div className="nlp-card">
                        <div className="nlp-label">Intent</div>
                        <div className="nlp-value" style={{color: intentColor[nlpResult.sentiment?.intent] || '#fff'}}>
                          {nlpResult.sentiment?.intent?.toUpperCase() || 'UNKNOWN'}
                        </div>
                      </div>
                      <div className="nlp-card">
                        <div className="nlp-label">Sentiment</div>
                        <div className="nlp-value" style={{color: sentimentColor[nlpResult.sentiment?.label] || '#fff'}}>
                          {nlpResult.sentiment?.label?.toUpperCase() || 'NEUTRAL'}
                        </div>
                      </div>
                      <div className="nlp-card">
                        <div className="nlp-label">Score</div>
                        <div className="nlp-value">{nlpResult.sentiment?.score?.toFixed(2) || '0.00'}</div>
                      </div>
                    </div>
                    {nlpResult.entities?.length > 0 && (
                      <div style={{marginTop:16}}>
                        <strong style={{color:'#94a3b8',fontSize:12}}>DETECTED ENTITIES:</strong>
                        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>
                          {nlpResult.entities.map((e,i) => (
                            <span key={i} className="entity-tag">{e.type}: {e.name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENT AI ── */}
        {activeTab === 'document' && (
          <div className="ai-section">
            <h2>📄 Document AI — Data Extraction</h2>
            <p className="ai-desc">Upload a PDF, invoice, or scanned form — AI extracts all text, fields, and structured data for the client.</p>
            <form onSubmit={handleDocument}>
              <div className="ai-field">
                <label>Document (PDF, PNG, JPG, TIFF)</label>
                <div className="file-drop" onClick={() => docRef.current.click()}>
                  {docFile ? `✅ ${docFile.name} (${(docFile.size/1024).toFixed(0)} KB)` : '📁 Click to upload document'}
                  <input ref={docRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff" style={{display:'none'}}
                    onChange={e => setDocFile(e.target.files[0])} />
                </div>
              </div>
              <button className="btn-ai-action" disabled={processingDoc || !docFile}>
                {processingDoc ? '⏳ Processing document...' : '📄 Extract Data'}
              </button>
            </form>
            {docResult && (
              <div className="ai-result">
                {docResult.error ? <p className="result-error">❌ {docResult.error}</p> : (
                  <>
                    {docResult.simulated && <p className="result-simulated">⚠️ Simulated — add GOOGLE_DOCAI_PROCESSOR_ID + service account to go live</p>}
                    <div className="result-meta">
                      <span>Pages: <strong>{docResult.pages}</strong></span>
                      <span>Fields: <strong>{docResult.keyValuePairs?.length || 0}</strong></span>
                      <span>Entities: <strong>{docResult.entities?.length || 0}</strong></span>
                    </div>
                    {docResult.keyValuePairs?.length > 0 && (
                      <div className="kv-table">
                        {docResult.keyValuePairs.map((kv, i) => (
                          <div key={i} className="kv-row">
                            <span className="kv-key">{kv.key}</span>
                            <span className="kv-val">{kv.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {docResult.text && <div className="result-box" style={{marginTop:12}}>{docResult.text.slice(0,1000)}{docResult.text.length > 1000 ? '…' : ''}</div>}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── GMAIL INBOX ── */}
        {activeTab === 'inbox' && (
          <div className="ai-section">
            <h2>📬 Client Reply Inbox</h2>
            <p className="ai-desc">Reads unread emails from your Gmail. AI analyses each reply and updates lead statuses automatically.</p>
            <div className="inbox-actions">
              <button className="btn-ai-action" onClick={loadInbox} disabled={loadingInbox}>
                {loadingInbox ? '⏳ Loading...' : '📬 Refresh Inbox'}
              </button>
              <button className="btn-ai-action btn-process" onClick={processReplies} disabled={processingReplies}>
                {processingReplies ? '⏳ Processing...' : '🧠 AI Process All Replies'}
              </button>
            </div>

            {!aiStatus.gmailReader && (
              <div className="setup-notice">
                ⚙️ <strong>Gmail Reader needs OAuth setup.</strong> See the credentials guide below.
              </div>
            )}

            {replyReport && (
              <div className="ai-result">
                {replyReport.error ? <p className="result-error">❌ {replyReport.error}</p> : (
                  <>
                    <p style={{color:'#34d399'}}>✅ Processed {replyReport.processed} emails</p>
                    {replyReport.updates?.map((u,i) => (
                      <div key={i} className="reply-update">
                        <span className="from-email">{u.email}</span>
                        <span className="intent-badge" style={{color: intentColor[u.intent]}}>→ {u.intent}</span>
                        <span className="new-status">Status: {u.newStatus}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {inbox.length === 0 && !loadingInbox && (
              <div className="empty-inbox">
                <p>{aiStatus.gmailReader ? '📭 No unread emails in inbox' : '📭 Gmail Reader not configured yet'}</p>
              </div>
            )}

            {inbox.map((email, i) => (
              <div key={i} className="inbox-email">
                <div className="email-from">{email.from}</div>
                <div className="email-subject">{email.subject}</div>
                <div className="email-date">{new Date(email.date).toLocaleDateString()}</div>
                <div className="email-body">{email.body?.slice(0, 200)}…</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credentials Guide */}
      <div className="credentials-guide">
        <h3>🔑 Google Cloud Credentials Guide</h3>
        <p style={{color:'#64748b',marginBottom:16}}>Everything runs on one Google Cloud project. Here's exactly where to get each key:</p>
        <div className="cred-grid">
          {[
            {
              service: '🌐 Translation + 🎙️ Transcription + 🧠 NLP',
              secret: 'GOOGLE_API_KEY',
              steps: [
                'Go to console.cloud.google.com',
                'Select your project → APIs & Services → Credentials',
                'Click Create Credentials → API Key',
                'Copy the key and add it as secret GOOGLE_API_KEY',
                'Also enable: Cloud Translation API, Speech-to-Text API, Cloud Natural Language API',
              ]
            },
            {
              service: '🔍 Custom Search (free 100/day)',
              secret: 'GOOGLE_API_KEY + GOOGLE_CSE_ID',
              steps: [
                'Same GOOGLE_API_KEY as above',
                'Go to programmablesearch.google.com',
                'Create a new search engine → search the whole web',
                'Copy the Search Engine ID (cx) → add as GOOGLE_CSE_ID secret',
              ]
            },
            {
              service: '📄 Document AI',
              secret: 'GOOGLE_DOCAI_PROCESSOR_ID + GOOGLE_CLOUD_PROJECT_ID + GOOGLE_SERVICE_ACCOUNT_JSON',
              steps: [
                'console.cloud.google.com → Document AI → Create Processor',
                'Choose "Form Parser" → create → copy the Processor ID',
                'Add as secret: GOOGLE_DOCAI_PROCESSOR_ID',
                'Also add your project ID as: GOOGLE_CLOUD_PROJECT_ID',
                'IAM & Admin → Service Accounts → Create → download JSON key → add entire JSON as GOOGLE_SERVICE_ACCOUNT_JSON',
              ]
            },
            {
              service: '📬 Gmail Inbox Reader',
              secret: 'GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN',
              steps: [
                'console.cloud.google.com → APIs & Services → Credentials',
                'Create Credentials → OAuth 2.0 Client ID → Desktop App',
                'Copy Client ID and Client Secret → add as secrets',
                'Enable Gmail API in APIs & Services → Library',
                'Use OAuth Playground (developers.google.com/oauthplayground) to generate Refresh Token with scope: https://mail.google.com/',
                'Add the refresh token as secret GMAIL_REFRESH_TOKEN',
              ]
            },
          ].map((c, i) => (
            <div key={i} className="cred-card">
              <div className="cred-service">{c.service}</div>
              <div className="cred-secret">Secret: <code>{c.secret}</code></div>
              <ol className="cred-steps">
                {c.steps.map((s, j) => <li key={j}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
