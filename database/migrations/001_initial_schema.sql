-- Migration: 001_initial_schema
-- Description: Initial CTS BPO database schema
-- Run schema.sql to execute this migration

-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    id          SERIAL PRIMARY KEY,
    version     VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    applied_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version, description) VALUES
('001', 'Initial CTS BPO schema: clients, subcontractors, contracts, transactions, ai_metrics, audit_trails, system_logs')
ON CONFLICT (version) DO NOTHING;
