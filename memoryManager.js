/**
 * ChatContinuity - Memory Manager (Content Script Orchestrator)
 */

import { getSettings, getSessionHistory, saveSessionHistory, getLastPromptedCount, saveLastPromptedCount } from './storage.js';
import { extractMessages, pasteContinuationPrompt } from './domExtractor.js';
import { analyzeConversationHealth } from './limitDetector.js';
import { initiateContinuation, isFreshChatPage } from './continuation.js';
import { logger, debounce, getConversationIdFromUrl } from './utils.js';

// Styles for the injected floating warning card
const FLOATING_POPUP_CSS = `
  #chatcontinuity-warning-popup {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 340px;
    background: rgba(26, 28, 36, 0.9);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    padding: 20px;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #f3f4f6;
    animation: cc-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes cc-slide-in {
    from {
      transform: translateY(100px) scale(0.9);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  .cc-popup-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .cc-popup-icon {
    font-size: 20px;
  }

  .cc-popup-title {
    font-weight: 700;
    font-size: 16px;
    color: #f59e0b; /* Warning amber color */
    letter-spacing: -0.01em;
  }

  .cc-popup-close {
    position: absolute;
    top: 14px;
    right: 16px;
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
    transition: color 0.2s;
  }

  .cc-popup-close:hover {
    color: #f3f4f6;
  }

  .cc-popup-body {
    font-size: 13.5px;
    line-height: 1.5;
    color: #d1d5db;
    margin: 0 0 16px 0;
  }

  .cc-popup-stats {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cc-popup-stat {
    font-size: 12.5px;
    color: #9ca3af;
    display: flex;
    justify-content: space-between;
  }

  .cc-popup-stat strong {
    color: #e5e7eb;
  }

  .cc-popup-btn {
    width: 100%;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    border: none;
    border-radius: 8px;
    color: white;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .cc-popup-btn:hover {
    background: linear-gradient(135deg, #60a5fa 0%, #2563eb 100%);
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
    transform: translateY(-1px);
  }

  .cc-popup-btn:active {
    transform: translateY(0);
  }
`;

let currentObserver = null;
let currentConvoId = null;
const lastMessageCountMap = new Map();

/**
 * Initializes the Memory Manager workspace in the content script context.
 */
export async function initializeMemoryManager() {
  logger.info('Initializing Memory Manager...');
  
  // Inject fonts and style block
  injectStyles();

  // Run initial extraction and sync
  await handleDOMUpdate();

  // Listen for DOM changes
  startMessageObserver();
}

/**
 * Injects floating UI stylesheet into host head
 */
function injectStyles() {
  if (document.getElementById('chatcontinuity-styles')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'chatcontinuity-styles';
  styleEl.textContent = FLOATING_POPUP_CSS;
  document.head.appendChild(styleEl);
}

/**
 * Starts observing the body or chat elements for changes
 */
function startMessageObserver() {
  if (currentObserver) {
    currentObserver.disconnect();
  }

  // Observe child additions in document.body recursively
  // Debounce updates to prevent excessive overhead during active message typing
  const debouncedUpdate = debounce(async () => {
    await handleDOMUpdate();
  }, 1000);

  currentObserver = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldUpdate = true;
        break;
      }
    }
    if (shouldUpdate) {
      debouncedUpdate();
    }
  });

  currentObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  logger.info('DOM MutationObserver started.');
}

/**
 * Stops observing DOM
 */
export function stopMessageObserver() {
  if (currentObserver) {
    currentObserver.disconnect();
    currentObserver = null;
    logger.info('DOM MutationObserver disconnected.');
  }
}

/**
 * Main action routine when DOM updates are detected.
 * Extracts messages, compares limits, triggers API summaries, and presents warning popups.
 */
