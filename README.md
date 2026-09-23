# Valorant Tracker — bot Discord

Suit en direct les parties Valorant des membres d'un serveur Discord :

- 🔴 **En jeu** : annonce quand un membre lance VALORANT (d'après son statut Discord).
- 🏆 / 💀 **Résultat** : à chaque fin de partie, poste victoire/défaite avec map, agent, score, K/D/A, ACS, ADR, HS % et gain/perte de RR en compétitif.
- 🔗 **tracker.gg** : cliquer sur le titre du résultat (ou le bouton « Voir la partie sur tracker.gg ») ouvre la page du match sur tracker.gg ; le pseudo et le bouton « Profil » ouvrent le profil du joueur.
- ⚫ **Fin de session** : quand le joueur ferme le jeu, le message « En jeu » devient un bilan (ex. `4 parties · 3V / 1D`).

## Commandes

| Commande | Rôle |
|---|---|
| `/salon #salon` | Choisit le salon des annonces (permission « Gérer le serveur ») |
| `/track ajouter pseudo tag [region] [membre]` | Suit un compte. Ex. : `pseudo: skyfe` `tag: マキマ` `region: Europe`. Région détectée automatiquement si omise. Le compte est lié à toi, ou au `membre` indiqué |
| `/track retirer pseudo tag` | Arrête le suivi |
| `/track liste` | Liste les comptes suivis |
| `/derniere pseudo tag [region]` | Affiche la dernière partie de n'importe quel joueur |

> Sur Valorant, EUW et EUNE ne sont qu'une seule région : **Europe (`eu`)**.

## Installation

### 1. Créer le bot Discord
1. <https://discord.com/developers/applications> → **New Application**.
2. Onglet **Bot** → **Reset Token** → copie le token.
3. Toujours dans **Bot**, active **Presence Intent** (indispensable pour détecter « en jeu »).
4. Onglet **OAuth2 → URL Generator** : scopes `bot` + `applications.commands`, permissions `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`. Ouvre l'URL générée pour inviter le bot.

### 2. Obtenir une clé API HenrikDev
Riot ne donne pas accès à l'API des matchs Valorant aux projets personnels. Le bot utilise donc [HenrikDev](https://docs.henrikdev.xyz), l'API communautaire utilisée par la plupart des bots Valorant. La clé est gratuite : rejoins leur Discord et génère-la via leur dashboard (clé « Basic » = 30 requêtes/min).

### 3. Lancer
Node.js 18.17+ requis.

```bash
npm install
cp .env.example .env   # puis remplis DISCORD_TOKEN et HENRIK_API_KEY
npm start
```

Astuce : renseigne `DEV_GUILD_ID` avec l'ID de ton serveur pour que les commandes apparaissent immédiatement.

Pour qu'il tourne 24/7, il faut l'héberger (VPS, Raspberry Pi, Railway, fly.io…). Les données sont stockées dans `data/db.json` : garde ce dossier persistant.

## Comment ça marche / limites

- **Aucune API publique n'indique qu'un joueur est *dans* une partie Valorant.** Le statut « en jeu » vient de l'activité Discord « Joue à VALORANT » du membre lié. Il faut donc que le joueur ait l'affichage de l'activité activé (Paramètres Discord → Confidentialité de l'activité), et cela indique que le jeu est lancé, pas forcément qu'une partie est en cours.
- Les résultats arrivent via l'API **1 à 3 minutes** après la fin de la partie. Le bot vérifie chaque minute pendant qu'un joueur est en jeu, et toutes les 5 minutes sinon (les résultats sont donc postés même si le statut Discord est masqué).
- Seules les parties jouées **après** l'ajout d'un compte sont annoncées.
- Compte PC uniquement (pas console).
- **tracker.gg** : les liens ouvrent le match et le profil, mais les stats affichées dans Discord viennent de HenrikDev (tracker.gg ne propose pas d'API Valorant ouverte). Pour que ton profil soit visible sur tracker.gg, connecte-toi une fois sur tracker.gg avec ton compte Riot.

## Structure

```
src/index.js     démarrage, événements Discord
src/commands.js  commandes slash
src/tracker.js   boucle de suivi + sessions « en jeu »
src/henrik.js    client API HenrikDev (file d'attente + limite de débit)
src/match.js     extraction des stats d'un match
src/embeds.js    mise en forme des messages
src/store.js     stockage JSON
```

`npm test` lance les tests.
