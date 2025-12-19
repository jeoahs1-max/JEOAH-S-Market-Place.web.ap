m
#!/bin/bash

# Ce script installe les dépendances du projet et déploie sur Vercel.

# 1. Installer les dépendances npm
echo "Installation des dépendances..."
npm install

# 2. Déployer sur Vercel en production
echo "Déploiement sur Vercel..."
npm run deploy

echo "Déploiement terminé !"
