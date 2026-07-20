/**
 * healthScoreEngine.js
 *
 * Responsabilidade única: calcular os indicadores de "Saúde da Igreja"
 * a partir de dados reais do banco. Não depende de nenhum outro engine.
 * Recebe o `pool` de conexão e devolve um objeto plano — quem chama
 * (dashboardService) decide o que fazer com o resultado.
 *
 * Cada sub-indicador é calculado em bloco try/catch isolado: se uma
 * tabela ainda não existir ou tiver nome diferente do esperado, aquele
 * indicador específico volta como `null` (com um motivo), sem derrubar
 * os demais nem o restante do dashboard.
 */
const config = require('../config/health.config');

async function calcularFrequenciaCultos(pool) {
  const totalAtivosRes = await pool.query(`SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`);
  const totalAtivos = parseInt(totalAtivosRes.rows[0].total, 10);
  if (totalAtivos === 0) return { percentual: 0, label: '0%' };

  const presentesRes = await pool.query(
    `SELECT COUNT(DISTINCT p.usuario_id) AS total
     FROM presencas_culto p
     JOIN eventos e ON e.id = p.evento_id
     WHERE p.presente = true
       AND e.tipo = 'culto'
       AND e.data_inicio >= NOW() - interval '${config.janelas.frequenciaCultosDias} days'`
  );
  const presentes = parseInt(presentesRes.rows[0].total, 10);
  const percentual = Math.round((presentes / totalAtivos) * 1000) / 10;
  return { percentual, label: `${percentual}%` };
}

async function calcularParticipacaoCelulas(pool) {
  const totalAtivosRes = await pool.query(`SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`);
  const totalAtivos = parseInt(totalAtivosRes.rows[0].total, 10);
  if (totalAtivos === 0) return { percentual: 0, label: '0%' };

  const vinculadosRes = await pool.query(
    `SELECT COUNT(DISTINCT usuario_id) AS total FROM membros_celula`
  );
  const vinculados = parseInt(vinculadosRes.rows[0].total, 10);
  const percentual = Math.round((vinculados / totalAtivos) * 1000) / 10;
  return { percentual, label: `${percentual}%` };
}

async function calcularParticipacaoMinisterios(pool) {
  const totalAtivosRes = await pool.query(`SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`);
  const totalAtivos = parseInt(totalAtivosRes.rows[0].total, 10);
  if (totalAtivos === 0) return { percentual: 0, label: '0%' };

  const vinculadosRes = await pool.query(
    `SELECT COUNT(DISTINCT usuario_id) AS total FROM membros_ministerio`
  );
  const vinculados = parseInt(vinculadosRes.rows[0].total, 10);
  const percentual = Math.round((vinculados / totalAtivos) * 1000) / 10;
  return { percentual, label: `${percentual}%` };
}

async function calcularCrescimento(pool) {
  const totalAtivosRes = await pool.query(`SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`);
  const totalAtivos = parseInt(totalAtivosRes.rows[0].total, 10);

  const mesAnteriorRes = await pool.query(
    `SELECT COUNT(*) AS total FROM usuarios
     WHERE ativo = true AND membro_desde <= date_trunc('month', NOW()) - interval '1 day'`
  );
  const totalMesAnterior = parseInt(mesAnteriorRes.rows[0].total, 10);
  const percentual = totalMesAnterior > 0
    ? Math.round(((totalAtivos - totalMesAnterior) / totalMesAnterior) * 1000) / 10
    : 0;
  return { percentual, label: `${percentual >= 0 ? '+' : ''}${percentual}%` };
}

async function calcularRetencao(pool) {
  const totalAtivosRes = await pool.query(`SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`);
  const totalAtivos = parseInt(totalAtivosRes.rows[0].total, 10);
  if (totalAtivos === 0) return { percentual: 0, label: '0%' };

  const retidosRes = await pool.query(
    `SELECT COUNT(*) AS total FROM usuarios
     WHERE ativo = true AND membro_desde <= NOW() - interval '${config.janelas.retencaoMinimaDias} days'`
  );
  const retidos = parseInt(retidosRes.rows[0].total, 10);
  const percentual = Math.round((retidos / totalAtivos) * 1000) / 10;
  return { percentual, label: `${percentual}%` };
}

