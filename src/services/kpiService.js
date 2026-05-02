// const { PrismaClient } = require('@prisma/client');
// const admin = require('./firebase');
// const prisma = new PrismaClient();

// let queryLoki, queryLokiCount;
// try {
//     const lokiService = require('./lokiService');
//     queryLoki = lokiService.queryLoki;
//     queryLokiCount = lokiService.queryLokiCount;
// } catch (e) {
//     console.warn('[KPI] lokiService introuvable:', e.message);
//     queryLoki = async() => 0;
//     queryLokiCount = async() => 0;
// }

// // pri & 7 == niveau syslog
// // INFO  = 6 → pri: 6,14,22,30,38,46,54,62,70,78,86,94,102,110,118,126
// // WARN  = 4 → pri: 4,12,20,28,36,44,52,60,68,76,84,92,100,108,116,124
// // ERROR = 3 → pri: 3,11,19,27,35,43,51,59,67,75,83,91,99,107,115,123
// const PRI_INFO = '(6|14|22|30|38|46|54|62|70|78|86|94|102|110|118|126)';
// const PRI_WARN = '(4|12|20|28|36|44|52|60|68|76|84|92|100|108|116|124)';
// const PRI_ERROR = '(3|11|19|27|35|43|51|59|67|75|83|91|99|107|115|123)';

// // Devices distincts ayant envoyé des logs dans la dernière heure
// async function getActiveDevicesFromLoki(tenantName) {
//     try {
//         return await queryLokiCount(
//             `count by (device_id) (count_over_time({tenant_id="${tenantName}"}[1h]))`
//         );
//     } catch (e) {
//         console.error('[KPI] Loki activeDevices erreur:', e.message);
//         return 0;
//     }
// }

// async function getKpis(userId, tenantId) {
//     if (!userId) throw new Error('userId requis');
//     if (!tenantId) throw new Error('tenantId requis');

//     const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
//     const tenantName = tenant ? tenant.name : 'default';

//     const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

//     const [totalDevices, offlineDevices] = await Promise.all([
//         prisma.device.count({ where: { ownerId: userId } }),
//         prisma.device.count({
//             where: {
//                 ownerId: userId,
//                 OR: [
//                     { online: false },
//                     { lastSeenAt: { lt: fiveMinAgo } },
//                     { lastSeenAt: null },
//                 ],
//             },
//         }),
//     ]);

//     let logsInfo = 0,
//         logsWarn = 0,
//         logsError = 0,
//         activeTokens = 0;
//     try {
//         console.log('[KPI] Loki query pour tenantName:', tenantName);
//         [logsInfo, logsWarn, logsError, activeTokens] = await Promise.all([
//             queryLoki(`sum(count_over_time({tenant_id="${tenantName}"} | json | pri=~"${PRI_INFO}"[1h]))`),
//             queryLoki(`sum(count_over_time({tenant_id="${tenantName}"} | json | pri=~"${PRI_WARN}"[1h]))`),
//             queryLoki(`sum(count_over_time({tenant_id="${tenantName}"} | json | pri=~"${PRI_ERROR}"[1h]))`),
//             getActiveDevicesFromLoki(tenantName),
//         ]);
//         console.log('[KPI] Loki résultats:', { logsInfo, logsWarn, logsError, activeTokens });
//     } catch (e) {
//         console.error('[KPI] Loki erreur:', e.message);
//     }

//     let alertsPending = 0;
//     try {
//         const snap = await admin.firestore()
//             .collection('alerts')
//             .where('tenant_id', '==', tenantName)
//             .where('status', 'in', ['pending', 'active'])
//             .count()
//             .get();
//         alertsPending = snap.data().count;
//     } catch (e) {
//         console.error('[KPI] Firestore erreur:', e.message);
//     }

