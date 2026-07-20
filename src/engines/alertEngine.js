/**
 * alertEngine.js
 *
 * Responsabilidade única: avaliar as regras ativas em alerts.config.js
 * contra os dados reais e devolver a lista de alertas disparados.
 * Não depende de nenhum outro engine — recebe `pool` e devolve dados.
 *
 * Cada verificador é isolado e resiliente: se uma tabela não existir
 * ou mudar de nome, aquela regra específica é ignorada (com aviso no
 * log) em vez de derrubar as demais.
 */
const config = require('../config/alerts.config');

async function verificarMembroSemPresenca(pool, parametros) {
  const dias = parametros.diasSemPresenca;
  const res = await pool.query(
    `SELECT u.nome FROM usuarios u
     WHERE u.ativo = true
       AND u.id NOT IN (
         SELECT DISTINCT p.usuario_id FROM presencas_culto p
         JOIN eventos e ON e.id = p.evento_id
         WHERE p.presente = true AND e.data_inicio >= NOW() - interval '${dias} days'
       )
     ORDER BY u.nome ASC`
  );
  if (res.rows.length === 0) return null;
  return {
    quantidade: res.rows.length,
    exemplos: res.rows.slice(0, 3).map((r) => r.nome),
    descricao: `${res.rows.length} membro(s) sem presença registrada há mais de ${dias} dias.`,
  };
}

async function verificarLiderSemAtividade(pool, parametros) {
  const dias = parametros.diasSemPresenca;
  const res = await pool.query(
    `SELECT u.nome FROM usuarios u
     WHERE u.ativo = true AND u.tipo = 'lider'
       AND u.id NOT IN (
         SELECT DISTINCT p.usuario_id FROM presencas_culto p
         JOIN eventos e ON e.id = p.evento_id
         WHERE p.presente = true AND e.data_inicio >= NOW() - interval '${dias} days'
       )
     ORDER BY u.nome ASC`
  );
  if (res.rows.length === 0) return null;
  return {
    quantidade: res.rows.length,
    exemplos: res.rows.slice(0, 3).map((r) => r.nome),
    descricao: `${res.rows.length} líder(es) sem presença registrada há mais de ${dias} dias.`,
  };
}

async function verificarCelulaSemMembros(pool) {
  const res = await pool.query(
    `SELECT c.nome FROM celulas c
     WHERE NOT EXISTS (SELECT 1 FROM membros_celula mc WHERE mc.celula_id = c.id)
     ORDER BY c.nome ASC`
  );
  if (res.rows.length === 0) return null;
  return {
    quantidade: res.rows.length,
    exemplos: res.rows.slice(0, 3).map((r) => r.nome),
    descricao: `${res.rows.length} célula(s) sem nenhum membro vinculado.`,
  };
}

async function verificarCelulaSemLider(pool) {
  const res = await pool.query(`SELECT nome FROM celulas WHERE lider_id IS NULL ORDER BY nome ASC`);
  if (res.rows.length === 0) return null;
  return {
    quantidade: res.rows.length,
    exemplos: res.rows.slice(0, 3).map((r) => r.nome),
    descricao: `${res.rows.length} célula(s) sem líder definido.`,
  };
}

async function verificarMinisterioSemMembros(pool) {
  const res = await pool.query(
    `SELECT m.nome FROM ministerios m
     WHERE NOT EXISTS (SELECT 1 FROM membros_ministerio mm WHERE mm.ministerio_id = m.id)
     ORDER BY m.nome ASC`
  );
  if (res.rows.length === 0) return null;
  return {
    quantidade: res.rows.length,
    exemplos: res.rows.slice(0, 3).map((r) => r.nome),
    descricao: `${res.rows.length} ministério(s) sem nenhum membro vinculado.`,
  };
}

async function verificarSaldoFinanceiroNegativo(pool) {
  const res = await pool.query(
    `SELECT
       COALESCE((SELECT SUM(valor) FROM dizimos_ofertas WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)), 0) AS entradas,
       COALESCE((SELECT SUM(valor) FROM despesas WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)), 0) AS saidas`
  );
  const entradas = parseFloat(res.rows[0].entradas);
  const saidas = parseFloat(res.rows[0].saidas);
  if (saidas <= entradas) return null;
  return {
    quantidade: 1,
    exemplos: [],
    descricao: `As saídas (R$ ${saidas.toFixed(2)}) superaram as entradas (R$ ${entradas.toFixed(2)}) neste mês.`,
  };
}

// Mapa regra.id -> função verificadora. Regras sem verificador aqui
// (ex: as que dependem de histórico) simplesmente não são avaliadas,
// mesmo que alguém esqueça de marcar ativo:false no config.
const VERIFICADORES = {
  membro_sem_presenca: verificarMembroSemPresenca,
  lider_sem_atividade: verificarLiderSemAtividade,
  celula_sem_membros: verificarCelulaSemMembros,
  celula_sem_lider: verificarCelulaSemLider,
  ministerio_sem_membros: verificarMinisterioSemMembros,
  saldo_financeiro_negativo: verificarSaldoFinanceiroNegativo,
};

/**
 * Avalia todas as regras ativas e devolve a lista de alertas disparados,
 * ordenada por severidade (CRITICAL primeiro).
 * @param {import('pg').Pool} pool
 * @returns {Promise<object[]>}
 */
async function gerarAlertas(pool) {
  const regrasAtivas = config.regras.filter((r) => r.ativo && VERIFICADORES[r.id]);

  const resultados = await Promise.all(
    regrasAtivas.map(async (regra) => {
      try {
        const disparo = await VERIFICADORES[regra.id](pool, regra.parametros);
        if (!disparo) return null;

        return {
          id: `${regra.id}_${Date.now()}`,
          categoria: regra.categoria,
          titulo: regra.titulo,
          descricao: disparo.descricao,
          exemplos: disparo.exemplos,
          severidade: regra.severidade,
          prioridade: config.severidades[regra.severidade]?.peso ?? 99,
          origem: 'alertEngine',
          dataCriacao: new Date().toISOString(),
          status: 'ativo',
          acaoSugerida: regra.acaoSugerida,
        };
      } catch (err) {
        console.warn(`Regra "${regra.id}" falhou ao avaliar (tabela ausente ou erro de query):`, err.message);
        return null;
      }
    })
  );

  return resultados
    .filter(Boolean)
    .sort((a, b) => a.prioridade - b.prioridade);
}

module.exports = { gerarAlertas };
