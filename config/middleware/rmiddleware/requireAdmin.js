// middleware/requireAdmin.js

const fs = require('fs');
const path = require('path');

function requireAdmin(req, res, next) {
  const userEmail = req.user && req.user.email;

  if (!userEmail) {
    return res.status(401).json({ error: 'Utilisateur non connecté' });
  }

  const filePath = path.join(__dirname, '..', 'config', 'admins.json');
  const admins = JSON.parse(fs.readFileSync(filePath, 'utf8')).admins;

  if (admins.includes(userEmail)) {
    return next(); // autorisé
  } else {
    return res.status(403).json({ error: 'Accès réservé à l’administrateur' });
  }
}

module.exports = requireAdmin;
