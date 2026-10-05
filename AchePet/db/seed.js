'use strict';

/**
 * Dados de exemplo: os mesmos 24 animais que estavam escritos direto no HTML,
 * agora no banco, usando os MESMOS caminhos de foto (pasta Media/).
 * Rodar manualmente:  npm run seed
 */
const { db, transacao } = require('./database');
const { hashSenha, normalizarTexto } = require('../lib/seguranca');
const crypto = require('crypto');

const P = 'Media/Animais Perdidos';
const E = 'Media/Animais Encontrados';

// [status, nome, espécie, raça, foto, data]
const ANIMAIS = [
    ['perdido', 'Isac', 'Cachorro', null, `${P}/Cachorro/Cachorro 1.jpg`, '2026-09-08'],
    ['perdido', 'Bela', 'Cachorro', null, `${P}/Cachorro/Cachorro 2.jpg`, '2025-01-24'],
    ['perdido', 'Thor', 'Cachorro', null, `${P}/Cachorro/Cachorro 3.jpg`, '2026-09-19'],
    ['perdido', 'Pipoca', 'Cachorro', null, `${P}/Cachorro/Cachorro 4.jpg`, '2025-10-03'],
    ['perdido', 'Xandy', 'Cachorro', null, `${P}/Cachorro/Cachorro 5.jpg`, '2025-12-13'],
    ['perdido', 'Ally', 'Gato', null, `${P}/Gato/Gato 1.jpg`, '2025-04-10'],
    ['perdido', 'Mel', 'Gato', null, `${P}/Gato/Gato 2.jpg`, '2026-06-23'],
    ['perdido', 'Dom', 'Gato', null, `${P}/Gato/Gato 3.jpg`, '2025-08-27'],
    ['perdido', 'Sol', 'Gato', null, `${P}/Gato/Gato 4.jpg`, '2026-05-04'],
    ['perdido', 'Paçoca', 'Gato', null, `${P}/Gato/Gato 5.jpg`, '2026-09-15'],
    ['perdido', 'Tony', 'Gato', null, `${P}/Gato/Gato 9.jpg`, '2026-05-19'],
    ['perdido', 'Loki', 'Gato', null, `${P}/Gato/Gato 10.jpg`, '2026-03-13'],

    ['encontrado', 'Nick', 'Outros', 'Coelho', `${E}/Outros/Coelho 1.jpg`, '2026-08-02'],
    ['encontrado', 'Lili', 'Outros', 'Coelho', `${E}/Outros/Coelho 2.jpg`, '2025-12-27'],
    ['encontrado', 'Amora', 'Gato', null, `${E}/Gato/Gato 6.png`, '2026-08-07'],
    ['encontrado', 'Bob', 'Gato', null, `${E}/Gato/Gato 7.jpg`, '2025-09-18'],
    ['encontrado', 'Edu', 'Gato', null, `${E}/Gato/Gato 8.jpg`, '2026-06-19'],
    ['encontrado', 'Eddie', 'Cachorro', null, `${E}/Cachorro/Cachorro 6.jpg`, '2025-06-11'],
    ['encontrado', 'Susie', 'Cachorro', null, `${E}/Cachorro/Cachorro 7.jpg`, '2026-04-24'],
    ['encontrado', 'Nina', 'Cachorro', null, `${E}/Cachorro/Cachorro 8.jpg`, '2026-08-30'],
    ['encontrado', 'Cacau', 'Cachorro', null, `${E}/Cachorro/Cachorro 9.jpg`, '2026-05-04'],
    ['encontrado', 'Nick', 'Cachorro', null, `${E}/Cachorro/Cachorro 10.jpg`, '2026-05-15'],
    ['encontrado', 'Kaka', 'Cachorro', null, `${E}/Cachorro/Cachorro 11.jpg`, '2026-10-03'],
    ['encontrado', 'Beth', 'Cachorro', null, `${E}/Cachorro/Cachorro 12.jpg`, '2026-09-26'],
];

function popular() {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM animais').get();
    if (n > 0) return false;

    transacao(() => {
        // Usuário "dono" dos exemplos: senha aleatória, ninguém consegue logar nele
        const u = db.prepare(
            'INSERT INTO usuarios (nome, email, cpf, cidade, senha_hash) VALUES (?, ?, NULL, ?, ?)'
        ).run('Exemplos AchePet', 'exemplos@achepet.local', 'São Paulo', hashSenha(crypto.randomBytes(24).toString('hex')));
        const donoId = Number(u.lastInsertRowid);

        const insAnimal = db.prepare(`
            INSERT INTO animais (usuario_id, status, nome, especie, raca, cidade, cidade_norm, uf, data_ocorrencia)
            VALUES (?, ?, ?, ?, ?, 'São Paulo', ?, 'SP', ?)`);
        const insFoto = db.prepare('INSERT INTO fotos (animal_id, caminho, ordem) VALUES (?, ?, 0)');

        for (const [status, nome, especie, raca, foto, data] of ANIMAIS) {
            const r = insAnimal.run(donoId, status, nome, especie, raca, normalizarTexto('São Paulo'), data);
            insFoto.run(Number(r.lastInsertRowid), foto);
        }
    });
    return true;
}

module.exports = { popular };

if (require.main === module) {
    console.log(popular() ? `Banco populado com ${ANIMAIS.length} animais de exemplo.` : 'O banco já tem animais; nada foi feito.');
}
