/**
 * Cliente administrativo do Supabase.
 *
 * Usa a service_role, que IGNORA Row Level Security. Por isso vive apenas no
 * backend: nunca deve ser importado por nada que chegue ao navegador.
 *
 * O cliente e opcional de proposito -- se as variaveis nao estiverem
 * configuradas, `supabaseAdmin` fica nulo e as rotas continuam funcionando
 * somente com o banco do Railway, em vez de derrubar a API inteira.
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

if (!supabaseAdmin) {
  console.warn(
    '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes. ' +
      'Os dados vindos do aplicativo nao serao carregados.',
  );
}

module.exports = { supabaseAdmin, supabaseConfigurado: Boolean(supabaseAdmin) };
