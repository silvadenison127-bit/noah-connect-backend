'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const pool    = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const { excluirMembros, excluirMembro } = require('../services/membros.service');

const router = express.Router();

const INSERT_USUARIO = "INSERT INTO usuarios (nome, email, senha_hash, telefone, cpf, tipo, status) VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'membro'), 'aprovado') RETURNING id, nome, email, telefone, cpf, tipo, ativo, membro_desde, status";

router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, nome, email, telefone, cpf, tipo, foto_url, membro_desde, ativo, status FROM usuarios ORDER BY nome ASC');
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao buscar membros' }); }
});

router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { nome, email, telefone, tipo, senha, cpf } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, email e senha sao obrigatorios.' });
  try {
    const existente = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existente.rows.length > 0) return res.status(409).json({ erro: 'Ja existe um usuario com esse email.' });
    const senha_hash = await bcrypt.hash(senha, 10);
    const r = await pool.query(INSERT_USUARIO, [nome, email, senha_hash, telefone || null, cpf || null, tipo]);
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao criar membro' }); }
});

router.get('/perfil', autenticar, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, nome, email, telefone, cpf, tipo, foto_url, membro_desde FROM usuarios WHERE id = $1', [req.usuario.id]);
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao buscar perfil' }); }
});

router.put('/perfil', autenticar, async (req, res) => {
  const { foto_url, telefone, cpf } = req.body;
  try {
    const r = await pool.query('UPDATE usuarios SET foto_url = COALESCE($1, foto_url), telefone = COALESCE($2, telefone), cpf = COALESCE($3, cpf), atualizado_em = NOW() WHERE id = $4 RETURNING id, nome, email, telefone, cpf, tipo, foto_url', [foto_url, telefone, cpf, req.usuario.id]);
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao atualizar perfil' }); }
});

router.get('/pendentes', autenticar, somenteAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT id, nome, email, telefone, criado_em FROM usuarios WHERE status = 'pendente' ORDER BY criado_em ASC");
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao buscar pendentes' }); }
});

router.put('/:id/aprovar', autenticar, somenteAdmin, async (req, res) => {
  try {
    const r = await pool.query("UPDATE usuarios SET status = 'aprovado', atualizado_em = NOW() WHERE id = $1 RETURNING id, nome, email, status", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ erro: 'Usuario nao encontrado' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao aprovar membro' }); }
});

router.put('/:id/rejeitar', autenticar, somenteAdmin, async (req, res) => {
  try {
    const r = await pool.query("UPDATE usuarios SET status = 'rejeitado', atualizado_em = NOW() WHERE id = $1 RETURNING id, nome, email, status", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ erro: 'Usuario nao encontrado' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao rejeitar membro' }); }
});

router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, tipo, ativo, cpf } = req.body;
  try {
    const r = await pool.query('UPDATE usuarios SET nome = COALESCE($1, nome), telefone = COALESCE($2, telefone), tipo = COALESCE($3, tipo), ativo = COALESCE($4, ativo), cpf = COALESCE($5, cpf), atualizado_em = NOW() WHERE id = $6 RETURNING id, nome, email, telefone, cpf, tipo, ativo', [nome, telefone, tipo, ativo, cpf, id]);
    if (r.rows.length === 0) return res.status(404).json({ erro: 'Membro nao encontrado' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao atualizar membro' }); }
});

router.post('/excluir-multiplos', autenticar, somenteAdmin, async (req, res) => {
  const { ids, confirmado } = req.body;
  try {
    const resultado = await excluirMembros({ ids, confirmado, executor: req.usuario, ip: req.ip });
    res.json(resultado);
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 500) console.error(err);
    res.status(status).json({ erro: status < 500 ? err.message : 'Erro ao excluir membros.' });
  }
});

router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await excluirMembro({ id: req.params.id, executor: req.usuario, ip: req.ip });
    res.json(resultado);
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 500) console.error(err);
    res.status(status).json({ erro: status < 500 ? err.message : 'Erro ao remover membro.' });
  }
});

module.exports = router;