/**
 * alerts.config.js
 *
 * Catálogo de regras do Alert Engine. Nenhum limiar (dias, valores)
 * deve viver dentro do engine — tudo fica aqui em `parametros`.
 *
 * Regras com `ativo: false` estão com a estrutura pronta mas
 * aguardando dado histórico (Fase 4.5 — Historical Metrics Engine).
 * Quando o histórico existir, basta trocar para `ativo: true` e
 * implementar o verificador correspondente no alertEngine.js —
 * nenhuma outra regra precisa mudar.
 */
module.exports = {
  severidades: {
    INFO: { peso: 3, label: 'Informativo' },
    WARNING: { peso: 2, label: 'Atenção' },
    CRITICAL: { peso: 1, label: 'Crítico' },
  },

  categorias: [
    'Frequência', 'Financeiro', 'Células', 'Ministérios',
    'Eventos', 'Visitantes', 'Membros', 'Sistema', 'Segurança',
  ],

  regras: [
    {
      id: 'membro_sem_presenca',
      categoria: 'Frequência',
      severidade: 'WARNING',
      ativo: true,
      parametros: { diasSemPresenca: 45 },
      titulo: 'Membros sem participação recente',
      acaoSugerida: 'Enviar comunicação para os membros ausentes.',
    },
    {
      id: 'lider_sem_atividade',
      categoria: 'Ministérios',
      severidade: 'WARNING',
      ativo: true,
      parametros: { diasSemPresenca: 45 },
      titulo: 'Líderes sem atividade recente',
      acaoSugerida: 'Verificar com a liderança se está tudo bem e oferecer suporte.',
    },
    {
      id: 'celula_sem_membros',
      categoria: 'Células',
      severidade: 'WARNING',
      ativo: true,
      parametros: {},
      titulo: 'Células sem membros vinculados',
      acaoSugerida: 'Revisar a necessidade de manter a célula ativa ou vincular membros.',
    },
    {
      id: 'celula_sem_lider',
      categoria: 'Células',
      severidade: 'CRITICAL',
      ativo: true,
      parametros: {},
      titulo: 'Células sem líder definido',
      acaoSugerida: 'Agendar reunião para definir um líder responsável pela célula.',
    },
    {
      id: 'ministerio_sem_membros',
      categoria: 'Ministérios',
      severidade: 'WARNING',
      ativo: true,
      parametros: {},
      titulo: 'Ministérios sem membros vinculados',
      acaoSugerida: 'Divulgar o ministério e convidar membros para participar.',
    },
    {
      id: 'saldo_financeiro_negativo',
      categoria: 'Financeiro',
      severidade: 'CRITICAL',
      ativo: true,
      parametros: {},
      titulo: 'Saldo financeiro negativo este mês',
      acaoSugerida: 'Revisar as despesas do mês e planejar ajustes no orçamento.',
    },

    // ----- Aguardando Fase 4.5 (Historical Metrics Engine) -----
    {
      id: 'queda_frequencia',
      categoria: 'Frequência',
      severidade: 'WARNING',
      ativo: false,
      parametros: { quedaPercentualMinima: 15 },
      titulo: 'Queda na frequência dos cultos',
      acaoSugerida: 'Enviar comunicação para os membros ausentes.',
    },
    {
      id: 'queda_arrecadacao',
      categoria: 'Financeiro',
      severidade: 'WARNING',
      ativo: false,
      parametros: { quedaPercentualMinima: 15 },
      titulo: 'Queda na arrecadação',
      acaoSugerida: 'Avaliar causas da queda e comunicar a liderança financeira.',
    },
    {
      id: 'aumento_pedidos_oracao',
      categoria: 'Membros',
      severidade: 'INFO',
      ativo: false,
      parametros: { aumentoPercentualMinimo: 50 },
      titulo: 'Aumento anormal de pedidos de oração',
      acaoSugerida: 'Avaliar se há uma situação específica afetando a congregação.',
    },
    {
      id: 'eventos_sem_inscritos',
      categoria: 'Eventos',
      severidade: 'INFO',
      ativo: false,
      parametros: {},
      titulo: 'Eventos sem inscritos',
      acaoSugerida: 'Divulgar o evento nos canais de comunicação da igreja.',
    },
    {
      id: 'visitantes_sem_acompanhamento',
      categoria: 'Visitantes',
      severidade: 'WARNING',
      ativo: false,
      parametros: { diasSemContato: 7 },
      titulo: 'Visitantes sem acompanhamento',
      acaoSugerida: 'Entrar em contato com os visitantes recentes.',
    },
  ],
};
