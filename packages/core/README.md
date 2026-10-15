# KYNEX — socle multisports

Cœur métier de la plateforme : catalogue de disciplines, fiches d'exercices, modèle de séance par blocs, générateurs spécialisés, orchestrateur hebdomadaire, séance en direct hors-ligne, suivi typé par discipline (GPS, montres, services tiers) et gamification. Le code est en TypeScript, sans framework : il est conçu pour être appelé par une app mobile/web et une API.

```bash
npm install
npm test               # 136 tests, dont les migrations SQL et la RLS exécutées sur PostgreSQL (PGlite)
npm run typecheck
npm run db:seed:export # régénère db/seed/0001_catalog.sql depuis le catalogue TS
DATABASE_URL=postgres://… npm run db:migrate   # applique migrations + seed (Supabase ou PostgreSQL)
```

## Livrables techniques

| Livrable | Où |
|---|---|
| 1. Schéma relationnel PostgreSQL / Supabase (ENUM, clés, CHECK, index, triggers, RLS) | [db/migrations/0001_multisport_core.sql](db/migrations/0001_multisport_core.sql), [db/migrations/0002_supabase_rls.sql](db/migrations/0002_supabase_rls.sql), runner [scripts/migrate.ts](scripts/migrate.ts) |
| 2. Types TypeScript / schémas Zod des blocs et des métriques | [src/blocks/schema.ts](src/blocks/schema.ts), [src/tracking/metrics.ts](src/tracking/metrics.ts) |
| 3. Architecture logique de l'orchestrateur | [docs/architecture-orchestrateur.md](docs/architecture-orchestrateur.md) |

## Couverture des disciplines

Chaque discipline déclare son niveau de couverture, et l'application l'affiche tel quel à l'utilisateur.

