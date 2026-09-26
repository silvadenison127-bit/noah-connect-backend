/**
 * Noticias do painel, gravadas direto no Supabase (`church_news`).
 *
 * Antes a rota usava a tabela `noticias` do Railway, que o aplicativo nunca
 * lia: o app le `church_news`. Agora o Supabase e a fonte unica das noticias
 * (Bloco 11, Fase A).
 *
 * O CONTRATO COM O PAINEL NAO MUDA: a resposta continua com os nomes em
 * portugues (id, titulo, conteudo, imagem_capa, publicado_em, autor_nome).
 * O `id` passa a ser uuid; o painel so o usa como texto.
 *
 * Decisoes validadas:
 * - autoria: usuarios.auth_user_id do usuario logado (mesma regra dos
 *   eventos, via resolverUuidDoAutor); sem vinculo, created_by fica nulo,
 *   sem inventar uuid.
 * - summary: nulo nesta etapa (o app mostraria o texto duplicado no detalhe).
 * - imagem: base64 em cover_url, temporario ate a migracao para o Storage.
 * - publicacao: is_published = true, como era no Railway (sem rascunho).
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const { resolverUuidDoAutor } = require('../services/eventos.service');
const router = express.Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUNAS = 'id, title, content, cover_url, published_at, created_by';
const FK_VIOLADA = '23503';

function supabaseIndisponivel(res) {
  return res.status(503).json({ erro: 'Notícias indisponíveis: Supabase não configurado.' });
}

/** "" ou ausente vira null: o painel envia "" quando a imagem e removida. */
function imagemOuNull(valor) {
  return typeof valor === 'string' && valor.trim() ? valor : null;
}

/** Converte a linha do Supabase para o formato que o painel ja usa. */
function paraPainel(linha, nomes) {
  return {
    id: linha.id,
    titulo: linha.title,
    conteudo: linha.content,
    imagem_capa: linha.cover_url,
    publicado_em: linha.published_at,
    autor_nome: (linha.created_by && nomes.get(linha.created_by)) || null,
  };
}

/** Nomes dos autores em profiles. Falha aqui nao derruba a resposta. */
async function nomesDosAutores(linhas) {
  const ids = [...new Set(linhas.map((l) => l.created_by).filter(Boolean))];
  const nomes = new Map();
  if (!ids.length) return nomes;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .in('id', ids);
  if (error) {
    console.error('[noticias] falha ao buscar autores:', error.message);
    return nomes;
  }
  for (const p of data || []) nomes.set(p.id, p.full_name);
  return nomes;
}

// Listar noticias (qualquer usuario logado no painel)
router.get('/', autenticar, async (req, res) => {
  if (!supabaseAdmin) return supabaseIndisponivel(res);
  try {
    const { data, error } = await supabaseAdmin
      .from('church_news')
      .select(COLUNAS)
      .order('published_at', { ascending: false });
    if (error) throw error;
    const linhas = data || [];
    const nomes = await nomesDosAutores(linhas);
    res.json(linhas.map((l) => paraPainel(l, nomes)));
  } catch (err) {
    console.error('[noticias] listar:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar notícias' });
  }
});

// Criar noticia (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  if (!supabaseAdmin) return supabaseIndisponivel(res);
  const { titulo, conteudo, imagem_capa } = req.body || {};
  if (!titulo || !conteudo) {
    return res.status(400).json({ erro: 'Título e conteúdo são obrigatórios' });
  }
  try {
    const autor = await resolverUuidDoAutor(req.usuario && req.usuario.id);
    const nova = {
      title: titulo,
      content: conteudo,
      cover_url: imagemOuNull(imagem_capa),
      summary: null,
      is_published: true,
      created_by: autor,
    };

    let { data, error } = await supabaseAdmin
      .from('church_news')
      .insert(nova)
      .select(COLUNAS)
      .single();

    // Vinculo apontando para um perfil que nao existe mais: publica sem autor
    // em vez de recusar a noticia (mesma regra de nao inventar identidade).
    if (error && error.code === FK_VIOLADA && autor) {
      console.error('[noticias] autor sem perfil no Supabase; publicando sem autor.');
      ({ data, error } = await supabaseAdmin
        .from('church_news')
        .insert({ ...nova, created_by: null })
        .select(COLUNAS)
        .single());
    }
    if (error) throw error;

    const nomes = await nomesDosAutores([data]);
    res.status(201).json(paraPainel(data, nomes));
  } catch (err) {
    console.error('[noticias] criar:', err.message);
    res.status(500).json({ erro: 'Erro ao publicar notícia' });
  }
});

// Atualizar noticia (admin). Campo ausente ou null = nao alterar.
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  if (!supabaseAdmin) return supabaseIndisponivel(res);
  if (!UUID.test(req.params.id)) {
    return res.status(400).json({ erro: 'Notícia inválida.' });
  }
  const { titulo, conteudo, imagem_capa } = req.body || {};
  const campos = {};
  if (titulo !== undefined && titulo !== null) campos.title = titulo;
  if (conteudo !== undefined && conteudo !== null) campos.content = conteudo;
  if (imagem_capa !== undefined && imagem_capa !== null) campos.cover_url = imagemOuNull(imagem_capa);

  try {
    const tabela = supabaseAdmin.from('church_news');
    const consulta = Object.keys(campos).length
      ? tabela.update(campos).eq('id', req.params.id).select(COLUNAS)
      : tabela.select(COLUNAS).eq('id', req.params.id);
    const { data, error } = await consulta.maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ erro: 'Notícia não encontrada' });

    const nomes = await nomesDosAutores([data]);
    res.json(paraPainel(data, nomes));
  } catch (err) {
    console.error('[noticias] atualizar:', err.message);
    res.status(500).json({ erro: 'Erro ao atualizar notícia' });
  }
});

// Remover noticia (admin). Mantem o 204 de antes, mesmo se o id nao existir.
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  if (!supabaseAdmin) return supabaseIndisponivel(res);
  if (!UUID.test(req.params.id)) {
    return res.status(400).json({ erro: 'Notícia inválida.' });
  }
  try {
    const { error } = await supabaseAdmin.from('church_news').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('[noticias] remover:', err.message);
    res.status(500).json({ erro: 'Erro ao remover notícia' });
  }
});

module.exports = router;
