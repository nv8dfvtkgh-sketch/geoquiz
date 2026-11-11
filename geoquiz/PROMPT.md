# GéoQuiz — cahier des charges (version affinée)

Tu es un développeur web full-stack senior et un game designer spécialisé dans
les jeux éducatifs. Construis une application web de quiz de géographie
multilingue et multijoueur, inspirée de Seterra (cartes cliquables), de Blooket
et de Kahoot (parties en direct rejointes avec un code, écran animateur).
Aucune installation côté joueur : tout se passe dans le navigateur, sur
téléphone, tablette ou ordinateur.

## 1. Contenu et zones
Toute catégorie est filtrable par **zone**, organisée en trois niveaux :
1. **Monde**
2. **Regroupements** : continents (Afrique, Europe, Asie, Amérique du Nord,
   Amérique du Sud, Océanie) et sous-régions (Afrique du Nord, Europe de l'Ouest,
   Caraïbes, Asie du Sud-Est, Moyen-Orient…)
3. **Pays** : chaque pays du monde dispose de sa carte de régions
   (régions du Maroc, États des USA, départements français, Länder…)

Catégories :
- **Drapeaux** : drapeau → pays, et pays → drapeau
- **Pays** : situer sur la carte, ou nommer le pays surligné
- **Capitales** : capitale ↔ pays, ou placer la capitale sur la carte
- **Régions / États / provinces** d'un pays : situer ou nommer
- À venir via simples fichiers de données : fleuves (zone cliquable élargie
  autour des lignes), montagnes, mers, lacs, déserts, monuments célèbres

**Niveaux de difficulté** : facile (pays et lieux les plus connus),
intermédiaire, difficile (tout, y compris micro-États et îles).

**Frontières** : Natural Earth, avec le tracé officiel marocain (le Maroc
inclut le Sahara ; 12 régions). Le traitement des frontières est un réglage
centralisé du pipeline de données.

## 2. Types de questions
- **Clic sur la carte** : un nom s'affiche, le joueur clique la bonne zone.
  3 essais, puis la bonne zone clignote. Les petits pays (< 1 cm à l'écran)
  ont une cible circulaire cliquable.
- **QCM** : 4 choix, avec des pièges plausibles (pays voisins, même
  sous-région, drapeaux qui se ressemblent).
- **Saisie libre** : tolère accents, casse, tirets, articles et petites fautes
  de frappe ; en arabe, tolère hamza, tā' marbūṭa, alif maqṣūra, tachkil et « ال ».

## 3. Multilingue
- Interface et noms de lieux en **français, anglais, arabe, espagnol**.
- Arabe en RTL avec une police adaptée (Noto Naskh / Noto Kufi Arabic).
- Chaque joueur choisit sa langue ; dans une même partie, des joueurs de
  langues différentes reçoivent les mêmes questions, chacune traduite.
- Aucun texte en dur : interface dans des fichiers de traduction, noms de
  lieux issus de CLDR (pays) et Natural Earth (capitales, régions).

## 4. Modes de jeu
**Solo** — Entraînement (sans chrono, bonne réponse montrée après une erreur)
et Chrono (score = précision + vitesse, meilleur score par quiz sauvegardé).

**Duel 1 contre 1** — code + lien à partager, ou partie rapide (jumelage
automatique). Mêmes questions au même moment, points selon justesse et
rapidité, résultat question par question, écran final avec revanche.

**Salle multijoueur (2 à 50 joueurs)** — l'hôte choisit catégorie, zone,
difficulté, nombre de questions, temps par question et type de questions.
Code de 6 caractères sans caractères ambigus (O/0, I/1/L) + lien + QR code.
Pseudo sans compte, salle d'attente, l'hôte lance. Classement après chaque
question, podium final. Reconnexion avec le même code.
**Mode animateur (façon Kahoot)** : l'hôte peut ne pas jouer ; son écran
(projecteur) affiche la question, le chrono, le nombre de réponses et le
classement, pendant que les joueurs répondent sur leur appareil.

## 5. Règles techniques
- Serveur qui fait autorité : il génère les questions, vérifie les réponses,
  calcule les scores. La bonne réponse n'est jamais envoyée avant que le
  joueur ait répondu ; les images de drapeaux passent par des jetons opaques.
- Temps réel via WebSockets, avec reprise de session après coupure.
- Cartes SVG pré-projetées à partir de Natural Earth (pipeline de données
  reproductible), drapeaux SVG libres (flag-icons, MIT).
- Mobile d'abord : carte zoomable au pincement, cibles tactiles ≥ 44 px.

## 6. Design — « Atlas épuré »
Tons sable, papier et bleu océan, typographie éditoriale, cartes au trait fin,
retour immédiat : vert = juste, rouge = faux, petits sons et animations
discrètes. Thème sombre automatique.

## 7. Livrables (V1)
1. Architecture (dossiers, flux de données, événements temps réel)
2. Code complet et fonctionnel : Drapeaux, Pays, Capitales et Régions sur le
   monde, les regroupements et chaque pays ; Solo, Duel, Salle multijoueur et
   mode animateur ; FR / EN / AR / ES
3. Instructions pour lancer en local et mettre en ligne
4. Guide pour ajouter une catégorie (ex. fleuves) ou une langue
