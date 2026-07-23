/**
 * historicalMetricsEngine.js
 *
 * Responsabilidade única: montar séries históricas mensais a partir
 * dos dados reais já existentes (usuarios, dizimos_ofertas,
 * presencas_culto). Calculado sob demanda — sem depender de cron ou
 * de uma tabela de snapshots dedicada.
 *
 * Quando o Railway (ou outro ambiente) tiver suporte a tarefas
 * agendadas, este engine pode evoluir para ler snapshots
 * pré-calculados em vez de agregar em tempo real — a interface de
 * retorno (lista de {periodo, valor}) permanece a mesma, então nada
 * que consome este engine precisa mudar.
 */
const config = require('../config/historical.config');

async function serieMembros(pool, meses) {
  const res = await pool.query(
    `SELECT to_char(gs, 'YYYY-MM') AS periodo,
            (SELECT COUNT(*) FROM usuarios
             WHERE ativo = true AND membro_desde <= (gs + interval '1 month' - interval '1 day')
            ) AS valor
     FROM generate_series(
       date_trunc('month', NOW()) - interval '${meses - 1} months',
       date_trunc('month', NOW()),
       interval '1 month'
     ) AS gs
     ORDER BY gs`
  );
  return res.rows.map((r) => ({ periodo: r.periodo, valor: parseInt(r.valor, 10) }));
}

async function serieArrecadacao(pool, meses) {
  const res = await pool.query(
    `SELECT to_char(gs, 'YYYY-MM') AS periodo,
            COALESCE((
              SELECT SUM(valor) FROM dizimos_ofertas
              WHERE date_trunc('month', data_lancamento) = gs
            ), 0) AS valor
     FROM generate_series(
       date_trunc('month', NOW()) - interval '${meses - 1} months',
       date_trunc('month', NOW()),
       interval '1 month'
     ) AS gs
     ORDER BY gs`
  );
  return res.rows.map((r) => ({ periodo: r.periodo, valor: parseFloat(r.valor) }));
}

async function serieFrequencia(pool, meses) {
  const res = await pool.query(
    `SELECT to_char(gs, 'YYYY-MM') AS periodo,
            COALESCE((
              SELECT COUNT(DISTINCT p.usuario_id)
              FROM presencas_culto p
              JOIN eventos e ON e.id = p.evento_id
              WHERE p.presente = true
                AND e.tipo = 'culto'
                AND date_trunc('month', e.data_inicio) = gs
            ), 0) AS valor
     FROM generate_series(
       date_trunc('month', NOW()) - interval '${meses - 1} months',
       date_trunc('month', NOW()),
       interval '1 month'
     ) AS gs
     ORDER BY gs`
  );
  return res.rows.map((r) => ({ periodo: r.periodo, valor: parseInt(r.valor, 10) }));
}

const CALCULADORES = {
  membros: serieMembros,
  arrecadacao: serieArrecadacao,
  frequencia: serieFrequencia,
};

/**
 * @param {import('pg').Pool} pool
 * @param {number} [meses] - quantos meses de histórico retornar
 * @returns {Promise<object>} uma chave por métrica configurada
 */
async function obterHistorico(pool, meses = config.mesesPadrao) {
  const resultado = {};

  await Promise.all(
    config.metricasDisponiveis.map(async (metrica) => {
      try {
        resultado[metrica] = {
          disponivel: true,
          serie: await CALCULADORES[metrica](pool, meses),
        };
      } catch (err) {
        console.warn(`Histórico da métrica "${metrica}" falhou ao calcular:`, err.message);
        resultado[metrica] = { disponivel: false, serie: [], motivo: err.message };
      }
    })
  );

  Object.entries(config.metricasIndisponiveis).forEach(([metrica, motivo]) => {
    resultado[metrica] = { disponivel: false, serie: [], motivo };
  });

  return resultado;
}

module.exports = { obterHistorico };
