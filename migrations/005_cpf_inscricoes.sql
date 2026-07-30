-- ============================================
-- MIGRATION 005 - CAMPO CPF EM INSCRICOES_CURSOS
-- Nota: aplicada manualmente via console SQL do Railway em 29/07/2026
-- Uso: emissao de certificados de conclusao de cursos
-- ============================================

ALTER TABLE inscricoes_cursos ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);