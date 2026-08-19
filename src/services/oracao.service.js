/**
 * Leitura e escrita unificadas dos pedidos de oracao.
 *
 * Os pedidos vivem em dois lugares:
 *   - Railway  (`pedidos_oracao`)  -> criados pelo painel administrativo
 *   - Supabase (`prayer_requests`) -> criados pelo aplicativo do membro
 *
 * O pastor nao deveria precisar saber disso. Este modulo traduz os registros
 * do Supabase para o mesmo formato que a tela ja consome ha meses, de modo que
 * `Oracao.jsx` continue funcionando sem nenhuma alteracao.
 *
 * A traducao inclui o `status`, porque os dois bancos usam vocabularios
 * diferentes, e o `id`, porque um usa serial e o outro uuid.
 */

const { supabaseAdmin } = require('../config/supabase');
const pool = require('../config/db');

/** Prefixo que identifica um pedido vindo do aplicativo. */
const PREFIXO_APP = 'sb:';

/** Colunas lidas de prayer_requests, iguais em toda leitura e escrita. */
const CAMPOS_APP =
  'id, member_id, display_name, is_anonymous, request, status, answer, answered_at, created_at';

/**
 * O painel conhece tres status: em_oracao, respondido e encerrado.
 * O aplicativo grava pending, praying e answered.
 *
 * `praying` vira `em_oracao` porque, para quem administra, "alguem esta
 * orando" e "aguardando" sao o mesmo estado: ainda em andamento.
 */
const STATUS_APP_PARA_PAINEL = {
  pending: 'em_oracao',
  praying: 'em_oracao',
  answered: 'respondido',
};

/** Caminho inverso, usado quando o pastor responder um pedido do aplicativo. */
const STATUS_PAINEL_PARA_APP = {
  em_oracao: 'pending',
  respondido: 'answered',
  encerrado: 'answered',
};

/** Converte um registro do Supabase no formato que o painel espera. */
function traduzirPedidoDoApp(registro) {
  const anonimo = Boolean(registro.is_anonymous);

  return {
    id: `${PREFIXO_APP}${registro.id}`,
    origem: 'aplicativo',
    usuario_id: registro.member_id,
    nome_solicitante: anonimo ? null : registro.display_name || 'Membro do aplicativo',
    anonimo,
    titulo: null, // o aplicativo nao coleta titulo
    pedido: registro.request,
    status: STATUS_APP_PARA_PAINEL[registro.status] || 'em_oracao',
    criado_em: registro.created_at,
    resposta: registro.answer || null,
    respondido_em: registro.answered_at || null,
  };
}

/** Marca um registro do Railway, para que a origem fique explicita na resposta. */
function marcarPedidoDoPainel(registro) {
  return { ...registro, origem: 'painel' };
}

/** Identifica a origem a partir do id recebido do frontend. */
function interpretarId(id) {
  const texto = String(id);
  return texto.startsWith(PREFIXO_APP)
    ? { origem: 'aplicativo', id: texto.slice(PREFIXO_APP.length) }
    : { origem: 'painel', id: texto };
}

/**
 * Busca os pedidos criados pelo aplicativo.
 *
 * Devolve `{ pedidos, aviso }` em vez de lancar excecao: uma indisponibilidade
 * do Supabase nao pode derrubar a tela inteira, mas tambem nao pode ser
 * escondida -- o aviso sobe junto com a resposta.
 */
