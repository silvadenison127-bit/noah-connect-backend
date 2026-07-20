/**
 * recommendations.config.js
 *
 * Mapeamentos usados pelo Recommendation Engine para traduzir um
 * alerta em recomendação. Nenhum texto/prioridade deve ser decidido
 * dentro do engine — tudo fica configurável aqui.
 */
module.exports = {
  areaResponsavelPorCategoria: {
    'Frequência': 'Pastoral / Acompanhamento de Membros',
    'Financeiro': 'Tesouraria',
    'Células': 'Coordenação de Células',
    'Ministérios': 'Coordenação de Ministérios',
    'Eventos': 'Equipe de Eventos',
    'Visitantes': 'Equipe de Recepção',
    'Membros': 'Secretaria',
    'Sistema': 'Administração da Plataforma',
    'Segurança': 'Administração da Plataforma',
  },

  impactoPorSeveridade: {
    CRITICAL: 'Alto — requer ação imediata',
    WARNING: 'Médio — recomendado agir nos próximos dias',
    INFO: 'Baixo — acompanhar quando possível',
  },

  prioridadePorSeveridade: {
    CRITICAL: 1,
    WARNING: 2,
    INFO: 3,
  },

  areaResponsavelPadrao: 'Liderança Geral',
  impactoPadrao: 'Não classificado',
};
