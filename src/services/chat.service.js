/**
 * Atendimento do chat pelo painel.
 *
 * O aplicativo ja tem chat completo: cria a sala pela RPC
 * `get_or_create_chat_room`, escreve em `chat_messages` e escuta por Realtime.
 * Faltava o outro lado - ninguem no painel via nem respondia.
 *
 * Tudo aqui fala com o Supabase, nao com o Railway: a conversa nasce e vive
 * no Supabase, entao nao existe ponte a construir, so a leitura e a escrita
 * do lado de quem atende.
 *
 * O remetente das respostas nao e um uuid fixo no codigo: o service procura
 * um profile com role `admin`. Assim, trocar o atendente ou criar um perfil
 * institucional depois nao exige mexer neste arquivo.
 */

const { supabaseAdmin } = require('../config/supabase');

const STATUS = {
  OK: 'SUPABASE_OK',
  NAO_CONFIGURADO: 'SUPABASE_NOT_CONFIGURED',
  SEM_ATENDENTE: 'SUPABASE_NO_ADMIN_PROFILE',
  FALHA: 'SUPABASE_FAILED',
};

function exigirSupabase() {
  if (!supabaseAdmin) {
    const erro = new Error('Supabase nao configurado no servidor.');
    erro.codigo = STATUS.NAO_CONFIGURADO;
    throw erro;
  }
}

function propagar(error) {
  const erro = new Error(error.message);
  erro.codigo = STATUS.FALHA;
  throw erro;
}

/** Profile que assina as respostas enviadas pelo painel. */
async function obterProfileAtendente() {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'admin')
    .order('full_name')
    .limit(1)
    .maybeSingle();

  if (error) propagar(error);
  if (!data) {
    const erro = new Error('Nenhum perfil administrador encontrado para assinar a resposta.');
    erro.codigo = STATUS.SEM_ATENDENTE;
    throw erro;
  }
  return data;
}

/**
 * Caixa de entrada: salas ordenadas pela ultima mensagem, com o nome do
 * membro e quantas mensagens dele ainda nao foram lidas.
 */
async function listarConversas(status = 'open') {
  exigirSupabase();

  const { data: salas, error } = await supabaseAdmin
    .from('chat_rooms')
    .select('id, member_id, subject, status, last_message_at, created_at')
    .eq('status', status)
    .order('last_message_at', { ascending: false });

  if (error) propagar(error);
  if (!salas || !salas.length) return [];

  const memberIds = salas.map((s) => s.member_id);
  const roomIds = salas.map((s) => s.id);

  const [membros, naoLidas] = await Promise.all([
    supabaseAdmin.from('members').select('id, profiles(full_name)').in('id', memberIds),
    supabaseAdmin
      .from('chat_messages')
      .select('room_id')
      .in('room_id', roomIds)
      .eq('sender_role', 'member')
      .is('read_at', null)
      .is('admin_hidden_at', null),
  ]);

  if (membros.error) propagar(membros.error);
  if (naoLidas.error) propagar(naoLidas.error);

  // O nome nao esta em members: a tabela guarda profile_id e o nome vive em
  // profiles. O select aninhado traz o campo como m.profiles.full_name.
  const nomePorMembro = new Map((membros.data || []).map((m) => [m.id, m.profiles?.full_name]));
  const contagem = new Map();
  for (const linha of naoLidas.data || []) {
    contagem.set(linha.room_id, (contagem.get(linha.room_id) || 0) + 1);
  }

  return salas.map((sala) => ({
    ...sala,
    membro_nome: nomePorMembro.get(sala.member_id) || 'Membro',
    nao_lidas: contagem.get(sala.id) || 0,
  }));
}

/** Mensagens de uma conversa, da mais antiga para a mais recente. */
async function listarMensagens(roomId, limite = 200) {
  exigirSupabase();

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, room_id, sender_profile_id, sender_role, body, read_at, created_at')
    .eq('room_id', roomId)
    .is('admin_hidden_at', null)
    .order('created_at', { ascending: true })
    .limit(limite);

  if (error) propagar(error);
  return data || [];
}

/**
 * Responde ao membro. Grava `sender_role = admin` porque o default da coluna
 * e `member` - sem isso a resposta apareceria como se o proprio membro
 * tivesse escrito.
 */
async function responder(roomId, texto) {
  exigirSupabase();

  const corpo = String(texto || '').trim();
  if (!corpo) {
    const erro = new Error('Mensagem vazia.');
    erro.codigo = STATUS.FALHA;
    throw erro;
  }

  const atendente = await obterProfileAtendente();

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      room_id: roomId,
      sender_profile_id: atendente.id,
      sender_role: 'admin',
      body: corpo,
    })
    .select('*')
    .single();

  if (error) propagar(error);

  await supabaseAdmin
    .from('chat_rooms')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', roomId);

  return data;
}

/** Marca como lidas as mensagens que o membro enviou nesta sala. */
async function marcarComoLidas(roomId) {
  exigirSupabase();

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('sender_role', 'member')
    .is('read_at', null);

  if (error) propagar(error);
  return { status: STATUS.OK };
}

/** Encerra ou reabre a conversa. Sem isso a caixa de entrada so cresce. */
async function alterarStatus(roomId, status) {
  exigirSupabase();

  if (!['open', 'closed'].includes(status)) {
    const erro = new Error('Status invalido.');
    erro.codigo = STATUS.FALHA;
    throw erro;
  }

  const { data, error } = await supabaseAdmin
    .from('chat_rooms')
    .update({ status })
    .eq('id', roomId)
    .select('*')
    .single();

  if (error) propagar(error);
  return data;
}

/** Total de mensagens de membros ainda nao lidas, nas conversas abertas. */
async function contarNaoLidas() {
  exigirSupabase();

  const { data: salas, error } = await supabaseAdmin
    .from('chat_rooms')
    .select('id')
    .eq('status', 'open');

  if (error) propagar(error);
  if (!salas || !salas.length) return { total: 0 };

  const { count, error: erroContagem } = await supabaseAdmin
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .in('room_id', salas.map((s) => s.id))
    .eq('sender_role', 'member')
    .is('read_at', null)
    .is('admin_hidden_at', null);

  if (erroContagem) propagar(erroContagem);
  return { total: count || 0 };
}

/**
 * Oculta mensagens apenas no painel. O app do membro nao usa esta coluna.
 * Sempre restrito a conversa informada; sem ids, oculta todas da conversa.
 */
async function ocultarMensagens(roomId, ids) {
  exigirSupabase();

  let consulta = supabaseAdmin
    .from('chat_messages')
    .update({ admin_hidden_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .is('admin_hidden_at', null);

  if (ids) consulta = consulta.in('id', ids);

  const { data, error } = await consulta.select('id');
  if (error) propagar(error);
  return { ocultadas: (data || []).length };
}

module.exports = {
  STATUS,
  contarNaoLidas,
  ocultarMensagens,
  listarConversas,
  listarMensagens,
  responder,
  marcarComoLidas,
  alterarStatus,
};
