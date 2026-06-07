/**
 * ChatContinuity - Background Service Worker
 * Coordinates background updates and browser tab events
 */

import { updateMemoryIncrementally } from './summarizer.js';
import { migrateOldStorageKeys } from './storage.js';
import { callOpenAI } from './openai.js';
import { logger } from './utils.js';

// Run storage migration on startup
migrateOldStorageKeys().then((migrated) => {
  if (migrated) {
    logger.info('Completed migration of old MemoryForge storage keys to ChatContinuity.');
  }
});

// Monitor installation
chrome.runtime.onInstalled.addListener(() => {
  logger.info('ChatContinuity Extension installed successfully.');
});

// Handle incoming runtime requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logger.debug('Received message in background:', request);

  if (request.action === 'OPEN_FRESH_CHAT') {
    // Open a fresh chat in a new tab and focus it
    chrome.tabs.create({
      url: request.url,
      active: true
    }, (tab) => {
      logger.info('Opened fresh chat tab:', tab.id);
    });
    sendResponse({ success: true });
    return true; // Keep channel open
  }

  if (request.action === 'SYNC_MEMORY') {
    // Async execution of project memory update
    (async () => {
      try {
        const updatedMemory = await updateMemoryIncrementally(request.messages, request.threshold, request.convoId);
        sendResponse({ success: true, memory: updatedMemory });
      } catch (err) {
        logger.error('Background memory sync failed:', err.message);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keeps the sendResponse channel open for async execution
  }

  if (request.action === 'TEST_CONNECTION') {
    (async () => {
      try {
        const response = await callOpenAI(
          request.messages,
          request.systemPrompt,
          request.options
        );
        sendResponse({ success: true, response });
      } catch (err) {
        logger.error('Background API connection test failed:', err.message);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep channel open
  }

  sendResponse({ error: 'Unknown action' });
  return false;
});
