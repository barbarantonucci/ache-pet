'use strict';

const fs = require('fs');
const path = require('path');

class HttpError extends Error {
    constructor(status, mensagem, campos) {
        super(mensagem);
        this.status = status;
        this.campos = campos;
    }
}

function enviarJson(res, status, objeto) {
    const corpo = JSON.stringify(objeto);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(corpo),
        'Cache-Control': 'no-store',
    });
    res.end(corpo);
}

function lerCorpoJson(req, limiteBytes) {
    return new Promise((resolve, reject) => {
        let tamanho = 0;
        let grande = false;
        const partes = [];
        req.on('data', (c) => {
            tamanho += c.length;
            if (tamanho > limiteBytes) { grande = true; partes.length = 0; return; }
            if (!grande) partes.push(c);
        });
        req.on('end', () => {
            if (grande) return reject(new HttpError(413, 'Os dados enviados são grandes demais.'));
            if (!partes.length) return resolve({});
            try {
                const obj = JSON.parse(Buffer.concat(partes).toString('utf8'));
                resolve(obj && typeof obj === 'object' ? obj : {});
            } catch {
                reject(new HttpError(400, 'JSON inválido.'));
            }
        });
        req.on('error', reject);
    });
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
};

/** Serve arquivo estático de dentro de `base`. Retorna false se não encontrou. */
function servirArquivo(req, res, base, caminhoRelativo, cache) {
    let alvo;
    try {
        alvo = path.normalize(path.join(base, decodeURIComponent(caminhoRelativo)));
    } catch {
        return false;
    }
    if (alvo !== base && !alvo.startsWith(base + path.sep)) return false;      // path traversal
    if (alvo.split(path.sep).some((p) => p.startsWith('.'))) return false;      // arquivos ocultos

    let stat;
    try { stat = fs.statSync(alvo); } catch { return false; }
    if (stat.isDirectory()) {
        alvo = path.join(alvo, 'index.html');
        try { stat = fs.statSync(alvo); } catch { return false; }
    }
    if (!stat.isFile()) return false;

    const tipo = MIME[path.extname(alvo).toLowerCase()];
    if (!tipo) return false;

    res.writeHead(200, {
        'Content-Type': tipo,
        'Content-Length': stat.size,
        'Cache-Control': cache || 'no-cache',
    });
    if (req.method === 'HEAD') return res.end(), true;
    fs.createReadStream(alvo).pipe(res);
    return true;
}

module.exports = { HttpError, enviarJson, lerCorpoJson, servirArquivo };
