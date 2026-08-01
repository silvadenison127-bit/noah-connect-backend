/**
 * aiNoahService.js
 *
 * Camada de orquestracao do modulo IA Noah. Reune um resumo dos dados
 * reais da igreja (usando as mesmas fontes que ja alimentam o
 * Dashboard) e repassa esse contexto para o anthropicService, que
 * decide se responde em modo real ou em modo demonstracao.
 *
 * Nenhuma chamada direta ao banco deve conter regra de negocio nova
 * aqui - reaproveitamos os engines e queries ja existentes sempre que
 * possivel, seguindo o mesmo padrao do dashboardService.
 */

const anthropicService = require('./anthropicService');

async function montarContexto(pool) {
  try {
    const [membros, celulas, dizimos, cultos, oracao] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM usuarios WHERE ativo = true`),
      pool.query(`SELECT COUNT(*) FROM celulas`),
      pool.query(`SELECT COALESCE(SUM(valor), 0) AS total FROM dizimos_ofertas WHERE data_lancamento >= date_trunc('month', CURRENT_DATE)`),
      pool.query(`SELECT COUNT(*) FROM eventos WHERE tipo = 'culto' AND data_inicio >= CURRENT_DATE`),
      pool.query(`SELECT COUNT(*) FROM pedidos_oracao WHERE status != 'encerrado'`),
    ]);

    return {
      totalMembrosAtivos: parseInt(membros.rows[0].count, 10),
      totalCelulas: parseInt(celulas.rows[0].count, 10),
      dizimosEsteMes: parseFloat(dizimos.rows[0].total),
      proximosCultos: parseInt(cultos.rows[0].count, 10),
      pedidosOracaoAtivos: parseInt(oracao.rows[0].count, 10),
      resumoTextual: `${membros.rows[0].count} membros ativos, ${celulas.rows[0].count} celulas cadastradas, ` +
        `${oracao.rows[0].count} pedidos de oracao ativos`,
      geradoEm: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Erro ao montar contexto da IA Noah:', err);
    return { resumoTextual: 'dados indisponiveis no momento', erro: true };
  }
}

async function responderPergunta(pool, { pergunta, historico }) {
  const contexto = await montarContexto(pool);
  const resultado = await anthropicService.perguntar({ pergunta, contexto, historico });
  return { ...resultado, contexto };
}

function obterStatus() {
  return {
    modo: anthropicService.chaveConfigurada() ? 'real' : 'demonstracao',
  };
}

module.exports = { responderPergunta, obterStatus, montarContexto };