async function calcularParticipacaoEventos(pool) {
  const totalAtivosRes = await pool.query(`SELECT COUNT(*) AS total FROM usuarios WHERE ativo = true`);
  const totalAtivos = parseInt(totalAtivosRes.rows[0].total, 10);
  if (totalAtivos === 0) return { percentual: 0, label: '0%' };

  const presentesRes = await pool.query(
    `SELECT COUNT(DISTINCT p.usuario_id) AS total
     FROM presencas_culto p
     JOIN eventos e ON e.id = p.evento_id
     WHERE p.presente = true
       AND e.data_inicio >= NOW() - interval '${config.janelas.participacaoEventosDias} days'`
  );
  const presentes = parseInt(presentesRes.rows[0].total, 10);
  const percentual = Math.round((presentes / totalAtivos) * 1000) / 10;
  return { percentual, label: `${percentual}%` };
}

async function contarPedidosOracaoAtivos(pool) {
  const res = await pool.query(`SELECT COUNT(*) AS total FROM pedidos_oracao WHERE status = 'em_oracao'`);
  const total = parseInt(res.rows[0].total, 10);
  return { total, label: `${total}` };
}

/**
 * Executa uma função de cálculo com segurança: se a query falhar
 * (ex: tabela não existe ainda), devolve null + motivo em vez de
 * derrubar os outros indicadores.
 */
async function comSeguranca(fn, pool) {
  try {
    return await fn(pool);
  } catch (err) {
    return { percentual: null, label: 'Indisponível', motivo: err.message };
  }
}

/**
 * Calcula o objeto completo de Saúde da Igreja.
 * @param {import('pg').Pool} pool
 * @returns {Promise<object>}
 */
async function calcularSaudeIgreja(pool) {
  const [
    frequenciaCultos,
    participacaoCelulas,
    participacaoMinisterios,
    crescimento,
    retencao,
    participacaoEventos,
    pedidosOracaoAtivos,
  ] = await Promise.all([
    comSeguranca(calcularFrequenciaCultos, pool),
    comSeguranca(calcularParticipacaoCelulas, pool),
    comSeguranca(calcularParticipacaoMinisterios, pool),
    comSeguranca(calcularCrescimento, pool),
    comSeguranca(calcularRetencao, pool),
    comSeguranca(calcularParticipacaoEventos, pool),
    comSeguranca(contarPedidosOracaoAtivos, pool),
  ]);

  // "Visitantes recorrentes" ainda não é rastreável: o sistema atual
  // não distingue "visitante" como tipo de usuário. Fica honesto como
  // indisponível em vez de estimar um número sem dado real por trás.
  const visitantesRecorrentes = { percentual: null, label: 'Sem dado disponível' };

  const indicadores = {
    frequenciaCultos,
    participacaoCelulas,
    participacaoMinisterios,
    crescimento,
    retencao,
    visitantesRecorrentes,
    participacaoEventos,
    pedidosOracaoAtivos, // informativo, não entra no score ponderado
  };

  // Média ponderada apenas dos indicadores disponíveis (percentual != null),
  // renormalizando os pesos para não penalizar por indicador ausente.
  const partes = Object.entries(config.pesos)
    .map(([chave, peso]) => ({ valor: indicadores[chave]?.percentual, peso }))
    .filter((p) => typeof p.valor === 'number')
    // Trava cada indicador em 0-100 apenas para o score geral — um
    // crescimento de +600% não pode valer 6x mais que os 100% de um
    // indicador "perfeito". Os valores individuais exibidos (ex: a barra
    // de Crescimento) continuam mostrando o percentual real, sem corte.
    .map((p) => ({ ...p, valor: Math.min(Math.max(p.valor, 0), 100) }));

  let scoreGeral = null;
  if (partes.length > 0) {
    const pesoTotal = partes.reduce((s, p) => s + p.peso, 0);
    scoreGeral = Math.min(Math.round(partes.reduce((s, p) => s + p.valor * p.peso, 0) / pesoTotal), 100);
  }

  return {
    score: scoreGeral,
    label: scoreGeral !== null ? `${scoreGeral}%` : 'Dados insuficientes',
    indicadores,
  };
}

module.exports = { calcularSaudeIgreja };
