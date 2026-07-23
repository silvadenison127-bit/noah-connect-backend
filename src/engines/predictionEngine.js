/**
 * predictionEngine.js
 *
 * Responsabilidade única: avaliar se existe histórico suficiente para
 * gerar previsões e, quando existir (Fase 4.5 em diante), delegar o
 * cálculo estatístico real. Por enquanto, a tabela de histórico ainda
 * não existe — então este engine SEMPRE reporta "dados insuficientes"
 * de forma honesta, sem estimar nenhum valor.
 *
 * A interface (formato do retorno) já é a definitiva: quando o
 * TrendAnalyzer/ForecastEngine forem implementados na Fase 4.5+,
 * só o cálculo interno muda — nada que consome este engine precisa
 * ser alterado.
 */
const config = require('../config/predictions.config');

async function contarRegistrosHistorico(pool, metrica) {
  try {
    const res = await pool.query(
      `SELECT COUNT(*) AS total FROM historico_metricas WHERE metrica = $1`,
      [metrica]
    );
    return parseInt(res.rows[0].total, 10);
  } catch (err) {
    // Tabela "historico_metricas" ainda não existe (aguardando Fase 4.5).
    // Isso não é um erro do sistema — é esperado nesta fase.
    return 0;
  }
}

async function gerarPrevisaoMetrica(pool, metrica) {
  const totalRegistros = await contarRegistrosHistorico(pool, metrica);
  const suficiente = totalRegistros >= config.minimoRegistrosHistorico;

  const horizontes = {};
  config.horizontesDias.forEach((dias) => {
    // Nenhum valor estimado é gerado nesta fase — a estrutura já
    // existe pronta para receber o resultado real do ForecastEngine.
    horizontes[`dias_${dias}`] = null;
  });

  return {
    metrica,
    totalRegistrosHistorico: totalRegistros,
    minimoNecessario: config.minimoRegistrosHistorico,
    suficiente,
    horizontes,
    mensagem: suficiente
      ? 'Histórico suficiente disponível, mas o modelo estatístico de previsão ainda não foi implementado.'
      : 'Dados históricos insuficientes para gerar previsão.',
  };
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<object[]>} uma entrada por métrica configurada
 */
async function gerarPrevisoes(pool) {
  return Promise.all(config.metricas.map((metrica) => gerarPrevisaoMetrica(pool, metrica)));
}

module.exports = { gerarPrevisoes };
