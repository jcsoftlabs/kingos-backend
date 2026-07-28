# Kingo's — API (Railway)

Backend Fastify + TypeScript + Prisma + PostgreSQL du site Kingo's. Voir le plan
d'implémentation complet dans le dépôt `kingos-plan` (`PLAN_IMPLEMENTATION_KINGOS.md`)
pour l'architecture, le modèle de données et la feuille de route.

## Démarrage local

```bash
cp .env.example .env   # renseigner DATABASE_URL, CLOUDINARY_URL, etc.
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

L'API écoute sur `http://localhost:4000`. `GET /sante` vérifie la connexion à la base.

## Structure

```
src/
├── core/        # env, db (Prisma), journalisation, erreurs, portee (RBAC), cloudinary
├── modules/      # 1 dossier par domaine métier (catalogue, commandes, devis, paiements...)
├── jobs/         # workers pg-boss (PDF, e-mails, réconciliation)
└── server.ts
prisma/
├── schema.prisma
├── migrations/   # inclut les contraintes SQL que Prisma ne sait pas exprimer
└── seed.ts
```

## État d'avancement

Scaffolding initial : modèle de données complet (34 tables), moteur de tarification
testé (`src/modules/catalogue/tarification.ts`), routes catalogue publiques,
signature d'upload Cloudinary, serveur Fastify durci (helmet, CORS, rate-limit,
arrêt gracieux). Les modules commandes, devis, factures, paiements et le
back-office restent à implémenter — voir le plan pour le détail par phase.

## Déploiement (Railway)

Build Docker multi-étapes (`Dockerfile`). `railway.json` configure la sonde
`/sante` et la politique de redémarrage. Les migrations s'appliquent au démarrage
du conteneur (`prisma migrate deploy`), jamais `db push` en production.

Variables d'environnement à définir sur le service Railway : voir `.env.example`.
