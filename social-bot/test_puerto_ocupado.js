'use strict';
// Regla del ecosistema: con el puerto ocupado, social-bot sale con 78 y un mensaje claro (no queda en bucle en PM2).
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

const blocker = net.createServer();
blocker.listen(0, '127.0.0.1', () => {
    const port = blocker.address().port;
    const res = spawnSync(process.execPath, [path.join(__dirname, 'index.js')], {
        env: { ...process.env, PORT: String(port), META_VERIFY_TOKEN: 'x', META_APP_SECRET: 'y' }, encoding: 'utf8', timeout: 15000
    });
    blocker.close();
    const ok = res.status === 78 && /ya está en uso/.test(res.stderr);
    console.log(ok ? '✅ puerto ocupado: sale con 78 y lo dice' : `❌ esperaba salida 78, fue ${res.status}: ${res.stderr}`);
    process.exit(ok ? 0 : 1);
});
