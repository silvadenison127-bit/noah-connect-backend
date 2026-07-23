/**
 * historical.config.js
 * Parâmetros do Historical Metrics Engine.
 */
module.exports = {
  // Quantos meses olhar para trás por padrão ao montar uma série histórica.
  mesesPadrao: 12,

  // Métricas que já podem ser calculadas sob demanda com os dados reais
  // existentes (usuarios, dizimos_ofertas, presencas_culto).
  metricasDisponiveis: ['membros', 'arrecadacao', 'frequencia'],

  // Métricas previstas na especificação, mas que o sistema ainda não
  // rastreia (não existe conceito de "visitante" nem "batismo" no
  // banco atual). Ficam documentadas aqui para quando essas
  // funcionalidades existirem — nenhum dado fictício é gerado.
  metricasIndisponiveis: {
    visitantes: 'O sistema ainda não distingue visitantes de membros.',
    batismos: 'O sistema ainda não possui registro de batismos.',
  },
};
