/**
 * metricsService.js
 * ----------------------------------------------------------------------------
 * Camada ÚNICA e oficial de métricas do Sistema Noah.
 *
 * Fonte de verdade para: Dashboard, Executive BI, IA Noah, Relatórios.
 * Nenhum desses módulos deve consultar tabelas diretamente — todos passam aqui.
 *
 * Contrato de retorno (SEMPRE este formato, nunca número solto):
 *   {
 *     valor: <number | null>,
 *     estado: "real" | "aguardando_dados" | "indisponivel" | "erro",
 *     ultimaAtualizacao: <ISO string>,
 *     origem: <string>   // tabela/módulo de origem
 *   }
 *
 * Estados:
 *   real             -> dado consultado com sucesso (inclusive zero legítimo)
 *   aguardando_dados -> tabela existe mas está vazia / sem base para o cálculo
 *   indisponivel     -> recurso não existe (tabela ausente, feature não modelada)
 *   erro             -> falha inesperada na consulta
 *
 * Princípios: responsabilidade única por método, DRY via helpers,
 * desacoplado do transporte (não conhece req/res).
 * ----------------------------------------------------------------------------
 */

const pool = require('../config/db');
const securityService = require('./securityService');

/** Monta o objeto padronizado de KPI. */
function kpi(valor, estado, origem) {
  return {
    valor,
    estado,
    ultimaAtualizacao: new Date().toISOString(),
    origem,
  };
}

/**
 * Helper central de contagem.
 * Executa um COUNT parametrizado, trata erro e carimba o estado.
 */
async function contar(sql, params, origem, opts = {}) {
  try {
    const { rows } = await pool.query(sql, params);
    const total = parseInt(rows[0]?.total ?? 0, 10);

    if (total === 0 && opts.zeroComoAguardando) {
      return kpi(0, 'aguardando_dados', origem);
    }
    return kpi(total, 'real', origem);
  } catch (err) {
    console.error(`[metricsService] Erro ao contar em "${origem}":`, err.message);
    return kpi(null, 'erro', origem);
  }
}

/**
 * Helper de soma monetária.
 * Executa um SUM(valor) e trata o "vazio vs zero" de forma honesta.
 */
async function somar(sql, params, origem) {
  try {
    const { rows } = await pool.query(sql, params);
    const total = parseFloat(rows[0]?.total ?? 0);
    const qtd = parseInt(rows[0]?.qtd ?? 0, 10);

    if (qtd === 0) {
      return kpi(0, 'aguardando_dados', origem);
    }
    return kpi(total, 'real', origem);
  } catch (err) {
    console.error(`[metricsService] Erro ao somar em "${origem}":`, err.message);
    return kpi(null, 'erro', origem);
  }
}

