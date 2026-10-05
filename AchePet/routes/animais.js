'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, transacao } = require('../db/database');
const { HttpError } = require('../lib/http');
const { UPLOADS_DIR } = require('../lib/config');
const { normalizarTexto, limitar } = require('../lib/seguranca');
const { enviarEmail } = require('../lib/email');

const ESPECIES = ['Cachorro', 'Gato', 'Ave', 'Outros'];
const SEXOS = ['femea', 'macho', 'nao-identificado'];
const PORTES = ['Pequeno', 'Médio', 'Grande', 'Não especificado'];
const STATUS = ['perdido', 'encontrado'];
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const MAX_FOTOS = 5;
const MAX_FOTO_BYTES = 3 * 1024 * 1024;

const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const exigirUsuario = (user) => {
    if (!user) throw new HttpError(401, 'Entre na sua conta para continuar.');
    return user;
};

function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- Fotos (base64 -> arquivo) ---------- */

function detectarImagem(buf) {
    if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
    if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
    return null;
}

function salvarFotos(dataUrls) {
    const salvas = [];
    try {
        for (const url of dataUrls) {
            const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(url));
            if (!m) throw new HttpError(400, 'Formato de foto inválido. Use JPG, PNG ou WEBP.');
            const buf = Buffer.from(m[1], 'base64');
            if (buf.length > MAX_FOTO_BYTES) throw new HttpError(400, 'Cada foto pode ter no máximo 3 MB.');
            const ext = detectarImagem(buf);
            if (!ext) throw new HttpError(400, 'Uma das fotos não é uma imagem válida.');

            const dir = path.join(UPLOADS_DIR, 'animais');
            fs.mkdirSync(dir, { recursive: true });
            const nome = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
            fs.writeFileSync(path.join(dir, nome), buf);
            salvas.push(`uploads/animais/${nome}`);
        }
    } catch (e) {
        salvas.forEach(removerArquivo);
        throw e;
    }
    return salvas;
}

function removerArquivo(caminho) {
    // Só apaga arquivos enviados por usuários (nunca os de Media/)
    if (!caminho.startsWith('uploads/animais/')) return;
    const alvo = path.join(UPLOADS_DIR, 'animais', path.basename(caminho));
    try { fs.unlinkSync(alvo); } catch { /* já não existe */ }
}

/* ---------- Formatação ---------- */

function resumo(a) {
    return {
        id: a.id, status: a.status, nome: a.nome, especie: a.especie, idade: a.idade,
        sexo: a.sexo, raca: a.raca, porte: a.porte, cor: a.cor,
        cidade: a.cidade, uf: a.uf, data: a.data_ocorrencia, resolvido: !!a.resolvido,
        foto: a.foto || null,
    };
}

const SELECT_RESUMO = `
    SELECT a.*, (SELECT caminho FROM fotos f WHERE f.animal_id = a.id ORDER BY f.ordem, f.id LIMIT 1) AS foto
    FROM animais a`;

/* ---------- Rotas ---------- */

async function listar({ query }) {
    const onde = ['a.resolvido = 0'];
    const params = [];

    if (query.status) {
        if (!STATUS.includes(query.status)) throw new HttpError(400, 'Status inválido.');
        onde.push('a.status = ?'); params.push(query.status);
    }
    if (query.cidade) {
        onde.push('a.cidade_norm LIKE ?'); params.push(`%${normalizarTexto(query.cidade).replace(/[%_]/g, '')}%`);
    }
    if (query.uf && UFS.includes(String(query.uf).toUpperCase())) {
        onde.push('a.uf = ?'); params.push(String(query.uf).toUpperCase());
    }
    if (query.especie && ESPECIES.includes(query.especie)) { onde.push('a.especie = ?'); params.push(query.especie); }
    if (query.sexo && SEXOS.includes(query.sexo)) { onde.push('a.sexo = ?'); params.push(query.sexo); }
    if (query.porte && PORTES.includes(query.porte)) { onde.push('a.porte = ?'); params.push(query.porte); }
    if (query.cor) {
        onde.push('LOWER(a.cor) LIKE ?'); params.push(`%${String(query.cor).toLowerCase().replace(/[%_]/g, '')}%`);
    }

    const limite = Math.min(Math.max(parseInt(query.limite, 10) || 12, 1), 48);
    const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
    const clausula = `WHERE ${onde.join(' AND ')}`;

    const total = db.prepare(`SELECT COUNT(*) AS n FROM animais a ${clausula}`).get(...params).n;
    const itens = db.prepare(
        `${SELECT_RESUMO} ${clausula} ORDER BY a.data_ocorrencia DESC, a.id DESC LIMIT ? OFFSET ?`
    ).all(...params, limite, offset).map(resumo);

    return { dados: { itens, total, limite, offset } };
}