//     return {
//         devices: {
//             total: totalDevices,
//             online: totalDevices - offlineDevices,
//             offline: offlineDevices,
//         },
//         logs: {
//             info_per_hour: Math.round(logsInfo),
//             warn_per_hour: Math.round(logsWarn),
//             error_per_hour: Math.round(logsError),
//         },
//         tokens: { active: activeTokens },
//         alerts: { pending: alertsPending },
//         generated_at: new Date().toISOString(),
//     };
// }

// module.exports = { getKpis };

// const { PrismaClient } = require('@prisma/client');
// const admin = require('./firebase');
// const prisma = new PrismaClient();

// let queryLoki, queryLokiCount;
// try {
//     const lokiService = require('./lokiService');
//     queryLoki = lokiService.queryLoki;
//     queryLokiCount = lokiService.queryLokiCount;
// } catch (e) {
//     console.warn('[KPI] lokiService introuvable:', e.message);
//     queryLoki = async() => 0;
//     queryLokiCount = async() => 0;
// }

// // Niveaux syslog journald — champ PRIORITY (string, majuscules)
// // INFO  : PRIORITY = "6"
// // WARN  : PRIORITY = "4" ou "5"
// // ERROR : PRIORITY = "0", "1", "2", "3"

// async function getActiveDevicesFromLoki(tenantName) {
//     try {
//         return await queryLokiCount(
//             `count by (device_id) (count_over_time({tenant_id="${tenantName}"}[1h]))`
//         );
//     } catch (e) {
//         console.error('[KPI] Loki activeDevices erreur:', e.message);
//         return 0;
//     }
// }

// async function getKpis(userId, tenantId) {
//     if (!userId) throw new Error('userId requis');
//     if (!tenantId) throw new Error('tenantId requis');

//     const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
//     const tenantName = tenant ? tenant.name : 'default';

//     console.log('[KPI] userId:', userId, '| tenantId:', tenantId, '| tenantName:', tenantName);

//     const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

//     const [totalDevices, offlineDevices] = await Promise.all([
//         prisma.device.count({ where: { tenantId } }),
//         prisma.device.count({
//             where: {
//                 tenantId,
//                 OR: [
//                     { online: false },
//                     { lastSeenAt: { lt: fiveMinAgo } },
//                     { lastSeenAt: null },
//                 ],
//             },
//         }),
//     ]);

//     console.log('[KPI] Devices — total:', totalDevices, '| offline:', offlineDevices);

//     let logsInfo = 0,
//         logsWarn = 0,
//         logsError = 0,
//         activeTokens = 0;
//     try {
//         console.log('[KPI] Loki queries pour tenantName:', tenantName);

//         // FIX : champ PRIORITY (majuscules, valeur string) au lieu de pri
//         [logsInfo, logsWarn, logsError, activeTokens] = await Promise.all([
//             queryLoki(`sum(count_over_time({tenant_id="${tenantName}"} | json | PRIORITY="6"[1h]))`),
//             queryLoki(`sum(count_over_time({tenant_id="${tenantName}"} | json | PRIORITY=~"4|5"[1h]))`),
//             queryLoki(`sum(count_over_time({tenant_id="${tenantName}"} | json | PRIORITY=~"0|1|2|3"[1h]))`),
//             getActiveDevicesFromLoki(tenantName),
//         ]);

//         console.log('[KPI] Loki résultats:', { logsInfo, logsWarn, logsError, activeTokens });
//     } catch (e) {
//         console.error('[KPI] Loki erreur:', e.message);
//     }

//     let alertsPending = 0;
//     try {
//         const snap = await admin.firestore()
//             .collection('alerts')
//             .where('tenant_id', '==', tenantName)
//             .where('status', 'in', ['pending', 'active'])
//             .count()
//             .get();
//         alertsPending = snap.data().count;
//     } catch (e) {
//         console.error('[KPI] Firestore erreur:', e.message);
//     }

