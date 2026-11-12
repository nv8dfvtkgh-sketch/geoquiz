# Mettre Quizellige en ligne sur Cloudflare

Sur Cloudflare, le jeu tourne avec **Workers + Durable Objects** :

- le **Worker** répond à l'API et sert le site (pages, styles, cartes, drapeaux) ;
- chaque **partie** est un *Durable Object* : un petit serveur dédié, identifié par le code de la
  partie, qui garde l'état du jeu et gère les connexions temps réel de tous ses joueurs ;
- la **partie rapide** passe par un Durable Object unique qui associe les joueurs.

Le **forfait gratuit** suffit pour commencer (Durable Objects « SQLite » inclus).

> N'utilisez pas « Upload your static files » : seule l'interface s'afficherait, sans parties.

---

## Étape 1 — Mettre le code sur GitHub

1. Décompressez `geoquiz.zip`.
2. *(Recommandé, si Node.js est installé)* dans le dossier, lancez `npm install` : cela crée
   `package-lock.json`, qui fige les versions des dépendances. Gardez ce fichier.
3. Créez un dépôt **vide** sur GitHub (par exemple `geoquiz`), puis envoyez le dossier :
   - avec **GitHub Desktop** : *File → Add local repository*, choisissez le dossier, *Publish repository* ;
   - ou en ligne de commande :
     ```bash
     git init
     git add .
     git commit -m "Quizellige"
     git branch -M main
     git remote add origin https://github.com/<votre-compte>/geoquiz.git
     git push -u origin main
     ```

Le fichier `.gitignore` exclut déjà ce qui est généré (`node_modules`, données construites…).

## Étape 2 — Créer le Worker depuis GitHub

1. Tableau de bord Cloudflare → **Workers & Pages** → **Créer** → **Connect GitHub**.
2. Autorisez Cloudflare à lire le dépôt `geoquiz`, puis sélectionnez-le.
3. Réglages de build :

   | Champ | Valeur |
   |---|---|
   | Nom du projet | `geoquiz` (doit correspondre à `name` dans `wrangler.jsonc`) |
   | Commande de build | `npm run build:cf` |
   | Commande de déploiement | `npx wrangler deploy` |
   | Répertoire racine | `/` |

4. **Déployer**. Le premier build prend quelques minutes : il télécharge Natural Earth (~60 Mo),
   construit les cartes de tous les pays, puis compile le site.

Le jeu est alors en ligne sur `https://geoquiz.<votre-sous-domaine>.workers.dev`.
Chaque `git push` sur `main` redéploie automatiquement.

## Étape 3 — Votre nom de domaine (facultatif)

Worker `geoquiz` → **Settings** → **Domains & Routes** → **Add** → *Custom domain*
(ex. `quiz.mondomaine.ma`). Le domaine doit être géré par Cloudflare. Le QR code et le lien de
partage utilisent automatiquement l'adresse affichée dans le navigateur.

## Réglages

- **Joueurs max par salle** : variable `MAX_PLAYERS` dans `wrangler.jsonc` (ou dans
  *Settings → Variables*).
- **Espace de validation des quiz** (`/admin`) : ajoutez un secret `ADMIN_PASSWORD`
  (Worker `geoquiz` → **Paramètres** → **Variables et secrets** → **Ajouter** → type *Secret*).
  Sans ce secret, la page `/admin` reste fermée. Les quiz créés par les joueurs sont stockés
  dans le Durable Object `QuizDO` ; une photo est réduite à environ 120 Ko avant envoi.
- **Comptes joueurs** : stockés dans le Durable Object `AccountsDO` (créé automatiquement au déploiement,
  migration `v3`). Mots de passe hachés (PBKDF2), e-mails jamais demandés aux moins de 13 ans.
  Dans `/admin` → onglet **Joueurs** : statistiques, export CSV, mot de passe provisoire, suppression.
- **Journaux** : onglet **Observability** du Worker (activé dans `wrangler.jsonc`).

## Bon à savoir

- Une partie vit en mémoire dans son Durable Object. Tant qu'au moins un joueur est connecté,
  elle continue ; un joueur coupé peut revenir avec le même code. Si **tout le monde** quitte
  pendant une ou deux minutes, Cloudflare libère la partie et le code expire.
- Les fichiers `public/data/*` (cartes et noms) sont lus par le Worker mais **bloqués au public** :
  les noms des régions sont des réponses.
- Coûts : le forfait gratuit inclut 100 000 requêtes par jour pour les Durable Objects et une durée
  d'activité limitée par jour ; une classe de 30 élèves pendant une heure reste très en dessous.
  Au-delà, le forfait Workers Paid coûte 5 $ par mois.

## Déployer depuis votre ordinateur (variante)

```bash
npm install
npx wrangler login
npm run cf:deploy        # construit les données + le site, puis déploie
```

Pour tester la version Cloudflare en local : `npm run data` (une fois), puis `npm run cf:dev`.

## En cas de problème

| Message | Solution |
|---|---|
| *Données absentes : lancez « npm run build:cf »* | La commande de build n'est pas `npm run build:cf`. Corrigez-la dans *Settings → Build*. |
| *Téléchargement impossible* pendant le build | GitHub était indisponible : relancez le déploiement. |
| Erreur de *migration* des Durable Objects | Ne modifiez pas le bloc `migrations` après le premier déploiement ; ajoutez plutôt une nouvelle étape (`"tag": "v2"`). |
| Le nom du projet ne correspond pas | Le nom choisi dans Cloudflare doit être celui de `name` dans `wrangler.jsonc`. |
| Les joueurs restent sur « Connexion perdue » | Vérifiez que l'adresse commence par `https://` ; les WebSockets passent par `/ws/`. |
