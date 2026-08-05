/**
 * pedidosOracaoProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Pedidos de Oração.
 * Campos pesquisados: nome_solicitante, titulo, pedido.
 * ----------------------------------------------------------------------------
 */

const LIMITE_RESULTADOS = 5;

async function pedidosOracaoProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome_solicitante, titulo, pedido, status
       FROM pedidos_oracao
       WHERE nome_solicitante ILIKE $1
          OR titulo ILIKE $1
          OR pedido ILIKE $1
       ORDER BY id DESC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `pedidos_oracao-${r.id}`,
      modulo: 'Pedidos de Oração',
      tipo: 'pedido_oracao',
      titulo: r.titulo || 'Pedido de oração',
      subtitulo: r.nome_solicitante || '',
      descricao: r.status || '',
      rota: `/oracao`,
      icone: 'HeartHandshake',
      relevancia: 1,
    }));
  } catch (err) {
    console.error('[pedidosOracaoProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = pedidosOracaoProvider;