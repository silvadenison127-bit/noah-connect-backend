/**
 * Publicacao, atualizacao e desativacao de ministerios do painel no Supabase.
 *
 * O ministerio nasce no Railway (`ministerios`) e precisa aparecer no
 * aplicativo, que le `ministries` no Supabase. O vinculo fica guardado em
 * `ministerios.supabase_ministry_id`.
 *
 * Espelha `celulas.service.js`, que por sua vez espelha `eventos.service.js`.
 * A repeticao e proposital: tres copias de um padrao provado sao mais faceis
 * de manter do que uma abstracao que precisa prever os tres casos.
 */

const { supabaseAdmin } = require('../config/supabase');

const STATUS = {
  OK: 'SUPABASE_CREATED',
  ATUALIZADO: 'SUPABASE_UPDATED',
  DESATIVADO: 'SUPABASE_DEACTIVATED',
  NAO_ENCONTRADO: 'SUPABASE_NOT_FOUND',
  NAO_CONFIGURADO: 'SUPABASE_NOT_CONFIGURED',
  FALHA: 'SUPABASE_FAILED',
};

const ERRO_SEM_INTEGRACAO = 'Integracao com o aplicativo nao configurada neste servidor.';
const ERRO_NAO_ENCONTRADO = 'Ministerio nao encontrado no aplicativo.';

/**
 * Monta o registro do Supabase a partir da linha do Railway.
 *
 * Campos deixados de fora, para usar o default do schema:
 *   is_active  default true  <- o aplicativo filtra por is_active
 *   created_at / updated_at  default now()
 *
 * Campos sem origem no painel e por isso omitidos:
 *   leader_profile_id  (o painel guarda um id inteiro, nao o uuid do profile)
 *   cover_url
 */
function traduzirMinisterioDoPainel(ministerio) {
  return {
    name: ministerio.nome,
    description: ministerio.descricao || null,
  };
}

/**
 * Publica um ministerio no Supabase.
 *
 * Devolve `{ uuid, status, erro }` em vez de lancar excecao: o ministerio ja
 * existe no Railway quando esta funcao roda, e uma indisponibilidade do
 * Supabase nao pode ser confundida com falha na criacao.
 */
async function publicarMinisterioNoApp(ministerio) {
  if (!supabaseAdmin) {
    console.warn('[ministerios] Supabase nao configurado; ficou apenas no painel.');
    return { uuid: null, status: STATUS.NAO_CONFIGURADO, erro: ERRO_SEM_INTEGRACAO };
  }

  const registro = traduzirMinisterioDoPainel(ministerio);

  const { data, error } = await supabaseAdmin
    .from('ministries')
    .insert(registro)
    .select('id, name, is_active')
    .single();

  if (error) {
    console.error('[ministerios] falha ao publicar:', error.message);
    return {
      uuid: null,
      status: STATUS.FALHA,
      erro: 'Nao foi possivel publicar o ministerio no aplicativo.',
    };
  }

  return { uuid: data.id, status: STATUS.OK, erro: null, registro: data };
}

/**
 * Reflete no Supabase a edicao de um ministerio ja publicado.
 *
 * Um uuid que nao encontra linha e reportado como NAO_ENCONTRADO, e nao
 * convertido em INSERT silencioso: criar uma segunda copia esconderia o
 * problema em vez de resolve-lo.
 */
async function atualizarMinisterioNoApp(uuidMinisterio, ministerio) {
  if (!supabaseAdmin) {
    return { status: STATUS.NAO_CONFIGURADO, erro: ERRO_SEM_INTEGRACAO };
  }

  const registro = {
    ...traduzirMinisterioDoPainel(ministerio),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('ministries')
    .update(registro)
    .eq('id', uuidMinisterio)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[ministerios] falha ao atualizar:', error.message);
    return {
      status: STATUS.FALHA,
      erro: 'Nao foi possivel atualizar o ministerio no aplicativo.',
    };
  }
  if (!data) {
    return { status: STATUS.NAO_ENCONTRADO, erro: ERRO_NAO_ENCONTRADO };
  }

  return { status: STATUS.ATUALIZADO, erro: null };
}

/**
 * Desativa o ministerio no aplicativo quando ele e removido do painel.
 *
 * Nao ha DELETE de proposito: o aplicativo filtra por `is_active`, entao
 * desativar ja tira o ministerio da vista do membro sem destruir o registro.
 */
async function desativarMinisterioNoApp(uuidMinisterio) {
  if (!supabaseAdmin) {
    return { status: STATUS.NAO_CONFIGURADO, erro: ERRO_SEM_INTEGRACAO };
  }

  const { data, error } = await supabaseAdmin
    .from('ministries')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', uuidMinisterio)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[ministerios] falha ao desativar:', error.message);
    return {
      status: STATUS.FALHA,
      erro: 'Nao foi possivel desativar o ministerio no aplicativo.',
    };
  }
  if (!data) {
    return { status: STATUS.NAO_ENCONTRADO, erro: ERRO_NAO_ENCONTRADO };
  }

  return { status: STATUS.DESATIVADO, erro: null };
}

module.exports = {
  STATUS,
  traduzirMinisterioDoPainel,
  publicarMinisterioNoApp,
  atualizarMinisterioNoApp,
  desativarMinisterioNoApp,
};