async function detalhe({ params, user }) {
    const a = db.prepare(
        `SELECT a.*, u.nome AS dono_nome FROM animais a JOIN usuarios u ON u.id = a.usuario_id WHERE a.id = ?`
    ).get(params.id);
    if (!a) throw new HttpError(404, 'Animal não encontrado.');

    const fotos = db.prepare('SELECT caminho FROM fotos WHERE animal_id = ? ORDER BY ordem, id').all(a.id).map((f) => f.caminho);
    return {
        dados: {
            ...resumo({ ...a, foto: fotos[0] }),
            caracteristicas: a.caracteristicas,
            fotos,
            publicadoPor: a.dono_nome.split(' ')[0],
            meu: !!user && user.id === a.usuario_id,
        },
    };
}

async function criar({ req, body, user }) {
    exigirUsuario(user);
    if (!limitar(`novo-animal:${user.id}`, 10, 60 * 60 * 1000)) {
        throw new HttpError(429, 'Você cadastrou muitos animais em pouco tempo. Tente mais tarde.');
    }

    const d = {
        status: texto(body.status, 20),
        nome: texto(body.nome, 60) || 'Sem nome',
        especie: texto(body.especie, 20),
        idade: texto(body.idade, 40) || null,
        sexo: texto(body.sexo, 20) || 'nao-identificado',
        raca: texto(body.raca, 60) || null,
        porte: texto(body.porte, 20) || 'Não especificado',
        cor: texto(body.cor, 60) || null,
        caracteristicas: String(body.caracteristicas ?? '').trim().slice(0, 600) || null,
        cidade: texto(body.cidade, 80),
        uf: texto(body.uf, 2).toUpperCase(),
        data: texto(body.data, 10),
    };
    const fotos = Array.isArray(body.fotos) ? body.fotos : [];

    const erros = {};
    if (!STATUS.includes(d.status)) erros.status = 'Escolha se o animal está perdido ou foi encontrado.';
    if (!ESPECIES.includes(d.especie)) erros.especie = 'Escolha a espécie.';
    if (!SEXOS.includes(d.sexo)) erros.sexo = 'Escolha o sexo.';
    if (!PORTES.includes(d.porte)) erros.porte = 'Porte inválido.';
    if (d.cidade.length < 2) erros.cidade = 'Informe a cidade.';
    if (!UFS.includes(d.uf)) erros.uf = 'Escolha o estado.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data) || Number.isNaN(Date.parse(d.data))) erros.data = 'Informe uma data válida.';
    else if (d.data > hojeISO()) erros.data = 'A data não pode estar no futuro.';
    if (fotos.length < 1) erros.fotos = 'Envie pelo menos 1 foto.';
    if (fotos.length > MAX_FOTOS) erros.fotos = `Máximo de ${MAX_FOTOS} fotos.`;
    if (Object.keys(erros).length) throw new HttpError(400, Object.values(erros)[0], erros);

    const caminhos = salvarFotos(fotos);
    try {
        const id = transacao(() => {
            const r = db.prepare(`
                INSERT INTO animais (usuario_id, status, nome, especie, idade, sexo, raca, porte, cor,
                                     caracteristicas, cidade, cidade_norm, uf, data_ocorrencia)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(user.id, d.status, d.nome, d.especie, d.idade, d.sexo, d.raca, d.porte, d.cor,
                d.caracteristicas, d.cidade, normalizarTexto(d.cidade), d.uf, d.data);
            const novoId = Number(r.lastInsertRowid);
            const ins = db.prepare('INSERT INTO fotos (animal_id, caminho, ordem) VALUES (?, ?, ?)');
            caminhos.forEach((c, i) => ins.run(novoId, c, i));
            return novoId;
        });
        return { status: 201, dados: { ok: true, id } };
    } catch (e) {
        caminhos.forEach(removerArquivo);
        throw e;
    }
}

function animalDoUsuario(id, user) {
    exigirUsuario(user);
    const a = db.prepare('SELECT * FROM animais WHERE id = ?').get(id);
    if (!a) throw new HttpError(404, 'Animal não encontrado.');
    if (a.usuario_id !== user.id) throw new HttpError(403, 'Você não tem permissão para alterar este anúncio.');
    return a;
}

async function atualizarResolvido({ params, body, user }) {
    const a = animalDoUsuario(params.id, user);
    const valor = body.resolvido === true || body.resolvido === 1 ? 1 : 0;
    db.prepare('UPDATE animais SET resolvido = ? WHERE id = ?').run(valor, a.id);
    return { dados: { ok: true, resolvido: !!valor } };
}

async function excluir({ params, user }) {
    const a = animalDoUsuario(params.id, user);
    const fotos = db.prepare('SELECT caminho FROM fotos WHERE animal_id = ?').all(a.id);
    db.prepare('DELETE FROM animais WHERE id = ?').run(a.id);
    fotos.forEach((f) => removerArquivo(f.caminho));
    return { dados: { ok: true } };
}

async function meusAnimais({ user }) {
    exigirUsuario(user);
    const itens = db.prepare(`
        SELECT a.*,
               (SELECT caminho FROM fotos f WHERE f.animal_id = a.id ORDER BY f.ordem, f.id LIMIT 1) AS foto,
               (SELECT COUNT(*) FROM contatos c WHERE c.animal_id = a.id) AS total_contatos,
               (SELECT COUNT(*) FROM contatos c WHERE c.animal_id = a.id AND c.lido = 0) AS nao_lidos
        FROM animais a WHERE a.usuario_id = ? ORDER BY a.id DESC`
    ).all(user.id).map((a) => ({ ...resumo(a), totalContatos: a.total_contatos, naoLidos: a.nao_lidos }));
    return { dados: { itens } };
}

/* ---------- Contato ---------- */

async function enviarContato({ params, body, user }) {
    exigirUsuario(user);
    const a = db.prepare(
        `SELECT a.*, u.email AS dono_email, u.nome AS dono_nome FROM animais a JOIN usuarios u ON u.id = a.usuario_id WHERE a.id = ?`
    ).get(params.id);
    if (!a) throw new HttpError(404, 'Animal não encontrado.');
    if (a.usuario_id === user.id) throw new HttpError(400, 'Este anúncio é seu.');
    if (!limitar(`contato:${user.id}:${a.id}`, 3, 24 * 60 * 60 * 1000)) {
        throw new HttpError(429, 'Você já enviou mensagens demais para este anúncio hoje.');
    }

    const nome = texto(body.nome, 120) || user.nome;
    const email = texto(body.email, 160).toLowerCase() || user.email;
    const telefone = String(body.telefone ?? '').replace(/[^\d()+\-\s]/g, '').trim().slice(0, 20) || null;
    const mensagem = String(body.mensagem ?? '').trim().slice(0, 1000);

    if (nome.length < 2) throw new HttpError(400, 'Informe seu nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (telefone && telefone.replace(/\D/g, '').length < 10) throw new HttpError(400, 'Telefone inválido (use DDD + número).');
    if (mensagem.length < 10) throw new HttpError(400, 'Escreva uma mensagem com pelo menos 10 caracteres.');

    db.prepare(
        'INSERT INTO contatos (animal_id, remetente_id, nome, email, telefone, mensagem) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(a.id, user.id, nome, email, telefone, mensagem);

    // Aviso por e-mail ao dono do anúncio (não bloqueia a resposta)
    enviarEmail({
        para: a.dono_email,
        assunto: `AchePet - novo contato sobre ${a.nome}`,
        texto: `Olá, ${a.dono_nome.split(' ')[0]}!\n\n${nome} entrou em contato sobre o anúncio de "${a.nome}":\n\n"${mensagem}"\n\nResponda para: ${email}${telefone ? ` | Telefone: ${telefone}` : ''}\n\nVocê também pode ver tudo em "Minha conta" no AchePet.`,
    });

    return { status: 201, dados: { ok: true } };
}

async function meusContatos({ user }) {
    exigirUsuario(user);
    const itens = db.prepare(`
        SELECT c.id, c.animal_id AS animalId, a.nome AS animalNome, a.status AS animalStatus,
               c.nome, c.email, c.telefone, c.mensagem, c.lido, c.criado_em AS criadoEm
        FROM contatos c JOIN animais a ON a.id = c.animal_id
        WHERE a.usuario_id = ? ORDER BY c.id DESC LIMIT 200`
    ).all(user.id).map((c) => ({ ...c, lido: !!c.lido }));
    return { dados: { itens } };
}

async function marcarLido({ params, user }) {
    exigirUsuario(user);
    const r = db.prepare(`
        UPDATE contatos SET lido = 1
        WHERE id = ? AND animal_id IN (SELECT id FROM animais WHERE usuario_id = ?)`
    ).run(params.id, user.id);
    if (!r.changes) throw new HttpError(404, 'Mensagem não encontrada.');
    return { dados: { ok: true } };
}

module.exports = [
    ['GET', '/api/animais', listar],
    ['POST', '/api/animais', criar, { limiteBytes: 20 * 1024 * 1024 }],
    ['GET', '/api/meus-animais', meusAnimais],
    ['GET', '/api/meus-contatos', meusContatos],
    ['PATCH', '/api/contatos/:id/lido', marcarLido],
    ['GET', '/api/animais/:id', detalhe],
    ['PATCH', '/api/animais/:id', atualizarResolvido],
    ['DELETE', '/api/animais/:id', excluir],
    ['POST', '/api/animais/:id/contatos', enviarContato],
];
