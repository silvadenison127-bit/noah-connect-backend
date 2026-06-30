-- ============================================
-- NOAH CONNECT PLATFORM - SCHEMA DO BANCO (MVP)
-- ============================================

-- Tabela de usuários (membros e administradores)
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    tipo VARCHAR(20) NOT NULL DEFAULT 'membro' CHECK (tipo IN ('membro', 'admin', 'lider')),
    foto_url TEXT,
    membro_desde DATE DEFAULT CURRENT_DATE,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de eventos / agenda
CREATE TABLE IF NOT EXISTS eventos (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    descricao TEXT,
    tipo VARCHAR(30) DEFAULT 'evento' CHECK (tipo IN ('culto', 'evento', 'congresso', 'encontro', 'celula')),
    data_inicio TIMESTAMP NOT NULL,
    data_fim TIMESTAMP,
    local VARCHAR(200),
    criado_por INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de pedidos de oração
CREATE TABLE IF NOT EXISTS pedidos_oracao (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id),
    nome_solicitante VARCHAR(150),
    anonimo BOOLEAN DEFAULT false,
    titulo VARCHAR(150),
    pedido TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'em_oracao' CHECK (status IN ('em_oracao', 'respondido', 'encerrado')),
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_eventos_data ON eventos(data_inicio);
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos_oracao(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
