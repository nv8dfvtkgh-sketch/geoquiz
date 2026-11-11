# GéoQuiz

Quiz de géographie multilingue (français, anglais, arabe, espagnol) et multijoueur :
cartes cliquables façon Seterra, duels et salles en direct façon Blooket / Kahoot.

- **Catégories** : Pays, Drapeaux, Capitales, Régions (de chaque pays du monde)
- **Zones** : monde, continents, régions du monde (Afrique du Nord, Caraïbes…), pays
- **Questions** : clic sur la carte (3 essais), QCM à 4 choix avec pièges plausibles, saisie libre tolérante
- **Modes** : Solo (entraînement / chrono), Duel 1 contre 1 (code, lien ou partie rapide),
  Salle de 2 à 50 joueurs (code, lien, QR code, reconnexion), mode animateur pour un écran projeté
- **Frontières** : Natural Earth, tracé officiel marocain (Sahara inclus, 12 régions)

Le cahier des charges affiné est dans [`PROMPT.md`](PROMPT.md).

---

## 1. Lancer le projet en local

Prérequis : **Node.js 20 ou plus récent**.

```bash
npm install
npm run data        # télécharge Natural Earth (~60 Mo) et construit data/build/ — une seule fois
npm run build       # compile le navigateur et le serveur
npm start           # http://localhost:3000
```

Pour développer (rechargement automatique) : `npm run dev`.

Sans connexion, `npm run data:demo` construit un petit monde schématique (tuiles, vrais noms
et vraies capitales) pour tester tous les modes. Repassez par `npm run data` pour les vraies cartes.

Tests du moteur : `npm test` (réponses tolérantes, anti-triche, solo, duel, salle, reconnexion).

Pour jouer à plusieurs sur le même Wi-Fi, ouvrez `http://<adresse-IP-de-l'ordinateur>:3000`
sur les téléphones.

## 2. Mettre en ligne

Deux versions du serveur partagent le même moteur de jeu :

- **Cloudflare Workers + Durable Objects** : voir le guide pas à pas
  [`DEPLOY-CLOUDFLARE.md`](DEPLOY-CLOUDFLARE.md) (fonctionne sur le forfait gratuit) ;
- **un seul processus Node** (pages + API + WebSocket), pour tout autre hébergeur, ci-dessous.

**Avec Docker** (Render, Railway, Fly.io, un VPS…) :

```bash
docker build -t geoquiz .
docker run -p 3000:3000 geoquiz
```

**Sans Docker** (Render / Railway « Web Service ») :
- Build : `npm install && npm run data && npm run build`
- Start : `npm start`

Variables d'environnement :

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port d'écoute | `3000` |
| `MAX_PLAYERS` | Joueurs max par salle | `50` |
| `DATA_DIR` | Dossier des données construites | `data/build` |

