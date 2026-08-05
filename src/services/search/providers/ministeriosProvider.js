/**
 * ministeriosProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Ministérios.
 * Campos pesquisados: nome, descricao.
 * ----------------------------------------------------------------------------
 */

const LIMITE_RESULTADOS = 5;

async function ministeriosProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, descricao
       FROM ministerios
       WHERE nome ILIKE $1
          OR descricao ILIKE $1
       ORDER BY nome ASC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `ministerios-${r.id}`,
      modulo: 'Ministérios',
      tipo: 'ministerio',
      titulo: r.nome,
      subtitulo: '',
      descricao: r.descricao || '',
      rota: `/ministerios`,
      icone: 'Heart',
      relevancia: 1,
    }));
  } catch (err) {
    console.error('[ministeriosProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = ministeriosProvider;