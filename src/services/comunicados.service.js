/**
 * Publicacao de comunicados do painel no Supabase.
 *
 * O comunicado nasce no Railway (`comunicados`) e precisa aparecer no
 * aplicativo, que le `notifications` no Supabase. Este servico transporta o
 * comunicado de um lado ao outro.
 *
 * O vinculo NAO fica numa coluna de id unico: ele vai em `notifications.data`
 * como { comunicado_id: N }. Assim, quando a segmentacao por grupo entrar e um
 * comunicado virar varias linhas (uma por membro), nada precisa ser migrado.
 * `comunicados.enviado_app_em` guarda apenas o momento do envio, para o painel
 * sinalizar "enviado ao app" sem consultar o Supabase.
 *
 * Espelha `celulas.service.js` de proposito: o padrao ja foi provado em
 * producao e copiar e mais seguro do que abstrair os dois numa unica peca.
 */

const { supabaseAdmin } = require('../config/supabase');
const { enviarParaTodos } = require('./push.service');

const STATUS = {
  OK: 'SUPABASE_CREATED',
  REMOVIDO: 'SUPABASE_DELETED',
  SEGMENTADO: 'SUPABASE_SKIPPED_SEGMENTED',
  NAO_ENCONTRADO: 'SUPABASE_NOT_FOUND',
  NAO_CONFIGURADO: 'SUPABASE_NOT_CONFIGURED',
  FALHA: 'SUPABASE_FAILED',
};

/** Apenas comunicados gerais chegam ao aplicativo nesta etapa. */
function ehGeral(publicoAlvo) {
  return (publicoAlvo || 'todos') === 'todos';
}

/**
 * Publica o comunicado como notificacao broadcast (`member_id = null`).
 * Retorna sempre um objeto de resultado; nunca lanca. A criacao do comunicado
 * no painel nao pode falhar por causa do Supabase.
 */
async function publicarComunicado(comunicado) {
  if (!supabaseAdmin) {
    return { status: STATUS.NAO_CONFIGURADO, notificationId: null };
  }
  if (!ehGeral(comunicado.publico_alvo)) {
    return { status: STATUS.SEGMENTADO, notificationId: null };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        member_id: null,
        type: 'system',
        title: comunicado.titulo,
        body: comunicado.mensagem,
        data: { comunicado_id: comunicado.id, origem: 'painel' },
      })
      .select('id')
      .single();

    if (error) {
      console.error('[comunicados.service] insert falhou:', error.message);
      return { status: STATUS.FALHA, notificationId: null, erro: error.message };
    }
    // Bloco 7B: push para todos os aparelhos. Sem await: o painel nao espera
    // a Expo responder, e qualquer falha fica so no log.
    const resumo = String(comunicado.mensagem || '').replace(/\s+/g, ' ').trim();
    enviarParaTodos({
      title: comunicado.titulo,
      body: resumo.length > 140 ? `${resumo.slice(0, 137)}...` : resumo,
      data: { url: '/(member)/noticias', comunicado_id: comunicado.id },
    }).then((r) => console.log('[comunicados] push enviado:', r.enviados, 'aparelho(s)'));
    return { status: STATUS.OK, notificationId: data.id };
  } catch (err) {
    console.error('[comunicados.service] excecao no insert:', err.message);
    return { status: STATUS.FALHA, notificationId: null, erro: err.message };
  }
}

/**
 * Remove do aplicativo todas as notificacoes geradas por este comunicado.
 * Busca por `data->>comunicado_id`, entao funciona com uma linha ou com varias.
 */
async function removerComunicadoDoApp(comunicadoId) {
  if (!supabaseAdmin) {
    return { status: STATUS.NAO_CONFIGURADO, removidos: 0 };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('data->>comunicado_id', String(comunicadoId))
      .select('id');

    if (error) {
      console.error('[comunicados.service] delete falhou:', error.message);
      return { status: STATUS.FALHA, removidos: 0, erro: error.message };
    }
    const removidos = (data || []).length;
    return {
      status: removidos ? STATUS.REMOVIDO : STATUS.NAO_ENCONTRADO,
      removidos,
    };
  } catch (err) {
    console.error('[comunicados.service] excecao no delete:', err.message);
    return { status: STATUS.FALHA, removidos: 0, erro: err.message };
  }
}

module.exports = { STATUS, publicarComunicado, removerComunicadoDoApp };
