/**
 * predictions.config.js
 *
 * Parâmetros do Prediction Engine. Define quais métricas terão
 * previsão no futuro, os horizontes de tempo e o volume mínimo de
 * histórico necessário antes de confiar em qualquer projeção.
 *
 * Enquanto o histórico (Fase 4.5) não existir ou não atingir o
 * mínimo, o engine SEMPRE retorna "dados insuficientes" — nunca um
 * número estimado sem lastro real.
 */
module.exports = {
  metricas: ['membros', 'dizimos', 'batismos', 'visitantes'],

  horizontesDias: [30, 90, 180, 365],

  // Quantidade mínima de registros históricos (ex: snapshots diários)
  // necessários antes de considerar uma previsão minimamente confiável.
  minimoRegistrosHistorico: 90,
};
