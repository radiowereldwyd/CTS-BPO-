-- CTS BPO Seed Data
-- Inserts sample data for development and testing

-- Clients
INSERT INTO clients (name, email, region, tier, contract_value, status) VALUES
('Acme Corp', 'acme@example.com', 'South Africa', 'enterprise', 50000.00, 'active'),
('Global Trade Ltd', 'global@example.com', 'Nigeria', 'growth', 15000.00, 'active'),
('Swift Services', 'swift@example.com', 'Kenya', 'starter', 5000.00, 'active'),
('Nexus Partners', 'nexus@example.com', 'UK', 'growth', 15000.00, 'active'),
('Peak Solutions', 'peak@example.com', 'South Africa', 'starter', 5000.00, 'active')
ON CONFLICT (email) DO NOTHING;

-- Subcontractors
INSERT INTO subcontractors (name, email, specializations, capacity, active_jobs, success_rate) VALUES
('Sub Alpha', 'alpha@subcontractors.com', ARRAY['data-entry', 'transcription'], 10, 2, 0.9500),
('Sub Beta', 'beta@subcontractors.com', ARRAY['customer-support', 'data-entry'], 8, 3, 0.8800),
('Sub Gamma', 'gamma@subcontractors.com', ARRAY['accounting', 'reporting'], 5, 1, 0.9700),
('Sub Delta', 'delta@subcontractors.com', ARRAY['transcription', 'customer-support'], 12, 4, 0.9200)
ON CONFLICT (email) DO NOTHING;

-- Sample Contracts
INSERT INTO contracts (client_id, sub_id, type, complexity, value, start_date, end_date, status, routing) VALUES
(1, NULL, 'data-entry', 3, 50000.00, CURRENT_DATE - 10, CURRENT_DATE + 20, 'active', 'internal'),
(2, 1, 'customer-support', 5, 15000.00, CURRENT_DATE - 5, CURRENT_DATE + 25, 'active', 'subcontractor'),
(3, NULL, 'transcription', 2, 5000.00, CURRENT_DATE - 2, CURRENT_DATE + 28, 'pending', 'internal'),
(4, 3, 'accounting', 7, 15000.00, CURRENT_DATE - 15, CURRENT_DATE + 15, 'completed', 'subcontractor'),
(5, 2, 'data-entry', 4, 5000.00, CURRENT_DATE - 20, CURRENT_DATE - 5, 'failed', 'subcontractor');

-- Sample Transactions
INSERT INTO transactions (contract_id, amount_zar, currency, reference, status, paid_at) VALUES
(4, 15000.00, 'ZAR', 'CTS-4-1001', 'succeeded', CURRENT_TIMESTAMP - INTERVAL '5 days'),
(5, 5000.00, 'ZAR', 'CTS-5-1002', 'failed', NULL);

-- Sample AI Metrics
INSERT INTO ai_metrics (date, accuracy, optimization_score, negotiation_win_rate, region_focus, contracts_processed, revenue_zar) VALUES
(CURRENT_DATE - 6, 0.8800, 0.8500, 0.9200, 'South Africa', 8, 75000.00),
(CURRENT_DATE - 5, 0.8900, 0.8600, 0.9100, 'Nigeria', 10, 90000.00),
(CURRENT_DATE - 4, 0.8950, 0.8700, 0.9300, 'South Africa', 12, 105000.00),
(CURRENT_DATE - 3, 0.9000, 0.8800, 0.9000, 'Kenya', 9, 80000.00),
(CURRENT_DATE - 2, 0.9050, 0.8900, 0.9400, 'UK', 11, 95000.00),
(CURRENT_DATE - 1, 0.9100, 0.9000, 0.9200, 'South Africa', 13, 115000.00),
(CURRENT_DATE, 0.9150, 0.9100, 0.9100, 'South Africa', 5, 45000.00);

-- Admin user (password: Admin1234!)
-- bcrypt hash of "Admin1234!" with 10 rounds
INSERT INTO users (name, email, password_hash, role) VALUES
('CTS Admin', 'admin@ctsbpo.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Sample Audit Trails
INSERT INTO audit_trails (event_type, entity_type, entity_id, description, status) VALUES
('contract.created', 'contract', 1, 'New contract received from Acme Corp', 'info'),
('contract.analyzed', 'contract', 1, 'Contract analyzed. Routed to internal handling.', 'info'),
('contract.created', 'contract', 2, 'New contract received from Global Trade Ltd', 'info'),
('contract.assigned', 'contract', 2, 'Assigned to subcontractor Sub Alpha', 'info'),
('contract.completed', 'contract', 4, 'Contract completed successfully', 'info'),
('payment.initiated', 'contract', 4, 'Payment of R15,000.00 initiated', 'info'),
('payment.succeeded', 'contract', 4, 'Payment confirmed. Reference: CTS-4-1001', 'info'),
('contract.failed', 'contract', 5, 'Contract failed: Subcontractor missed deadline', 'error'),
('payment.failed', 'contract', 5, 'Payment attempt 1 failed: timeout', 'error');
