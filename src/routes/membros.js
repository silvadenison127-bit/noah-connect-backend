const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

// Listar todos os membros (admin)
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, telefone, tipo, foto_url, membro_desde, ativo
       FROM usuarios ORDER BY nome ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar membros' });
  }
});

// Ver perfil próprio
router.get('/perfil', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, telefone, tipo, foto_url, membro_desde
       FROM usuarios WHERE id = $1`,
      [req.usuario.id]
    );
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar perfil' });
  }
});

// Atualizar membro (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, tipo, ativo } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET
        nome = COALESCE($1, nome),
        telefone = COALESCE($2, telefone),
        tipo = COALESCE($3, tipo),
        ativo = COALESCE($4, ativo),
        atualizado_em = NOW()
       WHERE id = $5
       RETURNING id, nome, email, telefone, tipo, ativo`,
      [nome, telefone, tipo, ativo, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Membro não encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar membro' });
  }
});

// Remover membro (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover membro' });
  }
});

module.exports = router;
