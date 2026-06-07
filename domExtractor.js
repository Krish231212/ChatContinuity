/**
 * ChatContinuity - DOM Extractor
 * Extracts messages and interacts with input areas of ChatGPT/Claude
 */

import { SELECTORS, detectPlatform } from './selectorManager.js';
import { safeQuery, safeQueryAll, logger } from './utils.js';

/**
 * Extracts all chat messages from the page.
 * @returns {Array<{role: 'user' | 'assistant', content: string}>}
 */
export function extractMessages() {
  const platform = detectPlatform();
  if (!platform) {
    logger.warn('Platform not detected, skipping message extraction.');
    return [];
  }

  const pSelectors = SELECTORS[platform];
  
  // Find message list container using fallbacks
  let messageListContainer = null;
  for (const selector of pSelectors.messageList) {
    messageListContainer = safeQuery(selector);
    if (messageListContainer) break;
  }

  if (!messageListContainer) {
    // Ultimate fallback: check body for articles
    logger.debug('Could not find message container. Scanning entire document.');
    messageListContainer = document.body;
  }

  // Find message rows
  let rows = [];
  for (const selector of pSelectors.messageRow) {
    rows = safeQueryAll(selector, messageListContainer);
    if (rows.length > 0) break;
  }

  if (rows.length === 0) {
    logger.debug('No message rows found via primary selectors.');
    return [];
  }

  const messages = [];

  for (const row of rows) {
    try {
      // Determine role
      const isUser = pSelectors.isUser(row);
      const role = isUser ? 'user' : 'assistant';

      // Find content inside the message row
      let contentEl = null;
      for (const selector of pSelectors.messageContent) {
        contentEl = safeQuery(selector, row);
        if (contentEl) break;
      }

      // Fallback: use row itself if no content sub-element found
      const elementToRead = contentEl || row;
      
      // Extract text content cleanly (filtering out actions/menus if possible)
      // clone to avoid mutating real DOM
      const clone = elementToRead.cloneNode(true);
      
      // Remove buttons, tooltips, share menus, and SVGs to clean text extraction
      // Do not strip aria-hidden elements as they can contain the first letter (e.g. drop cap layouts)
      const elementsToRemove = clone.querySelectorAll('button, svg, style, script, .sr-only');
      elementsToRemove.forEach(el => el.remove());

      let contentText = clone.textContent || clone.innerText || '';
      
      // Strip accessibility prefixes
      contentText = contentText.replace(/^(You said:|ChatGPT said:)\s*/i, '');
      contentText = contentText.trim();

      if (contentText) {
        // Simple deduplication or skipping system notices
        messages.push({
          role,
          content: contentText
        });
      }
    } catch (err) {
      logger.error('Failed to parse message row:', err);
    }
  }

  // Deduplicate consecutive identical messages (which might be caused by nested containers)
  const uniqueMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const current = messages[i];
    if (uniqueMessages.length === 0) {
      uniqueMessages.push(current);
    } else {
      const last = uniqueMessages[uniqueMessages.length - 1];
      if (last.role === current.role && last.content === current.content) {
        // Duplicate content, skip
        continue;
      }
      uniqueMessages.push(current);
    }
  }

  return uniqueMessages;
}

/**
 * Pastes a string into the input area of ChatGPT/Claude
 * @param {string} text 
 * @returns {Promise<boolean>}
 */
export async function pasteContinuationPrompt(text) {
  const platform = detectPlatform();
  if (!platform) return false;

  const pSelectors = SELECTORS[platform];
  let inputEl = null;

  for (const selector of pSelectors.inputArea) {
    inputEl = safeQuery(selector);
    if (inputEl) break;
  }

  if (!inputEl) {
    logger.error('Input element not found. Unable to paste.');
    return false;
  }

  try {
    inputEl.focus();

    // Try setting value (for textareas)
    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
      inputEl.value = text;
      
      // Dispatch input event to notify React/Vue models
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } 
    
    // Try contenteditable fields (Claude or ChatGPT custom divs)
    if (inputEl.getAttribute('contenteditable') === 'true') {
      try {
        inputEl.focus();

        // 1. Try ClipboardEvent paste (highly reliable for ProseMirror in Claude)
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true
        });
        inputEl.dispatchEvent(pasteEvent);

        // 2. Fallback check: if ClipboardEvent did not write anything, use execCommand
        const currentText = inputEl.textContent || '';
        if (currentText.trim() === '') {
          logger.info('ClipboardEvent paste did not populate text. Falling back to execCommand...');
          
          // Select all existing text inside contenteditable so we overwrite it
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(inputEl);
          selection.removeAllRanges();
          selection.addRange(range);

          const success = document.execCommand('insertText', false, text);
          if (!success) {
            throw new Error('execCommand returned false');
          }
        }
      } catch (execErr) {
        logger.warn('Pasting methods failed, falling back to innerHTML replacement:', execErr);
        inputEl.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = text;
        inputEl.appendChild(p);
        
        // Dispatch events to notify listeners of change
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Scroll to bottom of input to make sure it's visible
    inputEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    logger.info('Prompt successfully pasted and focused!');
    return true;
  } catch (err) {
    logger.error('Error pasting text into input field:', err);
    return false;
  }
}

/**
 * Returns the send button element if it exists
 * @returns {HTMLElement|null}
 */
export function getSendButton() {
  const platform = detectPlatform();
  if (!platform) return null;

  const pSelectors = SELECTORS[platform];
  for (const selector of pSelectors.sendButton) {
    const btn = safeQuery(selector);
    if (btn) return btn;
  }
  return null;
}
