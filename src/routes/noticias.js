const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar notícias (qualquer membro logado)
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT n.*, u.nome AS autor_nome
       FROM noticias n
       LEFT JOIN usuarios u ON u.id = n.autor_id
       ORDER BY n.publicado_em DESC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar notícias' });
  }
});

// Criar notícia (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, conteudo, imagem_capa } = req.body;
  if (!titulo || !conteudo) {
    return res.status(400).json({ erro: 'Título e conteúdo são obrigatórios' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO noticias (titulo, conteudo, imagem_capa, autor_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [titulo, conteudo, imagem_capa || null, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao publicar notícia' });
  }
});

// Atualizar notícia (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, conteudo, imagem_capa } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE noticias SET
        titulo = COALESCE($1, titulo),
        conteudo = COALESCE($2, conteudo),
        imagem_capa = COALESCE($3, imagem_capa),
        atualizado_em = NOW()
       WHERE id = $4 RETURNING *`,
      [titulo, conteudo, imagem_capa, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Notícia não encontrada' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar notícia' });
  }
});

// Remover notícia (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM noticias WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover notícia' });
  }
});

module.exports = router;
