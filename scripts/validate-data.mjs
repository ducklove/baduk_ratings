import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataFile = path.join(rootDir, 'public', 'data', 'baduk-data.json');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const data = JSON.parse(await readFile(dataFile, 'utf8'));
const countries = new Set(data.players.map((player) => player.country));

assert(data.schemaVersion === 1, 'Unexpected schema version');
assert(data.players.length > 500, 'Expected at least 500 Korea/China/Japan/Taiwan players');
assert(countries.has('kr'), 'Missing Korea players');
assert(countries.has('cn'), 'Missing China players');
assert(countries.has('jp'), 'Missing Japan players');
assert(countries.has('tw'), 'Missing Taiwan players');
assert(data.players[0]?.rating > 3600, 'Top rating looks too low');
assert(Object.keys(data.playerDetails).length >= 50, 'Expected at least 50 enriched profiles');
assert(data.schedule.length >= 25, 'Expected current-month schedule events');
assert(data.news.length >= 5, 'Expected latest news items');
assert(data.sourceHub.length >= 5, 'Expected source hub links');

for (const player of data.players.slice(0, 25)) {
  assert(player.names.en, `Missing English name for ${player.id}`);
  assert(player.names.ko, `Missing Korean name for ${player.id}`);
  assert(player.names.ja, `Missing Japanese name for ${player.id}`);
  assert(player.names.zh, `Missing Chinese name for ${player.id}`);
}

console.log(
  `Data OK: ${data.players.length} players, ${Object.keys(data.playerDetails).length} profiles, ${data.schedule.length} schedule events, ${data.news.length} news items.`,
);
