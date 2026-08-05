/**
 * financeiroProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Financeiro.
 * Une dizimos_ofertas (tipo, observacao) e despesas (categoria, descricao).
 * ----------------------------------------------------------------------------
 */

const LIMITE_RESULTADOS = 5;

async function financeiroProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, 'entrada' AS origem, tipo AS titulo, observacao AS descricao, valor, data_lancamento
       FROM dizimos_ofertas
       WHERE tipo ILIKE $1 OR observacao ILIKE $1
       UNION ALL
       SELECT id, 'despesa' AS origem, categoria AS titulo, descricao, valor, data_lancamento
       FROM despesas
       WHERE categoria ILIKE $1 OR descricao ILIKE $1
       ORDER BY data_lancamento DESC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `financeiro-${r.origem}-${r.id}`,
      modulo: 'Financeiro',
      tipo: r.origem,
      titulo: r.titulo,
      subtitulo: r.data_lancamento
        ? new Date(r.data_lancamento).toLocaleDateString('pt-BR')
        : '',
      descricao: r.descricao || '',
      rota: `/financeiro`,
      icone: 'Wallet',
      relevancia: 1,
    }));
  } catch (err) {
    console.error('[financeiroProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = financeiroProvider;