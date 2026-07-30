-- ============================================
-- MIGRATION 004 - CAMPO CPF EM USUARIOS
-- Nota: aplicada manualmente via console SQL do Railway em 29/07/2026
-- Uso: emissao de certificados de conclusao de cursos
-- ============================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);