/**
 * Dados da igreja e horarios dos cultos, no Supabase.
 *
 * O painel gravava em `configuracoes_igreja` (Railway), que tem apenas nome,
 * endereco em texto unico, telefone e email. O aplicativo le `church_settings`
 * no Supabase, que tem endereco estruturado, redes sociais e coordenadas -
 * 17 campos contra 4. Uma ponte entre os dois levaria 4 campos para uma tela
 * que precisa de 17 e deixaria dois cadastros de endereco divergindo na
 * primeira edicao.
 *
 * Por isso este service escreve DIRETO no Supabase, como o chat. A tabela do
 * Railway fica intocada, apenas sem uso novo.
 *
 * Horarios de culto vem de `church_services`, nao do campo `service_times` do
 * proprio `church_settings`: a tabela tem `is_active` e ordenacao propria,
 * entao da para desativar um culto sem apagar o registro. O aplicativo ja le
 * a tabela.
 */

const { supabaseAdmin } = require('../config/supabase');

const STATUS = {
  OK: 'SUPABASE_OK',
  NAO_CONFIGURADO: 'SUPABASE_NOT_CONFIGURED',
  NAO_ENCONTRADO: 'SUPABASE_NOT_FOUND',
  FALHA: 'SUPABASE_FAILED',
};

function exigirSupabase() {
  if (!supabaseAdmin) {
    const erro = new Error('Supabase não configurado no servidor.');
    erro.codigo = STATUS.NAO_CONFIGURADO;
    throw erro;
  }
}

function propagar(error) {
  const erro = new Error(error.message);
  erro.codigo = STATUS.FALHA;
  throw erro;
}

/** Campos que a tela do painel pode alterar. Protege id, created_at e afins. */
const CAMPOS_IGREJA = [
  'name', 'slogan', 'about',
  'address_line', 'district', 'city', 'state', 'postal_code',
  'latitude', 'longitude',
  'phone', 'whatsapp', 'email', 'website', 'instagram', 'youtube_channel_id',
];

/** Texto vazio vira null; numero vazio tambem. Evita gravar string em branco. */
function limpar(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

function montarAtualizacao(corpo) {
  const dados = {};
  for (const campo of CAMPOS_IGREJA) {
    if (!(campo in corpo)) continue;
    if (campo === 'latitude' || campo === 'longitude') {
      const numero = limpar(corpo[campo]);
      dados[campo] = numero === null ? null : Number(numero);
      continue;
    }
    dados[campo] = limpar(corpo[campo]);
  }
  return dados;
}

/** Existe um unico registro de configuracao; o service sempre pega o primeiro. */
async function obterIgreja() {
  exigirSupabase();
  const { data, error } = await supabaseAdmin
    .from('church_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) propagar(error);
  return data;
}

async function atualizarIgreja(corpo) {
  exigirSupabase();

  const atual = await obterIgreja();
  if (!atual) {
    const erro = new Error('Nenhum registro de configuração da igreja encontrado.');
    erro.codigo = STATUS.NAO_ENCONTRADO;
    throw erro;
  }

  const dados = montarAtualizacao(corpo);
  if (!Object.keys(dados).length) return atual;

  // `name` e NOT NULL no banco: nao deixa a tela apagar o nome sem querer.
  if ('name' in dados && dados.name === null) dados.name = atual.name;

  dados.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('church_settings')
    .update(dados)
    .eq('id', atual.id)
    .select('*')
    .single();

  if (error) propagar(error);
  return data;
}

async function listarCultos() {
  exigirSupabase();
  const { data, error } = await supabaseAdmin
    .from('church_services')
    .select('*')
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) propagar(error);
  return data || [];
}

async function criarCulto(corpo) {
  exigirSupabase();

  const { data, error } = await supabaseAdmin
    .from('church_services')
    .insert({
      name: limpar(corpo.name),
      description: limpar(corpo.description),
      weekday: Number(corpo.weekday),
      start_time: limpar(corpo.start_time),
      duration_minutes: corpo.duration_minutes ? Number(corpo.duration_minutes) : 90,
      location_name: limpar(corpo.location_name),
      is_active: corpo.is_active !== false,
    })
    .select('*')
    .single();

  if (error) propagar(error);
  return data;
}

async function atualizarCulto(id, corpo) {
  exigirSupabase();

  const dados = { updated_at: new Date().toISOString() };
  if ('name' in corpo) dados.name = limpar(corpo.name);
  if ('description' in corpo) dados.description = limpar(corpo.description);
  if ('weekday' in corpo) dados.weekday = Number(corpo.weekday);
  if ('start_time' in corpo) dados.start_time = limpar(corpo.start_time);
  if ('duration_minutes' in corpo) dados.duration_minutes = Number(corpo.duration_minutes);
  if ('location_name' in corpo) dados.location_name = limpar(corpo.location_name);
  if ('is_active' in corpo) dados.is_active = Boolean(corpo.is_active);

  const { data, error } = await supabaseAdmin
    .from('church_services')
    .update(dados)
    .eq('id', id)
    .select('*')
    .single();

  if (error) propagar(error);
  return data;
}

async function removerCulto(id) {
  exigirSupabase();
  const { error } = await supabaseAdmin.from('church_services').delete().eq('id', id);
  if (error) propagar(error);
  return { status: STATUS.OK };
}

module.exports = {
  STATUS,
  obterIgreja,
  atualizarIgreja,
  listarCultos,
  criarCulto,
  atualizarCulto,
  removerCulto,
};
