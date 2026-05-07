/**
 * BPO Job Delivery Module
 * Full lifecycle: client intake → admin assign → sub works → admin review → client delivery
 */
const db = require('../db');

const JOB_TYPES = {
  data_entry:          'Data Entry & Capture',
  transcription:       'Audio / Video Transcription',
  translation:         'Document Translation',
  document_processing: 'Document Processing',
  invoice_processing:  'Invoice Processing',
  payroll:             'Payroll Administration',
  medical_billing:     'Medical Billing & Records',
  legal:               'Legal Document Processing',
  bookkeeping:         'Bookkeeping & Accounts',
  content:             'Content Moderation / Writing',
  virtual_assistant:   'Virtual Assistant Tasks',
  other:               'Other',
};

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS bpo_jobs (
      id              SERIAL PRIMARY KEY,
      client_token    TEXT,
      client_name     TEXT,
      client_email    TEXT,
      job_type        TEXT NOT NULL DEFAULT 'other',
      title           TEXT NOT NULL,
      description     TEXT,
      instructions    TEXT,
      deadline        DATE,
      priority        TEXT DEFAULT 'normal',
      status          TEXT DEFAULT 'new',
      assigned_to     INTEGER,
      assigned_name   TEXT,
      assigned_email  TEXT,
      assigned_at     TIMESTAMPTZ,
      submitted_at    TIMESTAMPTZ,
      approved_at     TIMESTAMPTZ,
      delivered_at    TIMESTAMPTZ,
      quality_notes   TEXT,
      revision_count  INTEGER DEFAULT 0,
      revision_notes  TEXT,
      source_files    JSONB DEFAULT '[]',
      completed_files JSONB DEFAULT '[]',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_bpo_jobs_status ON bpo_jobs(status)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_bpo_jobs_token  ON bpo_jobs(client_token)`).catch(() => {});
  await db.query(`CREATE INDEX IF NOT EXISTS idx_bpo_jobs_sub    ON bpo_jobs(assigned_to)`).catch(() => {});
}

async function createJob({ clientToken, clientName, clientEmail, jobType, title, description, instructions, deadline, priority = 'normal', sourceFiles = [] }) {
  const r = await db.query(
    `INSERT INTO bpo_jobs
       (client_token, client_name, client_email, job_type, title, description, instructions, deadline, priority, source_files)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [clientToken, clientName, clientEmail, jobType, title, description, instructions, deadline || null, priority, JSON.stringify(sourceFiles)]
  );
  return r.rows[0];
}

async function listJobs({ status, assignedTo, limit = 200 } = {}) {
  let where = 'WHERE 1=1';
  const vals = [];
  if (status && status !== 'all') { vals.push(status); where += ` AND status = $${vals.length}`; }
  if (assignedTo) { vals.push(assignedTo); where += ` AND assigned_to = $${vals.length}`; }
  vals.push(limit);
  const r = await db.query(
    `SELECT id, client_name, client_email, client_token, job_type, title, description,
            status, priority, deadline::text AS deadline, assigned_name, assigned_email,
            assigned_at::text, submitted_at::text, delivered_at::text,
            revision_count, revision_notes, created_at::text, updated_at::text,
            EXTRACT(EPOCH FROM (deadline - NOW())) AS secs_until_deadline,
            jsonb_array_length(source_files)    AS source_file_count,
            jsonb_array_length(completed_files) AS completed_file_count
     FROM bpo_jobs ${where}
     ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       CASE status   WHEN 'review' THEN 0 WHEN 'new' THEN 1 WHEN 'revision' THEN 2 ELSE 3 END,
       created_at DESC
     LIMIT $${vals.length}`,
    vals
  );
  return r.rows;
}

