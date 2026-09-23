// Transforme un match HenrikDev v4 en résumé simple, centré sur un joueur.

export function summarizeMatch(match, puuid) {
  const meta = match.metadata;
  const players = match.players ?? [];
  const me = players.find((p) => p.puuid === puuid);
  if (!me) return null;

  const teams = match.teams ?? [];
  const roundsPlayed = teams.length
    ? (teams[0].rounds?.won ?? 0) + (teams[0].rounds?.lost ?? 0)
    : (match.rounds?.length ?? 0);

  let result = 'none';
  let score = null;
  let placement = null;

  const myTeam = teams.find((t) => t.team_id === me.team_id);
  if (myTeam && teams.length >= 2) {
    const other = teams.find((t) => t.team_id !== me.team_id);
    score = { us: myTeam.rounds?.won ?? 0, them: other?.rounds?.won ?? 0 };
    if (myTeam.won) result = 'win';
    else if (other?.won) result = 'loss';
    else result = 'draw';
  } else {
    // Deathmatch & co : pas d'équipes, on classe par kills.
    const ranking = [...players].sort((a, b) => (b.stats?.kills ?? 0) - (a.stats?.kills ?? 0));
    placement = ranking.findIndex((p) => p.puuid === puuid) + 1;
    result = placement === 1 ? 'win' : 'loss';
  }

  const s = me.stats ?? {};
  const shots = (s.headshots ?? 0) + (s.bodyshots ?? 0) + (s.legshots ?? 0);
  const rounds = Math.max(1, roundsPlayed);

  return {
    matchId: meta.match_id,
    completed: meta.is_completed !== false,
    startedAt: meta.started_at ? new Date(meta.started_at) : null,
    durationMs: meta.game_length_in_ms ?? null,
    map: meta.map?.name ?? 'Inconnue',
    mapId: meta.map?.id ?? null,
    mode: meta.queue?.name ?? meta.queue?.id ?? 'Partie',
    queueId: meta.queue?.id ?? null,
    region: meta.region ?? null,
    agent: me.agent?.name ?? 'Inconnu',
    agentId: me.agent?.id ?? null,
    rank: me.tier?.name ?? null,
    name: me.name,
    tag: me.tag,
    kills: s.kills ?? 0,
    deaths: s.deaths ?? 0,
    assists: s.assists ?? 0,
    acs: Math.round((s.score ?? 0) / rounds),
    adr: s.damage?.dealt != null ? Math.round(s.damage.dealt / rounds) : null,
    hsPercent: shots ? Math.round(((s.headshots ?? 0) / shots) * 100) : null,
    result,
    score,
    placement,
    playerCount: players.length,
  };
}

// Parmi les derniers matchs (du plus récent au plus ancien), retourne ceux joués
// après `lastMatchId`, dans l'ordre chronologique.
export function newMatchesSince(matches, lastMatchId, maxNew = 3) {
  const idx = matches.findIndex((m) => m.metadata?.match_id === lastMatchId);
  // Match de référence introuvable (trop ancien) : on ne poste que le plus récent
  // pour éviter de spammer le salon.
  const fresh = idx === -1 ? matches.slice(0, 1) : matches.slice(0, idx);
  return fresh.slice(0, maxNew).reverse();
}
