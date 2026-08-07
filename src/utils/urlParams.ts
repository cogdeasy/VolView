import { UrlParams } from '@vueuse/core';
import vtkURLExtract from '@kitware/vtk.js/Common/Core/URLExtract';
import { logError } from '@/src/utils/loggers';

// This module owns the tab's launch params (`urls=`, `names=`, `config=`,
// `save=`): both READING them at boot (readLaunchParams) and REWRITING them
// after a remote save (repointLaunchUrls). Keeping both sides here means the
// stale-`names=` interaction below stays next to the parsing it protects.

const { VITE_DEFAULT_URLS, VITE_DEFAULT_NAMES } = import.meta.env;

type ParsedUrlParams = {
  urls?: string[];
  names?: string[];
  config?: string[];
  save?: string | string[];
};

const isValidUrl = (str: string) => {
  try {
    return !!new URL(str.trim(), window.location.href);
  } catch {
    return false;
  }
};

const splitAndClean = (str: string) =>
  str
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

const parseUrlArray = (value: string | string[]): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((v) => parseUrlArray(v));
  }

  // A valueless `?urls` extracts as boolean `true`, which names nothing: yield
  // no URLs rather than throwing and taking `save=`/`config=` down with it.
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();

  if (!trimmed) return [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return splitAndClean(trimmed.slice(1, -1));
  }

  return [trimmed];
};

export const normalizeUrlParams = (rawParams: UrlParams): ParsedUrlParams => {
  const normalized: ParsedUrlParams = {};

  if (rawParams.urls) {
    const urls = parseUrlArray(rawParams.urls);
    const validUrls = urls.filter((url) => {
      const isValid = isValidUrl(url);
      if (!isValid) {
        logError(new Error(`Invalid URL in urls parameter: ${url}`));
      }
      return isValid;
    });

    if (validUrls.length > 0) {
      normalized.urls = validUrls;
    }
  }

  if (rawParams.names) {
    normalized.names = parseUrlArray(rawParams.names);
  }

  if (rawParams.config) {
    const configs = parseUrlArray(rawParams.config);
    const validConfigs = configs.filter((url) => {
      const isValid = isValidUrl(url);
      if (!isValid) {
        logError(new Error(`Invalid URL in config parameter: ${url}`));
      }
      return isValid;
    });

    if (validConfigs.length > 0) {
      normalized.config = validConfigs;
    }
  }

  if (rawParams.save) {
    normalized.save = rawParams.save;
  }

  return normalized;
};

// A deployment (a kiosk or demo build) can name a dataset to open when the tab
// carries no `urls=` of its own, via VITE_DEFAULT_URLS. The test is on the raw
// params, not the parsed ones: a tab whose `urls=` were all rejected still
// asked for specific data, and must show nothing rather than silently open a
// different study. For the same reason the default is all-or-nothing — a
// launch-time `names=` labels the `urls=` it arrived with, not this dataset.
export const withDefaultUrls = (
  rawParams: UrlParams,
  params: ParsedUrlParams,
  defaults: { urls?: string; names?: string }
): ParsedUrlParams => {
  // Presence, not truthiness: `?urls=` extracts as '' and a bare `?urls` as
  // `true`, and both still name the tab's intent.
  if ('urls' in rawParams || !defaults.urls) return params;

  const fallback = normalizeUrlParams({
    urls: defaults.urls,
    ...(defaults.names ? { names: defaults.names } : {}),
  });

  if (!fallback.urls) return params;

  const launch = { ...params };

  if (launch.names) {
    logError(
      new Error(
        `Ignoring names=${launch.names.join(',')}: it labels a urls= the tab did not supply, and the deployment default is opening instead`
      )
    );
    delete launch.names;
  }

  return { ...launch, ...fallback };
};

// The current tab's launch params. Unparseable params degrade to an empty
// launch (logged), never a failed boot.
export const readLaunchParams = (): ParsedUrlParams => {
  try {
    const rawParams = vtkURLExtract.extractURLParameters() as UrlParams;
    return withDefaultUrls(rawParams, normalizeUrlParams(rawParams), {
      urls: VITE_DEFAULT_URLS,
      names: VITE_DEFAULT_NAMES,
    });
  } catch (error) {
    logError(new Error(`Failed to parse URL parameters: ${error}`));
    return {};
  }
};

// On a successful remote save the backend returns `resumeUrl` — the saved
// session's load URL. Repoint ONLY the tab's `urls=` at it (so a future F5
// reloads the just-made save instead of the fresh launch manifest), via
// `history.replaceState` (no reload). `save=` and `config=` are untouched:
// every save keeps going to the launch-provided target.
export const repointLaunchUrls = (resumeUrl: string) => {
  const url = new URL(window.location.toString());
  url.searchParams.set('urls', resumeUrl);
  // A stale names= would rename the session zip after the original data file,
  // and filename-extension typing would then misparse the zip on reload.
  url.searchParams.delete('names');
  window.history.replaceState(null, '', url.toString());
};
