// Client minimal pour l'API non officielle HenrikDev (https://docs.henrikdev.xyz).
// Riot ne donne pas accès à l'API match Valorant aux projets perso : HenrikDev est
// la source utilisée par la plupart des bots communautaires.

const BASE_URL = 'https://api.henrikdev.xyz';

export class HenrikError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class HenrikClient {
  constructor({ apiKey, requestsPerMinute = 30 }) {
    this.apiKey = apiKey;
    // Petite marge sous la limite pour ne jamais prendre de 429.
    this.minSpacingMs = Math.ceil(60_000 / Math.max(1, requestsPerMinute - 2));
    this.queue = Promise.resolve();
    this.lastRequestAt = 0;
  }

  // Sérialise les requêtes et les espace pour respecter la limite de la clé.
  request(path) {
    const run = this.queue.then(() => this.#send(path));
    this.queue = run.catch(() => {});
    return run;
  }

  async #send(path, attempt = 0) {
    const wait = this.lastRequestAt + this.minSpacingMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();

    const res = await fetch(BASE_URL + path, {
      headers: { Authorization: this.apiKey, Accept: 'application/json' },
    });

    if (res.status === 429 && attempt < 2) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) || 30;
      await sleep(reset * 1000);
      return this.#send(path, attempt + 1);
    }

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body?.errors?.[0]?.message ?? res.statusText;
      throw new HenrikError(res.status, `HenrikDev ${res.status}: ${detail}`);
    }
    return body.data;
  }

  getAccount(name, tag) {
    return this.request(`/valorant/v2/account/${enc(name)}/${enc(tag)}`);
  }

  getMatches(region, puuid, size = 3) {
    return this.request(`/valorant/v4/by-puuid/matches/${enc(region)}/pc/${enc(puuid)}?size=${size}`);
  }

  getMmrHistory(region, puuid) {
    return this.request(`/valorant/v1/by-puuid/mmr-history/${enc(region)}/${enc(puuid)}`);
  }
}

const enc = encodeURIComponent;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
