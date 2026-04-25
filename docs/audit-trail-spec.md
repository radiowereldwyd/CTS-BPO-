# CTS BPO – Audit Trail Specification

## Overview

The audit trail system provides full transparency and compliance logging for all operations within CTS BPO.

---

## AuditLog Table Schema

```sql
CREATE TABLE audit_trails (
    id            SERIAL PRIMARY KEY,
    event_type    VARCHAR(100) NOT NULL,
    entity_type   VARCHAR(100),
    entity_id     INTEGER,
    description   TEXT NOT NULL,
    user_id       INTEGER,
    ip_address    VARCHAR(45),
    status        VARCHAR(20) DEFAULT 'info',  -- info, warning, error, critical
    timestamp     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Event Types

| Event Type | Description | Severity |
|-----------|-------------|----------|
| `contract.created` | New contract received | info |
| `contract.analyzed` | AI analysis completed | info |
| `contract.assigned` | Assigned to subcontractor | info |
| `contract.completed` | Contract successfully completed | info |
| `contract.failed` | Contract execution failed | error |
| `contract.recovered` | Failed contract resolved | info |
| `payment.initiated` | Ozow payment triggered | info |
| `payment.succeeded` | Payment confirmed | info |
| `payment.failed` | Payment attempt failed | error |
| `ai.optimization` | AI model updated | info |
| `auth.login` | User login event | info |
| `auth.unauthorized` | Unauthorized access attempt | critical |
| `system.error` | System-level error detected | error |
| `system.recovery` | Automated recovery action taken | warning |

---

## Failed Contracts Section

When a contract fails, the following information is captured:

| Field | Description |
|-------|-------------|
| Contract ID | Unique identifier |
| Client Name | Associated client |
| Failure Reason | AI-generated failure description |
| Assigned To | Subcontractor or internal |
| Failed At | Timestamp |
| Recovery Action | Automated action taken |
| Resolved At | Timestamp when resolved (if applicable) |
| Status | `failed` / `in_recovery` / `resolved` |

---

## Audit Log Retention

- Logs are retained for a minimum of 7 years for compliance.
- Sensitive data is masked in logs (e.g., payment details).
- Logs are immutable once written.
- Daily audit summaries are pushed to the dashboard.
