'use strict';

const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Pontos do mapa: membros e celulas que ja tem coordenadas.
 *
 * Quem nao tem endereco cadastrado simplesmente nao aparece -- o mapa
 * mostra o que existe, sem inventar posicao.
 */
router.get('/pontos', autenticar, somenteAdmin, async (req, res) => {
  try {
    const membros = await pool.query(
      `SELECT id, nome, bairro, cidade, latitude, longitude
       FROM usuarios
       WHERE ativo = true AND latitude IS NOT NULL AND longitude IS NOT NULL`
    );

    const celulas = await pool.query(
      `SELECT id, nome, endereco, bairro, cidade, latitude, longitude
       FROM celulas
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
    );

    const igreja = await pool.query(
      `SELECT COUNT(1) FILTER (WHERE latitude IS NULL) AS sem_coordenada FROM usuarios WHERE ativo = true`
    );

    res.json({
      membros: membros.rows,
      celulas: celulas.rows,
      membrosSemCoordenada: parseInt(igreja.rows[0].sem_coordenada, 10),
    });
  } catch (err) {
    console.error('[mapa] erro ao buscar pontos:', err);
    res.status(500).json({ erro: 'Erro ao carregar o mapa' });
  }
});

module.exports = router;