Points d'attention :
- L'hébergeur doit accepter les **WebSockets** (c'est le cas de Render, Railway, Fly.io ; derrière
  Nginx, ajoutez `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).
- Les parties vivent **en mémoire** : gardez **une seule instance**. Une instance tient
  confortablement des centaines de parties simultanées. Pour passer à plusieurs instances,
  il faudra partager l'état (Redis) — voir « Pour aller plus loin ».

## 3. Architecture

```
geoquiz/
├── PROMPT.md                 cahier des charges
├── data/
│   ├── names/                noms des pays FR/EN/AR/ES (Unicode CLDR)
│   ├── raw/                  Natural Earth téléchargé (généré)
│   └── build/                données du jeu (générées par npm run data)
│       ├── world.json        carte du monde pré-projetée, géométrie seule
│       ├── countries.json    noms, continent, voisins, capitale… (reste sur le serveur)
│       ├── regions/XX.json   subdivisions de chaque pays (+ noms, côté serveur)
│       └── flags/XX.svg      drapeaux (flag-icons, MIT)
├── scripts/
│   ├── build-data.ts         pipeline Natural Earth → data/build
│   ├── config/borders.ts     fusions de territoires (tracé des frontières)
│   ├── config/regions.ts     regroupements officiels (ex. provinces → 12 régions du Maroc)
│   ├── lib/geo.ts            fusion, simplification topologique, projection
│   ├── demo-data.ts          monde de démonstration hors ligne
│   └── build.mjs / dev.mjs   compilation (esbuild)
├── src/
│   ├── shared/protocol.ts    types et messages partagés navigateur ↔ serveur
│   ├── worker/index.ts       version Cloudflare : Worker + Durable Objects (RoomDO, QuickDO)
│   ├── server/
│   │   ├── index.ts          version Node : HTTP (fichiers, API) + WebSocket
│   │   ├── quick.ts          file d'attente de la partie rapide
│   │   ├── data.ts           chargement des données, zones, jetons d'images
│   │   ├── categories.ts     catégories : tirage, pièges, vérification
│   │   ├── rooms.ts          moteur : salles, manches, scores, reconnexion
│   │   └── text.ts           comparaison tolérante des réponses tapées
│   └── client/
│       ├── App.tsx, state.ts état de l'application
│       ├── net.ts            WebSocket, reconnexion automatique
│       ├── MapView.tsx       carte SVG zoomable et cliquable au doigt
│       ├── screens/          Accueil, Réglages, Salle d'attente, Partie, Résultats
│       ├── locales/*.json    traductions de l'interface
│       └── sound.ts          sons synthétisés
├── public/                   index.html, app.css, app.js (compilé)
└── tests/engine.test.ts
```

**Choix techniques.** Le cahier des charges proposait Next.js + Socket.io. Le jeu est une
application d'une seule page, sans besoin de rendu serveur ni de référencement : React compilé
par esbuild + des WebSockets standard. Le moteur (`rooms.ts`, `categories.ts`, `data.ts`) ne
dépend d'aucune plateforme ; `src/server/index.ts` (Node) et `src/worker/index.ts` (Cloudflare)
ne font que le brancher. Les messages sont typés dans `src/shared/protocol.ts`.

### Flux des données

```
Natural Earth + CLDR ──npm run data──▶ data/build/
                                        │
             world.json, regions (géométrie seule) ──▶ navigateur (/api/map/…)
             noms, capitales, voisins ──▶ serveur uniquement
```

Les cartes sont **projetées à l'avance** (Natural Earth I pour le monde, projection locale pour
chaque pays) et simplifiées sans créer de trous entre voisins : le navigateur ne fait que dessiner
des chemins SVG.

### Anti-triche

- Le serveur tire les questions, vérifie chaque réponse et calcule les scores.
- La question envoyée ne contient **jamais** la réponse : les choix de QCM ont des identifiants
  opaques (`o0`…`o3`), les drapeaux sont servis via des jetons à usage unique (`/api/img/…`)
  qui ne révèlent pas le pays, les noms des régions ne quittent pas le serveur.
- À plusieurs, la bonne réponse n'est révélée qu'en fin de manche, à tout le monde en même temps.
- Les temps de réponse sont mesurés côté serveur.
- Limite connue : pour « Quel est ce pays ? », la forme surlignée doit bien être affichée ; un
  script pourrait la comparer à la carte publique. C'est inhérent à ce type de jeu.

### Événements temps réel

Création : `POST /api/rooms {kind, settings, hostPlays}` → `{code}`. Le navigateur ouvre ensuite
le WebSocket **`/ws/<CODE>`** (un par partie ; sur Cloudflare, il arrive directement au Durable
Object de la partie), ou `/ws/quick` pour la partie rapide. Messages JSON :

| Navigateur → serveur | Rôle |
|---|---|
| `join {name, lang}` | entre dans la partie (le premier arrivé en est l'hôte) |
| `resume {token, lang}` | reprend sa place après une coupure ou un rechargement |
| `quick {settings}` / `cancelQuick` | partie rapide, sur `/ws/quick` |
| `settings`, `start`, `kick`, `next` | actions de l'hôte |
| `answer {q, value}` | réponse : id de zone, id d'option ou texte |
| `rematch`, `lang`, `leave` | revanche / retour en salle, langue, quitter |

| Serveur → navigateur | Rôle |
|---|---|
| `joined {you, token, room}` | entrée dans la partie (le jeton permet la reconnexion) |
| `room {room}` | état de la salle : joueurs, scores, réglages, étape |
| `question {q}` | question traduite dans la langue du joueur, sans la réponse |
| `feedback` | juste / faux, essais restants (révélation immédiate en solo) |
| `progress {answered, total}` | nombre de réponses reçues |
| `reveal {reveal, results, players, next}` | fin de manche : bonne réponse et classement |
| `finished {players, recap, solo?}` | podium, récapitulatif, précision et temps en solo |
| `matched {code}` | partie rapide : adversaire trouvé, rejoindre `/ws/<code>` |
| `error {code}`, `kicked`, `quickWaiting` | erreurs (traduites côté navigateur), etc. |

### Points

- Bonne réponse : de 500 (au dernier moment) à 1000 points (immédiatement).
- Carte : ×1 au premier essai, ×0,5 au deuxième, ×0,25 au troisième.
- Solo chrono : précision (crédit 1 / 0,5 / 0,25 selon l'essai) puis temps total ; le meilleur
  score de chaque configuration est gardé dans le navigateur.

## 4. Frontières et régions

- `scripts/config/borders.ts` : territoires fusionnés. Le Sahara (`SAH`) est rattaché au Maroc,
  ses frontières internes sont effacées et ses subdivisions rejoignent la carte du Maroc.
- `scripts/config/regions.ts` : regroupement des provinces en régions officielles. Pour le Maroc,
  les provinces de Natural Earth sont rangées dans les **12 régions** de 2015 (noms en 4 langues).
  À la construction, le pipeline affiche le nombre de régions obtenu et les subdivisions non
  rattachées : si une province apparaît seule, ajoutez son nom aux `tokens` de sa région.
- Pour les autres pays, si Natural Earth fournit un champ « region » (ex. départements → régions
  en France), deux découpages sont proposés : « Régions » et « Subdivisions ».
- Les subdivisions trop éloignées du territoire principal (outre-mer) sont écartées des cartes
  de pays (`REGION_MAX_DISTANCE_FACTOR`).

## 5. Ajouter une langue (ex. italien)

1. Copiez `src/client/locales/fr.json` en `it.json` et traduisez les valeurs.
2. Dans `src/client/i18n.ts`, importez le fichier et ajoutez `it` à `DICTS` et `LANG_LABELS`
   (et à `RTL` si la langue s'écrit de droite à gauche).
3. Dans `src/shared/protocol.ts`, ajoutez `'it'` à `LANGS`.
4. Noms de lieux : dans `scripts/build-data.ts`, ajoutez `'it'` à `LANGS`, et générez
   `data/names/countries.it.json` (CLDR, par exemple avec Python :
   `from babel import Locale; Locale('it').territories`). Les capitales et régions utilisent les
   champs `name_it` de Natural Earth. Relancez `npm run data`.

## 6. Ajouter une catégorie (ex. fleuves)

Une catégorie = **des données** + **un objet dans le registre** `CATEGORIES`.
La carte sait déjà afficher des lignes avec une zone cliquable élargie (22 px) autour.

**1. Données** — dans `scripts/build-data.ts`, ajoutez le fichier Natural Earth
`ne_10m_rivers_lake_centerlines.geojson` à `FILES`, puis à la fin de `main()` :

```ts
import { linesOf, topoSimplify } from './lib/geo';
const rivers = readJson(path.join(RAW, FILES.rivers)).features
  .filter((f: any) => prop(f, 'scalerank') <= 4 && prop(f, 'name'));
const byName = new Map<string, any[]>();
for (const f of rivers) byName.set(prop(f, 'name'), [...(byName.get(prop(f, 'name')) ?? []), f]);
const out: any[] = [], names: Record<string, any> = {};
[...byName].forEach(([name, fs], i) => {
  const lines = fs.flatMap((f) => linesOf(f.geometry)).map((l) => l.map(([x, y]) => world.tx(x, y)));
  const simple = topoSimplify(lines, 0.3, false);
  const b = bbox(simple);
  out.push({ id: `R${i}`, d: pathD(simple, false), c: simple[0][Math.floor(simple[0].length / 2)], b, a: 0, line: true });
  names[`R${i}`] = namesFrom(fs[0], name);
});
fs.writeFileSync(path.join(OUT, 'rivers.json'), JSON.stringify({ w: world.w, h: world.h, features: out, names }));
```

**2. Serveur** — chargez `rivers.json` dans `initData` (`src/server/data.ts`), servez sa
géométrie sur `/api/map/rivers` dans `src/server/index.ts` **et** `src/worker/index.ts`
(comme `/api/map/region/…`), puis ajoutez la catégorie dans
`src/server/categories.ts` en vous inspirant de `regionsCat` :

```ts
const riversCat: Category = {
  id: 'rivers',
  qtypes: ['map', 'mcq', 'type'],
  zoneKinds: ['world', 'continent', 'subregion'],
  pool: (zone, d, n) => byDifficulty(riverIdsIn(zone), d, n),
  make(target, kind, zone, rnd) {
    const names = rivers.names[target];
    const map = { map: 'rivers', view: zone.view, active: riverIdsIn(zone), layer: 'shapes' as const };
    const base = { category: 'rivers', target, answer: names, revealId: target, map };
    if (kind === 'map') return { ...base, kind, promptKey: 'q.rivers.map', promptName: names, attempts: 3, check: (v) => v === target };
    // … QCM et saisie : comme regionsCat
  },
};
```

et ajoutez `riversCat` à la liste de `CATEGORIES`. Dans `MapView.tsx`, `loadMap('rivers')` doit
appeler `/api/map/rivers` ; pour voir les pays en fond, dessinez `world` sous les lignes.

**3. Textes** — ajoutez `cat.rivers`, `q.rivers.map`, `q.rivers.name` dans chaque fichier de
`locales/`. La catégorie apparaît automatiquement dans les réglages.

Montagnes, lacs, mers, déserts et monuments suivent le même schéma (points : utilisez la couche
`capitals` de la carte, qui affiche des cibles rondes).

## 7. Pour aller plus loin

- Encarts pour les territoires lointains (Alaska et Hawaï sont aujourd'hui sur la même carte que
  les États contigus, à l'échelle réelle).
- Version Node sur plusieurs instances : déplacer `rooms` vers Redis (la version Cloudflare n'en a
  pas besoin : chaque partie est déjà isolée dans son Durable Object).
- Comptes et classements mondiaux (aujourd'hui : pseudo sans compte, records dans le navigateur).
- Noms alternatifs acceptés en saisie (« USA », « RDC »…) : ajouter une liste d'alias par pays
  dans `countries.json` et la passer à `typedCheck`.

## Licences des données

- Cartes : [Natural Earth](https://www.naturalearthdata.com/) (domaine public)
- Noms de pays : Unicode CLDR (licence Unicode)
- Drapeaux : [flag-icons](https://github.com/lipis/flag-icons) (MIT)
