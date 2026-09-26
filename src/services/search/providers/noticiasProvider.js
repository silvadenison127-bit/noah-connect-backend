/**
 * noticiasProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Notícias.
 * Campos pesquisados: title, content (Supabase `church_news`).
 *
 * Desde a migracao do Bloco 11 as noticias vivem no Supabase. O parametro
 * `pool` continua na assinatura porque o searchEngine chama todos os
 * providers do mesmo jeito; aqui ele nao e usado.
 *
 * Duas consultas (titulo e conteudo) em vez de um filtro "or": o filtro "or"
 * do Supabase e montado como texto, e um termo com virgula ou parenteses
 * poderia alterar o proprio filtro. Com .ilike() o termo vai sempre como valor.
 * ----------------------------------------------------------------------------
 */

const { supabaseAdmin } = require('../../../config/supabase');

const LIMITE_RESULTADOS = 5;
const COLUNAS = 'id, title, content, published_at';

async function buscarPor(coluna, termo) {
  const { data, error } = await supabaseAdmin
    .from('church_news')
    .select(COLUNAS)
    .ilike(coluna, `%${termo}%`)
    .order('published_at', { ascending: false })
    .limit(LIMITE_RESULTADOS);
  if (error) throw error;
  return data || [];
}

// eslint-disable-next-line no-unused-vars
async function noticiasProvider(pool, termo) {
  if (!supabaseAdmin) return [];
  try {
    const [porTitulo, porConteudo] = await Promise.all([
      buscarPor('title', termo),
      buscarPor('content', termo),
    ]);

    const unicas = new Map();
    for (const r of [...porTitulo, ...porConteudo]) unicas.set(r.id, r);

    return [...unicas.values()]
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      .slice(0, LIMITE_RESULTADOS)
      .map((r) => ({
        id: `noticias-${r.id}`,
        modulo: 'Notícias',
        tipo: 'noticia',
        titulo: r.title,
        subtitulo: '',
        descricao: (r.content || '').slice(0, 100),
        rota: `/noticias`,
        icone: 'Newspaper',
        relevancia: 1,
      }));
  } catch (err) {
    console.error('[noticiasProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = noticiasProvider;
