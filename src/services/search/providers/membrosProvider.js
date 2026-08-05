/**
 * membrosProvider.js
 * ----------------------------------------------------------------------------
 * Provider de busca para o módulo Membros/Líderes/Administradores.
 * Consulta exclusivamente a tabela `usuarios`.
 *
 * Campos pesquisados: nome, email, telefone, cpf.
 * Cada resultado é rotulado conforme usuarios.tipo (admin/lider/membro).
 * ----------------------------------------------------------------------------
 */

const ICONE_POR_TIPO = {
  admin: 'ShieldCheck',
  lider: 'UserCog',
  membro: 'User',
};

const MODULO_POR_TIPO = {
  admin: 'Administradores',
  lider: 'Líderes',
  membro: 'Membros',
};

const LIMITE_RESULTADOS = 5;

/**
 * @param {object} pool - conexão de banco
 * @param {string} termo - texto de busca (já sanitizado pelo engine)
 * @returns {Promise<Array>} resultados no contrato padronizado
 */
async function membrosProvider(pool, termo) {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, email, telefone, cpf, tipo
       FROM usuarios
       WHERE ativo = true
         AND (
           nome ILIKE $1
           OR email ILIKE $1
           OR telefone ILIKE $1
           OR cpf ILIKE $1
         )
       ORDER BY nome ASC
       LIMIT $2`,
      [`%${termo}%`, LIMITE_RESULTADOS]
    );

    return rows.map((r) => ({
      id: `usuarios-${r.id}`,
      modulo: MODULO_POR_TIPO[r.tipo] || 'Membros',
      tipo: r.tipo,
      titulo: r.nome,
      subtitulo: r.email,
      descricao: r.telefone || r.cpf || '',
      rota: `/membros`,
      icone: ICONE_POR_TIPO[r.tipo] || 'User',
      relevancia: 1,
    }));
  } catch (err) {
    console.error('[membrosProvider] Erro na busca:', err.message);
    return [];
  }
}

module.exports = membrosProvider;