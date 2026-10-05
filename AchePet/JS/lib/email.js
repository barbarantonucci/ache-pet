'use strict';

const fs = require('fs');
const path = require('path');
const { RESEND_API_KEY, MAIL_FROM, RAIZ } = require('./config');

/**
 * Envia e-mail.
 *  - Com RESEND_API_KEY + MAIL_FROM no .env: envia de verdade (API do Resend, via fetch).
 *  - Sem configuração (modo desenvolvimento): mostra no terminal e grava em db/emails.log.
 * Nunca lança erro: falha de e-mail não deve derrubar a requisição.
 */
async function enviarEmail({ para, assunto, texto }) {
    if (RESEND_API_KEY && MAIL_FROM) {
        try {
            const r = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: MAIL_FROM, to: [para], subject: assunto, text: texto }),
            });
            if (!r.ok) console.error('[email] falha ao enviar:', r.status, await r.text());
            return r.ok;
        } catch (e) {
            console.error('[email] erro:', e.message);
            return false;
        }
    }

    const registro = `\n=== E-MAIL (modo desenvolvimento) ${new Date().toISOString()} ===\nPara: ${para}\nAssunto: ${assunto}\n\n${texto}\n`;
    console.log(registro);
    try { fs.appendFileSync(path.join(RAIZ, 'db', 'emails.log'), registro); } catch { /* ignora */ }
    return true;
}

module.exports = { enviarEmail };
