export function stripTags(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*><\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .trim();
}

export function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

export function cleanText(value) {
  return decodeHtml(stripTags(value))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.)])/g, '$1')
    .trim();
}

export function normalizeDate(value) {
  const text = String(value ?? '').trim();
  const eastAsianMatch = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (eastAsianMatch) {
    return toIsoDate(Number(eastAsianMatch[1]), Number(eastAsianMatch[2]), Number(eastAsianMatch[3]));
  }

  const slashMatch = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (slashMatch) {
    return toIsoDate(Number(slashMatch[1]), Number(slashMatch[2]), Number(slashMatch[3]));
  }

  const [year, month, day] = text.split('-').map((part) => Number(part));
  if (!year || !month || !day) {
    return text;
  }
  return toIsoDate(year, month, day);
}

export function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function kstDateString(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function weekdayFromDate(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(`${date}T00:00:00+09:00`));
}

export function dateMinusDays(date, days) {
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setDate(value.getDate() - days);
  return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

export function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\((남|여|male|female)\)/gi, '')
    .replace(/[△▲]/g, '')
    .replace(/\b(9p|8p|7p|6p|5p|4p|3p|2p|1p)\b/gi, '')
    .replace(/(九段|八段|七段|六段|五段|四段|三段|二段|初段|단|段|名誉.*|女流.*|本因坊|棋聖|名人|王座|天元|十段|碁聖|扇興杯|快棋王|龍星)$/u, '')
    .replace(/[\s.,·・'"’()（）[\]{}_\-\\/]/g, '')
    .trim();
}

export function buildPlayerNameIndex(players) {
  const index = new Map();

  for (const player of players) {
    for (const name of [player.name, player.names.en, player.names.ko, player.names.ja, player.names.zh]) {
      const normalized = normalizeName(name);
      if (normalized.length >= 2 && !index.has(normalized)) {
        index.set(normalized, player);
      }
    }
  }

  return index;
}

export function matchPlayerByName(name, index) {
  const normalized = normalizeName(name);
  if (!normalized) {
    return null;
  }

  return index.get(normalized) ?? null;
}

export function findPlayersInText(text, players) {
  const matches = new Map();
  const normalizedText = normalizeName(text);

  for (const player of players) {
    const names = [player.names.ko, player.names.ja, player.names.zh, player.names.en, player.name]
      .map((name) => normalizeName(name))
      .filter((name) => name.length >= 2);

    if (names.some((name) => normalizedText.includes(name))) {
      matches.set(player.id, player);
    }
  }

  return [...matches.values()];
}
