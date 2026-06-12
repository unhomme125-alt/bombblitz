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

Variantes (modes compétitifs) : **⚡ Blitz** (timer très court) et **💀 Mort subite** (1 vie). Des **🤖 bots** peuvent être ajoutés au lobby pour tester.

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
