/**
 * securityService.js
 * ----------------------------------------------------------------------------
 * Avaliação modular da Segurança do Sistema Noah.
 *
 * Arquitetura: cada critério é um avaliador independente com
 *   { nome, peso, severidade, avaliar(ctx) -> { status, descricao } }.
 *
 * severidade:
 *   'critico'    -> se não estiver 'ok', limita a classificação a "Atenção"
 *                   (ou "Crítico" quando o próprio status for 'erro')
 *   'importante' -> influencia a nota, mas nunca bloqueia "Seguro"
 *
 * status de cada critério: 'ok' | 'atencao' | 'erro' | 'nao_validado'
 *
 * Para adicionar um critério novo (ex.: Backup real, Integridade da base),
 * basta inserir um objeto no array AVALIADORES — nada mais muda (Open/Closed).
 * ----------------------------------------------------------------------------
 */

const AVALIADORES = [
  {
    nome: 'Banco de dados conectado',
    peso: 20,
    severidade: 'critico',
    avaliar: (ctx) => ctx.bancoConectado
      ? { status: 'ok', descricao: 'O banco respondeu às consultas.' }
      : { status: 'erro', descricao: 'Banco de dados indisponível.' },
  },
  {
    nome: 'APIs essenciais funcionando',
    peso: 15,
    severidade: 'critico',
    avaliar: () => ({ status: 'ok', descricao: 'API respondeu à requisição.' }),
  },
  {
    nome: 'Existe administrador',
    peso: 20,
    severidade: 'critico',
    avaliar: (ctx) => ctx.totalAdmins >= 1
      ? { status: 'ok', descricao: 'Há ao menos um administrador ativo.' }
      : { status: 'erro', descricao: 'Nenhum administrador ativo — acesso comprometido.' },
  },
  {
    nome: 'Configurações obrigatórias concluídas',
    peso: 15,
    severidade: 'critico',
    avaliar: (ctx) => ctx.igrejaConfigurada
      ? { status: 'ok', descricao: 'Dados essenciais da igreja preenchidos.' }
      : { status: 'atencao', descricao: 'Dados obrigatórios da igreja incompletos.' },
  },
  {
    nome: 'Backup validado',
    peso: 20,
    severidade: 'critico',
    avaliar: (ctx) => ctx.backupValidado
      ? { status: 'ok', descricao: 'Backup recente validado.' }
      : { status: 'nao_validado', descricao: 'Módulo de backup ainda não implementado.' },
  },
  {
    nome: 'Quantidade ideal de administradores (2 a 4)',
    peso: 6,
    severidade: 'importante',
    avaliar: (ctx) => {
      const n = ctx.totalAdmins;
      if (n >= 2 && n <= 4) return { status: 'ok', descricao: `${n} admins: redundância saudável.` };
      if (n === 1) return { status: 'atencao', descricao: 'Apenas 1 admin: ponto único de falha.' };
      if (n >= 5) return { status: 'atencao', descricao: `${n} admins: superfície de risco elevada.` };
      return { status: 'erro', descricao: 'Sem administradores.' };
    },
  },
  {
    nome: 'Permissões consistentes',
    peso: 4,
    severidade: 'importante',
    avaliar: (ctx) => ctx.tiposInvalidos === 0
      ? { status: 'ok', descricao: 'Todos os usuários têm papel válido.' }
      : { status: 'atencao', descricao: `${ctx.tiposInvalidos} usuário(s) com papel inválido.` },
  },
  {
    nome: 'Sessão segura configurada',
    peso: 5,
    severidade: 'importante',
    avaliar: (ctx) => ctx.tokensOperante
      ? { status: 'ok', descricao: 'Renovação de sessão ativa.' }
      : { status: 'atencao', descricao: 'Mecanismo de sessão não verificado.' },
  },
];

/**
 * Determina a classificação final aplicando a REGRA DE TETO conservadora.
 */
function classificar(resultados) {
  const criticos = resultados.filter((r) => r.severidade === 'critico');

  const temFalhaGrave = criticos.some((r) => r.status === 'erro');
  if (temFalhaGrave) return 'critico';

  const todosCriticosOk = criticos.every((r) => r.status === 'ok');
  if (todosCriticosOk) return 'seguro';

  return 'atencao';
}

const securityService = {
  /**
   * Avalia a segurança consolidando todos os critérios.
   * @param {object} pool - conexão de banco (injeção de dependência).
   * @returns { status, nota, classificacao, criterios[], ultimaAtualizacao }
   */
  async avaliar(pool) {
    const ctx = {
      bancoConectado: false,
      totalAdmins: 0,
      tiposInvalidos: 0,
      igrejaConfigurada: false,
      tokensOperante: false,
      backupValidado: false,
    };

    try {
      const [adminsRes, tiposRes, configRes] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS total FROM usuarios WHERE tipo = 'admin' AND ativo = true`),
        pool.query(
          `SELECT COUNT(*) AS total FROM usuarios
           WHERE tipo IS NULL OR tipo NOT IN ('admin','lider','membro')`
        ),
        pool.query(`SELECT nome FROM configuracoes_igreja LIMIT 1`),
      ]);

      ctx.bancoConectado = true;
      ctx.totalAdmins = parseInt(adminsRes.rows[0].total, 10);
      ctx.tiposInvalidos = parseInt(tiposRes.rows[0].total, 10);
      ctx.igrejaConfigurada = !!configRes.rows[0]?.nome?.trim();

      try {
        await pool.query(`SELECT 1 FROM refresh_tokens LIMIT 1`);
        ctx.tokensOperante = true;
      } catch {
        ctx.tokensOperante = false;
      }
    } catch (err) {
      console.error('[securityService] Banco indisponível:', err.message);
    }

    const criterios = AVALIADORES.map((a) => {
      const r = a.avaliar(ctx);
      return {
        nome: a.nome,
        status: r.status,
        peso: a.peso,
        severidade: a.severidade,
        descricao: r.descricao,
      };
    });

    const pesoTotal = AVALIADORES.reduce((s, a) => s + a.peso, 0);
    const pesoObtido = criterios
      .filter((c) => c.status === 'ok')
      .reduce((s, c) => s + c.peso, 0);
    const nota = Math.round((pesoObtido / pesoTotal) * 100);

    const classificacao = classificar(criterios);

    return {
      status: 'real',
      nota,
      classificacao,
      criterios,
      ultimaAtualizacao: new Date().toISOString(),
    };
  },
};

module.exports = securityService;