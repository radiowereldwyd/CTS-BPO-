import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || '';

export default function FreelancerInbox({ token }) {
  const [threads, setThreads]       = useState([]);
  const [selected, setSelected]     = useState(null);
  const [messages, setMessages]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [reply, setReply]           = useState('');
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState('');
  const [replyError, setReplyError] = useState('');
  const bottomRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await axios.get(`${API}/api/freelancer/inbox`, { headers });
      setThreads(r.data.threads || []);
      setError('');
    } catch (e) {
      setError('Could not load inbox: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadMessages = useCallback(async (threadId) => {
    setMsgLoading(true);
    try {
      const r = await axios.get(`${API}/api/freelancer/inbox/${threadId}`, { headers });
      setMessages(r.data.messages || []);
      setSelected(r.data.thread || null);
    } catch (e) {
      setMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }, [token]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await axios.post(`${API}/api/freelancer/inbox/sync`, {}, { headers });
      setThreads(r.data.threads || []);
      if (selected) await loadMessages(selected.thread_id);
      setError('');
    } catch (e) {
      setError('Sync failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setSyncing(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    setReplyError('');
    try {
      const r = await axios.post(
        `${API}/api/freelancer/inbox/${selected.thread_id}/reply`,
        { message: reply.trim() },
        { headers }
      );
      if (r.data.ok) {
        setReply('');
        await loadMessages(selected.thread_id);
      } else {
        setReplyError(r.data.error || 'Send failed');
      }
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message || 'Send failed';
      setReplyError(errMsg);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll every 5 minutes
  useEffect(() => {
    const iv = setInterval(() => loadThreads(true), 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadThreads]);

  const fmt = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 140px)', background: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* ─── Thread list ─── */}
      <div style={{ width: 320, borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>💬 Freelancer Inbox</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{threads.length} conversation{threads.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={syncNow} disabled={syncing} style={{
            marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: 'none',
            background: syncing ? '#334155' : '#0ea5e9', color: '#fff', cursor: syncing ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 600
          }}>
            {syncing ? '⟳ Syncing…' : '⟳ Sync Now'}
          </button>
        </div>

        {error && (
          <div style={{ margin: 12, padding: '10px 14px', background: '#7f1d1d33', border: '1px solid #ef4444', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Loading threads…</div>
        ) : threads.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>No conversations yet.</p>
            <p style={{ color: '#475569', fontSize: 12, margin: '8px 0 0' }}>As employers reply to your bids, conversations will appear here.</p>
            <button onClick={syncNow} disabled={syncing} style={{
              marginTop: 16, padding: '8px 16px', borderRadius: 8, border: 'none',
              background: '#0ea5e9', color: '#fff', cursor: 'pointer', fontSize: 13
            }}>Check for New Messages</button>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {threads.map(t => {
              const isSelected = selected?.thread_id === t.thread_id;
              const hasReplies = parseInt(t.received_count) > 0;
              return (
                <div
                  key={t.thread_id}
                  onClick={() => loadMessages(t.thread_id)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid #1e293b',
                    cursor: 'pointer',
                    background: isSelected ? '#1e3a5f' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#1e293b'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: '#0ea5e9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 700, flexShrink: 0, color: '#fff'
                    }}>
                      {(t.other_name || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.other_name || 'Unknown'}
                        </span>
                        {hasReplies && (
                          <span style={{ background: '#22c55e', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                            REPLY
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.project_title || `Thread #${t.thread_id}`}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 10, color: '#475569', flexShrink: 0 }}>
                      {fmt(t.last_msg_at || t.updated_at)}
                    </div>
                  </div>
                  <div style={{ paddingLeft: 44, fontSize: 11, color: '#64748b' }}>
                    {parseInt(t.total_msgs)} message{parseInt(t.total_msgs) !== 1 ? 's' : ''} · {t.folder}
                    {hasReplies ? <span style={{ color: '#22c55e', marginLeft: 6 }}>• {t.received_count} from employer</span> : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b', fontSize: 11, color: '#475569' }}>
          <div style={{ marginBottom: 4 }}>Auto-syncs every 5 minutes</div>
          <div>Replies from employers show <span style={{ color: '#22c55e' }}>REPLY</span> badge</div>
        </div>
      </div>

      {/* ─── Conversation pane ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>💬</div>
            <p style={{ fontSize: 16, margin: 0, color: '#64748b' }}>Select a conversation to read it</p>
            <p style={{ fontSize: 13, margin: '8px 0 0', color: '#475569' }}>Employer replies to your bids appear here automatically.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', background: '#0f172a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%', background: '#0ea5e9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff'
                }}>
                  {(selected.other_name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9' }}>{selected.other_name}</div>
                  {selected.other_username && (
                    <a href={`https://www.freelancer.com/u/${selected.other_username}`} target="_blank" rel="noreferrer"
                       style={{ fontSize: 12, color: '#0ea5e9', textDecoration: 'none' }}>
                      @{selected.other_username} ↗
                    </a>
                  )}
                </div>
                {selected.project_title && (
                  <div style={{ marginLeft: 12, padding: '4px 10px', background: '#1e293b', borderRadius: 6, fontSize: 12, color: '#94a3b8', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📁 {selected.project_title}
                  </div>
                )}
                {selected.project_id && (
                  <a href={`https://www.freelancer.com/projects/${selected.project_id}`} target="_blank" rel="noreferrer"
                     style={{ marginLeft: 8, padding: '4px 10px', background: '#0ea5e9', borderRadius: 6, fontSize: 12, color: '#fff', textDecoration: 'none' }}>
                    View on Freelancer ↗
                  </a>
                )}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {msgLoading ? (
                <div style={{ textAlign: 'center', color: '#64748b', paddingTop: 40 }}>Loading messages…</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', paddingTop: 40 }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📨</div>
                  <p>No messages in this thread yet.</p>
                  <p style={{ fontSize: 12, color: '#475569' }}>When the employer replies to your bid, it will appear here.</p>
                </div>
              ) : (
                messages.map((m, i) => {
                  const isSent = m.direction === 'sent';
                  return (
                    <div key={m.msg_id || i} style={{ display: 'flex', justifyContent: isSent ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '70%', padding: '10px 14px', borderRadius: isSent ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background: isSent ? '#0ea5e9' : '#1e293b',
                        color: isSent ? '#fff' : '#e2e8f0',
                        fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word'
                      }}>
                        <div>{m.message}</div>
                        <div style={{ fontSize: 10, marginTop: 6, opacity: 0.7, textAlign: isSent ? 'right' : 'left' }}>
                          {isSent ? '✓ You' : selected.other_name} · {fmt(m.sent_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #1e293b', background: '#0f172a' }}>
              {replyError && (
                <div style={{ marginBottom: 8, padding: '8px 12px', background: '#7f1d1d33', border: '1px solid #ef4444', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
                  ⚠ {replyError}
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Note: Direct replies require full OAuth messaging permissions. Use the Freelancer website for guaranteed delivery.
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendReply(); }}
                  placeholder="Type a reply… (Ctrl+Enter to send)"
                  rows={3}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #334155',
                    background: '#1e293b', color: '#e2e8f0', fontSize: 14, resize: 'none',
                    outline: 'none', fontFamily: 'inherit'
                  }}
                />
                <button onClick={sendReply} disabled={sending || !reply.trim()} style={{
                  padding: '10px 20px', borderRadius: 10, border: 'none',
                  background: sending || !reply.trim() ? '#334155' : '#0ea5e9',
                  color: '#fff', cursor: sending || !reply.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: 14, height: 44
                }}>
                  {sending ? '…' : 'Send'}
                </button>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#475569' }}>
                Auto-replies are sent when employers message you. You can also reply manually here.
                For guaranteed delivery, also check <a href="https://www.freelancer.com/messages" target="_blank" rel="noreferrer" style={{ color: '#0ea5e9' }}>freelancer.com/messages ↗</a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
