'use strict';

/**
 * CTS BPO — Freelancer.com Inbox Monitor
 * Polls threads every 5 minutes, auto-responds to common questions,
 * stores conversation history in DB.
 */

const axios = require('axios');
const db    = require('../db');

const FL_TOKEN = () => process.env.FREELANCER_TOKEN || '';
const MY_ID    = 92591312;
const FL_API   = 'https://www.freelancer.com/api';

// ── DB setup ──────────────────────────────────────────────────────────────────
async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS fl_threads (
      thread_id    BIGINT PRIMARY KEY,
      project_id   BIGINT,
      other_user_id BIGINT,
      other_name   TEXT,
      other_username TEXT,
      project_title TEXT,
      folder       TEXT,
      is_read      BOOLEAN DEFAULT FALSE,
      last_msg_at  TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS fl_messages (
      msg_id       BIGINT PRIMARY KEY,
      thread_id    BIGINT,
      from_user    BIGINT,
      direction    TEXT,        -- 'sent' | 'received'
      message      TEXT,
      sent_at      TIMESTAMPTZ,
      auto_replied BOOLEAN DEFAULT FALSE,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ── Freelancer API helpers ────────────────────────────────────────────────────
function flGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return axios.get(`${FL_API}${path}${qs ? '?' + qs : ''}`, {
    headers: { 'freelancer-oauth-v1': FL_TOKEN() },
    timeout: 15000,
    validateStatus: () => true,
  });
}

function flPost(path, data = {}) {
  return axios.post(`${FL_API}${path}`, data, {
    headers: { 'freelancer-oauth-v1': FL_TOKEN(), 'Content-Type': 'application/json' },
    timeout: 15000,
    validateStatus: () => true,
  });
}

async function getUserInfo(userId) {
  try {
    const r = await flGet('/users/0.1/users/', { 'ids[]': userId, display_info: true });
    const u = r.data?.result?.users?.[userId];
    return u ? { name: u.display_name || u.username, username: u.username } : { name: 'User #' + userId, username: '' };
  } catch { return { name: 'User #' + userId, username: '' }; }
}

async function getProjectTitle(projectId) {
  try {
    const r = await flGet('/projects/0.1/projects/' + projectId + '/');
    return r.data?.result?.title || 'Project #' + projectId;
  } catch { return 'Project #' + projectId; }
}

// ── Fetch all threads + their messages ───────────────────────────────────────
async function fetchAllThreads() {
  const r = await flGet('/messages/0.1/threads/', { limit: 50, message_details: true });
  const raw = r.data?.result?.threads || [];
  const threads = [];

  for (const t of raw) {
    const tid     = t.thread?.id || t.id;
    const members = t.thread?.members || [];
    const otherId = members.find(m => m !== MY_ID);
    const projId  = t.thread?.context?.id;
    const folder  = t.folder || 'inbox';
    const isRead  = t.is_read !== false;
    const msgs    = t.messages || [];

    const [userInfo, projTitle] = await Promise.all([
      otherId ? getUserInfo(otherId) : Promise.resolve({ name: 'Unknown', username: '' }),
      projId  ? getProjectTitle(projId)  : Promise.resolve(''),
    ]);

    threads.push({
      thread_id:      tid,
      project_id:     projId || null,
      other_user_id:  otherId || null,
      other_name:     userInfo.name,
      other_username: userInfo.username,
      project_title:  projTitle,
      folder,
      is_read:        isRead,
      messages:       msgs.map(m => ({
        msg_id:    m.id,
        thread_id: tid,
        from_user: m.from_user,
        direction: m.from_user === MY_ID ? 'sent' : 'received',
        message:   m.message || '',
        sent_at:   m.time_created ? new Date(m.time_created * 1000).toISOString() : new Date().toISOString(),
      })),
    });
  }
  return threads;
}

// ── Get messages for a specific thread ───────────────────────────────────────
// NOTE: /threads/{id}/messages/ returns 405 on free-tier tokens.
// Correct approach: fetch the thread list filtered by id with message_details=true.
async function fetchThreadMessages(threadId) {
  const r = await flGet('/messages/0.1/threads/', {
    'ids[]': threadId,
    message_details: true,
    limit: 100,
  });
  const tid = parseInt(threadId, 10);
  const thread = (r.data?.result?.threads || []).find(t => t.id === tid || t.thread?.id === tid);
  const msgs = thread?.messages || [];
  return msgs.map(m => ({
    msg_id:    m.id,
    thread_id: threadId,
    from_user: m.from_user,
    direction: m.from_user === MY_ID ? 'sent' : 'received',
    message:   m.message || '',
    sent_at:   m.time_created ? new Date(m.time_created * 1000).toISOString() : new Date().toISOString(),
  }));
}

// ── Send a reply ─────────────────────────────────────────────────────────────
async function sendReply(threadId, message) {
  const trimmed = (message || '').trim();
  if (!trimmed) return { ok: false, error: 'Empty message — reply skipped' };
  const r = await flPost(`/messages/0.1/threads/${threadId}/messages/`, { message: trimmed });
  if (r.status === 200 || r.status === 201) {
    const msgId = r.data?.result?.id || Date.now();
    await db.query(
      `INSERT INTO fl_messages (msg_id, thread_id, from_user, direction, message, sent_at)
       VALUES ($1,$2,$3,'sent',$4,NOW()) ON CONFLICT (msg_id) DO NOTHING`,
      [msgId, threadId, MY_ID, message]
    );
    console.log(`[FL-INBOX] Replied to thread ${threadId}`);
    return { ok: true, msg_id: msgId };
  }
  console.error('[FL-INBOX] Reply failed:', r.status, r.data?.message);
  return { ok: false, error: r.data?.message || 'Send failed', status: r.status };
}

// ── Auto-respond logic ────────────────────────────────────────────────────────
function buildAutoReply(incomingText, projectTitle) {
  const t = (incomingText || '').toLowerCase();
  const proj = projectTitle ? `the "${projectTitle}" project` : 'your project';

  if (t.includes('still interest') || t.includes('are you available') || t.includes('available')) {
    return `Yes, absolutely! We are fully available and ready to start on ${proj} immediately. CTS BPO is a dedicated AI-powered business process outsourcing team. We can begin as soon as you award the project. When would you like to get started?`;
  }
  if (t.includes('rate') || t.includes('cost') || t.includes('price') || t.includes('charge') || t.includes('budget')) {
    return `Our bid reflects competitive market pricing for high-quality, reliable delivery on ${proj}. We are flexible and open to discussing the scope to fit your budget. Could you share any specific budget constraints so we can tailor our proposal for you?`;
  }
  if (t.includes('experience') || t.includes('portfolio') || t.includes('background') || t.includes('sample')) {
    return `CTS BPO specialises in data processing, virtual assistance, customer support, research, and administrative services. Our team has handled hundreds of similar projects with consistent 5-star delivery. We would be happy to provide references or walk you through our process for ${proj}.`;
  }
  if (t.includes('timeline') || t.includes('deadline') || t.includes('how long') || t.includes('when')) {
    return `We can deliver ${proj} on time or ahead of schedule. Once we have the full requirements, we will provide a precise timeline. Generally, we prioritise urgent projects and maintain clear communication throughout. What is your target completion date?`;
  }
  if (t.includes('hello') || t.includes('hi ') || t.includes('hey') || t.includes('greetings')) {
    return `Hello! Thank you for reaching out about ${proj}. CTS BPO is ready to assist. Please share any additional details or requirements and we will get started right away.`;
  }
  if (t.includes('award') || t.includes('hired') || t.includes('accept') || t.includes('let us proceed') || t.includes('proceed')) {
    return `Wonderful news! Thank you for awarding us ${proj}. We will begin immediately. Please share any source files, instructions, or access credentials needed, and we will keep you updated on progress every step of the way.`;
  }
  if (t.includes('revise') || t.includes('change') || t.includes('update') || t.includes('modify')) {
    return `Absolutely, we welcome your feedback on ${proj}. Please send through the specific changes you need and we will revise and resubmit promptly — we include unlimited revisions in our service.`;
  }
  if (t.includes('done') || t.includes('complet') || t.includes('finish') || t.includes('deliver')) {
    return `Glad to hear it! Please review the delivered work and let us know if there is anything you would like adjusted. We are also available for follow-up tasks or ongoing support for ${proj}.`;
  }
  return null; // no auto-reply template matched
}

// ── Save a message list to DB ─────────────────────────────────────────────────
async function saveMsgs(msgs) {
  for (const m of msgs) {
    if (!m.msg_id) continue;
    await db.query(`
      INSERT INTO fl_messages (msg_id, thread_id, from_user, direction, message, sent_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (msg_id) DO NOTHING
    `, [m.msg_id, m.thread_id, m.from_user, m.direction, m.message || '', m.sent_at]);
  }
}

// ── Sync + auto-reply loop ────────────────────────────────────────────────────
async function syncInbox() {
  if (!FL_TOKEN()) return;
  try {
    await ensureTables();
    const threads = await fetchAllThreads();

    for (const thread of threads) {
      // Determine best last_msg_at
      const lastInline = thread.messages.length > 0
        ? thread.messages[thread.messages.length - 1].sent_at
        : null;

      // Upsert thread record
      await db.query(`
        INSERT INTO fl_threads (thread_id, project_id, other_user_id, other_name, other_username, project_title, folder, is_read, last_msg_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT (thread_id) DO UPDATE SET
          is_read=EXCLUDED.is_read, folder=EXCLUDED.folder,
          other_name=EXCLUDED.other_name, project_title=EXCLUDED.project_title,
          last_msg_at=COALESCE(EXCLUDED.last_msg_at, fl_threads.last_msg_at),
          updated_at=NOW()
      `, [
        thread.thread_id, thread.project_id, thread.other_user_id,
        thread.other_name, thread.other_username, thread.project_title,
        thread.folder, thread.is_read, lastInline,
      ]);

      // 1) Save the inline messages that came with fetchAllThreads (message_details: true)
      if (thread.messages.length > 0) {
        await saveMsgs(thread.messages);
      }

      // 2) Also fetch full message list from the dedicated messages endpoint
      try {
        const fullMsgs = await fetchThreadMessages(thread.thread_id);
        if (fullMsgs.length > 0) {
          await saveMsgs(fullMsgs);
          console.log(`[FL-INBOX] Thread ${thread.thread_id}: saved ${fullMsgs.length} message(s)`);
        }
      } catch (msgErr) {
        console.warn(`[FL-INBOX] Could not fetch messages for thread ${thread.thread_id}:`, msgErr.message);
      }

      // 3) Check for unread incoming messages that haven't been auto-replied to
      const unhandled = await db.query(`
        SELECT m.msg_id, m.message FROM fl_messages m
        WHERE m.thread_id=$1 AND m.direction='received' AND m.auto_replied=FALSE
        ORDER BY m.sent_at ASC
      `, [thread.thread_id]);

      for (const row of unhandled.rows) {
        const reply = buildAutoReply(row.message, thread.project_title);
        if (reply) {
          const sent = await sendReply(thread.thread_id, reply);
          if (sent.ok) {
            await db.query(`UPDATE fl_messages SET auto_replied=TRUE WHERE msg_id=$1`, [row.msg_id]);
          }
        } else {
          await db.query(`UPDATE fl_messages SET auto_replied=TRUE WHERE msg_id=$1`, [row.msg_id]);
        }
      }
    }

    console.log(`[FL-INBOX] Synced ${threads.length} thread(s)`);
  } catch (err) {
    console.error('[FL-INBOX] Sync error:', err.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
async function getInboxData() {
  await ensureTables();
  const threads = await db.query(`
    SELECT t.*, 
      (SELECT COUNT(*) FROM fl_messages m WHERE m.thread_id=t.thread_id AND m.direction='received') AS received_count,
      (SELECT COUNT(*) FROM fl_messages m WHERE m.thread_id=t.thread_id) AS total_msgs
    FROM fl_threads t ORDER BY t.updated_at DESC
  `);
  return threads.rows;
}

async function getThreadConversation(threadId) {
  await ensureTables();
  const t = await db.query(`SELECT * FROM fl_threads WHERE thread_id=$1`, [threadId]);
  let m = await db.query(`SELECT * FROM fl_messages WHERE thread_id=$1 ORDER BY sent_at ASC`, [threadId]);

  // If DB has no messages but Freelancer may have some, do a live fetch and save them
  if (m.rows.length === 0 && FL_TOKEN()) {
    try {
      const live = await fetchThreadMessages(threadId);
      if (live.length > 0) {
        await saveMsgs(live);
        m = await db.query(`SELECT * FROM fl_messages WHERE thread_id=$1 ORDER BY sent_at ASC`, [threadId]);
        console.log(`[FL-INBOX] Live-fetched ${live.length} message(s) for thread ${threadId}`);
      }
    } catch (e) {
      console.warn(`[FL-INBOX] Live fetch failed for thread ${threadId}:`, e.message);
    }
  }

  return { thread: t.rows[0] || null, messages: m.rows };
}

module.exports = { syncInbox, getInboxData, getThreadConversation, sendReply, ensureTables, fetchAllThreads, fetchThreadMessages };
