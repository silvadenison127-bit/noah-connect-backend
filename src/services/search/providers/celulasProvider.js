/**
 * celulasProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Células.
 * Campos pesquisados: nome, endereco, dia_semana.
 * ----------------------------------------------------------------------------
 */

const LIMITE_RESULTADOS = 5;

async function celulasProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, endereco, dia_semana, horario
       FROM celulas
       WHERE nome ILIKE $1
          OR endereco ILIKE $1
          OR dia_semana ILIKE $1
       ORDER BY nome ASC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `celulas-${r.id}`,
      modulo: 'Células',
      tipo: 'celula',
      titulo: r.nome,
      subtitulo: r.dia_semana ? `${r.dia_semana}${r.horario ? ' · ' + r.horario : ''}` : '',
      descricao: r.endereco || '',
      rota: `/celulas`,
      icone: 'Home',
      relevancia: 1,
    }));
  } catch (err) {
    console.error('[celulasProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = celulasProvider;