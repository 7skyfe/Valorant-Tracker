import { EmbedBuilder } from 'discord.js';

const COLORS = {
  win: 0x2ecc71,
  loss: 0xff4655, // rouge Valorant
  draw: 0x95a5a6,
  none: 0x95a5a6,
  live: 0xfee75c,
  info: 0x5865f2,
};

const RESULT_LABEL = {
  win: '🏆 VICTOIRE',
  loss: '💀 DÉFAITE',
  draw: '🤝 ÉGALITÉ',
  none: '🏁 TERMINÉ',
};

const agentIcon = (id) => id && `https://media.valorant-api.com/agents/${id}/displayicon.png`;
const mapBanner = (id) => id && `https://media.valorant-api.com/maps/${id}/listviewicon.png`;

export function matchEmbed(m, { discordUserId, rr } = {}) {
  const scoreLine = m.score
    ? `**${m.score.us} – ${m.score.them}**`
    : m.placement
      ? `**#${m.placement}** / ${m.playerCount}`
      : '';

  const kd = m.deaths ? (m.kills / m.deaths).toFixed(2) : m.kills.toFixed(2);

  const embed = new EmbedBuilder()
    .setColor(COLORS[m.result])
    .setAuthor({ name: `${m.name}#${m.tag}`, iconURL: agentIcon(m.agentId) ?? undefined })
    .setTitle(`${RESULT_LABEL[m.result]} · ${m.map}`)
    .setDescription(
      [
        `${scoreLine} en **${m.mode}** avec **${m.agent}**`,
        discordUserId ? `<@${discordUserId}>` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .addFields(
      { name: 'K / D / A', value: `${m.kills} / ${m.deaths} / ${m.assists}`, inline: true },
      { name: 'K/D', value: kd, inline: true },
      { name: 'ACS', value: String(m.acs), inline: true },
    )
    .setFooter({ text: `Match ${m.matchId.slice(0, 8)}` });

  if (m.adr != null) embed.addFields({ name: 'ADR', value: String(m.adr), inline: true });
  if (m.hsPercent != null) embed.addFields({ name: 'HS %', value: `${m.hsPercent}%`, inline: true });
  if (rr) {
    const sign = rr.change > 0 ? '+' : '';
    embed.addFields({ name: 'Rang', value: `${rr.rank} (${sign}${rr.change} RR)`, inline: true });
  } else if (m.rank && m.rank !== 'Unrated') {
    embed.addFields({ name: 'Rang', value: m.rank, inline: true });
  }

  const thumb = agentIcon(m.agentId);
  if (thumb) embed.setThumbnail(thumb);
  const banner = mapBanner(m.mapId);
  if (banner) embed.setImage(banner);
  if (m.startedAt) embed.setTimestamp(m.startedAt);
  return embed;
}

export function liveEmbed(players, discordUserId) {
  const names = players.map((p) => `**${p.name}#${p.tag}**`).join(', ');
  return new EmbedBuilder()
    .setColor(COLORS.live)
    .setTitle('🔴 EN JEU')
    .setDescription(`<@${discordUserId}> (${names}) vient de lancer **VALORANT**.\nLes résultats arrivent ici à chaque fin de partie.`)
    .setTimestamp(new Date());
}

export function sessionEndEmbed(players, discordUserId, session) {
  const names = players.map((p) => `**${p.name}#${p.tag}**`).join(', ');
  const played = session.wins + session.losses + session.draws;
  const summary = played
    ? `${played} partie${played > 1 ? 's' : ''} · **${session.wins}V** / **${session.losses}D**${session.draws ? ` / ${session.draws}N` : ''}`
    : 'Aucune partie terminée détectée.';
  return new EmbedBuilder()
    .setColor(played && session.wins > session.losses ? COLORS.win : played ? COLORS.loss : COLORS.none)
    .setTitle('⚫ Session terminée')
    .setDescription(`<@${discordUserId}> (${names}) a quitté VALORANT.\n${summary}`)
    .setTimestamp(new Date());
}

export function infoEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.info).setTitle(title).setDescription(description);
}
