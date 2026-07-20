/**
 * dashboardService.js
 *
 * Camada de orquestração entre as rotas e os engines. Nenhuma regra
 * de negócio deve viver aqui — apenas chamadas aos engines e
 * montagem do payload final. Engines nunca se chamam entre si;
 * toda comunicação passa por este serviço.
 *
 * Conforme as próximas fases forem implementadas, este arquivo vai
 * ganhar novas chamadas (alertEngine, recommendationEngine,
 * predictionEngine, historicalMetricsEngine) sem que as rotas ou os
 * engines já existentes precisem ser alterados.
 */
const { calcularSaudeIgreja } = require('../engines/healthScoreEngine');
const { gerarAlertas } = require('../engines/alertEngine');
const { gerarRecomendacoes } = require('../engines/recommendationEngine');

async function obterSaudeDetalhada(pool) {
  try {
    return await calcularSaudeIgreja(pool);
  } catch (err) {
    console.error('Erro ao calcular saúde da igreja:', err);
    return { score: null, label: 'Indisponível', indicadores: {} };
  }
}

async function obterAlertas(pool) {
  try {
    return await gerarAlertas(pool);
  } catch (err) {
    console.error('Erro ao gerar alertas:', err);
    return [];
  }
}

// Recebe os alertas já calculados (evita nova consulta ao banco).
// Não depende do alertEngine diretamente — apenas dos dados que
// o dashboardService já obteve via obterAlertas.
function obterRecomendacoes(alertas) {
  try {
    return gerarRecomendacoes(alertas);
  } catch (err) {
    console.error('Erro ao gerar recomendações:', err);
    return [];
  }
}

module.exports = { obterSaudeDetalhada, obterAlertas, obterRecomendacoes };
