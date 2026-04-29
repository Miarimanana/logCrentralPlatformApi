const express = require('express');
const router = express.Router();
const { getKpis } = require('../services/kpiService');
const authenticate = require('../middleware/auth');

router.get('/', authenticate, async(req, res) => {
    try {
        console.log('[KPI] req.user:', req.user)
        const { id: userId, tenantId } = req.user;

        if (!userId) {
            return res.status(401).json({ error: 'userId manquant dans le token' });
        }
        if (!tenantId) {
            return res.status(400).json({ error: 'tenantId manquant dans le token' });
        }

        const kpis = await getKpis(userId, tenantId);
        res.json(kpis);

    } catch (err) {
        console.error('[GET /api/kpi]', err);
        res.status(500).json({ error: 'Impossible de charger les KPI' });
    }
});

module.exports = router;