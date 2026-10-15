# KYNEX

Application d'entraînement multisports — monorepo npm workspaces.

| Package | Rôle |
|---|---|
| [packages/core](packages/core) | Socle métier TypeScript : catalogue, générateurs, orchestrateur, séance en direct hors-ligne, suivi, gamification, schéma Supabase. Voir son [README](packages/core/README.md). |
| apps/mobile | App Expo (iPhone, Android, tablette, web/desktop) — en cours. |

```bash
npm install
npm test          # tests du socle
npm run typecheck # tous les workspaces
```
