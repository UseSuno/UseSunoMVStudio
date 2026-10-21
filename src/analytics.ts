/**
 * Optional telemetry (Google Analytics 4 & Microsoft Clarity).
 * Fully controlled by environment variables.
 * In open-source and local builds, when no environment variables are provided,
 * zero tracking scripts are injected, zero network requests occur, and the module is completely inert.
 */

export interface AnalyticsConfig {
  gaId: string;
  clarityId: string;
}

const GA4_ID_REGEX = /^G-[A-Za-z0-9]+$/i;
const CLARITY_ID_REGEX = /^[a-zA-Z0-9]+$/;

export function getAnalyticsConfig(): AnalyticsConfig {
  let gaId = '';
  let clarityId = '';

  // 1. Check compile-time injected defines from vite.config.ts
  try {
    if (typeof __GA_MEASUREMENT_ID__ === 'string') {
      gaId = __GA_MEASUREMENT_ID__.trim();
    }
  } catch {
    // Variable may be undeclared in non-Vite contexts
  }

  try {
    if (typeof __CLARITY_PROJECT_ID__ === 'string') {
      clarityId = __CLARITY_PROJECT_ID__.trim();
    }
  } catch {
    // Variable may be undeclared in non-Vite contexts
  }

  // 2. Check Vite client environment variables as fallback
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const env = import.meta.env as Record<string, string | undefined>;
    if (!gaId) {
      gaId = (env.VITE_GA_MEASUREMENT_ID || env.GA_MEASUREMENT_ID || env.VITE_GA4_ID || env.GA_ID || '').trim();
    }
    if (!clarityId) {
      clarityId = (env.VITE_CLARITY_PROJECT_ID || env.CLARITY_PROJECT_ID || env.VITE_CLARITY_ID || env.CLARITY_ID || '').trim();
    }
  }

  return { gaId, clarityId };
}

/**
 * Initializes Google Analytics 4 if a valid measurement ID is provided.
 */
export function initGA4(measurementId: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const id = measurementId.trim();
  if (!GA4_ID_REGEX.test(id)) return false;

  // Prevent duplicate script injection
  if (document.querySelector('script[data-analytics="ga4"]')) return true;

  const win = window as unknown as {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };

  win.dataLayer = win.dataLayer || [];
  if (typeof win.gtag !== 'function') {
    win.gtag = function () {
      win.dataLayer?.push(arguments);
    };
  }

  win.gtag('js', new Date());
  win.gtag('config', id, {
    send_page_view: true,
    anonymize_ip: true,
  });

  const script = document.createElement('script');
  script.async = true;
  script.setAttribute('data-analytics', 'ga4');
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;

  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript && firstScript.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }

  return true;
}

/**
 * Initializes Microsoft Clarity if a valid project ID is provided.
 */
export function initClarity(projectId: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const id = projectId.trim();
  if (!CLARITY_ID_REGEX.test(id)) return false;

  // Prevent duplicate script injection
  if (document.querySelector('script[data-analytics="clarity"]')) return true;

  type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };
  const win = window as unknown as {
    clarity?: ClarityFn;
  };

  if (typeof win.clarity !== 'function') {
    const fn: ClarityFn = Object.assign(
      function () {
        (fn.q = fn.q || []).push(arguments);
      },
      { q: [] as unknown[] }
    );
    win.clarity = fn;
  }

  const script = document.createElement('script');
  script.async = true;
  script.setAttribute('data-analytics', 'clarity');
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;

  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript && firstScript.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }

  return true;
}

/**
 * Main analytics bootstrapper.
 * Inspects environment settings and loads configured telemetry providers.
 * If no provider is configured, this function performs no action.
 */
export function initAnalytics(configOverride?: AnalyticsConfig): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Do not track inside iframes (e.g. Folia visualizer)
  if (window.top !== window.self) return;

  const win = window as unknown as { __studioAnalyticsInitialized?: boolean };
  if (win.__studioAnalyticsInitialized) return;
  win.__studioAnalyticsInitialized = true;

  const { gaId, clarityId } = configOverride ?? getAnalyticsConfig();

  if (gaId) {
    initGA4(gaId);
  }

  if (clarityId) {
    initClarity(clarityId);
  }
}
