/**
 * Transmissoes ao vivo.
 *
 * Ao contrario das demais rotas do painel, esta NAO escreve no Railway.
 * A tabela `live_streams` vive no Supabase porque e o aplicativo quem le
 * esses dados -- o painel apenas alimenta. Gravar no Railway criaria um
 * registro que nenhum membro jamais veria.
 *
 * O aplicativo busca a transmissao atual com `.limit(1)` sobre status='live'.
 * Por isso so pode existir uma no ar por vez: iniciar uma encerra as outras.
 */
const express = require('express');
const { supabaseAdmin, supabaseConfigurado } = require('../config/supabase');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

const TABELA = 'live_streams';

/**
 * Extrai o identificador do video a partir de qualquer formato de link do
 * YouTube. O pastor cola o endereco que aparece no navegador; converter e
 * problema nosso, nao dele.
 *
 * Formatos aceitos:
 *   youtube.com/watch?v=ID   youtu.be/ID   youtube.com/live/ID
 *   youtube.com/embed/ID     e o proprio ID avulso
 */
function extrairVideoId(entrada) {
  if (!entrada) return null;
  const texto = String(entrada).trim();
  if (!texto) return null;

  // O ID do YouTube tem 11 caracteres. Se veio so o ID, aceita direto.
  if (/^[A-Za-z0-9_-]{11}$/.test(texto)) return texto;

  const padroes = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];

  for (const padrao of padroes) {
    const achado = texto.match(padrao);
    if (achado) return achado[1];
  }

  return null;
}

/** Recusa cedo quando a integracao nao esta configurada. */
function exigirSupabase(res) {
  if (supabaseConfigurado) return true;
  res.status(503).json({
    erro: 'Transmissoes indisponiveis: a integracao com o aplicativo nao esta configurada.',
  });
  return false;
}

/**
 * Monta o registro a partir do corpo da requisicao.
 * Devolve { erro } quando a validacao falha, ou { dados } quando passa.
 */
function montarRegistro(corpo) {
  const { titulo, descricao, provider, link, thumbnail_url, agendado_para, destaque } = corpo;

  const tituloLimpo = String(titulo || '').trim();
  if (!tituloLimpo) return { erro: 'O titulo e obrigatorio.' };

  const plataforma = String(provider || 'youtube').trim().toLowerCase();
  const linkLimpo = String(link || '').trim();

  const dados = {
    title: tituloLimpo,
    description: String(descricao || '').trim() || null,
    provider: plataforma,
    thumbnail_url: String(thumbnail_url || '').trim() || null,
    scheduled_for: agendado_para || null,
    is_featured: Boolean(destaque),
  };

  if (plataforma === 'youtube') {
    const videoId = extrairVideoId(linkLimpo);
    if (!videoId) {
      return {
        erro: 'Link do YouTube invalido. Cole o endereco completo do video ou da transmissao.',
      };
    }
    dados.video_id = videoId;
    // A URL canonica tambem e gravada: o aplicativo prioriza `stream_url` e so
    // recorre ao `video_id` como alternativa.
    dados.stream_url = `https://www.youtube.com/watch?v=${videoId}`;
  } else {
    if (!linkLimpo) return { erro: 'Informe o endereco da transmissao.' };
    dados.video_id = null;
    dados.stream_url = linkLimpo;
  }

  return { dados };
}

// Listar transmissoes (admin)
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  if (!exigirSupabase(res)) return;
  try {
    const { data, error } = await supabaseAdmin
      .from(TABELA)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[ao-vivo] falha ao listar:', err);
    res.status(500).json({ erro: 'Erro ao buscar transmissoes' });
  }
});

// Criar transmissao (admin) -- nasce agendada
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  if (!exigirSupabase(res)) return;

  const { erro, dados } = montarRegistro(req.body);
  if (erro) return res.status(400).json({ erro });

  try {
    const { data, error } = await supabaseAdmin
      .from(TABELA)
      .insert({ ...dados, status: 'scheduled' })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[ao-vivo] falha ao criar:', err);
    res.status(500).json({ erro: 'Erro ao criar transmissao' });
  }
});

// Atualizar transmissao (admin) -- nao mexe em status
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  if (!exigirSupabase(res)) return;

  const { erro, dados } = montarRegistro(req.body);
  if (erro) return res.status(400).json({ erro });

  try {
    const { data, error } = await supabaseAdmin
      .from(TABELA)
      .update({ ...dados, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ erro: 'Transmissao nao encontrada' });
    res.json(data);
  } catch (err) {
    console.error('[ao-vivo] falha ao atualizar:', err);
    res.status(500).json({ erro: 'Erro ao atualizar transmissao' });
  }
});

/**
 * Colocar no ar (admin).
 *
 * Encerra qualquer outra transmissao que esteja marcada como 'live' ANTES de
 * subir esta. Se a ordem fosse invertida, existiriam duas no ar por um
 * instante e o aplicativo poderia mostrar a errada.
 */
router.post('/:id/iniciar', autenticar, somenteAdmin, async (req, res) => {
  if (!exigirSupabase(res)) return;

  const agora = new Date().toISOString();

  try {
    const encerramento = await supabaseAdmin
      .from(TABELA)
      .update({ status: 'ended', ended_at: agora, updated_at: agora })
      .eq('status', 'live')
      .neq('id', req.params.id);

    if (encerramento.error) throw encerramento.error;

    const { data, error } = await supabaseAdmin
      .from(TABELA)
      .update({ status: 'live', started_at: agora, ended_at: null, updated_at: agora })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ erro: 'Transmissao nao encontrada' });
    res.json(data);
  } catch (err) {
    console.error('[ao-vivo] falha ao iniciar:', err);
    res.status(500).json({ erro: 'Erro ao iniciar transmissao' });
  }
});

// Tirar do ar (admin)
router.post('/:id/encerrar', autenticar, somenteAdmin, async (req, res) => {
  if (!exigirSupabase(res)) return;

  const agora = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from(TABELA)
      .update({ status: 'ended', ended_at: agora, updated_at: agora })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ erro: 'Transmissao nao encontrada' });
    res.json(data);
  } catch (err) {
    console.error('[ao-vivo] falha ao encerrar:', err);
    res.status(500).json({ erro: 'Erro ao encerrar transmissao' });
  }
});

/**
 * Voltar para agendada (admin).
 *
 * Util quando o pastor aperta "iniciar" antes da hora ou por engano: devolve a
 * transmissao para a fila sem precisar cadastrar tudo de novo.
 */
router.post('/:id/reagendar', autenticar, somenteAdmin, async (req, res) => {
  if (!exigirSupabase(res)) return;

  const agora = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from(TABELA)
      .update({ status: 'scheduled', started_at: null, ended_at: null, updated_at: agora })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ erro: 'Transmissao nao encontrada' });
    res.json(data);
  } catch (err) {
    console.error('[ao-vivo] falha ao reagendar:', err);
    res.status(500).json({ erro: 'Erro ao reagendar transmissao' });
  }
});

// Remover transmissao (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  if (!exigirSupabase(res)) return;

  try {
    const { error } = await supabaseAdmin.from(TABELA).delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('[ao-vivo] falha ao remover:', err);
    res.status(500).json({ erro: 'Erro ao remover transmissao' });
  }
});

module.exports = router;