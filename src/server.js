require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const membrosRoutes = require('./routes/membros');
const eventosRoutes = require('./routes/eventos');
const oracaoRoutes = require('./routes/oracao');
const dashboardRoutes = require('./routes/dashboard');
const cultosRoutes = require('./routes/cultos');
const celulasRoutes = require('./routes/celulas');
const dizimosRoutes = require('./routes/dizimos');
const financeiroRoutes = require('./routes/financeiro');
const ministeriosRoutes = require('./routes/ministerios');
const noticiasRoutes = require('./routes/noticias');
const comunicadosRoutes = require('./routes/comunicados');
const relatoriosRoutes = require('./routes/relatorios');
const configuracoesRoutes = require('./routes/configuracoes');
const estudosBiblicosRoutes = require('./routes/estudosBiblicos');
const cursosRoutes = require('./routes/cursos');
const turmasRoutes = require('./routes/turmas');
const inscricoesCursosRoutes = require('./routes/inscricoesCursos');
const presencasCursosRoutes = require('./routes/presencasCursos');
const iaNoahRoutes = require('./routes/iaNoah');
const metricsRoutes = require('./routes/metrics'); // camada oficial de métricas
const searchRoutes = require('./routes/search'); // NOVO — Pesquisa Global

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.get('/', (req, res) => {
  res.json({ status: 'ok', servico: 'Noah Connect API' });
});
app.use('/api/auth', authRoutes);
app.use('/api/membros', membrosRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/oracao', oracaoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/cultos', cultosRoutes);
app.use('/api/celulas', celulasRoutes);
app.use('/api/dizimos', dizimosRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/ministerios', ministeriosRoutes);
app.use('/api/noticias', noticiasRoutes);
app.use('/api/comunicados', comunicadosRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/configuracoes', configuracoesRoutes);
app.use('/api/estudos-biblicos', estudosBiblicosRoutes);
app.use('/api/cursos', cursosRoutes);
app.use('/api/turmas', turmasRoutes);
app.use('/api/inscricoes-cursos', inscricoesCursosRoutes);
app.use('/api/presencas-cursos', presencasCursosRoutes);
app.use('/api/ia-noah', iaNoahRoutes);
app.use('/api/metrics', metricsRoutes); // expõe /api/metrics/*
app.use('/api/search', searchRoutes); // NOVO — expõe /api/search?q=texto

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Noah Connect API rodando na porta ${PORT}`);
});