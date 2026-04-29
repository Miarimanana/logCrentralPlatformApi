const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    const token = auth.split(' ')[1];
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        // Le token contient userId, on l'ajoute aussi comme id pour compatibilité
        req.user = {...payload, id: payload.userId };
        next();
    } catch {
        res.status(401).json({ error: 'Token invalide ou expiré' });
    }
};