const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar alunos de uma turma com a presenca de uma data especifica (admin)
// GET /api/presencas-cursos/turma/:turmaId?data=2026-07-29
router.get('/turma/:turmaId', autenticar, somenteAdmin, async (req, res) => {
  const { data } = req.query;
  if (!data) {
    return res.status(400).json({ erro: 'Informe a data da aula (?data=AAAA-MM-DD)' });
  }
  try {
    const resultado = await pool.query(
      `SELECT ic.id AS inscricao_id, ic.nome_completo,
              p.id AS presenca_id, p.status
       FROM inscricoes_cursos ic
       LEFT JOIN presencas_cursos p ON p.inscricao_id = ic.id AND p.data_aula = $2
       WHERE ic.turma_id = $1 AND ic.status != 'cancelado'
       ORDER BY ic.nome_completo ASC`,
      [req.params.turmaId, data]
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar lista de presenca' });
  }
});

// Salvar presenca de um aluno em uma data (admin) - cria ou atualiza
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { inscricao_id, data_aula, status } = req.body;
  if (!inscricao_id || !data_aula || !status) {
    return res.status(400).json({ erro: 'inscricao_id, data_aula e status sao obrigatorios' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO presencas_cursos (inscricao_id, data_aula, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (inscricao_id, data_aula)
       DO UPDATE SET status = $3
       RETURNING *`,
      [inscricao_id, data_aula, status]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar presenca' });
  }
});

// Salvar presenca em lote para varios alunos de uma vez (admin)
router.post('/lote', autenticar, somenteAdmin, async (req, res) => {
  const { data_aula, registros } = req.body;
  if (!data_aula || !Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ erro: 'data_aula e registros (lista) sao obrigatorios' });
  }
  try {
    const resultados = [];
    for (const registro of registros) {
      const resultado = await pool.query(
        `INSERT INTO presencas_cursos (inscricao_id, data_aula, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (inscricao_id, data_aula)
         DO UPDATE SET status = $3
         RETURNING *`,
        [registro.inscricao_id, data_aula, registro.status]
      );
      resultados.push(resultado.rows[0]);
    }
    res.status(201).json(resultados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar presencas em lote' });
  }
});

// Frequencia de todos os alunos de uma turma (admin) - para relatorios
router.get('/turma/:turmaId/relatorio-frequencia', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
        ic.id AS inscricao_id,
        ic.nome_completo,
        ic.telefone,
        ic.email,
        ic.cpf,
        ic.status AS status_inscricao,
        COUNT(p.*) FILTER (WHERE p.status = 'presente') AS presencas,
        COUNT(p.*) FILTER (WHERE p.status = 'ausente') AS faltas,
        COUNT(p.*) FILTER (WHERE p.status = 'atrasado') AS atrasos,
        COUNT(p.*) FILTER (WHERE p.status = 'justificado') AS justificadas,
        COUNT(p.*) AS total_aulas
       FROM inscricoes_cursos ic
       LEFT JOIN presencas_cursos p ON p.inscricao_id = ic.id
       WHERE ic.turma_id = $1 AND ic.status != 'cancelado'
       GROUP BY ic.id, ic.nome_completo, ic.telefone, ic.email, ic.cpf, ic.status
       ORDER BY ic.nome_completo ASC`,
      [req.params.turmaId]
    );

    const linhas = resultado.rows.map((linha) => {
      const total = parseInt(linha.total_aulas, 10);
      const presentes = parseInt(linha.presencas, 10);
      const percentual = total > 0 ? Math.round((presentes / total) * 100) : 0;
      return { ...linha, percentual_frequencia: percentual };
    });

    res.json(linhas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar relatorio de frequencia' });
  }
});

// Frequencia individual de um aluno (admin)
router.get('/frequencia/:inscricaoId', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'presente') AS presencas,
        COUNT(*) FILTER (WHERE status = 'ausente') AS faltas,
        COUNT(*) FILTER (WHERE status = 'atrasado') AS atrasos,
        COUNT(*) FILTER (WHERE status = 'justificado') AS justificadas,
        COUNT(*) AS total_aulas
       FROM presencas_cursos
       WHERE inscricao_id = $1`,
      [req.params.inscricaoId]
    );
    const linha = resultado.rows[0];
    const total = parseInt(linha.total_aulas, 10);
    const presentes = parseInt(linha.presencas, 10);
    const percentual = total > 0 ? Math.round((presentes / total) * 100) : 0;

    res.json({ ...linha, percentual_frequencia: percentual });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao calcular frequencia' });
  }
});

module.exports = router;