// const router = require('express').Router();
// const { v4: uuidv4 } = require('uuid');
// const { PrismaClient } = require('@prisma/client');
// const authMiddleware = require('../middleware/auth');
// const prisma = new PrismaClient();

// // Tous les endpoints nécessitent un JWT valide
// router.use(authMiddleware);

// // GET /api/devices — liste les devices du tenant
// router.get('/', async(req, res) => {
//     const devices = await prisma.device.findMany({
//         where: { tenantId: req.user.tenantId },
//         orderBy: { createdAt: 'desc' },
//     });
//     res.json(devices);
// });

// // POST /api/devices — créer un device + générer son token syslog
// router.post('/', async(req, res) => {
//     const { name, deviceId } = req.body;
//     if (!name || !deviceId) {
//         return res.status(400).json({ error: 'name et deviceId requis' });
//     }

//     // deviceId ne doit contenir que des lettres, chiffres, tirets
//     if (!/^[a-zA-Z0-9-_]+$/.test(deviceId)) {
//         return res.status(400).json({ error: 'deviceId invalide (lettres, chiffres, tirets uniquement)' });
//     }

//     try {
//         // Token syslog = UUID unique et secret
//         const syslogToken = `log-${uuidv4().replace(/-/g, '').substring(0, 12)}`;

//         const device = await prisma.device.create({
//             data: {
//                 name,
//                 deviceId,
//                 token: syslogToken,
//                 tenantId: req.user.tenantId,
//                 ownerId: req.user.userId,
//             },
//         });

//         // Retourner aussi la config syslog complète pour le QR code
//         res.status(201).json({
//             ...device,
//             syslogConfig: {
//                 // Le hostname à configurer sur le device : tenant__deviceId
//                 hostname: `${req.user.tenantId.substring(0, 8)}__${deviceId}`,
//                 server: 'VOTRE_IP_SERVEUR',
//                 port: 514,
//                 protocol: 'udp',
//                 token: syslogToken,
//             },
//         });
//     } catch (err) {
//         if (err.code === 'P2002') {
//             return res.status(409).json({ error: 'deviceId déjà utilisé' });
//         }
//         console.error(err);
//         res.status(500).json({ error: 'Erreur serveur' });
//     }
// });

// // GET /api/devices/:id — détail d'un device
// router.get('/:id', async(req, res) => {
//     const device = await prisma.device.findFirst({
//         where: { id: req.params.id, tenantId: req.user.tenantId },
//     });
//     if (!device) return res.status(404).json({ error: 'Device non trouvé' });
//     res.json(device);
// });

// router.patch('/:id', async(req, res) => {
//     const { name } = req.body;
//     if (!name) return res.status(400).json({ error: 'name requis' });
//     const device = await prisma.device.findFirst({
//         where: { id: req.params.id, tenantId: req.user.tenantId }
//     });
//     if (!device) return res.status(404).json({ error: 'Device non trouvé' });
//     const updated = await prisma.device.update({
//         where: { id: req.params.id },
//         data: { name }
//     });
//     res.json(updated);
// });

// // DELETE /api/devices/:id — supprimer (révoquer token)
// router.delete('/:id', async(req, res) => {
//     const device = await prisma.device.findFirst({
//         where: { id: req.params.id, tenantId: req.user.tenantId },
//     });
//     if (!device) return res.status(404).json({ error: 'Device non trouvé' });

//     await prisma.device.delete({ where: { id: req.params.id } });
//     res.json({ message: 'Device supprimé, token révoqué' });
// });

// // POST /api/devices/:id/token — regénérer le token
// router.post('/:id/token', async(req, res) => {
//     const device = await prisma.device.findFirst({
//         where: { id: req.params.id, tenantId: req.user.tenantId },
//     });
//     if (!device) return res.status(404).json({ error: 'Device non trouvé' });

//     const newToken = uuidv4().replace(/-/g, '');
//     const updated = await prisma.device.update({
//         where: { id: req.params.id },
//         data: { token: newToken },
//     });
//     res.json({ token: updated.token });
// });

// module.exports = router;

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const prisma = new PrismaClient();

// Tous les endpoints nécessitent un JWT valide
router.use(authMiddleware);

// GET /api/devices — liste les devices du tenant
router.get('/', async(req, res) => {
    try {
        const devices = await prisma.device.findMany({
            where: { tenantId: req.user.tenantId },
            orderBy: { createdAt: 'desc' },
        });

        // Recalcul online côté serveur (même timeout que offlineJob dans index.js)
        const cutoff = new Date(Date.now() - 5 * 60 * 1000);
        const result = devices.map((d) => ({
            ...d,
            online: d.online && d.lastSeenAt && d.lastSeenAt > cutoff,
        }));

        res.json(result);
    } catch (e) {
        console.error('[GET /devices] erreur:', e.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/devices — créer un device + générer son token syslog
router.post('/', async(req, res) => {
    const { name, deviceId } = req.body;
    if (!name || !deviceId)
        return res.status(400).json({ error: 'name et deviceId requis' });

    if (!/^[a-zA-Z0-9-_]+$/.test(deviceId))
        return res.status(400).json({ error: 'deviceId invalide (lettres, chiffres, tirets uniquement)' });

    try {
        const syslogToken = `log-${uuidv4().replace(/-/g, '').substring(0, 12)}`;

        const device = await prisma.device.create({
            data: {
                name,
                deviceId,
                token: syslogToken,
                tenantId: req.user.tenantId,
                ownerId: req.user.userId,
            },
        });

        res.status(201).json({
            ...device,
            tenantName: req.user.tenantId.substring(0, 8),
            syslogConfig: {
                hostname: `${req.user.tenantId.substring(0, 8)}__${deviceId}`,
                server: 'VOTRE_IP_SERVEUR',
                port: 514,
                protocol: 'udp',
                token: syslogToken,
            },
        });
    } catch (err) {
        if (err.code === 'P2002')
            return res.status(409).json({ error: 'deviceId déjà utilisé' });
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/devices/:id — détail d'un device
router.get('/:id', async(req, res) => {
    const device = await prisma.device.findFirst({
        where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    if (!device) return res.status(404).json({ error: 'Device non trouvé' });
    res.json(device);
});

// PATCH /api/devices/:id — renommer
router.patch('/:id', async(req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });

    const device = await prisma.device.findFirst({
        where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    if (!device) return res.status(404).json({ error: 'Device non trouvé' });

    const updated = await prisma.device.update({
        where: { id: req.params.id },
        data: { name },
    });
    res.json(updated);
});

// DELETE /api/devices/:id — supprimer (révoquer token)
router.delete('/:id', async(req, res) => {
    const device = await prisma.device.findFirst({
        where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    if (!device) return res.status(404).json({ error: 'Device non trouvé' });

    await prisma.device.delete({ where: { id: req.params.id } });
    res.json({ message: 'Device supprimé, token révoqué' });
});

// POST /api/devices/:id/token — regénérer le token
router.post('/:id/token', async(req, res) => {
    const device = await prisma.device.findFirst({
        where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    if (!device) return res.status(404).json({ error: 'Device non trouvé' });

    const newToken = uuidv4().replace(/-/g, '');
    const updated = await prisma.device.update({
        where: { id: req.params.id },
        data: { token: newToken },
    });
    res.json({ token: updated.token });
});

module.exports = router;