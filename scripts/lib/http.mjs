import { USER_AGENT } from './config.mjs';

let fetchImplementation = (...args) => globalThis.fetch(...args);

export function setFetchImplementation(fn) {
  fetchImplementation = fn ?? ((...args) => globalThis.fetch(...args));
}

export async function fetchText(url, init = {}) {
  const response = await fetchImplementation(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/json,text/plain,*/*',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }

  const buffer = await response.arrayBuffer();
  return new TextDecoder('utf-8').decode(buffer);
}

export async function fetchJson(url, init = {}) {
  const text = await fetchText(url, init);
  return JSON.parse(text);
}

export async function fetchTextResponseWithTimeout(url, init = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(url, { ...init, signal: controller.signal });
    const bodyText = await response.text();
    return { response, bodyText };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function withConcurrency(items, limit, mapper) {
  const output = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;

      try {
        output[current] = await mapper(items[current], current);
      } catch (error) {
        console.warn(`Skipping item ${items[current]}: ${error.message}`);
        output[current] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return output;
}
