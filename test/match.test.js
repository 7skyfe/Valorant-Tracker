import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMatch, newMatchesSince } from '../src/match.js';
import { matchEmbed } from '../src/embeds.js';
import { definitions } from '../src/commands.js';
import { isPlayingValorant } from '../src/tracker.js';

const ME = 'puuid-skyfe';

function fakeMatch({ id = 'm1', won = true, teams = true } = {}) {
  return {
    metadata: {
      match_id: id,
      map: { id: '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319', name: 'Ascent' },
      queue: { id: 'competitive', name: 'Competitive' },
      started_at: '2026-09-20T20:00:00.000Z',
      game_length_in_ms: 2_100_000,
      is_completed: true,
      region: 'eu',
    },
    players: [
      {
        puuid: ME, name: 'skyfe', tag: 'マキマ', team_id: 'Red',
        agent: { id: 'add6443a-41bd-e414-f6ad-e58d267f4e95', name: 'Jett' },
        tier: { name: 'Gold 2' },
        stats: { score: 5_200, kills: 21, deaths: 14, assists: 5, headshots: 30, bodyshots: 60, legshots: 10, damage: { dealt: 3_400 } },
      },
      { puuid: 'other', name: 'x', tag: '1', team_id: 'Blue', agent: { name: 'Sage' }, stats: { kills: 10 } },
    ],
    teams: teams
      ? [
          { team_id: 'Red', won, rounds: { won: won ? 13 : 7, lost: won ? 7 : 13 } },
          { team_id: 'Blue', won: !won, rounds: { won: won ? 7 : 13, lost: won ? 13 : 7 } },
        ]
      : [],
    rounds: new Array(20).fill({}),
  };
}

test('victoire en compétitif', () => {
  const s = summarizeMatch(fakeMatch(), ME);
  assert.equal(s.result, 'win');
  assert.deepEqual(s.score, { us: 13, them: 7 });
  assert.equal(s.acs, 260);
  assert.equal(s.adr, 170);
  assert.equal(s.hsPercent, 30);
  assert.equal(s.agent, 'Jett');
});

test('défaite', () => {
  assert.equal(summarizeMatch(fakeMatch({ won: false }), ME).result, 'loss');
});

test('deathmatch sans équipes : classement aux kills', () => {
  const s = summarizeMatch(fakeMatch({ teams: false }), ME);
  assert.equal(s.placement, 1);
  assert.equal(s.result, 'win');
});

test('joueur absent du match', () => {
  assert.equal(summarizeMatch(fakeMatch(), 'inconnu'), null);
});

test('nouveaux matchs depuis le dernier connu, ordre chronologique', () => {
  const list = ['m4', 'm3', 'm2', 'm1'].map((id) => fakeMatch({ id }));
  assert.deepEqual(newMatchesSince(list, 'm2').map((m) => m.metadata.match_id), ['m3', 'm4']);
  assert.deepEqual(newMatchesSince(list, 'm4'), []);
  assert.deepEqual(newMatchesSince(list, 'zzz').map((m) => m.metadata.match_id), ['m4']);
  assert.deepEqual(newMatchesSince(list, null).map((m) => m.metadata.match_id), ['m4']);
});

test('embed et commandes se construisent', () => {
  const embed = matchEmbed(summarizeMatch(fakeMatch(), ME), { discordUserId: '123', rr: { rank: 'Gold 2', change: 18 } }).toJSON();
  assert.match(embed.title, /VICTOIRE/);
  assert.ok(embed.fields.some((f) => f.value.includes('+18 RR')));
  assert.deepEqual(definitions.map((d) => d.name), ['salon', 'track', 'derniere', 'classement']);
});

test('détection du statut "Joue à VALORANT"', () => {
  assert.equal(isPlayingValorant({ activities: [{ type: 0, name: 'VALORANT' }] }), true);
  assert.equal(isPlayingValorant({ activities: [{ type: 2, name: 'Spotify' }] }), false);
  assert.equal(isPlayingValorant(null), false);
});

test('liens tracker.gg', async () => {
  const { trackerMatchUrl, trackerProfileUrl, matchButtons } = await import('../src/embeds.js');
  const s = summarizeMatch(fakeMatch({ id: 'abc-123' }), ME);
  assert.equal(trackerMatchUrl('abc-123'), 'https://tracker.gg/valorant/match/abc-123');
  assert.equal(trackerProfileUrl('skyfe', 'マキマ'), 'https://tracker.gg/valorant/profile/riot/skyfe%23%E3%83%9E%E3%82%AD%E3%83%9E/overview');
  assert.equal(matchEmbed(s).toJSON().url, 'https://tracker.gg/valorant/match/abc-123');
  assert.equal(matchButtons(s).toJSON().components.length, 2);
});
