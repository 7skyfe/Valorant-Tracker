import 'dotenv/config';
import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { HenrikClient } from './henrik.js';
import { Store } from './store.js';
import { Tracker } from './tracker.js';
import { definitions, handleCommand } from './commands.js';

const { DISCORD_TOKEN, HENRIK_API_KEY, DEV_GUILD_ID, HENRIK_RATE_LIMIT } = process.env;
if (!DISCORD_TOKEN || !HENRIK_API_KEY) {
  console.error('DISCORD_TOKEN et HENRIK_API_KEY sont requis (voir .env.example).');
  process.exit(1);
}

const client = new Client({
  // GuildPresences est un intent "privilégié" : à activer dans le Developer Portal.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences],
});

const store = new Store(new URL('../data/db.json', import.meta.url).pathname);
const henrik = new HenrikClient({ apiKey: HENRIK_API_KEY, requestsPerMinute: Number(HENRIK_RATE_LIMIT) || 30 });
const tracker = new Tracker({ client, store, henrik });

client.once(Events.ClientReady, async (c) => {
  if (DEV_GUILD_ID) await c.application.commands.set(definitions, DEV_GUILD_ID);
  else await c.application.commands.set(definitions);
  console.log(`Connecté en tant que ${c.user.tag} — ${store.trackedAccounts().length} compte(s) suivi(s).`);
  tracker.start();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction, { store, henrik, tracker });
  } catch (e) {
    console.error(e);
    const reply = { content: 'Une erreur est survenue.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
  tracker.onPresenceUpdate(oldPresence, newPresence).catch((e) => console.error('[presence]', e));
});

process.on('SIGINT', () => {
  tracker.stop();
  client.destroy();
  process.exit(0);
});

client.login(DISCORD_TOKEN);
