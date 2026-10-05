'use strict';

const { db } = require('../db/database');
const { HttpError } = require('../lib/http');
const { enviarEmail } = require('../lib/email');
const { CODIGO_DURACAO_MIN } = require('../lib/config');
const S = require('../lib/seguranca');

const GENERICO = 'Se o e-mail estiver cadastrado, enviamos um código de recuperação.';

const limparNome = (v) => String(v || '').trim().replace(/\s+/g, ' ');

function usuarioPublico(u) {
    return { id: u.id, nome: u.nome, email: u.email, cidade: u.cidade };
}

function ip(req) {
    return req.socket.remoteAddress || 'ip';
}

function emailValido(valor) {
    const email = String(valor || '').trim().toLowerCase();
    return email.length <= 160 && S.EMAIL_RE.test(email) ? email : null;
}

function agoraMais(minutos) {
    return new Date(Date.now() + minutos * 60000).toISOString();
}

/* ---------- Cadastro ---------- */

async function registrar({ req, body }) {
    if (!S.limitar(`registro:${ip(req)}`, 10, 60 * 60 * 1000)) {
        throw new HttpError(429, 'Muitas tentativas. Tente novamente mais tarde.');
    }

    const nome = limparNome(body.nome);
    const email = emailValido(body.email);
    const cpf = String(body.cpf || '').replace(/\D/g, '');
    const cidade = limparNome(body.cidade);
    const senha = String(body.senha || '');
    const confirmar = String(body.confirmarSenha || '');

    const campos = {};
    if (nome.length < 3 || nome.length > 120) campos.nome = 'Informe seu nome completo.';
    if (!email) campos.email = 'Informe um e-mail válido.';
    if (!S.validarCPF(cpf)) campos.cpf = 'CPF inválido.';
    if (cidade.length < 2 || cidade.length > 80) campos.cidade = 'Informe sua cidade.';
    if (senha.length < 8 || senha.length > 72) campos.senha = 'A senha deve ter de 8 a 72 caracteres.';
    if (senha !== confirmar) campos.confirmarSenha = 'As senhas não coincidem.';
    if (Object.keys(campos).length) throw new HttpError(400, Object.values(campos)[0], campos);

    const existe = db.prepare('SELECT email, cpf FROM usuarios WHERE email = ? OR cpf = ?').get(email, cpf);
    if (existe) {
        throw new HttpError(409, 'Já existe uma conta com este e-mail ou CPF.');
    }

    const r = db.prepare(
        'INSERT INTO usuarios (nome, email, cpf, cidade, senha_hash) VALUES (?, ?, ?, ?, ?)'
    ).run(nome, email, cpf, cidade, S.hashSenha(senha));

    return { status: 201, dados: { ok: true, id: Number(r.lastInsertRowid) } };
}

/* ---------- Login ---------- */

async function login({ req, body }) {
    const email = emailValido(body.email);
    const senha = String(body.senha || '');
    if (!email || !senha) throw new HttpError(400, 'Informe e-mail e senha.');

    if (!S.limitar(`login:${ip(req)}:${email}`, 8, 10 * 60 * 1000)) {
        throw new HttpError(429, 'Muitas tentativas de login. Aguarde alguns minutos.');
    }

    const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
    const ok = S.verificarSenha(senha, u ? u.senha_hash : S.HASH_FALSO);
    if (!u || !ok) throw new HttpError(401, 'E-mail ou senha incorretos.');

    return { dados: { token: S.assinar({ sub: u.id }), usuario: usuarioPublico(u) } };
}

