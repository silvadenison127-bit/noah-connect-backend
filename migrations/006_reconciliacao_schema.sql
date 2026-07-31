-- ============================================
-- MIGRATION 006 - RECONCILIACAO DE SCHEMA
-- ============================================
-- Contexto: as tabelas abaixo ja existem em producao (Railway),
-- criadas manualmente via console SQL ao longo do desenvolvimento
-- das rotas de Celulas, Ministerios, Cultos (presenca) e Financeiro.
-- Nunca foram versionadas em migration, entao o repositorio ficou
-- fora de sincronia com o schema real.
--
-- Esta migration e IDEMPOTENTE e SEGURA para producao: usa
-- "CREATE TABLE IF NOT EXISTS", entao em producao (onde as tabelas
-- ja existem) ela nao faz nada - zero risco de tocar em dado real.
-- Em qualquer ambiente novo (staging, disaster recovery, clone
-- local), ela cria o schema completo do zero.
-- ============================================

CREATE TABLE IF NOT EXISTS celulas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    lider_id INTEGER REFERENCES usuarios(id),
    dia_semana VARCHAR(20),
    horario VARCHAR(20),
    endereco VARCHAR(250),
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS membros_celula (
    id SERIAL PRIMARY KEY,
    celula_id INTEGER NOT NULL REFERENCES celulas(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE (celula_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS ministerios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    lider_id INTEGER REFERENCES usuarios(id),
    descricao TEXT,
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS membros_ministerio (
    id SERIAL PRIMARY KEY,
    ministerio_id INTEGER NOT NULL REFERENCES ministerios(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE (ministerio_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS presencas_culto (
    id SERIAL PRIMARY KEY,
    evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    presente BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE (evento_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS dizimos_ofertas (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id),
    tipo VARCHAR(20) NOT NULL DEFAULT 'dizimo' CHECK (tipo IN ('dizimo', 'oferta')),
    valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
    forma_pagamento VARCHAR(30) DEFAULT 'dinheiro',
    observacao TEXT,
    data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
    criado_por INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS despesas (
    id SERIAL PRIMARY KEY,
    categoria VARCHAR(30) NOT NULL CHECK (categoria IN (
        'aluguel', 'contas', 'manutencao', 'eventos', 'missoes', 'material', 'salarios', 'outros'
    )),
    descricao TEXT,
    valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
    forma_pagamento VARCHAR(30) DEFAULT 'dinheiro',
    data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
    criado_por INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membros_celula_celula ON membros_celula(celula_id);
CREATE INDEX IF NOT EXISTS idx_membros_celula_usuario ON membros_celula(usuario_id);
CREATE INDEX IF NOT EXISTS idx_membros_ministerio_ministerio ON membros_ministerio(ministerio_id);
CREATE INDEX IF NOT EXISTS idx_membros_ministerio_usuario ON membros_ministerio(usuario_id);
CREATE INDEX IF NOT EXISTS idx_presencas_culto_evento ON presencas_culto(evento_id);
CREATE INDEX IF NOT EXISTS idx_presencas_culto_usuario ON presencas_culto(usuario_id);
CREATE INDEX IF NOT EXISTS idx_dizimos_data ON dizimos_ofertas(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_dizimos_usuario ON dizimos_ofertas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_despesas_data ON despesas(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria ON despesas(categoria);
