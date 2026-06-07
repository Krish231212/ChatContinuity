/**
 * ChatContinuity - Utilities
 */

const LOG_PREFIX = '[ChatContinuity]';

export const logger = {
  info: (...args) => console.log(LOG_PREFIX, '[INFO]', ...args),
  warn: (...args) => console.warn(LOG_PREFIX, '[WARN]', ...args),
  error: (...args) => console.error(LOG_PREFIX, '[ERROR]', ...args),
  debug: (...args) => {
    // Enabled by default for transparency during testing/use
    console.log(LOG_PREFIX, '[DEBUG]', ...args);
  }
};

/**
 * Estimates token count based on string content.
 * Standard heuristic: 1 token ≈ 4 characters or 0.75 words.
 * We'll use character length / 4 + words count / 0.75 combined, or a simpler (char length / 4) fallback.
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  // A safe approximation: 1 token per 4 characters.
  return Math.ceil(text.length / 4);
}

/**
 * Simple debouncing helper
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Promise-based delay helper
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry utility to execute a function until it succeeds or hits max retries
 */
export async function retryWithDelay(fn, retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      logger.warn(`Operation failed, retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
      await delay(delayMs);
    }
  }
}

/**
 * Safe query selector that catches exceptions and logs them
 */
export function safeQuery(selector, context = document) {
  try {
    return context.querySelector(selector);
  } catch (err) {
    logger.debug(`safeQuery failed for selector "${selector}":`, err.message);
    return null;
  }
}

/**
 * Safe query selector all
 */
export function safeQueryAll(selector, context = document) {
  try {
    return Array.from(context.querySelectorAll(selector));
  } catch (err) {
    logger.debug(`safeQueryAll failed for selector "${selector}":`, err.message);
    return [];
  }
}

/**
 * Extracts the unique conversation UUID from a ChatGPT or Claude URL.
 */
export function getConversationIdFromUrl(urlString) {
  if (!urlString) return 'default';
  try {
    const url = new URL(urlString);
    const pathname = url.pathname;

    // ChatGPT: matches /c/<uuid>
    const gptMatch = pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
    if (gptMatch && gptMatch[1]) return gptMatch[1];

    // Claude: matches /chat/<uuid>
    const claudeMatch = pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
    if (claudeMatch && claudeMatch[1]) return claudeMatch[1];
  } catch (_) {
    // Ignore
  }
  return 'default';
}