async function eu({ user }) {
    if (!user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    return { dados: { usuario: usuarioPublico(user) } };
}

/* ---------- Recuperação de senha (3 etapas) ---------- */

// Etapa 1: e-mail -> envia código de 6 dígitos
async function esqueciSenha({ req, body }) {
    const email = emailValido(body.email);
    if (!email) throw new HttpError(400, 'Informe um e-mail válido.');

    if (!S.limitar(`esqueci:${ip(req)}`, 10, 60 * 60 * 1000) ||
        !S.limitar(`esqueci-email:${email}`, 3, CODIGO_DURACAO_MIN * 60 * 1000)) {
        throw new HttpError(429, 'Muitos pedidos de código. Aguarde alguns minutos.');
    }

    const u = db.prepare('SELECT id, nome FROM usuarios WHERE email = ?').get(email);
    if (u) {
        const codigo = S.codigoSeisDigitos();
        db.prepare('UPDATE recuperacao_senha SET usado = 1 WHERE usuario_id = ? AND usado = 0').run(u.id);
        db.prepare('INSERT INTO recuperacao_senha (usuario_id, codigo_hash, expira_em) VALUES (?, ?, ?)')
            .run(u.id, S.hmac(`${u.id}:${codigo}`), agoraMais(CODIGO_DURACAO_MIN));

        await enviarEmail({
            para: email,
            assunto: 'AchePet - código de recuperação de senha',
            texto: `Olá, ${u.nome.split(' ')[0]}!\n\nSeu código de recuperação é: ${codigo}\n\nEle vale por ${CODIGO_DURACAO_MIN} minutos. Se você não pediu a troca de senha, ignore este e-mail.\n\nAchePet`,
        });
    }
    // Resposta idêntica exista ou não o e-mail (evita descobrir quem tem conta)
    return { dados: { ok: true, mensagem: GENERICO } };
}

// Etapa 2: confirma o código -> devolve token de redefinição
async function verificarCodigo({ req, body }) {
    const email = emailValido(body.email);
    const codigo = String(body.codigo || '').replace(/\D/g, '');
    const invalido = new HttpError(400, 'Código inválido ou expirado.');
    if (!email || codigo.length !== 6) throw invalido;

    if (!S.limitar(`verifica:${ip(req)}`, 30, 60 * 60 * 1000)) {
        throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    }

    const u = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (!u) throw invalido;

    const linha = db.prepare(
        'SELECT * FROM recuperacao_senha WHERE usuario_id = ? AND usado = 0 ORDER BY id DESC LIMIT 1'
    ).get(u.id);
    if (!linha || linha.expira_em < new Date().toISOString() || linha.tentativas >= 5) throw invalido;

    if (!S.iguais(linha.codigo_hash, S.hmac(`${u.id}:${codigo}`))) {
        db.prepare('UPDATE recuperacao_senha SET tentativas = tentativas + 1 WHERE id = ?').run(linha.id);
        throw invalido;
    }

    const token = S.tokenAleatorio();
    db.prepare('UPDATE recuperacao_senha SET token_hash = ?, expira_em = ? WHERE id = ?')
        .run(S.hmac(token), agoraMais(CODIGO_DURACAO_MIN), linha.id);

    return { dados: { ok: true, token } };
}

// Etapa 3: token + nova senha
async function redefinirSenha({ body }) {
    const email = emailValido(body.email);
    const token = String(body.token || '');
    const senha = String(body.senha || '');
    const confirmar = String(body.confirmarSenha || '');
    const invalido = new HttpError(400, 'Link expirado. Peça um novo código.');

    if (senha.length < 8 || senha.length > 72) throw new HttpError(400, 'A senha deve ter de 8 a 72 caracteres.');
    if (senha !== confirmar) throw new HttpError(400, 'As senhas não coincidem.');
    if (!email || !token) throw invalido;

    const u = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (!u) throw invalido;

    const linha = db.prepare(
        'SELECT * FROM recuperacao_senha WHERE usuario_id = ? AND usado = 0 AND token_hash IS NOT NULL ORDER BY id DESC LIMIT 1'
    ).get(u.id);
    if (!linha || linha.expira_em < new Date().toISOString() || !S.iguais(linha.token_hash, S.hmac(token))) {
        throw invalido;
    }

    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(S.hashSenha(senha), u.id);
    db.prepare('UPDATE recuperacao_senha SET usado = 1 WHERE usuario_id = ?').run(u.id);

    return { dados: { ok: true } };
}

module.exports = [
    ['POST', '/api/auth/registrar', registrar],
    ['POST', '/api/auth/login', login],
    ['GET', '/api/auth/eu', eu],
    ['POST', '/api/auth/esqueci-senha', esqueciSenha],
    ['POST', '/api/auth/verificar-codigo', verificarCodigo],
    ['POST', '/api/auth/redefinir-senha', redefinirSenha],
];
