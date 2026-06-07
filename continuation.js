/**
 * ChatContinuity - Continuation Manager
 * Formats continuation prompts and coordinates redirection to a fresh chat
 */

import { CONTINUATION_PROMPT_TEMPLATE, STORAGE_KEYS } from './constants.js';
import { getProjectMemory, saveContinuationState } from './storage.js';
import { detectPlatform } from './selectorManager.js';
import { logger } from './utils.js';

/**
 * Formats the structured memory into the final continuation prompt string.
 * @param {Object} memory 
 * @returns {string} The prompt to paste in the fresh chat
 */
export function compileContinuationPrompt(memory) {
  const formatList = (arr) => {
    if (!arr || arr.length === 0) return 'None recorded yet.';
    return arr.map(item => `• ${item}`).join('\n');
  };

  return CONTINUATION_PROMPT_TEMPLATE
    .replace('{projectName}', memory.projectName || 'Untitled Project')
    .replace('{goal}', memory.goal || 'No goal specified')
    .replace('{currentTask}', memory.currentTask || 'General work')
    .replace('{completed}', formatList(memory.completed))
    .replace('{pending}', formatList(memory.pending))
    .replace('{importantDecisions}', formatList(memory.importantDecisions))
    .replace('{importantMessages}', formatList(memory.importantMessages))
    .replace('{recentContext}', formatList(memory.recentContext));
}

/**
 * Initiates the continuation flow.
 * Compiles the prompt, saves continuation state, and requests the background script to open a fresh chat.
 * @param {string|null} platformOverride Set when called from popup context
 * @param {string} convoId Conversation UUID
 */
export async function initiateContinuation(platformOverride = null, convoId = 'default') {
  const platform = platformOverride || detectPlatform();
  if (!platform) {
    logger.warn('Platform not detected, unable to initiate continuation.');
    return false;
  }

  try {
    const memory = await getProjectMemory(convoId);
    const promptText = compileContinuationPrompt(memory);

    // Save pending continuation state to storage
    await saveContinuationState({
      pending: true,
      promptText,
      platform,
      timestamp: Date.now()
    });

    let targetUrl = 'https://chatgpt.com/';
    if (platform === 'claude') {
      targetUrl = 'https://claude.ai/new';
    }

    logger.info(`Redirecting user to a fresh ${platform} chat...`);
    
    // Request background script to open new tab
    chrome.runtime.sendMessage({
      action: 'OPEN_FRESH_CHAT',
      url: targetUrl
    });

    return true;
  } catch (err) {
    logger.error('Failed to initiate continuation:', err);
    return false;
  }
}

/**
 * Validates whether the current URL represents a new chat page (not an existing history thread)
 * @param {string} urlString 
 * @param {'chatgpt' | 'claude'} platform 
 * @returns {boolean}
 */
export function isFreshChatPage(urlString, platform) {
  try {
    const url = new URL(urlString);
    const pathname = url.pathname;

    if (platform === 'chatgpt') {
      // ChatGPT new thread urls are just '/' or contain query params like '?model=...' but no chat ID
      // Existing chats look like '/c/uuid-string'
      return pathname === '/' || pathname === '';
    } else if (platform === 'claude') {
      // Claude new thread urls are '/new' or '/' or '/chat/new'
      // Existing chats look like '/chat/uuid-string'
      return pathname === '/' || pathname === '/new' || pathname.startsWith('/chat/new');
    }
  } catch (_) {
    // Fallback
  }
  return false;
}
