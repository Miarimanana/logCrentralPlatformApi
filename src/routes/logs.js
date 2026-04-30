const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const prisma = new PrismaClient();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const { device, limit = 200, search } = req.query;

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
    const tenantName = tenant ? tenant.name : null;

    const where = {
      ...(tenantName && { tenantId: tenantName }),
      ...(device     && { deviceId: device }),
      ...(search     && { message: { contains: search, mode: 'insensitive' } }),
    };

    const logs = await prisma.log.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });

    res.json({ logs, total: logs.length });

  } catch (err) {
    console.error('[GET /api/logs] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
