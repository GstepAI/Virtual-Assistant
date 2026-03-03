import { useState, useEffect } from 'react';

export interface RuntimeConfig {
  qnaEnabled: boolean;
  bugReportEnabled: boolean;
  adminEnabled: boolean;
  bugReportEndpoint: string;
  sessionDataEndpoint: string;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  qnaEnabled: true,
  bugReportEnabled: true,
  adminEnabled: true,
  bugReportEndpoint: '',
  sessionDataEndpoint: '',
};

// Module-level cache: only one fetch across the entire app lifetime
let cachedConfig: RuntimeConfig | null = null;

/** Synchronous read of the cache. Returns null if getRuntimeConfig() hasn't resolved yet. */
export function getCachedConfig(): RuntimeConfig | null {
  return cachedConfig;
}
let fetchPromise: Promise<RuntimeConfig> | null = null;

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig;

  if (!fetchPromise) {
    fetchPromise = fetch('/api/getConfig')
      .then((res) => {
        if (!res.ok) throw new Error(`/api/getConfig responded ${res.status}`);
        return res.json() as Promise<RuntimeConfig>;
      })
      .then((data) => {
        cachedConfig = data;
        return data;
      })
      .catch(() => {
        // On error keep defaults; allow a retry next call
        fetchPromise = null;
        return DEFAULT_CONFIG;
      });
  }

  return fetchPromise;
}

export function useRuntimeConfig(): RuntimeConfig {
  const [config, setConfig] = useState<RuntimeConfig>(cachedConfig ?? DEFAULT_CONFIG);

  useEffect(() => {
    let cancelled = false;
    getRuntimeConfig().then((data) => {
      if (!cancelled) setConfig(data);
    });
    return () => { cancelled = true; };
  }, []);

  return config;
}
