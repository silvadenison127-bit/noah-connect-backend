/**
 * eventosProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Eventos/Agenda.
 * Campos pesquisados: titulo, descricao, local, tipo.
 * ----------------------------------------------------------------------------
 */

const LIMITE_RESULTADOS = 5;

async function eventosProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, titulo, descricao, local, tipo, data_inicio
       FROM eventos
       WHERE titulo ILIKE $1
          OR descricao ILIKE $1
          OR local ILIKE $1
          OR tipo ILIKE $1
       ORDER BY data_inicio DESC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `eventos-${r.id}`,
      modulo: 'Eventos',
      tipo: r.tipo || 'evento',
      titulo: r.titulo,
      subtitulo: r.local || '',
      descricao: r.descricao || '',
      rota: `/eventos`,
      icone: 'Calendar',
      relevancia: 1,
    }));
  } catch (err) {
    console.error('[eventosProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = eventosProvider;