| Niveau | Signification | Disciplines |
|---|---|---|
| `full` | Contenus, règles de programmation, générateur, suivi, tests | Musculation, Street workout, Course à pied, HIIT & circuits, Mobilité |
| `beta` | Générateur disponible, règles en cours de validation (signalé à l'utilisateur) | Hybride type HYROX |
| `tracking_only` | Séances consignées à la main (ou importées) avec des métriques typées, sans génération | Hypertrophie, Powerlifting, Haltérophilie, CrossFit, Marche, Vélo, Natation, Rameur, Corde à sauter, Yoga, Pilates, Randonnée |
| `alpha` | Discipline référencée, séance libre uniquement | Sprint, PPG, Sports de combat, Prépa sports collectifs |

Les fiches d'exercices sont au statut `draft`. Elles doivent être relues par un professionnel qualifié avant de passer en `expert_validated`, ce que le schéma n'autorise qu'avec un relecteur nommé. Les scores de charge et les budgets de l'orchestrateur sont aussi des valeurs initiales à valider.

## Architecture

```
src/
  domain/        référentiels (objectifs, lieux, équipements, blocs, couverture…) + catalogue extensible des disciplines
  exercises/     fiche exercice (zod) avec assets licenciés et métadonnées de cache, bibliothèque, filtrage + alternatives
  profile/       profil d'entraînement : disciplines × niveau × priorité, objectifs, dispo, contraintes, état de forme
  blocks/        modèle universel de séance (14 types de blocs), charge sur 5 axes dont le SNC, validation par discipline
  generators/    un générateur par discipline (muscu, street workout, course, HIIT, mobilité, hybride)
  planner/       orchestrateur, règles d'interférence, conflits + suggestions, éditions, signalements fatigue/douleur
  live/          séance en direct : étapes, minuteurs, saisie, respect de la prescription, résultat
  offline/       stockage local, outbox de synchronisation, gestionnaire de synchro, cache des séances et fiches
  tracking/      métriques typées (tonnage, splits, D+/D-, TUT, zones, WOD), GPS, records, statistiques
  integrations/  contrat d'adaptateur + import/export Apple Health, Health Connect, Strava, Garmin
  gamification/  XP, niveaux, série hebdomadaire, quêtes, succès, défis personnels
  progress.ts    pipeline : séance enregistrée → records → XP → succès
db/
  migrations/    0001 schéma, 0002 RLS Supabase (incrémentales, protégées par checksum)
  seed/          catalogue généré depuis le code
docs/            architecture de l'orchestrateur
```

### Règles métier principales

- **Générateurs** : chacun choisit les créneaux de sa discipline (`planSlots`), puis génère la séance (`generate`).
  - Musculation : répartition selon fréquence et niveau, prescription selon l'objectif. Les charges sont exprimées en RPE : aucun poids en kg n'est inventé sans historique.
  - Course : +8 % par semaine, une semaine allégée sur quatre, une seule séance de qualité, course-marche pour les débutants.
  - Street workout : échelles de progression en fonction du matériel, travail de figures pour les avancés.
  - HIIT : quatre formats en rotation (intervalles, AMRAP, EMOM, circuit), variante sans impact.
  - Hybride : course compromise (course + ateliers), ateliers de force-endurance, fractionné long.
  - Mobilité : routines ciblées, en récupération active.
- **Orchestrateur** (détail dans [docs/architecture-orchestrateur.md](docs/architecture-orchestrateur.md)) :
  - les règles d'interférence sont déclaratives et servent à la fois au placement et à la détection ;
  - aucun fractionné VMA dans les 24 h qui suivent une séance lourde jambes ;
  - la semaine respecte un plafond de séances intenses et un budget SNC ;
  - un placement glouton est suivi d'une amélioration locale ;
  - chaque conflit vient avec des suggestions vérifiées par simulation ;
  - un signalement de fatigue ou de douleur remplace la séance par de la mobilité ou du repos, sans pénalité.
- **Séance en direct, hors-ligne** :
  - l'état est un réducteur pur, piloté par des horodatages et sérialisé après chaque action : il reprend à l'identique après un crash ;
  - les minuteurs sont rattrapés après un passage en arrière-plan ;
  - les écritures passent par une outbox persistante (ordre préservé, idempotence par identifiant, reprise avec délai croissant, lettres mortes au lieu de suppressions) ;
  - la synchronisation se lance en tâche de fond au retour du réseau ;
  - les séances des prochains jours et leurs fiches sont mises en cache, avec un budget de stockage pour les médias.
- **Données absentes** :
  - une valeur non mesurée reste `undefined` dans le code et `NULL` en base ;
  - une série validée sans saisie n'est pas enregistrée ;
  - une minute d'EMOM qui s'écoule n'est pas comptée comme réussie ;
  - le tonnage est calculé sur les séries pesées, en indiquant combien n'avaient pas de charge ;
  - le dénivelé n'est calculé que si la trace GPS contient l'altitude.
- **Intégrations** :
  - une activité importée est rattachée à la séance de l'app si elle démarre à ±10 min ;
  - l'app reste prioritaire, et l'appareil ne complète que les mesures manquantes ;
  - les imports sont dédoublonnés, et les types d'activité inconnus sont signalés ;
  - l'export ne contient que des données mesurées ;
  - les jetons OAuth ne sont jamais stockés dans les tables : seule une référence vers un coffre l'est.
- **Gamification** :
  - l'XP récompense la séance réalisée et le **respect de la prescription** (aucun bonus en cas de dépassement), jamais la performance ;
  - les séances au-delà du plan rapportent deux fois moins ;
  - le repos planifié et les remplacements pour raison de santé ne cassent pas la série ;
  - l'XP et les niveaux sont recalculés par la base de données, avec la même formule que l'application.

### Base de données

- `ENUM` pour les ensembles fermés ; tables de référence pour ce qui doit s'étendre (disciplines, équipements, environnements, objectifs, catégories).
- Blocs en colonnes typées, avec un `CHECK` par format et un trigger qui vérifie que le format est autorisé pour la discipline.
- Une table de métriques par modèle. Des triggers et des `CHECK` vérifient que le modèle correspond à la discipline. Aucune colonne JSON générique.
- Index ciblés pour l'historique (utilisateur + date, utilisateur + discipline + date), le calendrier (utilisateur + semaine) et le rapprochement des imports (utilisateur + `started_at`).
- Sécurité ligne par ligne (RLS) :
  - chacun ne voit et ne modifie que ses données ;
  - le catalogue est en lecture publique ;
  - l'XP, les records et les succès ne peuvent être écrits que par le serveur.
- Migrations incrémentales : `scripts/migrate.ts` enregistre une empreinte (checksum) de chaque fichier appliqué et refuse qu'on le modifie après coup. Toute évolution passe par un nouveau fichier `NNNN_*.sql`.
- `0001` a été réécrite avant toute application ; c'est désormais la base de référence.

## Ajouter une discipline

1. `registerDiscipline({...})` en `alpha` : le suivi et le succès « première séance » fonctionnent tout de suite.
2. Ajouter des fiches à la bibliothèque. Les tests vérifient les références et le matériel.
3. Écrire un `SessionGenerator` (`variants`, `planSlots`, `generate`) avec des charges sur 5 axes, puis appeler `registerGenerator`. La discipline passe en `beta`, puis en `full` une fois validée. L'orchestrateur ne change pas.
4. `npm run db:seed:export`.

## Pas encore fait

- Aucune interface (API ou front). Ce dépôt ne contient que le socle.
- Les adaptateurs réels des services tiers (OAuth, HealthKit, SDK Health Connect, API Strava et Garmin) restent à écrire. Le contrat `HealthProvider` et les règles d'import/export sont prêts et testés.
- Les implémentations de stockage local (IndexedDB, SQLite) et l'endpoint serveur qui reçoit l'outbox (idempotence via `sync_mutations`) restent à écrire.
- Pas de couche d'accès aux données entre le domaine et le SQL.
- Pas de ressources visuelles. Le schéma exige une licence, une provenance et une taille pour chaque média distant.
- Pas d'heure de séance (délais calculés au jour près) ni de doubles séances.
