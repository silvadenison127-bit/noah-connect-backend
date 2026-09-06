/**
 * Publicacao, atualizacao e cancelamento de eventos do painel no Supabase.
 *
 * O painel (Railway) e a origem administrativa. O aplicativo le
 * Supabase.events. Este servico transporta o evento de um lado ao outro e
 * devolve o uuid gerado, para que o painel guarde o vinculo em
 * eventos.supabase_event_id.
 *
 * Sem FOREIGN KEY: os bancos vivem em servidores distintos. A integridade
 * fica a cargo da aplicacao, mesmo criterio ja adotado em oracao.service.js.
 *
 * TIMEZONE
 * eventos.data_inicio e TIMESTAMP sem fuso e guarda o horario local de
 * Curitiba, exatamente como o administrador digitou. Supabase.events.starts_at
 * e timestamptz. A conversao NAO acontece aqui: ela e feita pelo proprio
 * PostgreSQL, no RETURNING do INSERT ou do UPDATE, com
 *
 *   data_inicio AT TIME ZONE 'America/Sao_Paulo'
 *
 * que usa a base IANA e respeita historico de horario de verao. Este servico
 * recebe os valores ja convertidos e apenas os serializa em ISO 8601.
 */

const { supabaseAdmin } = require('../config/supabase');
const pool = require('../config/db');

/** Estados possiveis da sincronizacao, devolvidos ao chamador. */
const STATUS = {
  OK: 'SUPABASE_CREATED',
  ATUALIZADO: 'SUPABASE_UPDATED',
  CANCELADO: 'SUPABASE_CANCELED',
  NAO_ENCONTRADO: 'SUPABASE_NOT_FOUND',
  NAO_CONFIGURADO: 'SUPABASE_NOT_CONFIGURED',
  FALHA: 'SUPABASE_FAILED',
};

/**
 * Traduz a identidade do painel (usuarios.id, integer) na identidade do
 * Supabase (profiles.id, uuid), para registrar a autoria do evento.
 *
 * Diferente de oracao.service.js, a ausencia de vinculo NAO e erro: o schema
 * permite events.created_by nulo, e recusar a criacao do evento por causa
 * disso puniria o administrador por um problema de cadastro. Devolvemos null
 * e seguimos, sem inventar uuid.
 */
async function resolverUuidDoAutor(usuarioId) {
  if (!usuarioId) return null;
  try {
    const { rows } = await pool.query(
      'SELECT auth_user_id FROM usuarios WHERE id = $1',
      [usuarioId],
    );
    return rows[0]?.auth_user_id || null;
  } catch (err) {
    console.error('[eventos] falha ao resolver autor:', err.message);
    return null;
  }
}

/**
 * Converte um Date do driver pg em ISO 8601 com fuso, ou null.
 * O pg entrega timestamptz como Date, entao toISOString ja produz o instante
 * correto em UTC.
 */
function paraIso(valor) {
  if (!valor) return null;
  return valor instanceof Date ? valor.toISOString() : new Date(valor).toISOString();
}

/**
 * Monta o registro do Supabase a partir da linha do Railway.
 *
 * Campos deixados de fora de proposito, para usar o default do schema:
 *   status        default 'scheduled'
 *   is_published  default true   <- o aplicativo filtra por is_published
 *   created_at / updated_at      default now()
 *
 * Campos sem origem no painel e por isso omitidos:
 *   address_line, latitude, longitude, cover_url, host_name, ministry_id
 */
function traduzirEventoDoPainel(evento, uuidAutor) {
  return {
    title: evento.titulo,
    description: evento.descricao || null,
    category: evento.tipo,
    starts_at: paraIso(evento.starts_at_utc),
    ends_at: paraIso(evento.ends_at_utc),
    location_name: evento.local || null,
    created_by: uuidAutor,
  };
}

/**
 * Publica um evento no Supabase.
 *
 * Devolve `{ uuid, status, erro }` em vez de lancar excecao: o evento ja
 * existe no Railway quando esta funcao roda, e uma indisponibilidade do
 * Supabase nao pode ser confundida com falha na criacao. O chamador decide
 * o que responder ao painel.
 *
 * @param {object} evento linha do Railway, ja com starts_at_utc / ends_at_utc
 * @param {number} usuarioId id do administrador AUTOR do evento
 */
async function publicarEventoNoApp(evento, usuarioId) {
  if (!supabaseAdmin) {
    console.warn('[eventos] Supabase nao configurado; evento ficou apenas no painel.');
    return {
      uuid: null,
      status: STATUS.NAO_CONFIGURADO,
      erro: 'Integracao com o aplicativo nao configurada neste servidor.',
    };
  }

  const uuidAutor = await resolverUuidDoAutor(usuarioId);
  const registro = traduzirEventoDoPainel(evento, uuidAutor);

  const { data, error } = await supabaseAdmin
    .from('events')
    .insert(registro)
    .select('id, title, starts_at, is_published, status')
    .single();

  if (error) {
    console.error('[eventos] falha ao publicar no aplicativo:', error.message);
    return {
      uuid: null,
      status: STATUS.FALHA,
      erro: 'Nao foi possivel publicar o evento no aplicativo.',
    };
  }

  return { uuid: data.id, status: STATUS.OK, erro: null, registro: data };
}