//     return {
//         devices: {
//             total: totalDevices,
//             online: totalDevices - offlineDevices,
//             offline: offlineDevices,
//         },
//         logs: {
//             info_per_hour: Math.round(logsInfo),
//             warn_per_hour: Math.round(logsWarn),
//             error_per_hour: Math.round(logsError),
//         },
//         tokens: { active: activeTokens },
//         alerts: { pending: alertsPending },
//         generated_at: new Date().toISOString(),
//     };
// }

// module.exports = { getKpis };

const { PrismaClient } = require('@prisma/client');
const admin = require('./firebase');
const prisma = new PrismaClient();

let queryLoki, queryLokiCount;
try {
    const lokiService = require('./lokiService');
    queryLoki = lokiService.queryLoki;
    queryLokiCount = lokiService.queryLokiCount;
} catch (e) {
    console.warn('[KPI] lokiService introuvable:', e.message);
    queryLoki = async() => 0;
    queryLokiCount = async() => 0;
}

// Niveaux syslog journald — champ PRIORITY (string, majuscules)
// INFO  : PRIORITY = "6"
// WARN  : PRIORITY = "4" ou "5"
// ERROR : PRIORITY = "0", "1", "2", "3"

// Devices distincts ayant envoyé des logs dans la dernière heure
async function getActiveDevicesFromLoki(tenantName) {
    try {
        const count = await queryLokiCount(
            `count by (device_id) (count_over_time({tenant_id="${tenantName}"}[1h]))`
        );
        console.log('[KPI] activeDevices Loki:', count);
        return count;
    } catch (e) {
        console.error('[KPI] Loki activeDevices erreur:', e.message);
        return 0;
    }
}

async function getKpis(userId, tenantId) {
    if (!userId) throw new Error('userId requis');
    if (!tenantId) throw new Error('tenantId requis');

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const tenantName = tenant ? tenant.name : 'default';

    console.log('[KPI] userId:', userId, '| tenantId:', tenantId, '| tenantName:', tenantName);

    // Total devices depuis Prisma
    const totalDevices = await prisma.device.count({ where: { tenantId } });
    console.log('[KPI] totalDevices:', totalDevices);

    let logsInfo = 0,
        logsWarn = 0,
        logsError = 0,
        activeTokens = 0;
    try {
        console.log('[KPI] Loki queries pour tenantName:', tenantName);

        [logsInfo, logsWarn, logsError, activeTokens] = await Promise.all([
            queryLoki(`sum(count_over_time({tenant_id="${tenantName}"} | json | PRIORITY="6"[1h]))`),
            queryLoki(`sum(count_over_time({tenant_id="${tenantName}"} | json | PRIORITY=~"4|5"[1h]))`),
            queryLoki(`sum(count_over_time({tenant_id="${tenantName}"} | json | PRIORITY=~"0|1|2|3"[1h]))`),
            getActiveDevicesFromLoki(tenantName),
        ]);

        console.log('[KPI] Loki résultats:', { logsInfo, logsWarn, logsError, activeTokens });
    } catch (e) {
        console.error('[KPI] Loki erreur:', e.message);
    }

    const devicesOnline = Math.min(activeTokens, totalDevices);
    const devicesOffline = Math.max(totalDevices - devicesOnline, 0);

    console.log('[KPI] online:', devicesOnline, '| offline:', devicesOffline);

    let alertsPending = 0;
    try {
        const snap = await admin.firestore()
            .collection('alerts')
            .where('tenant_id', '==', tenantName)
            .where('status', 'in', ['pending', 'active'])
            .count()
            .get();
        alertsPending = snap.data().count;
    } catch (e) {
        console.error('[KPI] Firestore erreur:', e.message);
    }

    return {
        devices: {
            total: totalDevices,
            online: devicesOnline,
            offline: devicesOffline,
        },
        logs: {
            info_per_hour: Math.round(logsInfo),
            warn_per_hour: Math.round(logsWarn),
            error_per_hour: Math.round(logsError),
        },
        tokens: { active: activeTokens },
        alerts: { pending: alertsPending },
        generated_at: new Date().toISOString(),
    };
}

module.exports = { getKpis };