async function buscarPedidosDoApp() {
  if (!supabaseAdmin) {
    return {
      pedidos: [],
      aviso: 'Integracao com o aplicativo nao configurada neste servidor.',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('prayer_requests')
    .select(CAMPOS_APP)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[oracao] falha ao ler pedidos do aplicativo:', error.message);
    return {
      pedidos: [],
      aviso: 'Nao foi possivel carregar os pedidos enviados pelo aplicativo.',
    };
  }

  return { pedidos: (data || []).map(traduzirPedidoDoApp), aviso: null };
}

/** Ordena do mais recente para o mais antigo, independente da origem. */
function ordenarPorData(pedidos) {
  return pedidos.sort(
    (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
  );
}

/**
 * Traduz a identidade do painel (usuarios.id, integer) na identidade do
 * Supabase (profiles.id, uuid). O vinculo vive em usuarios.auth_user_id.
 *
 * Sem vinculo nao ha como registrar a autoria: devolvemos erro em vez de
 * gravar answered_by nulo, porque resposta sem autor nao e auditavel.
 */
async function resolverUuidDoPastor(usuarioId) {
  const { rows } = await pool.query(
    'SELECT auth_user_id FROM usuarios WHERE id = $1',
    [usuarioId],
  );

  if (!rows.length) {
    return { uuid: null, erro: 'Usuario do painel nao encontrado.' };
  }
  if (!rows[0].auth_user_id) {
    return {
      uuid: null,
      erro:
        'Este usuario do painel ainda nao esta vinculado a uma conta do aplicativo. ' +
        'Sem o vinculo a autoria da resposta nao pode ser registrada.',
    };
  }
  return { uuid: rows[0].auth_user_id, erro: null };
}

/** Grava a resposta do pastor no pedido enviado pelo aplicativo. */
async function responderPedidoDoApp(uuidPedido, resposta, uuidPastor) {
  if (!supabaseAdmin) {
    return {
      pedido: null,
      status: 502,
      erro: 'Integracao com o aplicativo nao configurada neste servidor.',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('prayer_requests')
    .update({
      answer: resposta,
      status: 'answered',
      answered_at: new Date().toISOString(),
      answered_by: uuidPastor,
    })
    .eq('id', uuidPedido)
    .select(CAMPOS_APP)
    .maybeSingle();

  if (error) {
    console.error('[oracao] falha ao responder pedido do aplicativo:', error.message);
    return {
      pedido: null,
      status: 502,
      erro: 'Nao foi possivel gravar a resposta no aplicativo.',
    };
  }
  if (!data) {
    return { pedido: null, status: 404, erro: 'Pedido nao encontrado' };
  }

  // Notificacao e efeito secundario: se falhar, a resposta continua gravada.
  try {
    const { error: erroNotif } = await supabaseAdmin.from("notifications").insert({
      member_id: data.member_id,
      type: "prayer",
      title: "Seu pedido de oracao foi respondido",
      body: "O pastor respondeu ao seu pedido de oracao.",
      deep_link: "/(member)/meus-pedidos",
    });
    if (erroNotif) {
      console.error("[oracao] resposta gravada, mas a notificacao falhou:", erroNotif.message);
    }
  } catch (e) {
    console.error("[oracao] resposta gravada, mas a notificacao falhou:", e.message);
  }

  return { pedido: traduzirPedidoDoApp(data), status: 200, erro: null };
}

/** Altera o status de um pedido do aplicativo, traduzindo o vocabulario. */
async function alterarStatusDoPedidoDoApp(uuidPedido, statusDoPainel) {
  if (!supabaseAdmin) {
    return {
      pedido: null,
      status: 502,
      erro: 'Integracao com o aplicativo nao configurada neste servidor.',
    };
  }

  const statusDoApp = STATUS_PAINEL_PARA_APP[statusDoPainel];
  if (!statusDoApp) {
    return { pedido: null, status: 400, erro: 'Status invalido' };
  }

  const { data, error } = await supabaseAdmin
    .from('prayer_requests')
    .update({ status: statusDoApp })
    .eq('id', uuidPedido)
    .select(CAMPOS_APP)
    .maybeSingle();

  if (error) {
    console.error('[oracao] falha ao alterar status do pedido do aplicativo:', error.message);
    return {
      pedido: null,
      status: 502,
      erro: 'Nao foi possivel atualizar o status no aplicativo.',
    };
  }
  if (!data) {
    return { pedido: null, status: 404, erro: 'Pedido nao encontrado' };
  }

  return { pedido: traduzirPedidoDoApp(data), status: 200, erro: null };
}

module.exports = {
  PREFIXO_APP,
  STATUS_APP_PARA_PAINEL,
  STATUS_PAINEL_PARA_APP,
  traduzirPedidoDoApp,
  marcarPedidoDoPainel,
  interpretarId,
  buscarPedidosDoApp,
  ordenarPorData,
  resolverUuidDoPastor,
  responderPedidoDoApp,
  alterarStatusDoPedidoDoApp,
};