/**
 * Reflete no Supabase a edicao de um evento que ja esta publicado.
 *
 * created_by NAO e enviado: ele registra quem CRIOU o evento, e uma edicao
 * feita por outro administrador nao deve reescrever a autoria original.
 *
 * updated_at e enviado explicitamente porque o default do schema so vale no
 * INSERT; sem isso a coluna ficaria congelada na data de criacao.
 *
 * Um uuid que nao encontra linha no Supabase e reportado como
 * SUPABASE_NOT_FOUND, e nao convertido em INSERT silencioso: o vinculo aponta
 * para algo que sumiu, e isso precisa aparecer no log em vez de ser mascarado
 * por um registro novo.
 *
 * @param {object} evento linha do Railway, ja com starts_at_utc / ends_at_utc
 * @param {string} uuid   events.id correspondente
 */
async function atualizarEventoNoApp(evento, uuid) {
  if (!supabaseAdmin) {
    console.warn('[eventos] Supabase nao configurado; edicao ficou apenas no painel.');
    return {
      uuid,
      status: STATUS.NAO_CONFIGURADO,
      erro: 'Integracao com o aplicativo nao configurada neste servidor.',
    };
  }

  const { created_by, ...campos } = traduzirEventoDoPainel(evento, null);
  campos.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('events')
    .update(campos)
    .eq('id', uuid)
    .select('id, title, starts_at, is_published, status');

  if (error) {
    console.error('[eventos] falha ao atualizar no aplicativo:', error.message);
    return {
      uuid,
      status: STATUS.FALHA,
      erro: 'Nao foi possivel atualizar o evento no aplicativo.',
    };
  }

  if (!data || data.length === 0) {
    console.error(
      `[eventos] vinculo aponta para evento inexistente no aplicativo: ${uuid} ` +
      `(projeto ${(process.env.SUPABASE_URL || '').slice(8, 14)})`
    );
    return {
      uuid,
      status: STATUS.NAO_ENCONTRADO,
      erro: 'O evento vinculado nao existe mais no aplicativo.',
    };
  }

  return { uuid, status: STATUS.ATUALIZADO, erro: null, registro: data[0] };
}

/**
 * Cancela no aplicativo um evento removido do painel.
 *
 * O registro NAO e apagado do Supabase, por decisao do dono do projeto: um
 * evento cancelado e informacao, e apagar destruiria o registro de que ele
 * existiu. O aplicativo ja filtra `.neq('status', 'canceled')`, entao marcar
 * o status basta para que o membro deixe de ve-lo.
 *
 * Efeito colateral util: a operacao e reversivel. Um DELETE fisico nao seria.
 *
 * @param {string} uuid events.id correspondente
 */
async function cancelarEventoNoApp(uuid) {
  if (!supabaseAdmin) {
    console.warn('[eventos] Supabase nao configurado; cancelamento ficou apenas no painel.');
    return {
      uuid,
      status: STATUS.NAO_CONFIGURADO,
      erro: 'Integracao com o aplicativo nao configurada neste servidor.',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('events')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', uuid)
    .select('id, title, status');

  if (error) {
    console.error('[eventos] falha ao cancelar no aplicativo:', error.message);
    return {
      uuid,
      status: STATUS.FALHA,
      erro: 'Nao foi possivel cancelar o evento no aplicativo.',
    };
  }

  if (!data || data.length === 0) {
    console.error(
      `[eventos] vinculo aponta para evento inexistente no aplicativo: ${uuid} ` +
      `(projeto ${(process.env.SUPABASE_URL || '').slice(8, 14)})`
    );
    return {
      uuid,
      status: STATUS.NAO_ENCONTRADO,
      erro: 'O evento vinculado nao existe mais no aplicativo.',
    };
  }

  return { uuid, status: STATUS.CANCELADO, erro: null, registro: data[0] };
}

/**
 * Grava o vinculo no painel. Executado somente apos o INSERT no Supabase.
 *
 * Uma falha aqui deixa o evento publicado no aplicativo sem referencia no
 * painel: o membro ve o evento, mas o painel perde a capacidade de atualiza-lo
 * depois. Por isso o erro sobe explicito, em vez de virar log silencioso.
 */
async function vincularEvento(railwayId, uuid) {
  try {
    const { rowCount } = await pool.query(
      'UPDATE eventos SET supabase_event_id = $1 WHERE id = $2',
      [uuid, railwayId],
    );
    if (rowCount === 0) {
      return { ok: false, erro: 'Evento do painel nao encontrado para vincular.' };
    }
    return { ok: true, erro: null };
  } catch (err) {
    console.error('[eventos] falha ao gravar vinculo:', err.message);
    return { ok: false, erro: 'Nao foi possivel gravar o vinculo do evento.' };
  }
}

module.exports = {
  STATUS,
  resolverUuidDoAutor,
  traduzirEventoDoPainel,
  publicarEventoNoApp,
  atualizarEventoNoApp,
  cancelarEventoNoApp,
  vincularEvento,
};
