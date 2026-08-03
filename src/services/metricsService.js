const pool = require('../config/db');
const securityService = require('./securityService');

function kpi(valor, estado, origem) {
  return {
    valor,
    estado,
    ultimaAtualizacao: new Date().toISOString(),
    origem,
  };
}

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
  membrosAtivos() {
    return contar(`SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`, [], 'usuarios');
  },

  administradores() {
    return contar(`SELECT COUNT(*) AS total FROM usuarios WHERE tipo = 'admin'`, [], 'usuarios');
  },

  lideres() {
    return contar(`SELECT COUNT(*) AS total FROM usuarios WHERE tipo = 'lider'`, [], 'usuarios');
  },

  celulas() {
    return contar(`SELECT COUNT(*) AS total FROM celulas`, [], 'celulas');
  },

  ministerios() {
    return contar(`SELECT COUNT(*) AS total FROM ministerios`, [], 'ministerios');
  },

  cursos() {
    return contar(`SELECT COUNT(*) AS total FROM cursos WHERE ativo = true`, [], 'cursos');
  },

  turmas() {
    return contar(`SELECT COUNT(*) AS total FROM turmas`, [], 'turmas');
  },

  eventosDoMes() {
    return contar(
      `SELECT COUNT(*) AS total FROM eventos
       WHERE date_trunc('month', data_inicio) = date_trunc('month', CURRENT_DATE)`,
      [], 'eventos'
    );
  },

  proximosEventos() {
    return contar(`SELECT COUNT(*) AS total FROM eventos WHERE data_inicio >= NOW()`, [], 'eventos');
  },

  pedidosOracao() {
    return contar(`SELECT COUNT(*) AS total FROM pedidos_oracao`, [], 'pedidos_oracao');
  },

  noticias() {
    return contar(`SELECT COUNT(*) AS total FROM noticias`, [], 'noticias');
  },

  comunicados() {
    return contar(`SELECT COUNT(*) AS total FROM comunicados`, [], 'comunicados');
  },

  estudosBiblicos() {
    return contar(`SELECT COUNT(*) AS total FROM estudos_biblicos`, [], 'estudos_biblicos');
  },

  receitaDoMes() {
    return somar(
      `SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*) AS qtd
       FROM dizimos_ofertas
       WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)`,
      [], 'dizimos_ofertas'
    );
  },

  despesaDoMes() {
    return somar(
      `SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*) AS qtd
       FROM despesas
       WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)`,
      [], 'despesas'
    );
  },

  async saldoDoMes() {
    const [receita, despesa] = await Promise.all([this.receitaDoMes(), this.despesaDoMes()]);
    if (receita.estado === 'erro' || despesa.estado === 'erro') {
      return kpi(null, 'erro', 'financeiro');
    }
    const houveMovimento = receita.estado === 'real' || despesa.estado === 'real';
    const valorReceita = receita.valor ?? 0;
    const valorDespesa = despesa.valor ?? 0;
    const saldo = valorReceita - valorDespesa;
    return kpi(saldo, houveMovimento ? 'real' : 'aguardando_dados', 'financeiro');
  },

  seguranca() {
    return securityService.avaliar(pool);
  },

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