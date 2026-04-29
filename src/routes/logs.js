const router = require('express').Router();
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const prisma = new PrismaClient();

router.use(authMiddleware);

function priToSeverity(pri) {
    if (pri === undefined || pri === null) return 6;
    const n = parseInt(pri);
    if (isNaN(n)) return 6;
    return n & 0x07;
}

router.get('/', async(req, res) => {
    const { device, limit = 100, query: customQuery, search } = req.query;

    try {
        const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
        const tenantName = tenant ? tenant.name : 'default';

        let logqlQuery = '{job="syslog", tenant_id="' + tenantName + '"}';
        if (device) logqlQuery = '{job="syslog", tenant_id="' + tenantName + '", device_id="' + device + '"}';
        if (customQuery) logqlQuery += ' |= "' + customQuery + '"';
        if (search) logqlQuery += ' |= "' + search + '"';

        const now = Math.floor(Date.now() / 1000);
        const start = Math.floor((Date.now() - 86400000) / 1000);

        const response = await axios.get(process.env.LOKI_URL + '/loki/api/v1/query_range', {
            params: {
                query: logqlQuery,
                limit: parseInt(limit),
                start,
                end: now,
                direction: 'backward',
            },
        });

        const result = response.data && response.data.data && response.data.data.result;
        const streams = result || [];
        const logs = [];

        for (const stream of streams) {
            const labels = stream.stream;
            for (const [ts, msg] of stream.values) {
                let parsed = {};
                try { parsed = JSON.parse(msg); } catch (e) { parsed = { message: msg }; }

                const severity = parsed.detected_severity !== undefined ?
                    parseInt(parsed.detected_severity) :
                    priToSeverity(parsed.pri || labels.pri);

                logs.push({
                    timestamp: new Date(parseInt(ts) / 1e6).toISOString(),
                    message: parsed.message || msg,
                    device_id: labels.device_id || parsed.device_id || 'unknown',
                    tenant_id: labels.tenant_id || parsed.tenant_id || tenantName,
                    severity,
                    level: parsed.level || labels.level || 'info',
                    ident: parsed.ident || 'syslog',
                    pri: String(parsed.pri || ''),
                    host: parsed.host || '',
                });
            }
        }

        res.json({ logs, total: logs.length });
    } catch (err) {
        console.error('Loki error:', err.message);
        res.status(500).json({ error: 'Erreur Loki', detail: err.message });
    }
});

router.get('/labels', async(req, res) => {
    try {
        const response = await axios.get(process.env.LOKI_URL + '/loki/api/v1/label/device_id/values');
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: 'Erreur Loki' });
    }
});

module.exports = router;