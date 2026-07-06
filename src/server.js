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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Noah Connect API rodando na porta ${PORT}`);
});
