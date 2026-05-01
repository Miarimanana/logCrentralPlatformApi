require('dotenv').config();
require('./services/firebase');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const logsRoutes = require('./routes/logs');
const kpiRoutes = require('./routes/kpi');
const webhookRoutes = require('./routes/webhooks');
// const { startAlerting } = require('./routes/alerts');
const { startAlerting } = require('./services/alerting');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/install-agent.sh', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(path.join(__dirname, '../public/install-agent.sh'));
});

app.get('/install-agent-macos.sh', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(path.join(__dirname, '../public/install-agent-macos.sh'));
});

app.get('/install-agent.ps1', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(path.join(__dirname, '../public/install-agent.ps1'));
});

app.get('/install-agent-iot.sh', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(path.join(__dirname, '../public/install-agent-iot.sh'));
});

app.get('/install-agent-docker.sh', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(path.join(__dirname, '../public/install-agent-docker.sh'));
});

app.get('/api/devices/by-token/:token', async(req, res) => {
    const device = await prisma.device.findUnique({
        where: { token: req.params.token },
        include: { tenant: true },
    });
    if (!device) return res.status(404).json({ error: 'Token invalide' });

    await prisma.device.update({
        where: { token: req.params.token },
        data: {
            online: true,
            lastSeenAt: new Date(),
        },
    }).catch(e => console.error('[device] update lastSeenAt erreur:', e.message));

    res.json({
        deviceId: device.deviceId,
        tenantName: device.tenant.name,
        name: device.name,
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

async function offlineJob() {
    try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const updated = await prisma.device.updateMany({
            where: {
                online: true,
                lastSeenAt: { lt: fiveMinAgo },
            },
            data: { online: false },
        });
        if (updated.count > 0)
            console.log(`[offline-job] ${updated.count} device(s) marqués hors ligne`);
    } catch (e) {
        console.error('[offline-job] erreur:', e.message);
    }
}

const PORT = process.env.PORT || 4000;
// app.listen(PORT, () => {
//     console.log(`LogCentral API running on http://localhost:${PORT}`);
//     startAlerting();
//     offlineJob();
//     setInterval(offlineJob, 60 * 1000);
// });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`LogCentral API running on http://0.0.0.0:${PORT}`);
    startAlerting();
    offlineJob();
    setInterval(offlineJob, 60 * 1000);
});