const metricsService = {
  /**
   * Membros ativos.
   * Tabela: usuarios | Regra: ativo = true | Módulo: Membros
   */
  membrosAtivos() {
    return contar(
      `SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`,
      [],
      'usuarios'
    );
  },

  /**
   * Administradores.
   * Tabela: usuarios | Regra: tipo = 'admin' | Módulo: Membros/Acesso
   */
  administradores() {
    return contar(
      `SELECT COUNT(*) AS total FROM usuarios WHERE tipo = 'admin'`,
      [],
      'usuarios'
    );
  },

  /**
   * Líderes.
   * Tabela: usuarios | Regra: tipo = 'lider' | Módulo: Membros/Acesso
   */
  lideres() {
    return contar(
      `SELECT COUNT(*) AS total FROM usuarios WHERE tipo = 'lider'`,
      [],
      'usuarios'
    );
  },

  /**
   * Total de células.
   * Tabela: celulas | Regra: COUNT(*) | Módulo: Células
   */
  celulas() {
    return contar(`SELECT COUNT(*) AS total FROM celulas`, [], 'celulas');
  },

  /**
   * Total de ministérios.
   * Tabela: ministerios | Regra: COUNT(*) | Módulo: Ministérios
   */
  ministerios() {
    return contar(`SELECT COUNT(*) AS total FROM ministerios`, [], 'ministerios');
  },

  /**
   * Cursos ativos.
   * Tabela: cursos | Regra: ativo = true | Módulo: Cursos
   */
  cursos() {
    return contar(
      `SELECT COUNT(*) AS total FROM cursos WHERE ativo = true`,
      [],
      'cursos'
    );
  },

  /**
   * Total de turmas.
   * Tabela: turmas | Regra: COUNT(*) | Módulo: Cursos
   */
  turmas() {
    return contar(`SELECT COUNT(*) AS total FROM turmas`, [], 'turmas');
  },

  /**
   * Eventos deste mês.
   * Tabela: eventos | Regra: data_inicio no mês corrente | Módulo: Agenda/Eventos
   */
  eventosDoMes() {
    return contar(
      `SELECT COUNT(*) AS total FROM eventos
       WHERE date_trunc('month', data_inicio) = date_trunc('month', CURRENT_DATE)`,
      [],
      'eventos'
    );
  },

  /**
   * Próximos eventos.
   * Tabela: eventos | Regra: data_inicio >= agora | Módulo: Agenda/Eventos
   */
  proximosEventos() {
    return contar(
      `SELECT COUNT(*) AS total FROM eventos WHERE data_inicio >= NOW()`,
      [],
      'eventos'
    );
  },

  /**
   * Pedidos de oração.
   * Tabela: pedidos_oracao | Regra: COUNT(*) | Módulo: Pedidos de Oração
   */
  pedidosOracao() {
    return contar(
      `SELECT COUNT(*) AS total FROM pedidos_oracao`,
      [],
      'pedidos_oracao'
    );
  },

  /**
   * Notícias publicadas.
   * Tabela: noticias | Regra: COUNT(*) | Módulo: Notícias
   */
  noticias() {
    return contar(`SELECT COUNT(*) AS total FROM noticias`, [], 'noticias');
  },

  /**
   * Comunicados.
   * Tabela: comunicados | Regra: COUNT(*) | Módulo: Comunicações
   */
  comunicados() {
    return contar(`SELECT COUNT(*) AS total FROM comunicados`, [], 'comunicados');
  },

  /**
   * Estudos bíblicos.
   * Tabela: estudos_biblicos | Regra: COUNT(*) | Módulo: Estudos
   */
  estudosBiblicos() {
    return contar(
      `SELECT COUNT(*) AS total FROM estudos_biblicos`,
      [],
      'estudos_biblicos'
    );
  },

  /**
   * Receita do mês.
   * Tabela: dizimos_ofertas | Regra: SUM(valor) no mês corrente | Módulo: Financeiro
   */
  receitaDoMes() {
    return somar(
      `SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*) AS qtd
       FROM dizimos_ofertas
       WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)`,
      [],
      'dizimos_ofertas'
    );
  },

  /**
   * Despesa do mês.
   * Tabela: despesas | Regra: SUM(valor) no mês corrente | Módulo: Financeiro
   */
  despesaDoMes() {
    return somar(
      `SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*) AS qtd
       FROM despesas
       WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)`,
      [],
      'despesas'
    );
  },

  /**
   * Saldo do mês (receita - despesa).
   * Origem: dizimos_ofertas + despesas | Módulo: Financeiro
   * Estado: 'real' se houver qualquer lançamento; senão 'aguardando_dados'.
   */
  async saldoDoMes() {
    const [receita, despesa] = await Promise.all([
      this.receitaDoMes(),
      this.despesaDoMes(),
    ]);

    if (receita.estado === 'erro' || despesa.estado === 'erro') {
      return kpi(null, 'erro', 'financeiro');
    }

    const houveMovimento = receita.estado === 'real' || despesa.estado === 'real';
    const valorReceita = receita.valor ?? 0;
    const valorDespesa = despesa.valor ?? 0;
    const saldo = valorReceita - valorDespesa;

    return kpi(saldo, houveMovimento ? 'real' : 'aguardando_dados', 'financeiro');
  },

  /**
   * Segurança do sistema (indicador composto, modular).
   * Delega ao securityService (responsabilidade única).
   * Origem: usuarios, configuracoes_igreja, refresh_tokens | Módulo: Segurança
   */
  seguranca() {
    return securityService.avaliar(pool);
  },

  /**
   * Agrega todos os KPIs da Fase 1 (contagens + financeiro) numa resposta.
   */
  async coletarContagens() {
    const [
      membrosAtivos, administradores, lideres, celulas, ministerios,
      cursos, turmas, eventosDoMes, proximosEventos, pedidosOracao,
      noticias, comunicados, estudosBiblicos,
      receitaDoMes, despesaDoMes, saldoDoMes,
    ] = await Promise.all([
      this.membrosAtivos(), this.administradores(), this.lideres(),
      this.celulas(), this.ministerios(), this.cursos(), this.turmas(),
      this.eventosDoMes(), this.proximosEventos(), this.pedidosOracao(),
      this.noticias(), this.comunicados(), this.estudosBiblicos(),
      this.receitaDoMes(), this.despesaDoMes(), this.saldoDoMes(),
    ]);

    return {
      membrosAtivos, administradores, lideres, celulas, ministerios,
      cursos, turmas, eventosDoMes, proximosEventos, pedidosOracao,
      noticias, comunicados, estudosBiblicos,
      receitaDoMes, despesaDoMes, saldoDoMes,
    };
  },
};

module.exports = metricsService;