const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const dashboardService = require('../services/dashboardService');
const router = express.Router();

router.get('/', autenticar, somenteAdmin, async (req, res) => {
  // ===== BLOCO 1: dados já existentes (não alterado) =====
  let statsBase;
  try {
    const [membros, eventosMes, pedidos, financeiro] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM usuarios WHERE ativo = true`),
      pool.query(`SELECT COUNT(*) FROM eventos WHERE date_trunc('month', data_inicio) = date_trunc('month', NOW())`),
      pool.query(`SELECT COUNT(*) FROM pedidos_oracao WHERE status = 'em_oracao'`),
      pool.query(
        `SELECT COALESCE(SUM(valor), 0) AS total
         FROM dizimos_ofertas
         WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)`
      )
    ]);

    const entradas = parseFloat(financeiro.rows[0].total);

    // saídas reais (se a tabela "despesas" existir); senão, assume 0 sem quebrar o resto
    let saidas = 0;
    try {
      const despesasRes = await pool.query(
        `SELECT COALESCE(SUM(valor), 0) AS total
         FROM despesas
         WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)`
      );
      saidas = parseFloat(despesasRes.rows[0].total);
    } catch (e) {
      console.warn('Tabela "despesas" não encontrada ou erro ao consultar saídas:', e.message);
    }

    statsBase = {
      membros_ativos: parseInt(membros.rows[0].count, 10),
      eventos_este_mes: parseInt(eventosMes.rows[0].count, 10),
      pedidos_em_oracao: parseInt(pedidos.rows[0].count, 10),
      financeiro: {
        entradas,
        saidas,
        saldo: entradas - saidas
      }
    };
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao buscar estatísticas' });
  }

  // ===== BLOCO 2: indicadores estratégicos (Fase 3) =====
  // Isolado em try/catch próprio: se algo falhar aqui, o Bloco 1 acima
  // já foi enviado com sucesso e o dashboard continua funcionando.
  const indicadores = {
    crescimento: null,
    retencao: null,
    financeiro_status: null,
    engajamento: null,
    igreja_saudavel: null,
    ia_score: null,
    seguranca: { status: 'em_configuracao', label: 'Em configuração' },
  };

  try {
    const totalAtivosRes = await pool.query(`SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`);
    const totalAtivos = parseInt(totalAtivosRes.rows[0].total, 10);

    // --- Crescimento: membros ativos hoje vs. no fim do mês passado ---
    try {
      const mesAnteriorRes = await pool.query(
        `SELECT COUNT(*) AS total FROM usuarios
         WHERE ativo = true AND membro_desde <= date_trunc('month', NOW()) - interval '1 day'`
      );
      const totalMesAnterior = parseInt(mesAnteriorRes.rows[0].total, 10);
      const crescimentoPct = totalMesAnterior > 0
        ? ((totalAtivos - totalMesAnterior) / totalMesAnterior) * 100
        : 0;
      indicadores.crescimento = {
        percentual: Math.round(crescimentoPct * 10) / 10,
        label: `${crescimentoPct >= 0 ? '+' : ''}${Math.round(crescimentoPct * 10) / 10}%`
      };
    } catch (e) {
      console.warn('Erro ao calcular crescimento:', e.message);
    }

    // --- Retenção: % de membros ativos há mais de 90 dias ---
    try {
      const retidosRes = await pool.query(
        `SELECT COUNT(*) AS total FROM usuarios
         WHERE ativo = true AND membro_desde <= NOW() - interval '90 days'`
      );
      const retidos = parseInt(retidosRes.rows[0].total, 10);
      const retencaoPct = totalAtivos > 0 ? (retidos / totalAtivos) * 100 : 0;
      indicadores.retencao = {
        percentual: Math.round(retencaoPct * 10) / 10,
        label: `${Math.round(retencaoPct)}%`
      };
    } catch (e) {
      console.warn('Erro ao calcular retenção:', e.message);
    }

    // --- Financeiro: saldo positivo nos últimos 3 meses? ---
    try {
      const financeiro3mRes = await pool.query(
        `SELECT
           COALESCE((SELECT SUM(valor) FROM dizimos_ofertas WHERE data_lancamento >= NOW() - interval '3 months'), 0) AS entradas,
           COALESCE((SELECT SUM(valor) FROM despesas WHERE data_lancamento >= NOW() - interval '3 months'), 0) AS saidas`
      );
      const entradas3m = parseFloat(financeiro3mRes.rows[0].entradas);
      const saidas3m = parseFloat(financeiro3mRes.rows[0].saidas);
      const saudavel = entradas3m >= saidas3m;
      indicadores.financeiro_status = {
        saudavel,
        label: saudavel ? 'Saudável' : 'Atenção'
      };
    } catch (e) {
      console.warn('Erro ao calcular status financeiro:', e.message);
    }

    // --- Engajamento: % de membros ativos com presença registrada em cultos nos últimos 30 dias ---
    try {
      const engajadosRes = await pool.query(
        `SELECT COUNT(DISTINCT p.usuario_id) AS total
         FROM presencas_culto p
         JOIN eventos e ON e.id = p.evento_id
         WHERE p.presente = true AND e.tipo = 'culto' AND e.data_inicio >= NOW() - interval '30 days'`
      );
      const engajados = parseInt(engajadosRes.rows[0].total, 10);
      const engajamentoPct = totalAtivos > 0 ? (engajados / totalAtivos) * 100 : 0;
      indicadores.engajamento = {
        percentual: Math.round(engajamentoPct * 10) / 10,
        label: `${Math.round(engajamentoPct)}%`
      };
    } catch (e) {
      console.warn('Erro ao calcular engajamento (tabela "presencas" ou "cultos"):', e.message);
    }

    // --- Igreja Saudável: composto ponderado dos indicadores acima ---
    // freq/engajamento 30% + retenção 25% + crescimento 25% + financeiro 20%
    const engajamentoScore = indicadores.engajamento?.percentual ?? null;
    const retencaoScore = indicadores.retencao?.percentual ?? null;
    const crescimentoScore = indicadores.crescimento
      ? Math.min(Math.max(50 + indicadores.crescimento.percentual * 2, 0), 100)
      : null;
    const financeiroScore = indicadores.financeiro_status
      ? (indicadores.financeiro_status.saudavel ? 100 : 40)
      : null;

    const partes = [
      { valor: engajamentoScore, peso: 0.30 },
      { valor: retencaoScore, peso: 0.25 },
      { valor: crescimentoScore, peso: 0.25 },
      { valor: financeiroScore, peso: 0.20 },
    ].filter(p => p.valor !== null);

    if (partes.length > 0) {
      const pesoTotal = partes.reduce((s, p) => s + p.peso, 0);
      const scoreFinal = partes.reduce((s, p) => s + p.valor * p.peso, 0) / pesoTotal;
      indicadores.igreja_saudavel = {
        percentual: Math.round(scoreFinal),
        label: `${Math.round(scoreFinal)}%`
      };
      indicadores.ia_score = {
        pontos: Math.round(scoreFinal * 0.7 + (engajamentoScore ?? scoreFinal) * 0.3),
        label: `${Math.round(scoreFinal * 0.7 + (engajamentoScore ?? scoreFinal) * 0.3)}/100`
      };
    }
  } catch (err) {
    console.error('Erro geral ao calcular indicadores estratégicos:', err);
  }

  // ===== BLOCO 3: Saúde da Igreja detalhada (Fase 4.1) =====
  const saude_detalhada = await dashboardService.obterSaudeDetalhada(pool);

  // ===== BLOCO 4: Alertas Inteligentes (Fase 4.2) =====
  const alertas = await dashboardService.obterAlertas(pool);

  // ===== BLOCO 5: Recomendações (Fase 4.3) =====
  const recomendacoes = dashboardService.obterRecomendacoes(alertas);

  // ===== BLOCO 6: Previsões (Fase 4.4) =====
  // Apenas infraestrutura: sem histórico (Fase 4.5), sempre honesto
  // sobre dados insuficientes — nenhum valor estimado é inventado.
  const previsoes = await dashboardService.obterPrevisoes(pool);

  res.json({ ...statsBase, indicadores, saude_detalhada, alertas, recomendacoes, previsoes });
});

module.exports = router;
