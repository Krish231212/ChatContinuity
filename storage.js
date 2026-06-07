/**
 * MemoryForge - Storage Wrapper
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS, MEMORY_SCHEMA } from './constants.js';
import { logger } from './utils.js';

/**
 * Returns a scoped storage key for session-specific keys.
 */
function getScopedKey(baseKey, convoId) {
  if (convoId && convoId !== 'default') {
    return `${baseKey}_${convoId}`;
  }
  return baseKey;
}

/**
 * Gets settings from storage. If empty, returns default settings.
 */
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (result) => {
      const settings = result[STORAGE_KEYS.SETTINGS];
      if (!settings) {
        // Return default settings
        resolve({ ...DEFAULT_SETTINGS });
      } else {
        // Merge with defaults to ensure all keys exist
        resolve({ ...DEFAULT_SETTINGS, ...settings });
      }
    });
  });
}

/**
 * Saves settings to storage.
 */
export async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, () => {
      logger.info('Settings saved:', settings);
      resolve(true);
    });
  });
}

/**
 * Gets raw message session history.
 */
export async function getSessionHistory(convoId = 'default') {
  const key = getScopedKey(STORAGE_KEYS.SESSION_HISTORY, convoId);
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] || []);
    });
  });
}

/**
 * Saves raw message session history.
 */
export async function saveSessionHistory(messages, convoId = 'default') {
  const key = getScopedKey(STORAGE_KEYS.SESSION_HISTORY, convoId);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: messages }, () => {
      resolve(true);
    });
  });
}

/**
 * Gets structured project memory. If empty, returns schema structure.
 */
export async function getProjectMemory(convoId = 'default') {
  const key = getScopedKey(STORAGE_KEYS.PROJECT_MEMORY, convoId);
  logger.info(`getProjectMemory called: convoId="${convoId}", key="${key}"`);
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      const memory = result[key];
      logger.info(`getProjectMemory storage result: key="${key}", found=${!!memory}, messageCount=${memory?.conversationHealth?.messageCount}`);
      if (!memory) {
        // Return clean clone of schema
        resolve(JSON.parse(JSON.stringify(MEMORY_SCHEMA)));
      } else {
        resolve(memory);
      }
    });
  });
}

/**
 * Saves structured project memory.
 */
export async function saveProjectMemory(memory, convoId = 'default') {
  const key = getScopedKey(STORAGE_KEYS.PROJECT_MEMORY, convoId);
  logger.info(`saveProjectMemory called: convoId="${convoId}", key="${key}", messageCount=${memory?.conversationHealth?.messageCount}`);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: memory }, () => {
      logger.info(`saveProjectMemory storage set success: key="${key}"`);
      resolve(true);
    });
  });
}

/**
 * Gets the continuation redirect state.
 */
export async function getContinuationState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.CONTINUATION_STATE, (result) => {
      resolve(result[STORAGE_KEYS.CONTINUATION_STATE] || null);
    });
  });
}

/**
 * Saves the continuation redirect state.
 */
export async function saveContinuationState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.CONTINUATION_STATE]: state }, () => {
      resolve(true);
    });
  });
}

/**
 * Gets the message count at which the user was last prompted.
 */
export async function getLastPromptedCount(convoId = 'default') {
  const key = getScopedKey(STORAGE_KEYS.LAST_PROMPTED_COUNT, convoId);
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] || 0);
    });
  });
}

/**
 * Saves the message count at which the user was last prompted.
 */
export async function saveLastPromptedCount(count, convoId = 'default') {
  const key = getScopedKey(STORAGE_KEYS.LAST_PROMPTED_COUNT, convoId);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: count }, () => {
      resolve(true);
    });
  });
}

/**
 * Resets current session data (history, memory, prompt counts).
 */
export async function clearAllSessionData(convoId = 'default') {
  const historyKey = getScopedKey(STORAGE_KEYS.SESSION_HISTORY, convoId);
  const memoryKey = getScopedKey(STORAGE_KEYS.PROJECT_MEMORY, convoId);
  const lastPromptedKey = getScopedKey(STORAGE_KEYS.LAST_PROMPTED_COUNT, convoId);
  
  return new Promise((resolve) => {
    chrome.storage.local.remove([
      historyKey,
      memoryKey,
      lastPromptedKey
    ], () => {
      logger.info(`Session data cleared for conversation: ${convoId}`);
      resolve(true);
    });
  });
}

/**
 * Migrates old MemoryForge storage keys (prefixed with 'mf_') to ChatContinuity keys (prefixed with 'cc_').
 */
export async function migrateOldStorageKeys() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (allData) => {
      const keysToMigrate = Object.keys(allData).filter(key => key.startsWith('mf_'));
      if (keysToMigrate.length === 0) {
        resolve(false);
        return;
      }

      const newData = {};
      const keysToRemove = [];

      for (const oldKey of keysToMigrate) {
        const newKey = oldKey.replace(/^mf_/, 'cc_');
        newData[newKey] = allData[oldKey];
        keysToRemove.push(oldKey);
      }

      chrome.storage.local.set(newData, () => {
        chrome.storage.local.remove(keysToRemove, () => {
          logger.info(`Successfully migrated ${keysToRemove.length} storage keys from MemoryForge to ChatContinuity.`, keysToRemove);
          resolve(true);
        });
      });
    });
  });
}