async function getJob(id) {
  const r = await db.query(`SELECT * FROM bpo_jobs WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function getJobsByToken(token) {
  const r = await db.query(
    `SELECT id, job_type, title, description, status, priority,
            deadline::text AS deadline, assigned_name, submitted_at::text,
            delivered_at::text, revision_count, created_at::text,
            jsonb_array_length(completed_files) AS completed_file_count
     FROM bpo_jobs WHERE client_token = $1 ORDER BY created_at DESC`,
    [token]
  );
  return r.rows;
}

async function getSubJobs(subId) {
  const r = await db.query(
    `SELECT id, job_type, title, description, instructions, status, priority,
            deadline::text AS deadline, source_files, completed_files,
            submitted_at::text, revision_notes, quality_notes, created_at::text,
            jsonb_array_length(source_files) AS source_file_count
     FROM bpo_jobs
     WHERE assigned_to = $1 AND status NOT IN ('delivered')
     ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
       created_at DESC`,
    [subId]
  );
  return r.rows;
}

async function assignJob(id, { subId, subName, subEmail }) {
  const r = await db.query(
    `UPDATE bpo_jobs SET status='assigned', assigned_to=$2, assigned_name=$3, assigned_email=$4,
     assigned_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status IN ('new','revision')
     RETURNING *`,
    [id, subId, subName, subEmail]
  );
  return r.rows[0] || null;
}

async function startJob(id, subId) {
  const r = await db.query(
    `UPDATE bpo_jobs SET status='in_progress', updated_at=NOW()
     WHERE id=$1 AND assigned_to=$2 AND status='assigned'
     RETURNING *`,
    [id, subId]
  );
  return r.rows[0] || null;
}

async function submitWork(id, subId, completedFiles) {
  const r = await db.query(
    `UPDATE bpo_jobs SET status='review', completed_files=$3, submitted_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND assigned_to=$2 AND status IN ('assigned','in_progress','revision')
     RETURNING *`,
    [id, subId, JSON.stringify(completedFiles)]
  );
  return r.rows[0] || null;
}

async function approveJob(id, qualityNotes = '') {
  const r = await db.query(
    `UPDATE bpo_jobs SET status='delivered', quality_notes=$2, approved_at=NOW(), delivered_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status='review'
     RETURNING *`,
    [id, qualityNotes]
  );
  return r.rows[0] || null;
}

async function rejectJob(id, revisionNotes) {
  const r = await db.query(
    `UPDATE bpo_jobs SET status='revision', revision_notes=$2, revision_count=revision_count+1, updated_at=NOW()
     WHERE id=$1 AND status='review'
     RETURNING *`,
    [id, revisionNotes]
  );
  return r.rows[0] || null;
}

async function getStats() {
  const r = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status='new')         AS new_count,
      COUNT(*) FILTER (WHERE status='assigned')    AS assigned_count,
      COUNT(*) FILTER (WHERE status='in_progress') AS in_progress_count,
      COUNT(*) FILTER (WHERE status='review')      AS review_count,
      COUNT(*) FILTER (WHERE status='delivered')   AS delivered_count,
      COUNT(*) FILTER (WHERE status='revision')    AS revision_count,
      COUNT(*)                                     AS total,
      COUNT(*) FILTER (WHERE deadline < NOW() AND status NOT IN ('delivered')) AS overdue
    FROM bpo_jobs
  `);
  return r.rows[0] || {};
}

async function getWeeklyClientSummaries() {
  const r = await db.query(`
    SELECT client_email, client_name,
           COUNT(*) FILTER (WHERE status='delivered' AND delivered_at > NOW()-INTERVAL '7 days') AS delivered_this_week,
           COUNT(*) FILTER (WHERE status NOT IN ('delivered'))  AS active_jobs,
           COUNT(*)                                             AS total_jobs
    FROM bpo_jobs
    WHERE client_email IS NOT NULL
    GROUP BY client_email, client_name
    HAVING
      COUNT(*) FILTER (WHERE status NOT IN ('delivered')) > 0
      OR COUNT(*) FILTER (WHERE status='delivered' AND delivered_at > NOW()-INTERVAL '7 days') > 0
  `);
  return r.rows;
}

module.exports = {
  ensureTables, createJob, listJobs, getJob, getJobsByToken, getSubJobs,
  assignJob, startJob, submitWork, approveJob, rejectJob, getStats,
  getWeeklyClientSummaries, JOB_TYPES,
};
