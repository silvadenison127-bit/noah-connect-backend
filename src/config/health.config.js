/**
 * health.config.js
 * Parâmetros do Health Score Engine — nenhum número mágico deve
 * viver dentro do engine. Ajuste os pesos/janelas aqui.
 */
module.exports = {
  // Janelas de tempo (em dias) usadas nos cálculos
  janelas: {
    frequenciaCultosDias: 30,
    participacaoEventosDias: 30,
    retencaoMinimaDias: 90,
  },

  // Pesos usados na média ponderada do score geral de "Saúde da Igreja".
  // A soma dos pesos deve totalizar 1.0.
  // "pedidosOracaoAtivos" é informativo (não entra no score, pois um
  // número alto de pedidos não é necessariamente positivo ou negativo).
  pesos: {
    frequenciaCultos: 0.20,
    participacaoCelulas: 0.15,
    participacaoMinisterios: 0.15,
    crescimento: 0.15,
    retencao: 0.15,
    visitantesRecorrentes: 0.10,
    participacaoEventos: 0.10,
  },
};
