# JEOAH'S - Plateforme de Marketplace

## Présentation

JEOAH'S est une plateforme de marketplace innovante conçue pour connecter les vendeurs, les affiliés et les acheteurs dans un écosystème unique. Notre objectif est de fournir les outils et la visibilité nécessaires pour que chacun puisse prospérer.

## Contexte du Projet

Ce projet a été créé dans le but de développer une solution complète qui répond aux besoins spécifiques de trois types d'utilisateurs :

-   **Les Vendeurs** : Pour créer leur boutique, lister leurs produits et gérer leurs ventes.
-   **Les Affiliés** : Pour monétiser leur audience en promouvant des produits.
-   **Les Acheteurs** : Pour découvrir et acheter des produits de confiance.

Le système intègre une logique de plans d'abonnement, un programme de parrainage et des outils d'automatisation basés sur l'IA.

## Offres Spéciales de Lancemen

-   **Essai Gratuit pour les Pionniers** : Les 25 premiers utilisateurs inscrits bénéficieront d'un **essai gratuit de 15 jours**, avec tous les avantages d'un plan mensuel payant.
-   **Programme de Parrainage Exclusif** : pour chaque personne abonné a partir de votre lien recevez des reductions allant 5% jusqu'a50% et plus

## Rôles des utilisateurs

1.  **Acheteur** : Parcourt la marketplace, achète des produits et interagit avec la communauté. Des frais de service de 3% s'appliquent sur chaque achat.
2.  **Vendeur** : Met en vente ses produits sur la plateforme. Peut choisir un plan d'abonnement pour bénéficier de l'automatisation par IA ou utiliser le plan gratuit en gérant sa propre promotion.
3.  **Affilié** : Promeut les produits de la marketplace via des liens uniques pour gagner des commissions sur les ventes générées.

## Structure du Projet

Le projet est organisé comme suit :

-   `/public` : Contient tous les fichiers statiques accessibles par les utilisateurs (HTML, CSS, images).
-   `/functions` : Contient le code backend pour les Cloud Functions (logique métier, API).
-   `firebase.json` : Fichier de configuration pour les services Firebase, notamment Hosting.
-   `README.md` : Ce fichier.

## Comment Déployer

1.  Assurez-vous que toutes les modifications sont sauvegardées sur GitHub (`git push`).
2.  Ouvrez Google Cloud Shell depuis la console Firebase.
3.  Clonez le repository : `git clone [URL_DU_PROJET]`
4.  Entrez dans le dossier : `cd [NOM_DU_PROJET]`
5.  Déployez : `firebase deploy`
