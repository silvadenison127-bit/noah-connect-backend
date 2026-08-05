/**
 * comunicadosProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Comunicados.
 * Campos pesquisados: titulo, mensagem.
 * ----------------------------------------------------------------------------
 */

const LIMITE_RESULTADOS = 5;

async function comunicadosProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, titulo, mensagem, publico_alvo
       FROM comunicados
       WHERE titulo ILIKE $1
          OR mensagem ILIKE $1
       ORDER BY id DESC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `comunicados-${r.id}`,
      modulo: 'Comunicações',
      tipo: 'comunicado',
      titulo: r.titulo,
      subtitulo: r.publico_alvo || '',
      descricao: (r.mensagem || '').slice(0, 100),
      rota: `/comunicados`,
      icone: 'Megaphone',
      relevancia: 1,
    }));
  } catch (err) {
    console.error('[comunicadosProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = comunicadosProvider;