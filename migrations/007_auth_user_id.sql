-- 007_auth_user_id.sql
--
-- Vincula a identidade do painel (usuarios.id, integer) a identidade do
-- Supabase (profiles.id, uuid). Necessario para registrar a autoria em
-- prayer_requests.answered_by quando o pastor responde um pedido do app.
--
-- Sem FOREIGN KEY: auth.users vive em outro servidor (Supabase), e FK entre
-- bancos distintos e impossivel. A integridade fica a cargo da aplicacao.
--
-- Indice parcial em vez de UNIQUE na coluna: garante unicidade sem impedir
-- multiplos NULL quando outros usuarios ainda nao tiverem vinculo.
--
-- APLICADA MANUALMENTE EM 18/08/2026 no banco de desenvolvimento.
-- Este arquivo registra a alteracao no historico do projeto.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_auth_user_id_key
  ON usuarios (auth_user_id) WHERE auth_user_id IS NOT NULL;