async function handleDOMUpdate() {
  try {
    const convoId = getConversationIdFromUrl(window.location.href);

    // Detect navigation / chat swaps (SPA)
    if (currentConvoId !== null && convoId !== currentConvoId) {
      logger.info(`Navigation detected: swapping from ${currentConvoId} to ${convoId}. Waiting for DOM to settle...`);
      currentConvoId = convoId;
      lastMessageCountMap.set(convoId, 0);

      // Schedule a check 800ms later to read the fresh DOM
      setTimeout(async () => {
        await handleDOMUpdate();
      }, 800);
      return;
    }
    currentConvoId = convoId;

    const extracted = extractMessages();
    if (extracted.length === 0) return;

    // Save history scoped by convoId
    await saveSessionHistory(extracted, convoId);

    // Get current configuration settings
    const settings = await getSettings();
    const threshold = settings.thresholdMessages;
    
    // Evaluate health state
    const health = analyzeConversationHealth(extracted, threshold);
    const prevCount = lastMessageCountMap.get(convoId) || 0;

    // If message count has grown for this conversation
    if (extracted.length > prevCount) {
      const growthDiff = extracted.length - prevCount;
      lastMessageCountMap.set(convoId, extracted.length);
      logger.info(`Conversation ${convoId} update: ${extracted.length} messages. (+${growthDiff})`);

      // Check if we need to request an incremental update from the service worker
      // We trigger memory sync at the start and then every 'updateFrequency' messages
      const shouldSyncMemory = (extracted.length % settings.updateFrequency === 0) || (extracted.length === 1);
      if (shouldSyncMemory) {
        logger.info(`Triggering incremental project memory sync for ${convoId}...`);
        chrome.runtime.sendMessage({
          action: 'SYNC_MEMORY',
          messages: extracted,
          threshold: threshold,
          convoId: convoId
        });
      }

      // Check threshold and show warning card
      if (health.hasExceeded && settings.autoPopup) {
        const lastPrompted = await getLastPromptedCount(convoId);
        // Avoid repeatedly spamming: show once per threshold crossing
        if (extracted.length > lastPrompted) {
          showFloatingWarning(health.messageCount, health.estimatedTokens);
          await saveLastPromptedCount(extracted.length, convoId);
        }
      }
    }
  } catch (err) {
    logger.error('Error during DOM update evaluation:', err);
  }
}

/**
 * Injects and displays the glassmorphic floating alert popup
 */
function showFloatingWarning(messageCount, estimatedTokens) {
  // If already displayed, don't duplicate
  if (document.getElementById('chatcontinuity-warning-popup')) return;

  const popup = document.createElement('div');
  popup.id = 'chatcontinuity-warning-popup';
  popup.innerHTML = `
    <button class="cc-popup-close" id="cc-close-warning">&times;</button>
    <div class="cc-popup-header">
      <span class="cc-popup-icon">⚠️</span>
      <span class="cc-popup-title">Large Conversation Detected</span>
    </div>
    <p class="cc-popup-body">
      ChatContinuity has detected a long session. Transition to a fresh chat to maintain high performance without losing project context.
    </p>
    <div class="cc-popup-stats">
      <div class="cc-popup-stat">
        <span>Estimated Turns:</span>
        <strong>${messageCount}</strong>
      </div>
      <div class="cc-popup-stat">
        <span>Estimated Context size:</span>
        <strong>${estimatedTokens} tokens</strong>
      </div>
    </div>
    <button id="chatcontinuity-continue-btn" class="cc-popup-btn">Continue in Fresh Chat</button>
  `;

  document.body.appendChild(popup);

  // Setup click listeners
  document.getElementById('cc-close-warning').addEventListener('click', () => {
    popup.remove();
  });

  document.getElementById('chatcontinuity-continue-btn').addEventListener('click', async () => {
    const btn = document.getElementById('chatcontinuity-continue-btn');
    if (btn) {
      btn.textContent = 'Syncing memory...';
      btn.disabled = true;
    }

    const convoId = getConversationIdFromUrl(window.location.href);

    try {
      const messages = await getSessionHistory(convoId);
      const settings = await getSettings();

      // Trigger background sync
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'SYNC_MEMORY',
          messages: messages,
          threshold: settings.thresholdMessages,
          convoId: convoId
        }, (response) => {
          if (!response || !response.success) {
            logger.warn('Floating card sync failed:', response?.error);
          }
          resolve();
        });
      });
    } catch (err) {
      logger.error('Failed to sync before redirection:', err);
    }

    popup.remove();
    logger.info('User approved continuation from floating card.');
    await initiateContinuation(null, convoId);
  });
}
