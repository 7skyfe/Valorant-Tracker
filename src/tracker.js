// Boucle de suivi : détecte les nouvelles parties terminées et gère les sessions "en jeu".
//
// Il n'existe aucune API publique qui dise "ce joueur est en partie Valorant en ce
// moment". On utilise donc le statut Discord ("Joue à VALORANT") du membre lié au
// compte pour annoncer qu'il est en jeu et pour accélérer le polling pendant sa session.
import { ActivityType } from 'discord.js';
import { summarizeMatch, newMatchesSince } from './match.js';
import { matchEmbed, matchButtons, liveEmbed, sessionEndEmbed } from './embeds.js';

const TICK_MS = 15_000;
const LIVE_POLL_MS = 60_000; // membre en jeu : on vérifie chaque minute
const IDLE_POLL_MS = 5 * 60_000; // sinon toutes les 5 min (au cas où le statut Discord est masqué)
const AFTER_SESSION_MS = 10 * 60_000; // on reste en mode rapide 10 min après la fermeture du jeu
const LIVE_COOLDOWN_MS = 5 * 60_000; // anti-spam si le jeu crash / redémarre

export function isPlayingValorant(presence) {
  return (presence?.activities ?? []).some(
    (a) => a.type === ActivityType.Playing && a.name?.toUpperCase() === 'VALORANT',
  );
}

export class Tracker {
  constructor({ client, store, henrik, log = console }) {
    this.client = client;
    this.store = store;
    this.henrik = henrik;
    this.log = log;
    this.nextCheck = new Map(); // puuid -> timestamp
    this.fastUntil = new Map(); // puuid -> timestamp (mode rapide après une session)
    this.sessions = new Map(); // `${guildId}:${userId}` -> { messageId, channelId, wins, losses, draws, endedAt }
    this.running = false;
  }

  start() {
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error('[tracker]', e)), TICK_MS);
    this.tick().catch((e) => this.log.error('[tracker]', e));
  }

  stop() {
    clearInterval(this.timer);
  }

  // Force une vérification rapide d'un compte (ex. juste après /track add).
  schedule(puuid, inMs = 0) {
    this.nextCheck.set(puuid, Date.now() + inMs);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      for (const account of this.store.trackedAccounts()) {
        if ((this.nextCheck.get(account.puuid) ?? 0) > now) continue;
        const fast = this.#isLive(account) || (this.fastUntil.get(account.puuid) ?? 0) > now;
        this.nextCheck.set(account.puuid, now + (fast ? LIVE_POLL_MS : IDLE_POLL_MS));
        try {
          await this.checkAccount(account);
        } catch (e) {
          this.log.warn(`[tracker] ${account.name}#${account.tag}: ${e.message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  async checkAccount(account) {
    const matches = await this.henrik.getMatches(account.region, account.puuid, 3);
    if (!matches?.length) return;

    const fresh = newMatchesSince(matches, account.lastMatchId).filter(
      (m) => m.metadata?.is_completed !== false,
    );
    if (!fresh.length) return;

    for (const match of fresh) {
      const summary = summarizeMatch(match, account.puuid);
      if (!summary) continue;
      this.store.updateIdentity(account.puuid, summary.name, summary.tag);
      const rr = await this.#rrFor(account, summary);
      for (const guildId of account.guilds) {
        await this.#postResult(guildId, account.puuid, summary, rr);
      }
    }
    this.store.setLastMatch(account.puuid, fresh.at(-1).metadata.match_id);
  }

  async #rrFor(account, summary) {
    if (summary.queueId !== 'competitive') return null;
    try {
      const history = await this.henrik.getMmrHistory(account.region, account.puuid);
      const entry = history?.find((h) => h.match_id === summary.matchId);
      return entry ? { rank: entry.currenttierpatched, change: entry.mmr_change_to_last_game } : null;
    } catch {
      return null;
    }
  }

  async #postResult(guildId, puuid, summary, rr) {
    const g = this.store.guild(guildId);
    const player = g.players[puuid];
    if (!player || !g.channelId) return;
    const channel = await this.#channel(g.channelId);
    if (!channel) return;

    await channel.send({
      embeds: [matchEmbed(summary, { discordUserId: player.discordUserId, rr })],
      components: [matchButtons(summary)],
      allowedMentions: { parse: [] },
    });

    const session = player.discordUserId && this.sessions.get(`${guildId}:${player.discordUserId}`);
    if (session) {
      if (summary.result === 'win') session.wins++;
      else if (summary.result === 'loss') session.losses++;
      else if (summary.result === 'draw') session.draws++;
    }
  }

  // --- Statut Discord -------------------------------------------------------

  async onPresenceUpdate(oldPresence, newPresence) {
    const guildId = newPresence?.guild?.id;
    const userId = newPresence?.userId;
    if (!guildId || !userId) return;

    const players = this.store.playersForDiscordUser(guildId, userId);
    if (!players.length) return;

    const wasPlaying = isPlayingValorant(oldPresence);
    const isPlaying = isPlayingValorant(newPresence);
    if (wasPlaying === isPlaying) return;

    if (isPlaying) await this.#startSession(guildId, userId, players);
    else await this.#endSession(guildId, userId, players);
  }

  async #startSession(guildId, userId, players) {
    const key = `${guildId}:${userId}`;
    const previous = this.sessions.get(key);
    // Relance du jeu juste après l'avoir fermé : on reprend la même session.
    if (previous?.endedAt && Date.now() - previous.endedAt < LIVE_COOLDOWN_MS) {
      previous.endedAt = null;
      return;
    }

    const session = { messageId: null, channelId: null, wins: 0, losses: 0, draws: 0, endedAt: null };
    this.sessions.set(key, session);
    for (const p of players) this.schedule(p.puuid, LIVE_POLL_MS);

    const channel = await this.#channel(this.store.guild(guildId).channelId);
    if (!channel) return;
    const msg = await channel.send({ embeds: [liveEmbed(players, userId)], allowedMentions: { parse: [] } });
    session.messageId = msg.id;
    session.channelId = channel.id;
  }

  async #endSession(guildId, userId, players) {
    const key = `${guildId}:${userId}`;
    const session = this.sessions.get(key);
    if (!session) return;
    session.endedAt = Date.now();

    // Le dernier match met souvent 1-2 min à apparaître dans l'API : on reste en
    // polling rapide un moment, puis on clôture la session.
    for (const p of players) {
      this.fastUntil.set(p.puuid, Date.now() + AFTER_SESSION_MS);
      this.schedule(p.puuid, 30_000);
    }

    setTimeout(async () => {
      if (this.sessions.get(key) !== session || session.endedAt === null) return; // relancé entre-temps
      this.sessions.delete(key);
      const channel = session.channelId && (await this.#channel(session.channelId));
      const msg = channel && (await channel.messages.fetch(session.messageId).catch(() => null));
      if (msg) await msg.edit({ embeds: [sessionEndEmbed(players, userId, session)] }).catch(() => {});
    }, LIVE_COOLDOWN_MS);
  }

  #isLive(account) {
    if (!account.discordUserId) return false;
    return account.guilds.some((guildId) => {
      const s = this.sessions.get(`${guildId}:${account.discordUserId}`);
      return s && s.endedAt === null;
    });
  }

  async #channel(channelId) {
    if (!channelId) return null;
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    return channel?.isTextBased() ? channel : null;
  }
}
