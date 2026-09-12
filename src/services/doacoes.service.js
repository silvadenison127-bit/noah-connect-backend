/**
 * Leitura das doacoes feitas pelo aplicativo.
 *
 * O membro gera um PIX no aplicativo e o registro nasce em `donations`, no
 * Supabase, com status `pending`. Ninguem confirma esse pagamento
 * automaticamente: nao ha integracao com o banco, entao a baixa e manual --
 * a tesouraria confere o extrato e confirma no painel.
 *
 * Estas doacoes NAO sao misturadas com `dizimos_ofertas` do Railway. Aquela
 * tabela e o lancamento manual da tesouraria (dinheiro, cheque, deposito);
 * esta e a cobranca digital, com ciclo de pagamento proprio.
 */

const { supabaseAdmin } = require('../config/supabase');

const TABELA = 'donations';

const CAMPOS =
  'id, member_id, type, method, amount_cents, currency, status, provider, ' +
  'provider_payment_id, message, expires_at, paid_at, created_at';

const SEM_INTEGRACAO = 'Integracao com o aplicativo nao configurada neste servidor.';
const NAO_ENCONTRADA = 'Doacao nao encontrada';

/** Vocabulario do aplicativo traduzido para o do painel. */
const TIPOS = { tithe: 'dizimo', offering: 'oferta', other: 'outro' };

const SITUACOES = {
  pending: 'aguardando',
  processing: 'processando',
  paid: 'confirmado',
  failed: 'falhou',
  canceled: 'cancelado',
  refunded: 'estornado',
};

/**
 * Converte um registro do Supabase no formato que o painel espera.
 *
 * `amount_cents` vira `valor` em reais: o Supabase guarda centavos inteiros
 * para nao sofrer arredondamento, mas a tela mostra moeda.
 */
function traduzirDoacaoDoApp(r) {
  return {
    id: r.id,
    origem: 'aplicativo',
    membro_id: r.member_id,
    tipo: TIPOS[r.type] || 'outro',
    forma_pagamento: r.method,
    valor: Number(r.amount_cents || 0) / 100,
    moeda: r.currency || 'BRL',
    situacao: SITUACOES[r.status] || r.status,
    situacao_original: r.status,
    identificador: r.provider_payment_id || null,
    mensagem: r.message || null,
    expira_em: r.expires_at || null,
    confirmado_em: r.paid_at || null,
    criado_em: r.created_at,
  };
}

/**
 * Busca as doacoes enviadas pelo aplicativo.
 *
 * Devolve `{ doacoes, aviso }` em vez de lancar excecao: indisponibilidade do
 * Supabase nao pode derrubar a tela inteira, mas tambem nao pode ser
 * escondida.
 */
async function buscarDoacoesDoApp() {
  if (!supabaseAdmin) {
    return { doacoes: [], aviso: SEM_INTEGRACAO };
  }

  const { data, error } = await supabaseAdmin
    .from(TABELA)
    .select(CAMPOS)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[doacoes] falha ao ler:', error.message);
    return { doacoes: [], aviso: 'Nao foi possivel carregar as doacoes do aplicativo.' };
  }

  return { doacoes: (data || []).map(traduzirDoacaoDoApp), aviso: null };
}
/** Confirma o recebimento. `paid_at` marca quando a tesouraria deu a baixa. */
async function confirmarDoacaoDoApp(uuid) {
  if (!supabaseAdmin) return { status: 502, erro: SEM_INTEGRACAO };

  const agora = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from(TABELA)
    .update({ status: 'paid', paid_at: agora, updated_at: agora })
    .eq('id', uuid)
    .select(CAMPOS)
    .maybeSingle();

  if (error) {
    console.error('[doacoes] falha ao confirmar:', error.message);
    return { status: 502, erro: 'Nao foi possivel confirmar a doacao.' };
  }
  if (!data) return { status: 404, erro: NAO_ENCONTRADA };

  return { doacao: traduzirDoacaoDoApp(data), status: 200, erro: null };
}

/** Cancela a doacao. `paid_at` volta a nulo para o registro nao mentir. */
async function cancelarDoacaoDoApp(uuid) {
  if (!supabaseAdmin) return { status: 502, erro: SEM_INTEGRACAO };

  const agora = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from(TABELA)
    .update({ status: 'canceled', paid_at: null, updated_at: agora })
    .eq('id', uuid)
    .select(CAMPOS)
    .maybeSingle();

  if (error) {
    console.error('[doacoes] falha ao cancelar:', error.message);
    return { status: 502, erro: 'Nao foi possivel cancelar a doacao.' };
  }
  if (!data) return { status: 404, erro: NAO_ENCONTRADA };

  return { doacao: traduzirDoacaoDoApp(data), status: 200, erro: null };
}

module.exports = {
  TIPOS,
  SITUACOES,
  traduzirDoacaoDoApp,
  buscarDoacoesDoApp,
  confirmarDoacaoDoApp,
  cancelarDoacaoDoApp,
};