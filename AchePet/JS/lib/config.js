'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');

// Carrega o arquivo .env (sem dependências externas)
const arquivoEnv = path.join(RAIZ, '.env');
if (fs.existsSync(arquivoEnv)) {
    for (const linha of fs.readFileSync(arquivoEnv, 'utf8').split(/\r?\n/)) {
        const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
        if (m && !(m[1] in process.env)) {
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
}

// Segredo para assinar tokens: variável de ambiente ou arquivo gerado automaticamente
function carregarSegredo() {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) return process.env.JWT_SECRET;
    const arquivo = path.join(RAIZ, 'db', '.secret');
    if (!fs.existsSync(arquivo)) {
        fs.writeFileSync(arquivo, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
    }
    return fs.readFileSync(arquivo, 'utf8').trim();
}

const PRODUCAO = process.env.NODE_ENV === 'production';

module.exports = {
    RAIZ,
    PORTA: Number(process.env.PORT) || 3000,
    PRODUCAO,
    SEGREDO: carregarSegredo(),
    PUBLIC_DIR: path.join(RAIZ, 'public'),
    UPLOADS_DIR: path.join(RAIZ, 'uploads'),
    TOKEN_DURACAO_SEG: 60 * 60 * 24 * 7, // 7 dias
    CODIGO_DURACAO_MIN: 15,
    // Dados de exemplo (os mesmos cards que estavam fixos no HTML). Desligue com SEED=false
    SEED: process.env.SEED ? process.env.SEED !== 'false' : !PRODUCAO,
    MAIL_FROM: process.env.MAIL_FROM || '',
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
};
