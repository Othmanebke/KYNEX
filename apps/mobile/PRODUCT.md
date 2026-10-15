# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tout le monde à égalité : débutants qui (re)commencent, amateurs qui combinent plusieurs sports (salle, course, mobilité, HIIT…), pratiquants confirmés. Aucune cible prioritaire : chaque écran doit rester compréhensible pour un débutant sans freiner un pratiquant confirmé.

Situation d'usage : préparer sa semaine (calme, souvent sur PC ou tablette), puis s'entraîner (en salle, dehors, à la maison — téléphone en main, mains occupées, parfois hors réseau).

## Product Purpose

KYNEX construit la semaine d'entraînement d'une personne qui pratique plusieurs disciplines, sans que ces disciplines se gênent : charge répartie, repos respectés, conflits signalés avec une solution vérifiée. Puis il accompagne la séance en direct et en garde la trace.

Réussite pour l'utilisateur (toutes confirmées) :
- **Régularité** : tenir sa semaine, semaine après semaine.
- **Progresser sans se blesser** : charge maîtrisée, interférences évitées, repos respecté.
- **Gain de temps** : ouvrir l'app et s'entraîner, sans réfléchir à quoi faire.
- **Suivre ses chiffres** : historique, records, statistiques par discipline.

## Positioning

Un orchestrateur multisports : chaque discipline garde son propre générateur et ses règles, et un planificateur commun arbitre la semaine (budget de séances intenses, stress nerveux cumulé, règles d'interférence comme « pas de fractionné dans les 24 h après des jambes lourdes »). Les mêmes règles servent au placement et à la détection des conflits.

## Operating Context

- Préparation de la semaine : calendrier, déplacement / allègement / suppression de séances, conflits avec suggestions.
- Séance en direct : étape en cours, minuteur, saisie reps / charge / RPE, pause / reprise, 100 % hors-ligne (outbox).
- Signalement fatigue / douleur au jour le jour : la séance est remplacée par de la mobilité ou du repos, sans pénalité.
- Historique et statistiques par discipline ; profil joueur (niveaux, XP, quêtes, succès).

## Capabilities and Constraints

- Monorepo npm : socle métier `packages/core` (@kynex/core, TypeScript, Zod) + app `apps/mobile` (Expo SDK 57, Expo Router, Reanimated).
- **Web d'abord** (PC, tablette, téléphone via le navigateur). L'app iPhone / Android viendra ensuite du même code Expo, sans réécriture.
- Interface **en français**, tutoiement.
- Supabase prévu (auth + base, schéma dans `packages/core/db`) mais pas branché pour l'instant : sans `.env`, comptes et données restent sur l'appareil (mode local). Pas de clés dans le code.
- Couverture des disciplines déclarée honnêtement : `full` (Coachée), `beta`, `tracking_only` (Suivi seul), `alpha` (Séance libre). Une discipline non couverte n'est jamais présentée comme coachée.
- Charges exprimées en RPE : aucun poids en kg inventé sans historique.

## Brand Commitments

- Nom : **KYNEX**.
- Voix : français direct, tutoiement, phrases courtes ; explique le « pourquoi » d'une décision du plan sans jargon.
- Référence fournie par l'utilisateur : une maquette de club de sport (sombre, accent vert-jaune, grands titres condensés, CTA soulignés avec flèche), à reprendre « en mieux ».

## Evidence on Hand

- Catalogue réel : 22 disciplines (5 coachées, 1 bêta, 12 en suivi seul, 4 en séance libre), fiches d'exercices, générateurs et planificateur testés (136 tests du socle).
- Images d'exercices : source retenue **free-exercise-db** (domaine public). Chaque média doit porter licence et provenance.
- **Absences à ne jamais combler par de l'invention** : aucun coach, témoignage, client, statistique d'usage ou note d'avis. Les fiches d'exercices sont des brouillons non validés par un expert : ne jamais écrire « validé par un coach ». Une mesure absente s'affiche comme absente, jamais comme 0.

## Product Principles

1. **Honnêteté avant tout** : couverture réelle, données réelles, mesures absentes affichées comme absentes, limites du plan expliquées.
2. **La santé prime sur la performance** : un signalement de fatigue ou de douleur n'est jamais pénalisé ; l'XP récompense le respect de la prescription, pas le dépassement.
3. **Chaque décision du plan est explicable et modifiable** : l'utilisateur voit pourquoi, et garde la main (déplacer, alléger, supprimer, annuler).
4. **Utilisable en pleine séance** : grandes cibles, lisible à distance, fonctionne hors-ligne.

## Accessibility & Inclusion

- Contraste AA minimum, tailles de texte dynamiques respectées, zones tactiles ≥ 44 pt, réduction des animations respectée (exigences du brief).
- Retours haptiques jamais seuls : toujours doublés d'un retour visuel.
