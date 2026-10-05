'use strict';

const crypto = require('crypto');
const { SEGREDO, TOKEN_DURACAO_SEG } = require('./config');

/* ---------- Senhas (scrypt + salt) ---------- */

function hashSenha(senha) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(senha, salt, 64);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verificarSenha(senha, armazenado) {
    const [saltHex, hashHex] = String(armazenado || '').split(':');
    if (!saltHex || !hashHex) return false;
    const esperado = Buffer.from(hashHex, 'hex');
    const calculado = crypto.scryptSync(senha, Buffer.from(saltHex, 'hex'), esperado.length);
    return crypto.timingSafeEqual(esperado, calculado);
}

// Hash "falso" usado para gastar o mesmo tempo quando o e-mail não existe
const HASH_FALSO = hashSenha(crypto.randomBytes(8).toString('hex'));

/* ---------- Tokens de sessão (JWT HS256) ---------- */

const b64 = (b) => Buffer.from(b).toString('base64url');

function assinar(dados) {
    const cabecalho = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const agora = Math.floor(Date.now() / 1000);
    const corpo = b64(JSON.stringify({ ...dados, iat: agora, exp: agora + TOKEN_DURACAO_SEG }));
    const assinatura = crypto.createHmac('sha256', SEGREDO).update(`${cabecalho}.${corpo}`).digest('base64url');
    return `${cabecalho}.${corpo}.${assinatura}`;
}

function verificarToken(token) {
    try {
        const [cabecalho, corpo, assinatura] = String(token).split('.');
        if (!cabecalho || !corpo || !assinatura) return null;
        const esperado = crypto.createHmac('sha256', SEGREDO).update(`${cabecalho}.${corpo}`).digest();
        const recebido = Buffer.from(assinatura, 'base64url');
        if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) return null;
        const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
        if (!dados.exp || dados.exp < Math.floor(Date.now() / 1000)) return null;
        return dados;
    } catch {
        return null;
    }
}

/* ---------- Códigos de recuperação ---------- */

function hmac(valor) {
    return crypto.createHmac('sha256', SEGREDO).update(String(valor)).digest('hex');
}

function codigoSeisDigitos() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function tokenAleatorio() {
    return crypto.randomBytes(32).toString('base64url');
}

function iguais(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------- Validações ---------- */

function normalizarTexto(txt) {
    return String(txt || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ');
}

function validarCPF(valor) {
    const cpf = String(valor || '').replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let t = 9; t < 11; t++) {
        let soma = 0;
        for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
        const digito = ((soma * 10) % 11) % 10;
        if (digito !== Number(cpf[t])) return false;
    }
    return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- Limite de requisições (em memória) ---------- */

const janelas = new Map();

/** Retorna true se ainda está dentro do limite. */
function limitar(chave, max, janelaMs) {
    const agora = Date.now();
    const lista = (janelas.get(chave) || []).filter((t) => agora - t < janelaMs);
    if (lista.length >= max) {
        janelas.set(chave, lista);
        return false;
    }
    lista.push(agora);
    janelas.set(chave, lista);
    return true;
}

setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of janelas) {
        if (!v.some((t) => agora - t < 60 * 60 * 1000)) janelas.delete(k);
    }
}, 10 * 60 * 1000).unref();

module.exports = {
    hashSenha, verificarSenha, HASH_FALSO,
    assinar, verificarToken,
    hmac, codigoSeisDigitos, tokenAleatorio, iguais,
    normalizarTexto, validarCPF, EMAIL_RE, limitar,
};
