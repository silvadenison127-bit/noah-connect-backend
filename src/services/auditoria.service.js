'use strict';

async function registrarAuditoria(client, {
  executor_id,
  executor_nome,
  operacao,
  ids_afetados,
  impacto,
  resultado,
  ip,
}) {
  const res = await client.query(
    `INSERT INTO audit_log
       (executor_id, executor_nome, operacao, ids_afetados, impacto, resultado, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      executor_id   ?? null,
      executor_nome ?? null,
      operacao,
      JSON.stringify(ids_afetados),
      JSON.stringify(impacto),
      resultado,
      ip ?? null,
    ]
  );
  return res.rows[0].id;
}

module.exports = { registrarAuditoria };