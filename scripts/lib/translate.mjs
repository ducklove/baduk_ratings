import {
  readNonNegativeIntEnv,
  readPositiveIntEnv,
  sourceUrls,
} from './config.mjs';
import { sourceStatus } from './comparisons.mjs';
import { fetchTextResponseWithTimeout } from './http.mjs';
import { chunk, cleanText } from './text.mjs';

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || 'qwen/qwen3.7-plus';
const OPENROUTER_TRANSLATION_BATCH_SIZE = readPositiveIntEnv('OPENROUTER_TRANSLATION_BATCH_SIZE', 4);
const OPENROUTER_TRANSLATION_TIMEOUT_MS = readPositiveIntEnv('OPENROUTER_TRANSLATION_TIMEOUT_MS', 45000);
const OPENROUTER_NEWS_TRANSLATION_LIMIT = readPositiveIntEnv('OPENROUTER_NEWS_TRANSLATION_LIMIT', 36);
const OPENROUTER_SCHEDULE_TRANSLATION_LIMIT = readNonNegativeIntEnv('OPENROUTER_SCHEDULE_TRANSLATION_LIMIT', 48);
// Hard wall-clock budget for the whole translation stage so a slow model can
// never push generate:data past the CI step timeout; remaining batches are
// skipped and the snapshot ships with partial localization.
const OPENROUTER_TRANSLATION_BUDGET_MS = readPositiveIntEnv('OPENROUTER_TRANSLATION_BUDGET_MS', 480000);

function openRouterApiKey() {
  return process.env.OPENROUTER_API_KEY?.trim();
}

