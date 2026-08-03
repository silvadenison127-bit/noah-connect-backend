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

  /**
   * Crescimento de membros (indicador inteligente, Fase 2).
   * Origem: usuarios.membro_desde | Módulo: Membros
   */
  async crescimento() {
    try {
      const { rows } = await pool.query(`
        SELECT
          date_trunc('month', membro_desde) AS mes,
          COUNT(*) AS total
        FROM usuarios
        WHERE ativo = true
          AND membro_desde >= date_trunc('month', CURRENT_DATE) - interval '6 months'
        GROUP BY date_trunc('month', membro_desde)
        ORDER BY mes ASC
      `);

      const mesAtualChave = new Date().toISOString().slice(0, 7);
      const porMes = {};
      rows.forEach((r) => {
        const chave = new Date(r.mes).toISOString().slice(0, 7);
        porMes[chave] = parseInt(r.total, 10);
      });

      const mesesHistoricos = Object.keys(porMes).filter((m) => m !== mesAtualChave);
      const totalAtual = porMes[mesAtualChave] ?? 0;

      if (mesesHistoricos.length === 0) {
        return {
          valor: null,
          estado: 'aguardando_dados',
          rotulo: 'Histórico insuficiente',
          mesAtual: totalAtual,
          mediaHistorica: null,
          mesesConsiderados: 0,
          ultimaAtualizacao: new Date().toISOString(),
          origem: 'usuarios',
        };
      }

      const somaHistorica = mesesHistoricos.reduce((s, m) => s + porMes[m], 0);
      const mediaHistorica = somaHistorica / mesesHistoricos.length;

      if (mediaHistorica === 0 && totalAtual === 0) {
        return {
          valor: 0,
          estado: 'aguardando_dados',
          rotulo: 'Aguardando histórico',
          mesAtual: totalAtual,
          mediaHistorica,
          mesesConsiderados: mesesHistoricos.length,
          ultimaAtualizacao: new Date().toISOString(),
          origem: 'usuarios',
        };
      }

      if (mediaHistorica === 0 && totalAtual > 0) {
        return {
          valor: null,
          estado: 'real',
          rotulo: 'Primeiro crescimento registrado',
          mesAtual: totalAtual,
          mediaHistorica,
          mesesConsiderados: mesesHistoricos.length,
          ultimaAtualizacao: new Date().toISOString(),
          origem: 'usuarios',
        };
      }

      const percentual = ((totalAtual - mediaHistorica) / mediaHistorica) * 100;

      const mesesOrdenados = [...mesesHistoricos].sort();
      const mesAnteriorChave = mesesOrdenados[mesesOrdenados.length - 1];
      const totalMesAnterior = porMes[mesAnteriorChave] ?? null;

      return {
        valor: Math.round(percentual * 10) / 10,
        estado: 'real',
        rotulo: `${percentual >= 0 ? '+' : ''}${Math.round(percentual * 10) / 10}%`,
        mesAtual: totalAtual,
        mediaHistorica: Math.round(mediaHistorica * 10) / 10,
        mesesConsiderados: mesesHistoricos.length,
        complementar: {
          mesAnterior: totalMesAnterior,
          variacaoMesAnterior: totalMesAnterior
            ? Math.round(((totalAtual - totalMesAnterior) / totalMesAnterior) * 1000) / 10
            : null,
        },
        ultimaAtualizacao: new Date().toISOString(),
        origem: 'usuarios',
      };
    } catch (err) {
      console.error('[metricsService] Erro ao calcular crescimento:', err.message);
      return {
        valor: null, estado: 'erro', rotulo: '—',
        ultimaAtualizacao: new Date().toISOString(), origem: 'usuarios',
      };
    }
  },

  /**
   * Retenção de membros (indicador inteligente, Fase 2).
   * Origem: usuarios.membro_desde, usuarios.ativo | Módulo: Membros
   */
  async retencao() {
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE membro_desde <= CURRENT_DATE - INTERVAL '180 days') AS elegiveis,
          COUNT(*) FILTER (
            WHERE membro_desde <= CURRENT_DATE - INTERVAL '180 days' AND ativo = true
          ) AS retidos,
          COUNT(*) FILTER (
            WHERE membro_desde > CURRENT_DATE - INTERVAL '180 days' AND ativo = true
          ) AS em_integracao
        FROM usuarios
      `);

      const elegiveis = parseInt(rows[0].elegiveis, 10);
      const retidos = parseInt(rows[0].retidos, 10);
      const emIntegracao = parseInt(rows[0].em_integracao, 10);

      if (elegiveis === 0) {
        return {
          valor: null,
          estado: 'aguardando_dados',
          rotulo: 'Histórico insuficiente',
          elegiveis: 0,
          retidos: 0,
          emIntegracao,
          ultimaAtualizacao: new Date().toISOString(),
          origem: 'usuarios',
        };
      }

      const percentual = (retidos / elegiveis) * 100;

      return {
        valor: Math.round(percentual * 10) / 10,
        estado: 'real',
        rotulo: `${Math.round(percentual)}%`,
        elegiveis,
        retidos,
        emIntegracao,
        ultimaAtualizacao: new Date().toISOString(),
        origem: 'usuarios',
      };
    } catch (err) {
      console.error('[metricsService] Erro ao calcular retencao:', err.message);
      return {
        valor: null, estado: 'erro', rotulo: '—',
        ultimaAtualizacao: new Date().toISOString(), origem: 'usuarios',
      };
    }
  },

  /**
   * Engajamento de membros (indicador inteligente, Fase 2).
   * Origem: presencas_culto, membros_celula, membros_ministerio | Módulo: Membros
   * Cultos (40%), Células (30%, proxy vínculo), Ministérios (30%, proxy vínculo).
   * Pesos redistribuídos proporcionalmente entre componentes com dado real.
   */
  async engajamento() {
    const JANELA_DIAS_CULTOS = 60;

    try {
      const totalAtivosRes = await pool.query(
        `SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`
      );
      const totalAtivos = parseInt(totalAtivosRes.rows[0].total, 10);

      if (totalAtivos === 0) {
        return {
          valor: null,
          estado: 'aguardando_dados',
          rotulo: 'Aguardando dados',
          componentes: [],
          ultimaAtualizacao: new Date().toISOString(),
          origem: 'usuarios',
        };
      }

      let cultos = { nome: 'Cultos', peso: 40, estado: 'aguardando_dados', percentual: null };
      try {
        const presencaRes = await pool.query(
          `SELECT COUNT(DISTINCT usuario_id) AS total
           FROM presencas_culto
           WHERE presente = true
             AND criado_em >= CURRENT_DATE - INTERVAL '${JANELA_DIAS_CULTOS} days'`
        );
        const totalComPresenca = parseInt(presencaRes.rows[0]?.total ?? 0, 10);

        const totalRegistrosRes = await pool.query(`SELECT COUNT(*) AS total FROM presencas_culto`);
        const totalRegistros = parseInt(totalRegistrosRes.rows[0].total, 10);

        if (totalRegistros === 0) {
          cultos.estado = 'aguardando_dados';
        } else {
          cultos.estado = 'real';
          cultos.percentual = (totalComPresenca / totalAtivos) * 100;
        }
      } catch (e) {
        console.warn('[metricsService] Engajamento/Cultos indisponível:', e.message);
        cultos.estado = 'indisponivel';
      }

      let celulas = { nome: 'Células', peso: 30, estado: 'aguardando_dados', percentual: null };
      try {
        const vinculadosRes = await pool.query(
          `SELECT COUNT(DISTINCT mc.usuario_id) AS total
           FROM membros_celula mc
           JOIN usuarios u ON u.id = mc.usuario_id AND u.ativo = true`
        );
        const totalVinculados = parseInt(vinculadosRes.rows[0]?.total ?? 0, 10);
        celulas.estado = 'real';
        celulas.percentual = (totalVinculados / totalAtivos) * 100;
      } catch (e) {
        console.warn('[metricsService] Engajamento/Células indisponível:', e.message);
        celulas.estado = 'indisponivel';
      }

      let ministerios = { nome: 'Ministérios', peso: 30, estado: 'aguardando_dados', percentual: null };
      try {
        const vinculadosRes = await pool.query(
          `SELECT COUNT(DISTINCT mm.usuario_id) AS total
           FROM membros_ministerio mm
           JOIN usuarios u ON u.id = mm.usuario_id AND u.ativo = true`
        );
        const totalVinculados = parseInt(vinculadosRes.rows[0]?.total ?? 0, 10);
        ministerios.estado = 'real';
        ministerios.percentual = (totalVinculados / totalAtivos) * 100;
      } catch (e) {
        console.warn('[metricsService] Engajamento/Ministérios indisponível:', e.message);
        ministerios.estado = 'indisponivel';
      }

      const componentes = [cultos, celulas, ministerios];
      const disponiveis = componentes.filter((c) => c.estado === 'real');

      if (disponiveis.length === 0) {
        return {
          valor: null,
          estado: 'aguardando_dados',
          rotulo: 'Aguardando dados',
          componentes,
          ultimaAtualizacao: new Date().toISOString(),
          origem: 'usuarios',
        };
      }

      const pesoTotalDisponivel = disponiveis.reduce((s, c) => s + c.peso, 0);
      const percentualFinal = disponiveis.reduce(
        (s, c) => s + c.percentual * (c.peso / pesoTotalDisponivel),
        0
      );

      return {
        valor: Math.round(percentualFinal * 10) / 10,
        estado: 'real',
        rotulo: `${Math.round(percentualFinal)}%`,
        componentes,
        janelaDiasCultos: JANELA_DIAS_CULTOS,
        ultimaAtualizacao: new Date().toISOString(),
        origem: 'usuarios',
      };
    } catch (err) {
      console.error('[metricsService] Erro ao calcular engajamento:', err.message);
      return {
        valor: null, estado: 'erro', rotulo: '—',
        ultimaAtualizacao: new Date().toISOString(), origem: 'usuarios',
      };
    }
  },

  /**
   * Status Financeiro (indicador inteligente, Fase 2).
   * Origem: dizimos_ofertas, despesas | Módulo: Financeiro
   * Classifica a tendência (margem média dos últimos até 3 meses com dado),
   * não o resultado de um único mês. Limiares centralizados abaixo.
   */
  async statusFinanceiro() {
    const LIMIAR_SAUDAVEL = 15; // margem média mínima para "Saudável" (%)
    const LIMIAR_CRITICO = -5;  // margem média abaixo disso é "Crítico" (%)

    try {
      const { rows } = await pool.query(`
        SELECT mes, SUM(receita) AS receita, SUM(despesa) AS despesa
        FROM (
          SELECT date_trunc('month', data_lancamento) AS mes, valor AS receita, 0 AS despesa
          FROM dizimos_ofertas
          WHERE data_lancamento >= date_trunc('month', CURRENT_DATE) - interval '2 months'
          UNION ALL
          SELECT date_trunc('month', data_lancamento) AS mes, 0 AS receita, valor AS despesa
          FROM despesas
          WHERE data_lancamento >= date_trunc('month', CURRENT_DATE) - interval '2 months'
        ) t
        GROUP BY mes
        ORDER BY mes ASC
      `);

      if (rows.length === 0) {
        return {
          valor: null,
          estado: 'aguardando_dados',
          classificacao: 'aguardando_dados',
          rotulo: 'Histórico insuficiente',
          mesesConsiderados: 0,
          ultimaAtualizacao: new Date().toISOString(),
          origem: 'financeiro',
        };
      }

      const meses = rows.map((r) => {
        const receita = parseFloat(r.receita);
        const despesa = parseFloat(r.despesa);
        const saldo = receita - despesa;
        let margem;
        if (receita > 0) {
          margem = (saldo / receita) * 100;
        } else if (despesa > 0) {
          margem = -100;
        } else {
          margem = null;
        }
        return { mes: r.mes, receita, despesa, saldo, margem };
      }).filter((m) => m.margem !== null);

      if (meses.length === 0) {
        return {
          valor: null,
          estado: 'aguardando_dados',
          classificacao: 'aguardando_dados',
          rotulo: 'Histórico insuficiente',
          mesesConsiderados: 0,
          ultimaAtualizacao: new Date().toISOString(),
          origem: 'financeiro',
        };
      }

      const margemMedia = meses.reduce((s, m) => s + m.margem, 0) / meses.length;
      const todosNegativos = meses.every((m) => m.saldo < 0);

      let classificacao;
      if (meses.length === 1) {
        classificacao = margemMedia >= LIMIAR_SAUDAVEL ? 'saudavel' : 'atencao';
      } else if (todosNegativos) {
        classificacao = 'critico';
      } else if (margemMedia >= LIMIAR_SAUDAVEL) {
        classificacao = 'saudavel';
      } else if (margemMedia < LIMIAR_CRITICO) {
        classificacao = 'critico';
      } else {
        classificacao = 'atencao';
      }

      const ROTULOS = { saudavel: 'Saudável', atencao: 'Atenção', critico: 'Crítico' };

      return {
        valor: Math.round(margemMedia * 10) / 10,
        estado: 'real',
        classificacao,
        rotulo: ROTULOS[classificacao],
        mesesConsiderados: meses.length,
        margemMedia: Math.round(margemMedia * 10) / 10,
        limiares: { saudavel: LIMIAR_SAUDAVEL, critico: LIMIAR_CRITICO },
        ultimaAtualizacao: new Date().toISOString(),
        origem: 'financeiro',
      };
    } catch (err) {
      console.error('[metricsService] Erro ao calcular statusFinanceiro:', err.message);
      return {
        valor: null, estado: 'erro', classificacao: 'erro', rotulo: '—',
        ultimaAtualizacao: new Date().toISOString(), origem: 'financeiro',
      };
    }
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