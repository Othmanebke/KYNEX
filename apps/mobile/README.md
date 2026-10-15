# KYNEX — app mobile (Expo)

iPhone, Android, tablette et web (PC) depuis le même code. Utilise le socle `@kynex/core`.

```bash
# depuis la racine du dépôt
npm install
npm run mobile            # puis scanne le QR code avec Expo Go
npm run typecheck
npm test                  # tests du socle + de l'app
```

## Supabase (optionnel pour l'instant)

Copie `.env.example` en `.env` et renseigne l'URL et la clé publique du projet.
Sans `.env`, l'app fonctionne en **mode local** : tout reste sur l'appareil.

## Organisation

| Dossier | Rôle |
|---|---|
| `src/app/` | Routes Expo Router. `(auth)` : accueil, connexion, inscription. `(app)` : écrans connectés. |
| `src/ui/` | Design system : jetons, texte, boutons, champs, couverture des disciplines. |
| `src/data/` | Supabase, session (cloud ou locale), règles des formulaires. |
| `src/features/` | Composants propres à un écran. |
| `src/dev/` | Jeux de données de test (Démo / Pire cas / Vide), visibles en développement seulement. |

En développement, ajoute `?data=pire` à une URL web (ex. `/connexion?data=pire`) ou utilise le sélecteur en bas d'écran pour voir l'écran avec des données extrêmes.

`metro.config.js` contient une seule règle : il fait résoudre les imports `./x.js` du socle vers ses fichiers `.ts`.
