-- ============================================================
-- AchePet | Esquema do banco de dados (SQLite)
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    cpf         TEXT    UNIQUE,                 -- somente dígitos (NULL para usuário de sistema)
    cidade      TEXT    NOT NULL,
    senha_hash  TEXT    NOT NULL,               -- scrypt: salt:hash (nunca a senha pura)
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS animais (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id       INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    status           TEXT    NOT NULL CHECK (status IN ('perdido', 'encontrado')),
    nome             TEXT    NOT NULL DEFAULT 'Sem nome',
    especie          TEXT    NOT NULL CHECK (especie IN ('Cachorro', 'Gato', 'Ave', 'Outros')),
    idade            TEXT,
    sexo             TEXT    NOT NULL DEFAULT 'nao-identificado'
                             CHECK (sexo IN ('femea', 'macho', 'nao-identificado')),
    raca             TEXT,
    porte            TEXT    NOT NULL DEFAULT 'Não especificado'
                             CHECK (porte IN ('Pequeno', 'Médio', 'Grande', 'Não especificado')),
    cor              TEXT,
    caracteristicas  TEXT,
    cidade           TEXT    NOT NULL,
    cidade_norm      TEXT    NOT NULL,          -- cidade sem acento/minúscula, usada na busca
    uf               TEXT    NOT NULL,
    data_ocorrencia  TEXT    NOT NULL,          -- YYYY-MM-DD (quando sumiu / foi encontrado)
    resolvido        INTEGER NOT NULL DEFAULT 0 CHECK (resolvido IN (0, 1)),
    criado_em        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_animais_mural   ON animais (status, resolvido, data_ocorrencia DESC);
CREATE INDEX IF NOT EXISTS idx_animais_cidade  ON animais (cidade_norm);
CREATE INDEX IF NOT EXISTS idx_animais_usuario ON animais (usuario_id);

CREATE TABLE IF NOT EXISTS fotos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id  INTEGER NOT NULL REFERENCES animais(id) ON DELETE CASCADE,
    caminho    TEXT    NOT NULL,                -- ex.: uploads/animais/abc.jpg ou Media/Animais Perdidos/...
    ordem      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fotos_animal ON fotos (animal_id, ordem);

CREATE TABLE IF NOT EXISTS contatos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id     INTEGER NOT NULL REFERENCES animais(id) ON DELETE CASCADE,
    remetente_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nome          TEXT    NOT NULL,
    email         TEXT    NOT NULL,
    telefone      TEXT,
    mensagem      TEXT    NOT NULL,
    lido          INTEGER NOT NULL DEFAULT 0 CHECK (lido IN (0, 1)),
    criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contatos_animal ON contatos (animal_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS recuperacao_senha (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    codigo_hash   TEXT    NOT NULL,             -- HMAC do código de 6 dígitos
    token_hash    TEXT,                         -- preenchido após o código ser confirmado
    tentativas    INTEGER NOT NULL DEFAULT 0,
    usado         INTEGER NOT NULL DEFAULT 0 CHECK (usado IN (0, 1)),
    expira_em     TEXT    NOT NULL,
    criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recuperacao_usuario ON recuperacao_senha (usuario_id, criado_em DESC);
