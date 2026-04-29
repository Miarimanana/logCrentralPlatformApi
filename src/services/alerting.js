// const axios = require('axios');
// const admin = require('./firebase');

// const db = admin.firestore();
// const _seen = new Set();

// function parseSeverity(log) {
//     if (log.pri) {
//         const n = parseInt(log.pri);
//         if (!isNaN(n)) return n & 7;
//     }
//     return 6;
// }

// function dedupeKey(log) {
//     const slot = Math.floor(Date.parse(log.timestamp) / (5 * 60 * 1000));
//     return `${log.device_id}|${log.message}|${slot}`;
// }

// async function pollAndAlert() {
//     try {
//         const now = Math.floor(Date.now() / 1000);
//         console.log('[alert] poll at', now);

//         const resp = await axios.get(`${process.env.LOKI_URL}/loki/api/v1/query_range`, {
//             params: {
//                 query: '{job="syslog"}',
//                 limit: 100,
//                 start: now - 35,
//                 end: now,
//                 direction: 'backward',
//             },
//         });

//         const result = (resp.data && resp.data.data && resp.data.data.result) || [];
//         console.log('[alert] streams:', result.length);

//         for (const stream of result) {
//             for (const entry of stream.values) {
//                 const ts  = entry[0];
//                 const msg = entry[1];

//                 let parsed = {};
//                 try { parsed = JSON.parse(msg); } catch(e) { parsed = { message: msg }; }

//                 const log = {
//                     timestamp: new Date(parseInt(ts) / 1e6).toISOString(),
//                     message:   parsed.message  || msg,
//                     device_id: stream.stream.device_id || parsed.device_id || 'unknown',
//                     tenant_id: stream.stream.tenant_id || parsed.tenant_id || 'default',
//                     ident:     parsed.ident || '',
//                     pri:       parsed.pri   || '',
//                 };

//                 const severity = parseSeverity(log);
//                 console.log('[alert] pri:', log.pri, '-> sev:', severity, '|', log.message);

//                 if (severity > 4) continue;

//                 const key = dedupeKey(log);
//                 if (_seen.has(key)) { console.log('[alert] skip dedupe'); continue; }
//                 _seen.add(key);
//                 setTimeout(function() { _seen.delete(key); }, 10 * 60 * 1000);

//                 await db.collection('alerts').add({
//                     rule:         'severity <= 4',
//                     device_id:    log.device_id,
//                     message:      log.message,
//                     severity:     severity,
//                     status:       'active',
//                     count:        1,
//                     triggered_at: admin.firestore.Timestamp.fromDate(new Date(log.timestamp)),
//                     resolved_at:  null,
//                     tenant_id:    log.tenant_id,
//                     ident:        log.ident,
//                 });

//                 console.log('[alert] CREATED sev=' + severity + ' device=' + log.device_id + ' — ' + log.message);
//             }
//         }
//     } catch (err) {
//         console.error('[alert] poll error:', err.message);
//     }
// }

// function startAlerting(intervalMs) {
//     const ms = intervalMs || 30000;
//     console.log('[alert] polling every ' + (ms / 1000) + 's');
//     pollAndAlert();
//     return setInterval(pollAndAlert, ms);
// }

// module.exports = { startAlerting };


const axios = require('axios');
const admin = require('./firebase');
const { PrismaClient } = require('@prisma/client');

const db = admin.firestore();
const prisma = new PrismaClient();
const _seen = new Set();

// Cache nom → UUID pour éviter un appel Prisma à chaque log
const _tenantCache = new Map();

async function resolveTenantId(tenantName) {
    if (!tenantName || tenantName === 'default') return tenantName;

    // Retourne depuis le cache si déjà résolu
    if (_tenantCache.has(tenantName)) return _tenantCache.get(tenantName);

    try {
        const tenant = await prisma.tenant.findUnique({ where: { name: tenantName } });
        if (tenant) {
            _tenantCache.set(tenantName, tenant.id.toString());
            return tenant.id.toString();
        }
    } catch (e) {
        console.error('[alert] resolveTenantId error:', e.message);
    }

    // Fallback : on garde le nom si le tenant n'existe pas en DB
    return tenantName;
}

function parseSeverity(log) {
    if (log.pri) {
        const n = parseInt(log.pri);
        if (!isNaN(n)) return n & 7;
    }
    return 6;
}

function dedupeKey(log) {
    const slot = Math.floor(Date.parse(log.timestamp) / (5 * 60 * 1000));
    return `${log.device_id}|${log.message}|${slot}`;
}

async function pollAndAlert() {
    try {
        const now = Math.floor(Date.now() / 1000);
        console.log('[alert] poll at', now);

        const resp = await axios.get(`${process.env.LOKI_URL}/loki/api/v1/query_range`, {
            params: {
                query: '{job="syslog"}',
                limit: 100,
                start: now - 35,
                end: now,
                direction: 'backward',
            },
        });

        const result = (resp.data && resp.data.data && resp.data.data.result) || [];
        console.log('[alert] streams:', result.length);

        for (const stream of result) {
            for (const entry of stream.values) {
                const ts = entry[0];
                const msg = entry[1];

                let parsed = {};
                try { parsed = JSON.parse(msg); } catch (e) { parsed = { message: msg }; }

                // Nom brut venant de Loki (ex: "logcentral")
                const rawTenantName = stream.stream.tenant_id || parsed.tenant_id || 'default';

                const tenantUuid = await resolveTenantId(rawTenantName);

                const log = {
                    timestamp: new Date(parseInt(ts) / 1e6).toISOString(),
                    message: parsed.message || msg,
                    device_id: stream.stream.device_id || parsed.device_id || 'unknown',
                    tenant_id: tenantUuid,
                    ident: parsed.ident || '',
                    pri: parsed.pri || '',
                };

                const severity = parseSeverity(log);
                console.log('[alert] pri:', log.pri, '-> sev:', severity, '|', log.message);

                if (severity > 4) continue;

                const key = dedupeKey(log);
                if (_seen.has(key)) { console.log('[alert] skip dedupe'); continue; }
                _seen.add(key);
                setTimeout(function() { _seen.delete(key); }, 10 * 60 * 1000);

                await db.collection('alerts').add({
                    rule: 'severity <= 4',
                    device_id: log.device_id,
                    message: log.message,
                    severity: severity,
                    status: 'active',
                    count: 1,
                    triggered_at: admin.firestore.Timestamp.fromDate(new Date(log.timestamp)),
                    resolved_at: null,
                    tenant_id: log.tenant_id,
                    ident: log.ident,
                });

                console.log('[alert] CREATED sev=' + severity + ' tenant=' + log.tenant_id + ' device=' + log.device_id + ' — ' + log.message);
            }
        }
    } catch (err) {
        console.error('[alert] poll error:', err.message);
    }
}

function startAlerting(intervalMs) {
    const ms = intervalMs || 30000;
    console.log('[alert] polling every ' + (ms / 1000) + 's');
    pollAndAlert();
    return setInterval(pollAndAlert, ms);
}

module.exports = { startAlerting };