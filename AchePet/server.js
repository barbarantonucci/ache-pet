'use strict';

const [vMaior, vMenor] = process.versions.node.split('.').map(Number);
if (vMaior < 22 || (vMaior === 22 && vMenor < 13)) {
    console.error('\nO AchePet precisa do Node.js 22.13 ou mais novo. Você está com ' + process.versions.node + '.');
    console.error('Baixe em https://nodejs.org (versão LTS) e rode "npm start" de novo.\n');
    process.exit(1);
}

const http = require('http');
const path = require('path');
const config = require('./lib/config');
const { db } = require('./db/database');
const { HttpError, enviarJson, lerCorpoJson, servirArquivo } = require('./lib/http');
const { verificarToken } = require('./lib/seguranca');

if (config.SEED) require('./db/seed').popular();

/* ---------- Tabela de rotas ---------- */

const rotas = [...require('./routes/auth'), ...require('./routes/animais')].map(([metodo, caminho, handler, opcoes]) => ({
    metodo,
    handler,
    opcoes: opcoes || {},
    regex: new RegExp('^' + caminho.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'),
}));

function usuarioDoToken(req) {
    const cab = req.headers.authorization || '';
    if (!cab.startsWith('Bearer ')) return null;
    const dados = verificarToken(cab.slice(7));
    if (!dados) return null;
    return db.prepare('SELECT id, nome, email, cidade FROM usuarios WHERE id = ?').get(dados.sub) || null;
}

async function tratarApi(req, res, url) {
    const casadas = rotas.filter((r) => r.regex.test(url.pathname));
    if (!casadas.length) throw new HttpError(404, 'Rota não encontrada.');
    const rota = casadas.find((r) => r.metodo === req.method);
    if (!rota) throw new HttpError(405, 'Método não permitido.');

    const params = rota.regex.exec(url.pathname).groups || {};
    if (params.id !== undefined && !/^\d{1,12}$/.test(params.id)) throw new HttpError(400, 'Identificador inválido.');

    const query = Object.fromEntries(url.searchParams);
    const body = ['POST', 'PATCH', 'PUT'].includes(req.method)
        ? await lerCorpoJson(req, rota.opcoes.limiteBytes || 64 * 1024)
        : {};
    const user = usuarioDoToken(req);

    const r = await rota.handler({ req, res, params, query, body, user });
    enviarJson(res, r.status || 200, r.dados);
}

function cabecalhosSeguranca(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; '));
}

const servidor = http.createServer(async (req, res) => {
    cabecalhosSeguranca(res);
    try {
        const url = new URL(req.url, 'http://localhost');

        if (url.pathname.startsWith('/api/')) {
            return await tratarApi(req, res, url);
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido.');

        // Fotos enviadas pelos usuários
        if (url.pathname.startsWith('/uploads/')) {
            if (servirArquivo(req, res, config.UPLOADS_DIR, url.pathname.slice('/uploads/'.length), 'public, max-age=604800')) return;
            throw new HttpError(404, 'Arquivo não encontrado.');
        }

        // Site (HTML/CSS/JS/Media)
        const rel = url.pathname === '/' ? 'tela-inicial.html' : url.pathname.slice(1);
        if (servirArquivo(req, res, config.PUBLIC_DIR, rel)) return;
        if (servirArquivo(req, res, config.PUBLIC_DIR, rel + '.html')) return;

        throw new HttpError(404, 'Página não encontrada.');
    } catch (erro) {
        if (res.headersSent) return res.end();
        if (erro instanceof HttpError) {
            if (req.url.startsWith('/api/')) {
                return enviarJson(res, erro.status, { erro: erro.message, campos: erro.campos });
            }
            res.writeHead(erro.status, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end(erro.message);
        }
        console.error('[erro]', erro);
        enviarJson(res, 500, { erro: 'Erro interno. Tente novamente em instantes.' });
    }
});

servidor.listen(config.PORTA, () => {
    console.log(`AchePet rodando em http://localhost:${config.PORTA}`);
});
