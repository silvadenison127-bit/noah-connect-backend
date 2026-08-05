/**
 * estudosBiblicosProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Estudos Bíblicos.
 * Campos pesquisados: titulo, descricao, conteudo, autor.
 * ----------------------------------------------------------------------------
 */

const LIMITE_RESULTADOS = 5;

async function estudosBiblicosProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, titulo, descricao, autor
       FROM estudos_biblicos
       WHERE titulo ILIKE $1
          OR descricao ILIKE $1
          OR conteudo ILIKE $1
          OR autor ILIKE $1
       ORDER BY id DESC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `estudos_biblicos-${r.id}`,
      modulo: 'Estudos Bíblicos',
      tipo: 'estudo',
      titulo: r.titulo,
      subtitulo: r.autor || '',
      descricao: r.descricao || '',
      rota: `/estudos-biblicos`,
      icone: 'BookOpen',
      relevancia: 1,
    }));
  } catch (err) {
    console.error('[estudosBiblicosProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = estudosBiblicosProvider;