import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { HenrikError } from './henrik.js';
import { summarizeMatch } from './match.js';
import { matchEmbed, matchButtons, infoEmbed, trackerProfileUrl } from './embeds.js';

const REGIONS = [
  { name: 'Europe (EUW / EUNE)', value: 'eu' },
  { name: 'Amérique du Nord', value: 'na' },
  { name: 'Asie-Pacifique (Japon inclus)', value: 'ap' },
  { name: 'Corée', value: 'kr' },
  { name: 'Amérique latine', value: 'latam' },
  { name: 'Brésil', value: 'br' },
];

const riotIdOptions = (b) =>
  b
    .addStringOption((o) => o.setName('pseudo').setDescription('Pseudo Riot (avant le #)').setRequired(true))
    .addStringOption((o) => o.setName('tag').setDescription('Tag Riot (après le #)').setRequired(true));

export const definitions = [
  new SlashCommandBuilder()
    .setName('salon')
    .setDescription('Choisir le salon où le bot annonce les parties')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addChannelOption((o) =>
      o
        .setName('salon')
        .setDescription('Salon des annonces')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName('track')
    .setDescription('Gérer les joueurs suivis')
    .setDMPermission(false)
    .addSubcommand((s) =>
      riotIdOptions(s.setName('ajouter').setDescription('Suivre un compte Valorant'))
        .addStringOption((o) =>
          o.setName('region').setDescription('Région du compte (détectée automatiquement sinon)').addChoices(...REGIONS),
        )
        .addUserOption((o) =>
          o.setName('membre').setDescription('Membre Discord lié au compte (toi par défaut)'),
        ),
    )
    .addSubcommand((s) => riotIdOptions(s.setName('retirer').setDescription('Arrêter de suivre un compte')))
    .addSubcommand((s) => s.setName('liste').setDescription('Voir les comptes suivis sur ce serveur')),

  new SlashCommandBuilder()
    .setName('derniere')
    .setDescription('Afficher la dernière partie d’un joueur')
    .setDMPermission(false)
    .addStringOption((o) => o.setName('pseudo').setDescription('Pseudo Riot (avant le #)').setRequired(true))
    .addStringOption((o) => o.setName('tag').setDescription('Tag Riot (après le #)').setRequired(true))
    .addStringOption((o) =>
      o.setName('region').setDescription('Région du compte (détectée automatiquement sinon)').addChoices(...REGIONS),
    ),
].map((c) => c.toJSON());

// "skyfe#マキマ" collé dans le champ pseudo, ou "#マキマ" dans le champ tag : on tolère.
function readRiotId(interaction) {
  let name = interaction.options.getString('pseudo').trim();
  let tag = interaction.options.getString('tag').trim().replace(/^#/, '');
  if (name.includes('#')) [name] = name.split('#');
  return { name: name.trim(), tag: tag.trim() };
}

function explain(e) {
  if (e instanceof HenrikError) {
    if (e.status === 404) return 'Compte introuvable. Vérifie le pseudo, le tag et la région.';
    if (e.status === 401 || e.status === 403) return 'Clé API HenrikDev invalide ou manquante (voir le README).';
    if (e.status === 429) return 'Trop de requêtes, réessaie dans une minute.';
  }
  return `Erreur : ${e.message}`;
}

export async function handleCommand(interaction, { store, henrik, tracker }) {
  const guildId = interaction.guildId;

  if (interaction.commandName === 'salon') {
    const channel = interaction.options.getChannel('salon');
    const me = interaction.guild.members.me;
    if (!channel.permissionsFor(me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return interaction.reply({
        content: `Je n’ai pas la permission d’écrire dans ${channel} (il me faut : voir, envoyer, intégrer des liens).`,
        flags: MessageFlags.Ephemeral,
      });
    }
    store.setChannel(guildId, channel.id);
    return interaction.reply({ content: `✅ Les parties seront annoncées dans ${channel}.` });
  }

  if (interaction.commandName === 'derniere') {
    const { name, tag } = readRiotId(interaction);
    await interaction.deferReply();
    try {
      const account = await henrik.getAccount(name, tag);
      const region = interaction.options.getString('region') ?? account.region;
      const [match] = (await henrik.getMatches(region, account.puuid, 1)) ?? [];
      const summary = match && summarizeMatch(match, account.puuid);
      if (!summary) return interaction.editReply('Aucune partie récente trouvée pour ce compte.');
      return interaction.editReply({ embeds: [matchEmbed(summary)], components: [matchButtons(summary)] });
    } catch (e) {
      return interaction.editReply(explain(e));
    }
  }

  if (interaction.commandName !== 'track') return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'liste') {
    const g = store.guild(guildId);
    const players = Object.values(g.players);
    const lines = players.map(
      (p) => `• [**${p.name}#${p.tag}**](${trackerProfileUrl(p.name, p.tag)}) (${p.region.toUpperCase()})${p.discordUserId ? ` — <@${p.discordUserId}>` : ''}`,
    );
    const channelLine = g.channelId ? `Salon des annonces : <#${g.channelId}>` : '⚠️ Aucun salon configuré : utilise `/salon`.';
    return interaction.reply({
      embeds: [infoEmbed(`Joueurs suivis (${players.length})`, [channelLine, '', ...(lines.length ? lines : ['Personne pour l’instant. Utilise `/track ajouter`.'])].join('\n'))],
      allowedMentions: { parse: [] },
    });
  }

  if (sub === 'retirer') {
    const { name, tag } = readRiotId(interaction);
    const player = store.findPlayer(guildId, name, tag);
    if (!player) {
      return interaction.reply({ content: `**${name}#${tag}** n’est pas suivi ici.`, flags: MessageFlags.Ephemeral });
    }
    const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (player.discordUserId !== interaction.user.id && player.addedBy !== interaction.user.id && !canManage) {
      return interaction.reply({
        content: 'Seul le joueur lié, la personne qui l’a ajouté ou un gestionnaire du serveur peut le retirer.',
        flags: MessageFlags.Ephemeral,
      });
    }
    store.removePlayer(guildId, player.puuid);
    return interaction.reply(`🗑️ **${player.name}#${player.tag}** n’est plus suivi.`);
  }

  if (sub === 'ajouter') {
    const { name, tag } = readRiotId(interaction);
    const member = interaction.options.getUser('membre') ?? interaction.user;
    await interaction.deferReply();
    try {
      const account = await henrik.getAccount(name, tag);
      const region = interaction.options.getString('region') ?? account.region;
      // On mémorise la dernière partie actuelle pour n'annoncer que les suivantes.
      const matches = await henrik.getMatches(region, account.puuid, 1).catch(() => []);
      store.addPlayer(guildId, {
        puuid: account.puuid,
        name: account.name,
        tag: account.tag,
        region,
        discordUserId: member.bot ? null : member.id,
        addedBy: interaction.user.id,
        lastMatchId: matches?.[0]?.metadata?.match_id ?? null,
      });
      tracker.schedule(account.puuid, 60_000);

      const warn = store.guild(guildId).channelId ? '' : '\n⚠️ Pense à configurer le salon des annonces avec `/salon`.';
      return interaction.editReply({
        content: `✅ **${account.name}#${account.tag}** (${region.toUpperCase()}, niveau ${account.account_level ?? '?'}) est maintenant suivi, lié à ${member}.${warn}`,
        allowedMentions: { parse: [] },
      });
    } catch (e) {
      return interaction.editReply(explain(e));
    }
  }
}
