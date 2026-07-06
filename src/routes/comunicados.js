const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar comunicados relevantes para o usuário logado (todos + suas células/ministérios)
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.*, u.nome AS autor_nome,
              EXISTS (
                SELECT 1 FROM comunicados_lidos cl
                WHERE cl.comunicado_id = c.id AND cl.usuario_id = $1
              ) AS lido
       FROM comunicados c
       LEFT JOIN usuarios u ON u.id = c.criado_por
       WHERE c.publico_alvo = 'todos'
          OR (c.publico_alvo = 'celula' AND c.alvo_id IN (
                SELECT celula_id FROM membros_celula WHERE usuario_id = $1
              ))
          OR (c.publico_alvo = 'ministerio' AND c.alvo_id IN (
                SELECT ministerio_id FROM membros_ministerio WHERE usuario_id = $1
              ))
       ORDER BY c.criado_em DESC`,
      [req.usuario.id]
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar comunicados' });
  }
});

// Contar não lidos (para o sino)
router.get('/nao-lidos', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT COUNT(*) FROM comunicados c
       WHERE (
         c.publico_alvo = 'todos'
         OR (c.publico_alvo = 'celula' AND c.alvo_id IN (
               SELECT celula_id FROM membros_celula WHERE usuario_id = $1
             ))
         OR (c.publico_alvo = 'ministerio' AND c.alvo_id IN (
               SELECT ministerio_id FROM membros_ministerio WHERE usuario_id = $1
             ))
       )
       AND NOT EXISTS (
         SELECT 1 FROM comunicados_lidos cl
         WHERE cl.comunicado_id = c.id AND cl.usuario_id = $1
       )`,
      [req.usuario.id]
    );
    res.json({ total: parseInt(resultado.rows[0].count, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao contar não lidos' });
  }
});

// Marcar comunicado como lido
router.post('/:id/lido', autenticar, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO comunicados_lidos (comunicado_id, usuario_id)
       VALUES ($1, $2)
       ON CONFLICT (comunicado_id, usuario_id) DO NOTHING`,
      [req.params.id, req.usuario.id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao marcar como lido' });
  }
});

// Criar comunicado (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, mensagem, publico_alvo, alvo_id } = req.body;
  if (!titulo || !mensagem) {
    return res.status(400).json({ erro: 'Título e mensagem são obrigatórios' });
  }
  if (publico_alvo !== 'todos' && !alvo_id) {
    return res.status(400).json({ erro: 'Selecione o grupo de destino.' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO comunicados (titulo, mensagem, publico_alvo, alvo_id, criado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [titulo, mensagem, publico_alvo || 'todos', publico_alvo === 'todos' ? null : alvo_id, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar comunicado' });
  }
});

// Remover comunicado (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM comunicados WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover comunicado' });
  }
});

module.exports = router;
