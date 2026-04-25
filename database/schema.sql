-- CTS BPO Database Schema
-- PostgreSQL

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    email          VARCHAR(255) UNIQUE NOT NULL,
    region         VARCHAR(100),
    tier           VARCHAR(20) DEFAULT 'starter',  -- starter, growth, enterprise
    contract_value NUMERIC(12, 2) DEFAULT 0,
    status         VARCHAR(20) DEFAULT 'active',   -- active, inactive, suspended
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subcontractors table
CREATE TABLE IF NOT EXISTS subcontractors (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,
    email            VARCHAR(255) UNIQUE NOT NULL,
    specializations  TEXT[],
    capacity         INTEGER DEFAULT 10,
    active_jobs      INTEGER DEFAULT 0,
    success_rate     NUMERIC(5, 4) DEFAULT 0.9000,
    status           VARCHAR(20) DEFAULT 'active',
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
    id            SERIAL PRIMARY KEY,
    client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    sub_id        INTEGER REFERENCES subcontractors(id) ON DELETE SET NULL,
    type          VARCHAR(100),
    complexity    INTEGER CHECK (complexity BETWEEN 1 AND 10),
    value         NUMERIC(12, 2) NOT NULL,
    start_date    DATE,
    end_date      DATE,
    status        VARCHAR(30) DEFAULT 'pending',   -- pending, active, completed, failed
    success_rate  NUMERIC(5, 4),
    routing       VARCHAR(20) DEFAULT 'internal',  -- internal, subcontractor
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id              SERIAL PRIMARY KEY,
    contract_id     INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
    amount_zar      NUMERIC(12, 2) NOT NULL,
    amount_usd      NUMERIC(12, 2),
    currency        VARCHAR(10) DEFAULT 'ZAR',
    reference       VARCHAR(255),
    ozow_reference  VARCHAR(255),
    status          VARCHAR(20) DEFAULT 'pending', -- pending, succeeded, failed
    paid_at         TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Metrics table
CREATE TABLE IF NOT EXISTS ai_metrics (
    id                  SERIAL PRIMARY KEY,
    date                DATE NOT NULL,
    accuracy            NUMERIC(5, 4),
    optimization_score  NUMERIC(5, 4),
    negotiation_win_rate NUMERIC(5, 4),
    region_focus        VARCHAR(100),
    contracts_processed INTEGER DEFAULT 0,
    revenue_zar         NUMERIC(12, 2) DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Trails table
CREATE TABLE IF NOT EXISTS audit_trails (
    id           SERIAL PRIMARY KEY,
    event_type   VARCHAR(100) NOT NULL,
    entity_type  VARCHAR(100),
    entity_id    INTEGER,
    description  TEXT NOT NULL,
    user_id      INTEGER,
    ip_address   VARCHAR(45),
    status       VARCHAR(20) DEFAULT 'info',  -- info, warning, error, critical
    timestamp    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Logs table
CREATE TABLE IF NOT EXISTS system_logs (
    id              SERIAL PRIMARY KEY,
    error_code      VARCHAR(50),
    description     TEXT,
    recovery_action TEXT,
    resolved        BOOLEAN DEFAULT FALSE,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_transactions_contract_id ON transactions(contract_id);
CREATE INDEX IF NOT EXISTS idx_audit_trails_event_type ON audit_trails(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_trails_timestamp ON audit_trails(timestamp);
