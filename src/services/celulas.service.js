/**
 * Publicacao, atualizacao e desativacao de celulas do painel no Supabase.
 *
 * A celula nasce no Railway (`celulas`) e precisa aparecer no aplicativo, que
 * le `cells` no Supabase. Este servico transporta a celula de um lado ao outro
 * e o vinculo fica guardado em `celulas.supabase_cell_id`.
 *
 * Espelha `eventos.service.js` de proposito: o padrao ja foi provado em
 * producao e copiar e mais seguro do que abstrair os dois numa unica peca.
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

/**
 * O painel guarda o dia da semana como texto ("Segunda"); o aplicativo espera
 * um numero (0 = domingo). Acentos e caixa sao normalizados antes da busca.
 *
 * Um valor desconhecido vira null em vez de zero: celula sem dia definido e
 * melhor do que celula anunciada no dia errado.
 */
const DIAS = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  'terca-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
};

function traduzirDiaDaSemana(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  // Se ja vier numero (ou texto numerico), respeita desde que esteja na faixa.
  const numero = Number(valor);
  if (Number.isInteger(numero) && numero >= 0 && numero <= 6) return numero;

  const limpo = String(valor)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove acentos

  return DIAS[limpo] ?? null;
}

/**
 * O painel aceita horario livre ("19:30", "19h30"). O Supabase espera `time`.
 * Extrai horas e minutos; devolve null quando nao consegue interpretar, para
 * o insert nao ser recusado inteiro por causa do horario.
 */
function traduzirHorario(valor) {
  if (!valor) return null;
  const achado = String(valor).match(/(\d{1,2})\s*[:h]\s*(\d{2})/);
  if (!achado) return null;

  const hora = Number(achado[1]);
  const minuto = Number(achado[2]);
  if (hora > 23 || minuto > 59) return null;

  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00`;
}

/**
 * Monta o registro do Supabase a partir da linha do Railway.
 *
 * Campos deixados de fora, para usar o default do schema:
 *   is_active  default true  <- o aplicativo filtra por is_active
 *   created_at / updated_at  default now()
 *
 * Campos sem origem no painel e por isso omitidos:
 *   leader_profile_id  (o painel guarda um id inteiro, nao o uuid do profile)
 *   district, city, latitude, longitude
 */
function traduzirCelulaDoPainel(celula) {
  return {
    name: celula.nome,
    weekday: traduzirDiaDaSemana(celula.dia_semana),
    start_time: traduzirHorario(celula.horario),
    address_line: celula.endereco || null,
  };
}

/**
 * Publica uma celula no Supabase.
 *
 * Devolve `{ uuid, status, erro }` em vez de lancar excecao: a celula ja
 * existe no Railway quando esta funcao roda, e uma indisponibilidade do
 * Supabase nao pode ser confundida com falha na criacao.
 */
async function publicarCelulaNoApp(celula) {
  if (!supabaseAdmin) {
    console.warn('[celulas] Supabase nao configurado; celula ficou apenas no painel.');
    return {
      uuid: null,
      status: STATUS.NAO_CONFIGURADO,
      erro: 'Integracao com o aplicativo nao configurada neste servidor.',
    };
  }

  const registro = traduzirCelulaDoPainel(celula);

  const { data, error } = await supabaseAdmin
    .from('cells')
    .insert(registro)
    .select('id, name, weekday, start_time, is_active')
    .single();

  if (error) {
    console.error('[celulas] falha ao publicar no aplicativo:', error.message);
    return {
      uuid: null,
      status: STATUS.FALHA,
      erro: 'Nao foi possivel publicar a celula no aplicativo.',
    };
  }

  return { uuid: data.id, status: STATUS.OK, erro: null, registro: data };
}

/**
 * Reflete no Supabase a edicao de uma celula ja publicada.
 *
 * Um uuid que nao encontra linha e reportado como NAO_ENCONTRADO, e nao
 * convertido em INSERT silencioso: o vinculo aponta para algo que deveria
 * existir, e criar uma segunda copia esconderia o problema.
 */
async function atualizarCelulaNoApp(uuidCelula, celula) {
  if (!supabaseAdmin) {
    return {
      status: STATUS.NAO_CONFIGURADO,
      erro: 'Integracao com o aplicativo nao configurada neste servidor.',
    };
  }

  const registro = {
    ...traduzirCelulaDoPainel(celula),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('cells')
    .update(registro)
    .eq('id', uuidCelula)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[celulas] falha ao atualizar no aplicativo:', error.message);
    return { status: STATUS.FALHA, erro: 'Nao foi possivel atualizar a celula no aplicativo.' };
  }
  if (!data) {
    return { status: STATUS.NAO_ENCONTRADO, erro: 'Celula nao encontrada no aplicativo.' };
  }

  return { status: STATUS.ATUALIZADO, erro: null };
}

/**
 * Desativa a celula no aplicativo quando ela e removida do painel.
 *
 * Nao ha DELETE de proposito: o aplicativo filtra por `is_active`, entao
 * desativar ja tira a celula da vista do membro sem destruir o registro nem
 * os vinculos que possam existir.
 */
async function desativarCelulaNoApp(uuidCelula) {
  if (!supabaseAdmin) {
    return {
      status: STATUS.NAO_CONFIGURADO,
      erro: 'Integracao com o aplicativo nao configurada neste servidor.',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('cells')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', uuidCelula)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[celulas] falha ao desativar no aplicativo:', error.message);
    return { status: STATUS.FALHA, erro: 'Nao foi possivel desativar a celula no aplicativo.' };
  }
  if (!data) {
    return { status: STATUS.NAO_ENCONTRADO, erro: 'Celula nao encontrada no aplicativo.' };
  }

  return { status: STATUS.DESATIVADO, erro: null };
}

module.exports = {
  STATUS,
  traduzirDiaDaSemana,
  traduzirHorario,
  traduzirCelulaDoPainel,
  publicarCelulaNoApp,
  atualizarCelulaNoApp,
  desativarCelulaNoApp,
};