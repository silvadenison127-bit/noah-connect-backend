/**
 * noticiasProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Notícias.
 * Campos pesquisados: titulo, conteudo.
 * ----------------------------------------------------------------------------
 */

const LIMITE_RESULTADOS = 5;

async function noticiasProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, titulo, conteudo
       FROM noticias
       WHERE titulo ILIKE $1
          OR conteudo ILIKE $1
       ORDER BY id DESC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `noticias-${r.id}`,
      modulo: 'Notícias',
      tipo: 'noticia',
      titulo: r.titulo,
      subtitulo: '',
      descricao: (r.conteudo || '').slice(0, 100),
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