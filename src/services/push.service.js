/**
 * Envio de push notification para membros (Bloco 7).
 *
 * Usa o servico oficial da Expo (o mesmo da Edge Function panic-alert).
 * Os enderecos de push ficam em `notification_tokens` (Supabase) e so sao
 * lidos aqui, com a chave de servico. O push e sempre efeito secundario:
 * qualquer falha e registrada no log e NUNCA derruba a operacao principal.
 *
 * Limpeza automatica: quando a Expo responde DeviceNotRegistered (app
 * desinstalado ou permissao retirada), o endereco e desativado.
 */
const { supabaseAdmin } = require('../config/supabase');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const LOTE = 100; // limite de mensagens por requisicao na API da Expo

async function tokensAtivos(memberIds) {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (!supabaseAdmin || ids.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('notification_tokens')
    .select('expo_push_token')
    .in('member_id', ids)
    .eq('is_active', true);
  if (error) {
    console.error('[push] falha ao ler aparelhos:', error.message);
    return [];
  }
  return [...new Set((data || []).map((t) => t.expo_push_token).filter(Boolean))];
}

async function desativar(tokens) {
  if (!supabaseAdmin || tokens.length === 0) return;
  const { error } = await supabaseAdmin
    .from('notification_tokens')
    .update({ is_active: false })
    .in('expo_push_token', tokens);
  if (error) console.error('[push] falha ao desativar aparelhos:', error.message);
}

/**
 * Envia a mesma mensagem para os aparelhos ativos dos membros informados.
 * Devolve { enviados, desativados } (nunca lanca erro).
 */
async function enviarParaMembros(memberIds, { title, body, data } = {}) {
  try {
    const tokens = await tokensAtivos(memberIds);
    if (tokens.length === 0) return { enviados: 0, desativados: 0 };

    let enviados = 0;
    const invalidos = [];
    for (let i = 0; i < tokens.length; i += LOTE) {
      const lote = tokens.slice(i, i + LOTE);
      const mensagens = lote.map((to) => ({
        to,
        title,
        body,
        data: data || {},
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      }));
      const resposta = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(mensagens),
      });
      if (!resposta.ok) {
        console.error('[push] Expo respondeu', resposta.status);
        continue;
      }
      const json = await resposta.json().catch(() => ({}));
      const tickets = Array.isArray(json?.data) ? json.data : [];
      tickets.forEach((ticket, idx) => {
        if (ticket?.status === 'ok') enviados += 1;
        else if (ticket?.details?.error === 'DeviceNotRegistered') invalidos.push(lote[idx]);
      });
    }

    await desativar(invalidos);
    return { enviados, desativados: invalidos.length };
  } catch (err) {
    console.error('[push] falha no envio:', err.message);
    return { enviados: 0, desativados: 0 };
  }
}

module.exports = { enviarParaMembros };
