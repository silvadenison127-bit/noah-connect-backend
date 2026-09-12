const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const {
  publicarCelulaNoApp,
  atualizarCelulaNoApp,
  desativarCelulaNoApp,
} = require('../services/celulas.service');
const router = express.Router();

// Listar células com líder e contagem de membros
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.*, u.nome AS lider_nome,
              (SELECT COUNT(*) FROM membros_celula mc WHERE mc.celula_id = c.id) AS total_membros
       FROM celulas c
       LEFT JOIN usuarios u ON u.id = c.lider_id
       ORDER BY c.nome ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar células' });
  }
});

/**
 * Criar célula (admin).
 *
 * A célula nasce no Railway e em seguida é publicada no Supabase, que é de
 * onde o aplicativo lê. Se a publicação falhar, a célula continua criada no
 * painel e o aviso sobe junto com a resposta -- nunca em silêncio, senão o
 * pastor cadastraria algo que nenhum membro veria.
 */
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { nome, lider_id, dia_semana, horario, endereco } = req.body;
  if (!nome) {
    return res.status(400).json({ erro: 'Nome da célula é obrigatório' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO celulas (nome, lider_id, dia_semana, horario, endereco)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nome, lider_id || null, dia_semana || null, horario || null, endereco || null]
    );

    const celula = resultado.rows[0];
    const publicacao = await publicarCelulaNoApp(celula);

    if (publicacao.uuid) {
      await pool.query('UPDATE celulas SET supabase_cell_id = $1 WHERE id = $2', [
        publicacao.uuid,
        celula.id,
      ]);
      celula.supabase_cell_id = publicacao.uuid;
    }

    res.status(201).json(
      publicacao.erro ? { ...celula, aviso: publicacao.erro } : celula
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar célula' });
  }
});

/**
 * Atualizar célula (admin).
 *
 * A edição é refletida no Supabase quando existe vínculo. Sem vínculo a
 * célula nunca chegou ao aplicativo: neste caso ela é publicada agora, em vez
 * de continuar invisível para sempre.
 */
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { nome, lider_id, dia_semana, horario, endereco } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE celulas SET
        nome = COALESCE($1, nome),
        lider_id = COALESCE($2, lider_id),
        dia_semana = COALESCE($3, dia_semana),
        horario = COALESCE($4, horario),
        endereco = COALESCE($5, endereco)
       WHERE id = $6 RETURNING *`,
      [nome, lider_id, dia_semana, horario, endereco, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Célula não encontrada' });

    const celula = resultado.rows[0];
    let aviso = null;

    if (celula.supabase_cell_id) {
      const r = await atualizarCelulaNoApp(celula.supabase_cell_id, celula);
      aviso = r.erro;
    } else {
      const publicacao = await publicarCelulaNoApp(celula);
      if (publicacao.uuid) {
        await pool.query('UPDATE celulas SET supabase_cell_id = $1 WHERE id = $2', [
          publicacao.uuid,
          celula.id,
        ]);
        celula.supabase_cell_id = publicacao.uuid;
      }
      aviso = publicacao.erro;
    }

    res.json(aviso ? { ...celula, aviso } : celula);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar célula' });
  }
});

/**
 * Remover célula (admin).
 *
 * No Railway a linha é apagada; no Supabase a célula é apenas desativada. O
 * aplicativo filtra por `is_active`, então desativar já tira a célula da vista
 * do membro sem destruir vínculos que possam existir do lado de lá.
 *
 * O uuid é capturado ANTES do DELETE, via RETURNING: depois de apagada a linha
 * não haveria como descobrir qual célula desativar no aplicativo.
 */
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      'DELETE FROM celulas WHERE id = $1 RETURNING supabase_cell_id',
      [req.params.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Célula não encontrada' });
    }

    const uuid = resultado.rows[0].supabase_cell_id;
    if (uuid) {
      const r = await desativarCelulaNoApp(uuid);
      if (r.erro) {
        console.error('[celulas] célula removida do painel, mas segue ativa no aplicativo:', r.erro);
      }
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover célula' });
  }
});

// Listar membros vinculados a uma célula + membros disponíveis para vincular
router.get('/:id/membros', autenticar, somenteAdmin, async (req, res) => {
  try {
    const vinculados = await pool.query(
      `SELECT u.id, u.nome, u.email
       FROM membros_celula mc
       JOIN usuarios u ON u.id = mc.usuario_id
       WHERE mc.celula_id = $1
       ORDER BY u.nome ASC`,
      [req.params.id]
    );
    const disponiveis = await pool.query(
      `SELECT u.id, u.nome, u.email
       FROM usuarios u
       WHERE u.ativo = true
         AND u.id NOT IN (
           SELECT usuario_id FROM membros_celula WHERE celula_id = $1
         )
       ORDER BY u.nome ASC`,
      [req.params.id]
    );
    res.json({ vinculados: vinculados.rows, disponiveis: disponiveis.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar membros da célula' });
  }
});

// Vincular membro a uma célula (admin)
router.post('/:id/membros', autenticar, somenteAdmin, async (req, res) => {
  const { usuario_id } = req.body;
  try {
    await pool.query(
      `INSERT INTO membros_celula (celula_id, usuario_id)
       VALUES ($1, $2)
       ON CONFLICT (celula_id, usuario_id) DO NOTHING`,
      [req.params.id, usuario_id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao vincular membro' });
  }
});

// Desvincular membro de uma célula (admin)
router.delete('/:id/membros/:usuarioId', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM membros_celula WHERE celula_id = $1 AND usuario_id = $2`,
      [req.params.id, req.params.usuarioId]
    );
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao desvincular membro' });
  }
});

module.exports = router;