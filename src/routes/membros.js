const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar todos os membros (admin)
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, telefone, cpf, tipo, foto_url, membro_desde, ativo, status
       FROM usuarios ORDER BY nome ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar membros' });
  }
});

// Criar novo membro (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { nome, email, telefone, tipo, senha, cpf } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios.' });
  }
  try {
    const existente = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existente.rows.length > 0) {
      return res.status(409).json({ erro: 'Já existe um usuário com esse email.' });
    }
    const senha_hash = await bcrypt.hash(senha, 10);
    const resultado = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, telefone, cpf, tipo, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'membro'), 'aprovado')
       RETURNING id, nome, email, telefone, cpf, tipo, ativo, membro_desde, status`,
      [nome, email, senha_hash, telefone || null, cpf || null, tipo]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar membro' });
  }
});

// Ver perfil próprio
router.get('/perfil', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, telefone, cpf, tipo, foto_url, membro_desde
       FROM usuarios WHERE id = $1`,
      [req.usuario.id]
    );
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar perfil' });
  }
});

// Atualizar próprio perfil (foto, telefone, cpf)
router.put('/perfil', autenticar, async (req, res) => {
  const { foto_url, telefone, cpf } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET
        foto_url = COALESCE($1, foto_url),
        telefone = COALESCE($2, telefone),
        cpf = COALESCE($3, cpf),
        atualizado_em = NOW()
       WHERE id = $4
       RETURNING id, nome, email, telefone, cpf, tipo, foto_url`,
      [foto_url, telefone, cpf, req.usuario.id]
    );
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

// Listar membros aguardando aprovação (admin)
router.get('/pendentes', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, telefone, criado_em
       FROM usuarios WHERE status = 'pendente' ORDER BY criado_em ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pendentes' });
  }
});

// Aprovar membro (admin)
router.put('/:id/aprovar', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET status = 'aprovado', atualizado_em = NOW()
       WHERE id = $1 RETURNING id, nome, email, status`,
      [req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao aprovar membro' });
  }
});

// Rejeitar membro (admin)
router.put('/:id/rejeitar', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET status = 'rejeitado', atualizado_em = NOW()
       WHERE id = $1 RETURNING id, nome, email, status`,
      [req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao rejeitar membro' });
  }
});

// Atualizar membro (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, tipo, ativo, cpf } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET
        nome = COALESCE($1, nome),
        telefone = COALESCE($2, telefone),
        tipo = COALESCE($3, tipo),
        ativo = COALESCE($4, ativo),
        cpf = COALESCE($5, cpf),
        atualizado_em = NOW()
       WHERE id = $6
       RETURNING id, nome, email, telefone, cpf, tipo, ativo`,
      [nome, telefone, tipo, ativo, cpf, id]
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

// Excluir múltiplos membros (admin) — com travas de segurança + cascade
router.post('/excluir-multiplos', autenticar, somenteAdmin, async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ erro: 'Nenhum membro selecionado para exclusão.' });
  }

  const idsLimpos = [...new Set(ids.map((v) => String(v).trim()).filter(Boolean))];
  if (idsLimpos.length === 0) {
    return res.status(400).json({ erro: 'IDs inválidos.' });
  }

  // Trava 1: não pode excluir o próprio usuário logado
  if (idsLimpos.includes(String(req.usuario.id))) {
    return res.status(403).json({ erro: 'Você não pode excluir o seu próprio usuário.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Trava 2: não pode excluir o último administrador do sistema
    const totalAdmins = await client.query(
      `SELECT COUNT(*)::int AS total FROM usuarios WHERE tipo = 'admin'`
    );
    const adminsSelecionados = await client.query(
      `SELECT COUNT(*)::int AS total FROM usuarios
       WHERE tipo = 'admin' AND id::text = ANY($1::text[])`,
      [idsLimpos]
    );
    const restantes = totalAdmins.rows[0].total - adminsSelecionados.rows[0].total;
    if (restantes < 1) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        erro: 'Não é possível excluir todos os administradores. O sistema precisa de pelo menos um admin.',
      });
    }

    // Descobre TODAS as tabelas/colunas que referenciam usuarios(id)
    const refs = await client.query(`
      SELECT tc.table_name AS tabela, kcu.column_name AS coluna
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'usuarios'
        AND ccu.column_name = 'id'
    `);

    // Apaga os registros filhos em cada tabela vinculada
    for (const { tabela, coluna } of refs.rows) {
      await client.query(
        `DELETE FROM "${tabela}" WHERE "${coluna}"::text = ANY($1::text[])`,
        [idsLimpos]
      );
    }

    // Por fim, apaga os próprios membros
    const del = await client.query(
      `DELETE FROM usuarios WHERE id::text = ANY($1::text[]) RETURNING id`,
      [idsLimpos]
    );

    await client.query('COMMIT');
    res.json({ excluidos: del.rowCount, ids: del.rows.map((r) => r.id) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir membros.' });
  } finally {
    client.release();
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