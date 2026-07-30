-- ============================================
-- MIGRATION 003 - MODULO CURSOS
-- ============================================

-- Cursos (Consolidacao, CME, CTL, Casais Radicais, etc)
CREATE TABLE IF NOT EXISTS cursos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    ativo BOOLEAN DEFAULT true,
    criado_por INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Turmas de um curso
CREATE TABLE IF NOT EXISTS turmas (
    id SERIAL PRIMARY KEY,
    curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    professor VARCHAR(150),
    data_inicio DATE,
    data_fim DATE,
    dias_semana VARCHAR(100),
    horario VARCHAR(50),
    local VARCHAR(200),
    max_alunos INTEGER,
    status VARCHAR(20) DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada', 'cancelada', 'planejada')),
    criado_por INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Inscricoes (aluno em uma turma)
CREATE TABLE IF NOT EXISTS inscricoes_cursos (
    id SERIAL PRIMARY KEY,
    turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id),
    nome_completo VARCHAR(150) NOT NULL,
    telefone VARCHAR(20),
    email VARCHAR(150),
    data_inscricao DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'inscrito' CHECK (status IN ('inscrito', 'confirmado', 'cancelado', 'concluido')),
    observacoes TEXT,
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Presencas (registro por aula)
CREATE TABLE IF NOT EXISTS presencas_cursos (
    id SERIAL PRIMARY KEY,
    inscricao_id INTEGER NOT NULL REFERENCES inscricoes_cursos(id) ON DELETE CASCADE,
    data_aula DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'presente' CHECK (status IN ('presente', 'ausente', 'atrasado', 'justificado')),
    criado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE (inscricao_id, data_aula)
);

-- Indices uteis
CREATE INDEX IF NOT EXISTS idx_turmas_curso ON turmas(curso_id);
CREATE INDEX IF NOT EXISTS idx_inscricoes_turma ON inscricoes_cursos(turma_id);
CREATE INDEX IF NOT EXISTS idx_presencas_inscricao ON presencas_cursos(inscricao_id);
CREATE INDEX IF NOT EXISTS idx_presencas_data ON presencas_cursos(data_aula);