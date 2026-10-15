# KYNEX — application (Expo)

Web d'abord (PC, tablette, téléphone dans le navigateur), puis iPhone et Android depuis le même code. Utilise le socle `@kynex/core`.

```bash
# depuis la racine du dépôt
npm install
npm run web               # ouvre l'app dans le navigateur (http://localhost:8081)
npm run mobile            # iPhone / Android via Expo Go (plus tard)
npm run typecheck
npm test                  # tests du socle + de l'app
```

## Écrans

| Route | Écran |
|---|---|
| `/bienvenue` | Landing page : hero, aperçu calculé en direct, fonctionnement, fonctionnalités, couverture des disciplines, démo interactive du planificateur, application (« Bientôt » sur les stores), pied de page |
| `/connexion`, `/inscription` | Comptes (Supabase si configuré, sinon comptes locaux au navigateur) |
| `/creation-profil` | Création / modification du profil en 8 étapes (schémas Zod du socle) |
| `/` (onglet Semaine) | Calendrier `planWeek` : jauges de charge, conflits + solutions, déplacer / alléger / supprimer, annuler, fatigue / douleur |
| `/seance/[id]` | Détail d'une séance : blocs, sollicitation, fiches exercices (photos free-exercise-db) |
| `/live/[id]` | Séance en direct hors-ligne : étapes, minuteurs, saisie reps / charge / RPE, pause, récapitulatif XP |
| `/historique` | Historique et statistiques par discipline, records, saisie manuelle |
| `/profil` | Profil joueur : niveau, XP, série, niveaux par discipline, quêtes, succès, compte |

## Données

- **Aucun backend pour l'instant** : sans `.env`, tout est enregistré sur l'appareil (localStorage / SQLite). Les écritures passent par l'outbox du socle et attendent une future synchronisation.
- **Mode démo** (« Essayer la démo ») : compte fictif généré par le vrai socle sur 4 semaines, pastille « Démo · données fictives » visible partout, données effacées à la sortie.
- **Supabase** : copie `.env.example` en `.env` et renseigne l'URL et la clé publique.

## Organisation

| Dossier | Rôle |
|---|---|
| `src/app/` | Routes Expo Router. `(auth)` : landing, connexion, inscription. `(app)` : onglets, séance, séance en direct, création du profil. |
| `src/ui/` | Design system : jetons, texte, boutons, champs, puces, panneaux, icônes Feather, couverture des disciplines. |
| `src/data/` | Session, profil, semaine, journal (résultats, XP, records, outbox), médias d'exercices, démo. |
| `src/features/` | Logique et composants propres à chaque écran (logique pure testée à côté : `*.test.ts`). |
| `src/dev/` | Jeux de données de test (Démo / Pire cas / Vide), en développement seulement : `?data=pire`. |

`metro.config.js` contient une seule règle : il fait résoudre les imports `./x.js` du socle vers ses fichiers `.ts`.
