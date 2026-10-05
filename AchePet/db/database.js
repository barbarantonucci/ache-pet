'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'achepet.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

/** Executa fn dentro de uma transação (rollback automático em caso de erro). */
function transacao(fn) {
    db.exec('BEGIN');
    try {
        const resultado = fn();
        db.exec('COMMIT');
        return resultado;
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }
}

module.exports = { db, transacao, DB_PATH };
