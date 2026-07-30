const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar todos os cursos (qualquer logado)
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM turmas t WHERE t.curso_id = c.id) AS total_turmas
       FROM cursos c
       ORDER BY c.nome ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar cursos' });
  }
});

// Estatisticas para o Dashboard do modulo (admin)
router.get('/dashboard-stats', autenticar, somenteAdmin, async (req, res) => {
  try {
    const [totalCursos, turmasAtivas, alunosMatriculados, inscricoesPendentes, frequenciaMedia, inscricoesPorMes, proximasTurmas] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM cursos WHERE ativo = true`),
      pool.query(`SELECT COUNT(*) FROM turmas WHERE status = 'ativa'`),
      pool.query(`SELECT COUNT(*) FROM inscricoes_cursos WHERE status != 'cancelado'`),
      pool.query(`SELECT COUNT(*) FROM inscricoes_cursos WHERE status = 'inscrito'`),
      pool.query(`
        SELECT COALESCE(ROUND(
          (COUNT(*) FILTER (WHERE status = 'presente')::decimal / NULLIF(COUNT(*), 0)) * 100
        ), 0) AS media
        FROM presencas_cursos
      `),
      pool.query(`
        SELECT TO_CHAR(criado_em, 'YYYY-MM') AS mes, COUNT(*) AS total
        FROM inscricoes_cursos
        WHERE criado_em >= NOW() - INTERVAL '6 months'
        GROUP BY mes
        ORDER BY mes ASC
      `),
      pool.query(`
        SELECT t.id, t.nome, t.dias_semana, t.horario, t.data_inicio, c.nome AS curso_nome
        FROM turmas t
        LEFT JOIN cursos c ON c.id = t.curso_id
        WHERE t.status = 'ativa'
        ORDER BY t.data_inicio ASC NULLS LAST
        LIMIT 5
      `),
    ]);

    res.json({
      total_cursos: parseInt(totalCursos.rows[0].count, 10),
      turmas_ativas: parseInt(turmasAtivas.rows[0].count, 10),
      alunos_matriculados: parseInt(alunosMatriculados.rows[0].count, 10),
      inscricoes_pendentes: parseInt(inscricoesPendentes.rows[0].count, 10),
      frequencia_media: parseInt(frequenciaMedia.rows[0].media, 10),
      inscricoes_por_mes: inscricoesPorMes.rows,
      proximas_turmas: proximasTurmas.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar estatisticas do dashboard' });
  }
});

// Ver um curso especifico
router.get('/:id', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM cursos WHERE id = $1', [req.params.id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Curso nao encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar curso' });
  }
});

// Criar curso (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { nome, descricao } = req.body;
  if (!nome) {
    return res.status(400).json({ erro: 'O nome do curso e obrigatorio' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO cursos (nome, descricao, criado_por)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [nome, descricao || null, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar curso' });
  }
});

// Atualizar curso (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { nome, descricao, ativo } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE cursos SET
        nome = COALESCE($1, nome),
        descricao = COALESCE($2, descricao),
        ativo = COALESCE($3, ativo)
       WHERE id = $4
       RETURNING *`,
      [nome, descricao, ativo, req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Curso nao encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar curso' });
  }
});

// Remover curso (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM cursos WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover curso' });
  }
});

module.exports = router;