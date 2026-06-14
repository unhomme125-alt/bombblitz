# 💣 BombBlitz

Clone de **BombParty** (jklm.fun) multijoueur en temps réel, avec 4 modes de
jeu, lobby en ligne et WebSocket. Stack 100 % vanilla.

- **Backend** : Node.js + Express 4 + Socket.IO 4 (données en mémoire, pas de BDD)
- **Frontend** : HTML/CSS/JS vanilla (modules ES2022), Vite comme dev server
- **Sans** TypeScript, framework CSS, ORM ni Docker

## Modes de jeu

| Mode | But |
|------|-----|
| 🌍 **Pays** | Taper un pays contenant la combinaison (+ points de rapidité) |
| 🏛️ **Capitales** | Taper une capitale contenant la combinaison |
| ➕ **Calcul** | Résoudre l'opération (difficulté progressive) |
| 📖 **Classique** | Taper un mot du dictionnaire contenant la combinaison |
| 💣 **Coopératif** | Toute l'équipe désamorce une bombe partagée avant la fin du timer global ; chaque erreur retire 10 % du temps |
| 🔴 **Imposteur** | Coopératif à traître caché (4+ joueurs). Toute l'équipe désamorce une bombe commune à tour de rôle ; l'un de vous est l'**Imposteur** et peut **saboter**, **freezer** un clavier et provoquer l'explosion. Jauge de 👁️ suspicion + **🚨 Appel d'urgence** pour voter |

Variantes (modes compétitifs) : **⚡ Blitz** (timer très court) et **💀 Mort subite** (1 vie). Des **🤖 bots** peuvent être ajoutés au lobby pour tester.

### 🔴 Mode Imposteur en détail

Mode **coopératif avec un traître caché**. Une **bombe commune** à timer global
(30-120s, réglable) ; les joueurs répondent à tour de rôle à des challenges
« combinaison ». L'**Imposteur** (toujours 1, désigné au hasard) voit le même
écran que les Civils mais veut faire exploser la bombe sans se faire repérer.

- **Timer** : chaque bonne réponse ajoute du temps selon la longueur du mot
  (4→+3s, 5→+5s, 6→+8s, 7→+11s, 8+→+15s) ; toute erreur ou timeout retire **12s**.
  Le timer ne descend jamais sous **5s**. On gagne quand le compteur de
  challenges désamorcés (`joueurs × 4`, min 12) est atteint.
- **Sabotage** (imposteur, 3 charges `●●●`) : un bouton 💣 discret force sa
  réponse à être incorrecte — sans laisser de trace pour les autres.
- **Freeze** (imposteur, 1×/min) : gèle le clavier d'un joueur 4s à son prochain
  tour (animation glitch côté victime, cooldown visible côté imposteur).
- **Suspicion** : jauge 👁️ 0-5 sous chaque avatar, mise à jour automatiquement
  (rate 2 tours de suite, rate un mot facile, répond trop vite → +1 ; mot long
  correct ou victime d'un freeze → −1).
- **Appel d'urgence** (1 par joueur) : coûte **8s** immédiatement, gèle le jeu et
  lance un **vote de 15s** (votes cachés, révélation simultanée). Majorité
  absolue → exclusion. Exclure l'imposteur = victoire des Civils ; exclure un
  Civil coûte **20s** de plus.
- **Victoire** : les Civils gagnent en désamorçant la bombe ou en votant
  l'imposteur ; l'imposteur gagne si la bombe explose ou s'il ne reste que 2
  joueurs. À la fin, les cartes se retournent (flip 3D) et révèlent les rôles,
  les sabotages utilisés et le **score de discrétion** de l'imposteur.
- Composition : toujours **1 Imposteur**, les autres sont Civils (min 4 joueurs).

## Lancer le jeu

```bash
npm install
npm start            # serveur sur http://localhost:3000
```

Ouvre **http://localhost:3000** dans deux onglets : crée une salle dans l'un,
rejoins avec le code 4 lettres dans l'autre, et lance la partie. Aucune
configuration supplémentaire n'est nécessaire.

### Mode développement (hot reload front)

```bash
npm run dev:server   # serveur Socket.IO (port 3000)
npm run dev:client   # Vite (port 5173, proxy /socket.io -> 3000)
```

> ⚠️ **Vite 5 exige Node ≥ 18.** Le serveur de jeu (`npm start`) fonctionne
> dès Node 16 ; Vite n'est qu'un confort de dev — tout est jouable via le
> serveur Express seul.

## Régénérer les données

Les fichiers `server/data/*.json` sont générés par script :

```bash
node server/data/buildSyllables.js   # countries.json + capitals.json (195 pays)
node server/data/buildWords.js       # words_fr.json (~4000 mots)
```

## Notes

- **Validation des réponses : côté serveur uniquement.**
- Les **sons** et la **bombe** sont générés programmatiquement (Web Audio +
  SVG) — aucun fichier binaire requis ; fallback silencieux si l'audio est
  bloqué. Le dossier `client/assets/` est donc optionnel.
- Une salle inactive depuis 30 min est nettoyée automatiquement.
- Reconnexion : ré-ouvrir `game.html?room=CODE` rejoint la salle si elle existe.

## Architecture

```
server/
  server.js          Express + Socket.IO, câblage des événements
  roomManager.js     Salles en mémoire (création, jonction, TTL)
  gameEngine.js      Manches, tours, bombe, vies, fin de partie
  modes/             classic · countries · capitals · math
  data/              JSON + scripts de génération
client/
  index.html         Accueil (pseudo, créer/rejoindre)
  game.html          Lobby + écran de jeu
  css/               main · lobby · game
  js/                lobby · game · ui · bomb · sounds · socket
```
