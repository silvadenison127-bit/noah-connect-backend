-- ============================================
-- MIGRATION 002 - ESTUDOS BIBLICOS
-- Nota: aplicada manualmente via console SQL do Railway em 28/07/2026
-- ============================================

CREATE TABLE IF NOT EXISTS estudos_biblicos (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    descricao TEXT,
    conteudo TEXT NOT NULL,
    categoria VARCHAR(50),
    autor VARCHAR(150),
    criado_por INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estudos_criado_em ON estudos_biblicos(criado_em);