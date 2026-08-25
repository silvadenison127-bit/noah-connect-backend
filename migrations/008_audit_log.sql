CREATE TABLE IF NOT EXISTS audit_log (
  id             BIGSERIAL PRIMARY KEY,
  executor_id    INTEGER,
  executor_nome  TEXT,
  operacao       TEXT        NOT NULL,
  ids_afetados   JSONB,
  impacto        JSONB,
  resultado      TEXT,
  ip             TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_executor  ON audit_log (executor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_criado_em ON audit_log (criado_em);
CREATE INDEX IF NOT EXISTS idx_audit_log_operacao  ON audit_log (operacao);
