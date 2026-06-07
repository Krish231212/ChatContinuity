import { getContinuationState, saveContinuationState, clearAllSessionData } from './storage.js';
import { isFreshChatPage } from './continuation.js';
import { pasteContinuationPrompt } from './domExtractor.js';
import { detectPlatform } from './selectorManager.js';
import { initializeMemoryManager } from './memoryManager.js';
import { logger, delay } from './utils.js';

(async () => {
  try {
    logger.info('Launcher script active.');

    // 3. Evaluate pending continuation context
    const continuation = await getContinuationState();
    const platform = detectPlatform();
    const currentUrl = window.location.href;

    // Clear default session data if loading a fresh chat page to avoid leakage of old default data
    if (platform && isFreshChatPage(currentUrl, platform)) {
      logger.info('Fresh chat page loaded. Clearing default workspace slate...');
      await clearAllSessionData('default');
    }
    
    if (continuation && continuation.pending && platform === continuation.platform) {
      if (isFreshChatPage(currentUrl, platform)) {
        logger.info('Continuation state detected! Clearing flag and waiting for text input field...');
        
        // Clear continuation state immediately to avoid repeated injections
        await saveContinuationState(null);

        // Attempt paste loop (up to 10 seconds)
        let pasted = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          pasted = await pasteContinuationPrompt(continuation.promptText);
          if (pasted) {
            logger.info('Prompt successfully pasted into input!');
            showToastIndicator();
            break;
          }
          await delay(250);
        }
        if (!pasted) {
          logger.warn('Failed to auto-paste continuation prompt: input element was not found.');
        }
      }
    }

    // 4. Initialize observers and limits tracking
    await initializeMemoryManager();

  } catch (err) {
    console.error('[ChatContinuity] Content script error:', err);
  }
})();

/**
 * Shows an elegant top-level success toast in the page DOM
 */
function showToastIndicator() {
  const id = 'chatcontinuity-toast';
  if (document.getElementById(id)) return;

  const toast = document.createElement('div');
  toast.id = id;
  toast.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    padding: 12px 28px;
    border-radius: 30px;
    font-weight: 600;
    font-size: 13.5px;
    z-index: 10000000;
    box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    transition: opacity 0.5s ease, transform 0.5s ease;
  `;
  toast.textContent = '✨ ChatContinuity: Context Pasted. Focus set, ready to SEND!';
  document.body.appendChild(toast);

  // Transition out
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-10px)';
    setTimeout(() => toast.remove(), 500);
  }, 4500);
}
