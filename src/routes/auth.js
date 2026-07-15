const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const router = express.Router();

const ACCESS_TOKEN_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

function gerarAccessToken(usuario) {
  return jwt.sign(
    { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

function gerarRefreshTokenBruto() {
  return crypto.randomBytes(40).toString('hex');
}

function hashToken(tokenBruto) {
  return crypto.createHash('sha256').update(tokenBruto).digest('hex');
}

async function criarRefreshToken(usuarioId) {
  const tokenBruto = gerarRefreshTokenBruto();
  const tokenHash = hashToken(tokenBruto);
  const expiraEm = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em)
     VALUES ($1, $2, $3)`,
    [usuarioId, tokenHash, expiraEm]
  );

  return tokenBruto;
}

// Cadastro de novo membro — agora nasce PENDENTE, sem token
router.post('/cadastro', async (req, res) => {
  const { nome, email, senha, telefone } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' });
  }
  try {
    const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ erro: 'Já existe um usuário com esse email' });
    }
    const senhaHash = await bcrypt.hash(senha, 10);
    await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, telefone, status)
       VALUES ($1, $2, $3, $4, 'pendente')`,
      [nome, email, senhaHash, telefone || null]
    );
    res.status(201).json({
      mensagem: 'Cadastro enviado! Sua conta será liberada por um administrador em breve.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao cadastrar usuário' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
  }
  try {
    const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    const usuario = resultado.rows[0];
    if (!usuario) {
      return res.status(401).json({ erro: 'Email ou senha inválidos' });
    }
    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Email ou senha inválidos' });
    }
    if (usuario.status === 'pendente') {
      return res.status(403).json({ erro: 'Sua conta ainda está aguardando aprovação.' });
    }
    if (usuario.status === 'rejeitado') {
      return res.status(403).json({ erro: 'Seu cadastro não foi aprovado. Fale com a liderança.' });
    }

    const accessToken = gerarAccessToken(usuario);
    const refreshToken = await criarRefreshToken(usuario.id);

    res.json({
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo },
      accessToken,
      refreshToken
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao fazer login' });
  }
});

// Renovar sessão (rotação: revoga o antigo, emite um novo par)
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ erro: 'refreshToken é obrigatório' });
  }
  try {
    const tokenHash = hashToken(refreshToken);
    const resultado = await pool.query(
      `SELECT rt.*, u.id AS usuario_id, u.nome, u.tipo, u.status
       FROM refresh_tokens rt
       JOIN usuarios u ON u.id = rt.usuario_id
       WHERE rt.token_hash = $1 AND rt.revogado_em IS NULL AND rt.expira_em > NOW()`,
      [tokenHash]
    );
    const registro = resultado.rows[0];
    if (!registro) {
      return res.status(401).json({ erro: 'Sessão expirada, faça login novamente' });
    }
    if (registro.status !== 'aprovado') {
      return res.status(403).json({ erro: 'Conta não está mais aprovada' });
    }

    // Revoga o token usado (rotação)
    await pool.query(`UPDATE refresh_tokens SET revogado_em = NOW() WHERE id = $1`, [registro.id]);

    const usuario = { id: registro.usuario_id, nome: registro.nome, tipo: registro.tipo };
    const novoAccessToken = gerarAccessToken(usuario);
    const novoRefreshToken = await criarRefreshToken(usuario.id);

    res.json({ accessToken: novoAccessToken, refreshToken: novoRefreshToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao renovar sessão' });
  }
});

// Logout — revoga o refresh token atual
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ erro: 'refreshToken é obrigatório' });
  }
  try {
    const tokenHash = hashToken(refreshToken);
    await pool.query(
      `UPDATE refresh_tokens SET revogado_em = NOW() WHERE token_hash = $1`,
      [tokenHash]
    );
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao encerrar sessão' });
  }
});

module.exports = router;
