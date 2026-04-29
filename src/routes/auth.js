// const router   = require('express').Router();
// const bcrypt   = require('bcryptjs');
// const jwt      = require('jsonwebtoken');
// const { PrismaClient } = require('@prisma/client');
// const prisma   = new PrismaClient();

// // POST /api/auth/register
// router.post('/register', async (req, res) => {
//   const { email, password, name, tenantName } = req.body;
//   if (!email || !password || !name || !tenantName) {
//     return res.status(400).json({ error: 'Tous les champs sont requis' });
//   }

//   try {
//     // Créer ou récupérer le tenant
//     let tenant = await prisma.tenant.findUnique({ where: { name: tenantName } });
//     if (!tenant) {
//       tenant = await prisma.tenant.create({ data: { name: tenantName } });
//     }

//     const hashed = await bcrypt.hash(password, 10);
//     const user = await prisma.user.create({
//       data: {
//         email,
//         password: hashed,
//         name,
//         tenantId: tenant.id,
//         role: 'ADMIN',
//       },
//     });

//     const token = jwt.sign(
//       { userId: user.id, tenantId: tenant.id, role: user.role },
//       process.env.JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     res.status(201).json({
//       token,
//       user: { id: user.id, email: user.email, name: user.name, role: user.role },
//       tenant: { id: tenant.id, name: tenant.name },
//     });
//   } catch (err) {
//     if (err.code === 'P2002') {
//       return res.status(409).json({ error: 'Email déjà utilisé' });
//     }
//     console.error(err);
//     res.status(500).json({ error: 'Erreur serveur' });
//   }
// });

// // POST /api/auth/login
// router.post('/login', async (req, res) => {
//   const { email, password } = req.body;
//   if (!email || !password) {
//     return res.status(400).json({ error: 'Email et mot de passe requis' });
//   }

//   try {
//     const user = await prisma.user.findUnique({
//       where: { email },
//       include: { tenant: true },
//     });

//     if (!user || !(await bcrypt.compare(password, user.password))) {
//       return res.status(401).json({ error: 'Identifiants incorrects' });
//     }

//     const token = jwt.sign(
//       { userId: user.id, tenantId: user.tenantId, role: user.role },
//       process.env.JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     res.json({
//       token,
//       user: { id: user.id, email: user.email, name: user.name, role: user.role },
//       tenant: { id: user.tenant.id, name: user.tenant.name },
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Erreur serveur' });
//   }
// });

// // GET /api/auth/me
// router.get('/me', require('../middleware/auth'), async (req, res) => {
//   const user = await prisma.user.findUnique({
//     where: { id: req.user.userId },
//     include: { tenant: true },
//   });
//   res.json({
//     user: { id: user.id, email: user.email, name: user.name, role: user.role },
//     tenant: { id: user.tenant.id, name: user.tenant.name },
//   });
// });

// module.exports = router;

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const admin = require('../services/firebase');
const prisma = new PrismaClient();

// POST /api/auth/register
router.post('/register', async(req, res) => {
    const { email, password, name, tenantName } = req.body;
    if (!email || !password || !name || !tenantName) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    try {
        // Créer ou récupérer le tenant
        let tenant = await prisma.tenant.findUnique({ where: { name: tenantName } });
        if (!tenant) {
            tenant = await prisma.tenant.create({ data: { name: tenantName } });
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email,
                password: hashed,
                name,
                tenantId: tenant.id,
                role: 'ADMIN',
            },
        });

        const token = jwt.sign({ userId: user.id, tenantId: tenant.id, role: user.role },
            process.env.JWT_SECRET, { expiresIn: '7d' }
        );

        // Pose les claims permanents sur l'utilisateur Firebase
        // (crée l'utilisateur Firebase s'il n'existe pas)
        try {
            await admin.auth().setCustomUserClaims(user.id.toString(), {
                tenant_id: user.tenantId.toString(),
                role: user.role,
            });
        } catch (e) {
            // L'utilisateur Firebase n'existe pas encore, on le crée
            await admin.auth().createUser({ uid: user.id.toString() });
            await admin.auth().setCustomUserClaims(user.id.toString(), {
                tenant_id: user.tenantId.toString(),
                role: user.role,
            });
        }

        const firebaseToken = await admin.auth().createCustomToken(
            user.id.toString(), { tenant_id: tenant.id.toString() }
        );

        res.status(201).json({
            token,
            firebaseToken,
            name: user.name,
            email: user.email,
            tenantName: tenant.name,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
            tenant: { id: tenant.id, name: tenant.name },
        });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'Email déjà utilisé' });
        }
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/auth/login
router.post('/login', async(req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { tenant: true },
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }

        const token = jwt.sign({ userId: user.id, tenantId: user.tenantId, role: user.role },
            process.env.JWT_SECRET, { expiresIn: '7d' }
        );

        // Pose les claims permanents sur l'utilisateur Firebase
        // (crée l'utilisateur Firebase s'il n'existe pas)
        try {
            await admin.auth().setCustomUserClaims(user.id.toString(), {
                tenant_id: user.tenantId.toString(),
                role: user.role,
            });
        } catch (e) {
            // L'utilisateur Firebase n'existe pas encore, on le crée
            await admin.auth().createUser({ uid: user.id.toString() });
            await admin.auth().setCustomUserClaims(user.id.toString(), {
                tenant_id: user.tenantId.toString(),
                role: user.role,
            });
        }

        const firebaseToken = await admin.auth().createCustomToken(
            user.id.toString(), { tenant_id: user.tenantId.toString() }
        );

        res.json({
            token,
            firebaseToken,
            name: user.name,
            email: user.email,
            tenantName: user.tenant.name,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
            tenant: { id: user.tenant.id, name: user.tenant.name },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async(req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { tenant: true },
    });
    res.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        tenant: { id: user.tenant.id, name: user.tenant.name },
    });
});

module.exports = router;