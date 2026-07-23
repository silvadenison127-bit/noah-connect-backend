/**
 * recommendationEngine.js
 *
 * Responsabilidade única: transformar alertas (dados já calculados
 * pelo alertEngine) em recomendações acionáveis, em linguagem natural.
 *
 * Importante: este engine NÃO chama o alertEngine nem o banco. Ele
 * recebe a lista de alertas como parâmetro — quem orquestra essa
 * comunicação é o dashboardService, conforme a arquitetura aprovada
 * (nenhum engine depende diretamente de outro).
 */
const config = require('../config/recommendations.config');

/**
 * @param {object[]} alertas - lista de alertas gerados pelo alertEngine
 * @returns {object[]} lista de recomendações, ordenada por prioridade
 */
function gerarRecomendacoes(alertas) {
  if (!Array.isArray(alertas) || alertas.length === 0) return [];

  return alertas
    .filter((a) => a.acaoSugerida) // só recomenda quando há ação definida
    .map((a) => ({
      id: `rec_${a.id}`,
      alertaOrigemId: a.id,
      categoria: a.categoria,
      prioridade: config.prioridadePorSeveridade[a.severidade] ?? 99,
      motivo: a.descricao,
      impacto: config.impactoPorSeveridade[a.severidade] ?? config.impactoPadrao,
      acaoRecomendada: a.acaoSugerida,
      areaResponsavel: config.areaResponsavelPorCategoria[a.categoria] ?? config.areaResponsavelPadrao,
      dataCriacao: new Date().toISOString(),
    }))
    .sort((a, b) => a.prioridade - b.prioridade);
}

module.exports = { gerarRecomendacoes };