export function parseJsonFromModelText(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error('empty model response');
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? text;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('model response was not JSON');
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export function normalizeLocalizedText(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  const clean = (text) => cleanText(String(text ?? ''));
  return {
    en: clean(source.en) || fallback,
    ko: clean(source.ko) || fallback,
    ja: clean(source.ja) || fallback,
    zhHans: clean(source.zhHans) || clean(source.zh) || fallback,
    zhHant: clean(source.zhHant) || clean(source.zh) || fallback,
  };
}

export function reusePreviousTranslations(schedule, news, previousSnapshot) {
  const previousSchedule = new Map(
    (Array.isArray(previousSnapshot?.schedule) ? previousSnapshot.schedule : []).map((event) => [event.id, event]),
  );
  const previousNews = new Map(
    (Array.isArray(previousSnapshot?.news) ? previousSnapshot.news : []).map((item) => [item.id, item]),
  );
  let reused = 0;

  const reusedSchedule = schedule.map((event) => {
    if (event.localized_title) {
      return event;
    }
    const previous = previousSchedule.get(event.id);
    if (
      !previous?.localized_title ||
      previous.title !== event.title ||
      (previous.tournament ?? '') !== (event.tournament ?? '')
    ) {
      return event;
    }
    reused += 1;
    return {
      ...event,
      localized_title: previous.localized_title,
      ...(event.tournament && previous.localized_tournament
        ? { localized_tournament: previous.localized_tournament }
        : {}),
    };
  });

  const reusedNews = news.map((item) => {
    if (item.localized_title) {
      return item;
    }
    const previous = previousNews.get(item.id);
    if (
      !previous?.localized_title ||
      previous.title !== item.title ||
      (previous.summary ?? '') !== (item.summary ?? '')
    ) {
      return item;
    }
    reused += 1;
    return {
      ...item,
      localized_title: previous.localized_title,
      ...(previous.localized_summary ? { localized_summary: previous.localized_summary } : {}),
    };
  });

  return { schedule: reusedSchedule, news: reusedNews, reused };
}

export function buildTranslationItems(schedule, news, snapshotDate) {
  const newsItems = news
    .slice(0, OPENROUTER_NEWS_TRANSLATION_LIMIT)
    .filter((item) => !item.localized_title);
  const scheduleItems = schedule
    .filter((event) => event.date >= snapshotDate || (event.dateEnd ?? '') >= snapshotDate)
    .slice(0, OPENROUTER_SCHEDULE_TRANSLATION_LIMIT)
    .filter((event) => !event.localized_title);

  return [
    ...newsItems.map((item) => ({
      id: `news:${item.id}`,
      type: 'news',
      title: item.title,
      summary: item.summary,
      source_region: item.region,
      source_name: item.source,
    })),
    ...scheduleItems.map((event) => ({
      id: `schedule:${event.id}`,
      type: 'schedule',
      title: event.title,
      tournament: event.tournament ?? '',
      source_region: event.region,
      source_name: event.source_name ?? event.source,
    })),
  ].filter((item) => item.title);
}

async function translateBatchWithOpenRouter(items) {
  const { response, bodyText } = await fetchTextResponseWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouterApiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ducklove.github.io/baduk_ratings/',
      'X-Title': 'Baduk-R static data translation',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You translate professional baduk/go schedule and news metadata. Return strict JSON only. Preserve player names, tournament names, ranks, dates, times, source names, and factual meaning. Do not invent missing information.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            target_languages: {
              en: 'English',
              ko: 'Korean',
              ja: 'Japanese',
              zhHans: 'Simplified Chinese',
              zhHant: 'Traditional Chinese',
            },
            output_schema:
              'Return {"items":[{"id":"same id","title":{"en":"","ko":"","ja":"","zhHans":"","zhHant":""},"tournament":{"en":"","ko":"","ja":"","zhHans":"","zhHant":""},"summary":{"en":"","ko":"","ja":"","zhHans":"","zhHant":""}}]}. Omit tournament or summary only if the input field is empty.',
            items,
          }),
        },
      ],
    }),
  }, OPENROUTER_TRANSLATION_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with HTTP ${response.status}`);
  }

  const payload = JSON.parse(bodyText);
  const content = payload?.choices?.[0]?.message?.content;
  const parsed = parseJsonFromModelText(content);
  if (!Array.isArray(parsed.items)) {
    throw new Error('OpenRouter response missing items array');
  }

  return parsed.items;
}

export async function translatePublicContent(schedule, news, generatedAt, previousSnapshot = null) {
  const reuseResult = reusePreviousTranslations(schedule, news, previousSnapshot);
  schedule = reuseResult.schedule;
  news = reuseResult.news;
  const reusedNote = `${reuseResult.reused} translated item(s) reused from previous snapshot.`;

  if (!openRouterApiKey()) {
    return {
      schedule,
      news,
      status: sourceStatus({
        source_id: 'openrouter_translation',
        source_name: 'OpenRouter',
        country_or_region: 'global',
        data_type: 'translation',
        status: reuseResult.reused ? 'available' : 'unavailable',
        terms_status: 'unknown',
        source_url: sourceUrls.openRouter,
        fetched_at: generatedAt,
        confidence: reuseResult.reused ? 0.6 : 0,
        item_count: reuseResult.reused,
        notes: `OPENROUTER_API_KEY is not set. ${reusedNote} Runtime UI uses original source text otherwise.`,
      }),
    };
  }

  const snapshotDate = generatedAt.slice(0, 10);
  const items = buildTranslationItems(schedule, news, snapshotDate);
  const translations = new Map();
  let failedBatch = null;
  let failedBatches = 0;
  let budgetExhausted = false;
  const startedAt = Date.now();

  try {
    for (const batch of chunk(items, OPENROUTER_TRANSLATION_BATCH_SIZE)) {
      if (Date.now() - startedAt > OPENROUTER_TRANSLATION_BUDGET_MS) {
        budgetExhausted = true;
        console.warn(
          `OpenRouter translation budget of ${OPENROUTER_TRANSLATION_BUDGET_MS}ms exhausted; remaining batches skipped.`,
        );
        break;
      }
      if (failedBatches >= 3 && translations.size === 0) {
        console.warn('OpenRouter translation aborted: first three batches all failed.');
        break;
      }
      try {
        const translatedItems = await translateBatchWithOpenRouter(batch);
        for (const item of translatedItems) {
          if (item?.id) {
            translations.set(item.id, item);
          }
        }
      } catch (error) {
        failedBatch = error;
        failedBatches += 1;
        console.warn(`OpenRouter translation batch skipped: ${error.message}`);
      }
    }

    return {
      schedule: schedule.map((event) => {
        const item = translations.get(`schedule:${event.id}`);
        if (!item) {
          return event;
        }

        return {
          ...event,
          localized_title: normalizeLocalizedText(item.title, event.title),
          ...(event.tournament
            ? { localized_tournament: normalizeLocalizedText(item.tournament, event.tournament) }
            : {}),
        };
      }),
      news: news.map((item) => {
        const translation = translations.get(`news:${item.id}`);
        if (!translation) {
          return item;
        }

        return {
          ...item,
          localized_title: normalizeLocalizedText(translation.title, item.title),
          localized_summary: normalizeLocalizedText(translation.summary, item.summary),
        };
      }),
      status: sourceStatus({
        source_id: 'openrouter_translation',
        source_name: 'OpenRouter',
        country_or_region: 'global',
        data_type: 'translation',
        status: translations.size || reuseResult.reused ? 'available' : failedBatch ? 'parse_failed' : 'available_empty',
        terms_status: 'unknown',
        source_url: sourceUrls.openRouter,
        fetched_at: generatedAt,
        confidence: translations.size || reuseResult.reused ? 0.72 : 0.2,
        item_count: translations.size + reuseResult.reused,
        notes: failedBatch
          ? `Partial build-time schedule/news localization via ${OPENROUTER_MODEL}. ${reusedNote} ${failedBatches} batch(es) failed (last: ${failedBatch.message}). The frontend never calls OpenRouter.`
          : budgetExhausted
            ? `Partial build-time schedule/news localization via ${OPENROUTER_MODEL}. ${reusedNote} Time budget exhausted; remaining items keep source text. The frontend never calls OpenRouter.`
            : `Build-time schedule/news localization via ${OPENROUTER_MODEL}. ${reusedNote} The frontend never calls OpenRouter.`,
      }),
    };
  } catch (error) {
    console.warn(`OpenRouter translation skipped: ${error.message}`);
    return {
      schedule,
      news,
      status: sourceStatus({
        source_id: 'openrouter_translation',
        source_name: 'OpenRouter',
        country_or_region: 'global',
        data_type: 'translation',
        status: 'parse_failed',
        terms_status: 'unknown',
        source_url: sourceUrls.openRouter,
        fetched_at: generatedAt,
        confidence: 0,
        item_count: reuseResult.reused,
        notes: `Build-time translation failed. ${reusedNote} Runtime UI uses original source text otherwise. Model: ${OPENROUTER_MODEL}.`,
      }),
    };
  }
}
