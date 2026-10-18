# Plan de Reprise d'Activité (PRA)

## Composants
- Conteneur Proxmox
- Base de données SQLite
- Photos
- Tunnel DNS

## RTO/RPO
- RTO (Recovery Time Objective): 1 heure
- RPO (Recovery Point Objective): 15 minutes

## Procédure de Restauration
1. Restaurer la base de données depuis la sauvegarde
2. Copier les photos depuis le stockage
3. Redémarrer le conteneur Proxmox
4. Vérifier l'intégrité de la base avec `PRAGMA integrity_check`

## Dépendances Externes
- Proxmox
- Serveur de sauvegarde
- Clé de chiffrement