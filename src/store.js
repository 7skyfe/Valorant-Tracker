// Stockage JSON simple : largement suffisant pour quelques serveurs / dizaines de joueurs.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(file) {
    this.file = file;
    try {
      this.data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      this.data = { guilds: {} };
    }
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }

  guild(guildId) {
    return (this.data.guilds[guildId] ??= { channelId: null, players: {} });
  }

  setChannel(guildId, channelId) {
    this.guild(guildId).channelId = channelId;
    this.save();
  }

  addPlayer(guildId, player) {
    this.guild(guildId).players[player.puuid] = player;
    this.save();
  }

  removePlayer(guildId, puuid) {
    delete this.guild(guildId).players[puuid];
    this.save();
  }

  findPlayer(guildId, name, tag) {
    const n = name.toLowerCase();
    const t = tag.toLowerCase();
    return Object.values(this.guild(guildId).players).find(
      (p) => p.name.toLowerCase() === n && p.tag.toLowerCase() === t,
    );
  }

  // Un même compte peut être suivi sur plusieurs serveurs : on regroupe par puuid
  // pour ne faire qu'un appel API par joueur.
  trackedAccounts() {
    const byPuuid = new Map();
    for (const [guildId, g] of Object.entries(this.data.guilds)) {
      for (const p of Object.values(g.players)) {
        const entry = byPuuid.get(p.puuid) ?? { ...p, guilds: [] };
        entry.guilds.push(guildId);
        byPuuid.set(p.puuid, entry);
      }
    }
    return [...byPuuid.values()];
  }

  setLastMatch(puuid, matchId) {
    for (const g of Object.values(this.data.guilds)) {
      if (g.players[puuid]) g.players[puuid].lastMatchId = matchId;
    }
    this.save();
  }

  // Met à jour pseudo/tag si le joueur a changé de Riot ID.
  updateIdentity(puuid, name, tag) {
    let changed = false;
    for (const g of Object.values(this.data.guilds)) {
      const p = g.players[puuid];
      if (p && (p.name !== name || p.tag !== tag)) {
        Object.assign(p, { name, tag });
        changed = true;
      }
    }
    if (changed) this.save();
  }

  playersForDiscordUser(guildId, userId) {
    return Object.values(this.guild(guildId).players).filter((p) => p.discordUserId === userId);
  }
}
