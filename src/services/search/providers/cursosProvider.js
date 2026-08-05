/**
 * cursosProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Cursos.
 * Campos pesquisados: nome, descricao.
 * ----------------------------------------------------------------------------
 */

const LIMITE_RESULTADOS = 5;

async function cursosProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, descricao, ativo
       FROM cursos
       WHERE (nome ILIKE $1 OR descricao ILIKE $1)
       ORDER BY nome ASC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `cursos-${r.id}`,
      modulo: 'Cursos',
      tipo: 'curso',
      titulo: r.nome,
      subtitulo: r.ativo ? 'Ativo' : 'Inativo',
      descricao: r.descricao || '',
      rota: `/cursos`,
      icone: 'GraduationCap',
      relevancia: 1,
    }));
  } catch (err) {
    console.error('[cursosProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = cursosProvider;