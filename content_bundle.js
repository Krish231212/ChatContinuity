(() => {
  // constants.js
  var STORAGE_KEYS = {
    SETTINGS: "cc_settings",
    SESSION_HISTORY: "cc_session_history",
    // Raw extracted messages
    PROJECT_MEMORY: "cc_project_memory",
    // Structured project memory JSON
    CONTINUATION_STATE: "cc_continuation_state",
    // Flag and data for pending redirect paste
    LAST_PROMPTED_COUNT: "cc_last_prompted_count"
    // Message count when user was last shown the popup
  };
  var DEFAULT_SETTINGS = {
    apiKey: "",
    model: "gpt-4o",
    apiBaseUrl: "https://api.openai.com/v1",
    thresholdMessages: 25,
    // For testing/real use (user default can be configured, prompt mentions default 250, but let's make it configurable, default 50 for realistic testing, user requested default 250)
    autoPopup: true,
    autoOpenFresh: true,
    updateFrequency: 10
    // Update memory every 10 messages
  };
  var MEMORY_SCHEMA = {
    projectName: "Name of the project or session topic",
    goal: "The overarching objective of this session",
    currentTask: "What is currently being worked on or discussed",
    completed: ["List of completed steps, setup, or milestones"],
    pending: ["List of remaining steps, tasks, or follow-ups"],
    importantDecisions: ["Key decisions, architecture choices, or rules agreed upon"],
    importantMessages: ["Crucial messages, snippets, or specifications to remember"],
    recentContext: ["Short summary of the last 2-3 exchanges for immediate flow transition"],
    conversationHealth: {
      messageCount: 0,
      estimatedTokens: 0
    }
  };
  var CONTINUATION_PROMPT_TEMPLATE = `We are continuing an existing project.

PROJECT: {projectName}
GOAL: {goal}
CURRENT TASK: {currentTask}

COMPLETED SO FAR:
{completed}

PENDING TASKS:
{pending}

IMPORTANT DECISIONS & CONFIGURATIONS:
{importantDecisions}

CRITICAL CONTEXT & MESSAGES:
{importantMessages}

RECENT PROGRESS & RESUME POINT:
{recentContext}

Please continue exactly where we stopped. Do not repeat completed setup, code, or context. Ask me if you need any files, or confirm you are ready to begin the next task.`;

  // utils.js
  var LOG_PREFIX = "[ChatContinuity]";
  var logger = {
    info: (...args) => console.log(LOG_PREFIX, "[INFO]", ...args),
    warn: (...args) => console.warn(LOG_PREFIX, "[WARN]", ...args),
    error: (...args) => console.error(LOG_PREFIX, "[ERROR]", ...args),
    debug: (...args) => {
      console.log(LOG_PREFIX, "[DEBUG]", ...args);
    }
  };
  function estimateTokens(text) {
    if (!text || typeof text !== "string") return 0;
    return Math.ceil(text.length / 4);
  }
  function debounce(func, wait) {
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
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function safeQuery(selector, context = document) {
    try {
      return context.querySelector(selector);
    } catch (err) {
      logger.debug(`safeQuery failed for selector "${selector}":`, err.message);
      return null;
    }
  }
  function safeQueryAll(selector, context = document) {
    try {
      return Array.from(context.querySelectorAll(selector));
    } catch (err) {
      logger.debug(`safeQueryAll failed for selector "${selector}":`, err.message);
      return [];
    }
  }
  function getConversationIdFromUrl(urlString) {
    if (!urlString) return "default";
    try {
      const url = new URL(urlString);
      const pathname = url.pathname;
      const gptMatch = pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
      if (gptMatch && gptMatch[1]) return gptMatch[1];
      const claudeMatch = pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
      if (claudeMatch && claudeMatch[1]) return claudeMatch[1];
    } catch (_) {
    }
    return "default";
  }

  // storage.js
  function getScopedKey(baseKey, convoId) {
    if (convoId && convoId !== "default") {
      return `${baseKey}_${convoId}`;
    }
    return baseKey;
  }
  async function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (result) => {
        const settings = result[STORAGE_KEYS.SETTINGS];
        if (!settings) {
          resolve({ ...DEFAULT_SETTINGS });
        } else {
          resolve({ ...DEFAULT_SETTINGS, ...settings });
        }
      });
    });
  }
  async function getSessionHistory(convoId = "default") {
    const key = getScopedKey(STORAGE_KEYS.SESSION_HISTORY, convoId);
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] || []);
      });
    });
  }
  async function saveSessionHistory(messages, convoId = "default") {
    const key = getScopedKey(STORAGE_KEYS.SESSION_HISTORY, convoId);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: messages }, () => {
        resolve(true);
      });
    });
  }
  async function getProjectMemory(convoId = "default") {
    const key = getScopedKey(STORAGE_KEYS.PROJECT_MEMORY, convoId);
    logger.info(`getProjectMemory called: convoId="${convoId}", key="${key}"`);
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        const memory = result[key];
        logger.info(`getProjectMemory storage result: key="${key}", found=${!!memory}, messageCount=${memory?.conversationHealth?.messageCount}`);
        if (!memory) {
          resolve(JSON.parse(JSON.stringify(MEMORY_SCHEMA)));
        } else {
          resolve(memory);
        }
      });
    });
  }
  async function getContinuationState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.CONTINUATION_STATE, (result) => {
        resolve(result[STORAGE_KEYS.CONTINUATION_STATE] || null);
      });
    });
  }
  async function saveContinuationState(state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.CONTINUATION_STATE]: state }, () => {
        resolve(true);
      });
    });
  }
  async function getLastPromptedCount(convoId = "default") {
    const key = getScopedKey(STORAGE_KEYS.LAST_PROMPTED_COUNT, convoId);
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] || 0);
      });
    });
  }
  async function saveLastPromptedCount(count, convoId = "default") {
    const key = getScopedKey(STORAGE_KEYS.LAST_PROMPTED_COUNT, convoId);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: count }, () => {
        resolve(true);
      });
    });
  }
  async function clearAllSessionData(convoId = "default") {
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

  // selectorManager.js
  var SELECTORS = {
    chatgpt: {
      messageList: [
        "main div.flex-1.overflow-hidden",
        'div[class*="react-scroll-to-bottom"]',
        "div.role-presentation",
        "div.flex.flex-col.text-sm",
        "main div.flex.flex-col.items-center"
      ],
      messageRow: [
        '[data-testid*="conversation-turn"]',
        'section[data-testid*="conversation-turn"]',
        'article[data-testid*="conversation-turn"]',
        'div[data-testid*="conversation-turn"]',
        "article",
        "div.group.role-presentation"
      ],
      messageContent: [
        '[data-testid="conversation-turn-answer"]',
        "div.markdown",
        "div.flex.flex-col.gpts-message",
        "div.w-full.text-token-text-primary",
        "div.text-base"
      ],
      // Function to check if a row represents a User message
      isUser: (element) => {
        const text = element.textContent || "";
        if (text.includes("You said:")) return true;
        if (text.includes("ChatGPT said:")) return false;
        if (element.querySelector('[data-testid="user-message"]') || element.getAttribute("data-testid") === "user-message") return true;
        if (element.querySelector('[data-presentation-role="user"]')) return true;
        const hasAssistantAvatar = element.querySelector('img[alt="User avatar"]') === null && (element.querySelector("div.gizmo-shadow-stroke") || element.querySelector('[class*="agent-profile"]'));
        if (hasAssistantAvatar) return false;
        const hasMarkdown = element.querySelector(".markdown");
        if (!hasMarkdown && element.querySelector(".whitespace-pre-wrap")) {
          return true;
        }
        const userMarker = element.querySelector(".bg-token-main-surface-secondary") || element.querySelector(".bg-user-message") || element.querySelector(".font-user-message");
        if (userMarker) return true;
        const hasActionIcons = element.querySelector('button[title*="Copy"]');
        return !hasActionIcons;
      },
      inputArea: [
        "#prompt-textarea",
        'textarea[placeholder*="Message ChatGPT"]',
        "textarea[data-id]",
        "textarea",
        '[contenteditable="true"]'
      ],
      sendButton: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[data-testid*="send"]',
        '[data-testid="composer-send-button"]',
        "button.bg-black"
      ]
    },
    claude: {
      messageList: [
        "div.flex-1.overflow-y-auto",
        'div[class*="chat-container"]',
        ".grid.grid-cols-1",
        "div.max-w-3xl"
      ],
      messageRow: [
        '[data-testid="user-message"], [data-testid="assistant-message"]',
        "div.font-claude-message",
        "div.chat-turn",
        "div.group.flex.flex-col",
        "div.grid.grid-cols-1 > div.group"
      ],
      messageContent: [
        '[data-testid="user-message"], [data-testid="assistant-message"]',
        "div.font-claude-message",
        "div.contents",
        ".markdown",
        "div.whitespace-pre-wrap"
      ],
      // Function to check if a row represents a User message
      isUser: (element) => {
        if (element.getAttribute("data-testid") === "user-message" || element.querySelector('[data-testid="user-message"]')) return true;
        if (element.getAttribute("data-testid") === "assistant-message" || element.querySelector('[data-testid="assistant-message"]')) return false;
        if (element.classList.contains("font-user-message") || element.querySelector(".font-user-message")) return true;
        if (element.querySelector(".bg-accent") || element.classList.contains("bg-accent")) return true;
        const hasAssistantAvatar = element.querySelector('svg[viewBox*="Claude"]') || element.querySelector('img[src*="claude"]');
        if (hasAssistantAvatar) return false;
        const classStr = element.className || "";
        if (classStr.includes("user") || classStr.includes("human")) return true;
        const hasMenuButtons = element.querySelector('button[aria-label*="Copy"]');
        return !hasMenuButtons;
      },
      inputArea: [
        'div[contenteditable="true"]',
        '[data-testid="chat-input"]',
        'textarea[placeholder*="Message Claude"]',
        "textarea",
        "div.ProseMirror"
      ],
      sendButton: [
        'button[aria-label="Send Message"]',
        'button[aria-label*="Send"]',
        "button.bg-accent",
        'button:has(svg[data-name*="PaperPlane"])',
        "button"
      ]
    }
  };
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("chatgpt.com") || host.includes("openai.com")) {
      return "chatgpt";
    }
    if (host.includes("claude.ai")) {
      return "claude";
    }
    return null;
  }

  // continuation.js
  function compileContinuationPrompt(memory) {
    const formatList = (arr) => {
      if (!arr || arr.length === 0) return "None recorded yet.";
      return arr.map((item) => `\u2022 ${item}`).join("\n");
    };
    return CONTINUATION_PROMPT_TEMPLATE.replace("{projectName}", memory.projectName || "Untitled Project").replace("{goal}", memory.goal || "No goal specified").replace("{currentTask}", memory.currentTask || "General work").replace("{completed}", formatList(memory.completed)).replace("{pending}", formatList(memory.pending)).replace("{importantDecisions}", formatList(memory.importantDecisions)).replace("{importantMessages}", formatList(memory.importantMessages)).replace("{recentContext}", formatList(memory.recentContext));
  }
  async function initiateContinuation(platformOverride = null, convoId = "default") {
    const platform = platformOverride || detectPlatform();
    if (!platform) {
      logger.warn("Platform not detected, unable to initiate continuation.");
      return false;
    }
    try {
      const memory = await getProjectMemory(convoId);
      const promptText = compileContinuationPrompt(memory);
      await saveContinuationState({
        pending: true,
        promptText,
        platform,
        timestamp: Date.now()
      });
      let targetUrl = "https://chatgpt.com/";
      if (platform === "claude") {
        targetUrl = "https://claude.ai/new";
      }
      logger.info(`Redirecting user to a fresh ${platform} chat...`);
      chrome.runtime.sendMessage({
        action: "OPEN_FRESH_CHAT",
        url: targetUrl
      });
      return true;
    } catch (err) {
      logger.error("Failed to initiate continuation:", err);
      return false;
    }
  }
  function isFreshChatPage(urlString, platform) {
    try {
      const url = new URL(urlString);
      const pathname = url.pathname;
      if (platform === "chatgpt") {
        return pathname === "/" || pathname === "";
      } else if (platform === "claude") {
        return pathname === "/" || pathname === "/new" || pathname.startsWith("/chat/new");
      }
    } catch (_) {
    }
    return false;
  }

  // domExtractor.js
  function extractMessages() {
    const platform = detectPlatform();
    if (!platform) {
      logger.warn("Platform not detected, skipping message extraction.");
      return [];
    }
    const pSelectors = SELECTORS[platform];
    let messageListContainer = null;
    for (const selector of pSelectors.messageList) {
      messageListContainer = safeQuery(selector);
      if (messageListContainer) break;
    }
    if (!messageListContainer) {
      logger.debug("Could not find message container. Scanning entire document.");
      messageListContainer = document.body;
    }
    let rows = [];
    for (const selector of pSelectors.messageRow) {
      rows = safeQueryAll(selector, messageListContainer);
      if (rows.length > 0) break;
    }
    if (rows.length === 0) {
      logger.debug("No message rows found via primary selectors.");
      return [];
    }
    const messages = [];
    for (const row of rows) {
      try {
        const isUser = pSelectors.isUser(row);
        const role = isUser ? "user" : "assistant";
        let contentEl = null;
        for (const selector of pSelectors.messageContent) {
          contentEl = safeQuery(selector, row);
          if (contentEl) break;
        }
        const elementToRead = contentEl || row;
        const clone = elementToRead.cloneNode(true);
        const elementsToRemove = clone.querySelectorAll("button, svg, style, script, .sr-only");
        elementsToRemove.forEach((el) => el.remove());
        let contentText = clone.textContent || clone.innerText || "";
        contentText = contentText.replace(/^(You said:|ChatGPT said:)\s*/i, "");
        contentText = contentText.trim();
        if (contentText) {
          messages.push({
            role,
            content: contentText
          });
        }
      } catch (err) {
        logger.error("Failed to parse message row:", err);
      }
    }
    const uniqueMessages = [];
    for (let i = 0; i < messages.length; i++) {
      const current = messages[i];
      if (uniqueMessages.length === 0) {
        uniqueMessages.push(current);
      } else {
        const last = uniqueMessages[uniqueMessages.length - 1];
        if (last.role === current.role && last.content === current.content) {
          continue;
        }
        uniqueMessages.push(current);
      }
    }
    return uniqueMessages;
  }
  async function pasteContinuationPrompt(text) {
    const platform = detectPlatform();
    if (!platform) return false;
    const pSelectors = SELECTORS[platform];
    let inputEl = null;
    for (const selector of pSelectors.inputArea) {
      inputEl = safeQuery(selector);
      if (inputEl) break;
    }
    if (!inputEl) {
      logger.error("Input element not found. Unable to paste.");
      return false;
    }
    try {
      inputEl.focus();
      if (inputEl.tagName === "TEXTAREA" || inputEl.tagName === "INPUT") {
        inputEl.value = text;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (inputEl.getAttribute("contenteditable") === "true") {
        try {
          inputEl.focus();
          const dataTransfer = new DataTransfer();
          dataTransfer.setData("text/plain", text);
          const pasteEvent = new ClipboardEvent("paste", {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
          });
          inputEl.dispatchEvent(pasteEvent);
          const currentText = inputEl.textContent || "";
          if (currentText.trim() === "") {
            logger.info("ClipboardEvent paste did not populate text. Falling back to execCommand...");
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(inputEl);
            selection.removeAllRanges();
            selection.addRange(range);
            const success = document.execCommand("insertText", false, text);
            if (!success) {
              throw new Error("execCommand returned false");
            }
          }
        } catch (execErr) {
          logger.warn("Pasting methods failed, falling back to innerHTML replacement:", execErr);
          inputEl.innerHTML = "";
          const p = document.createElement("p");
          p.textContent = text;
          inputEl.appendChild(p);
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      inputEl.scrollIntoView({ behavior: "smooth", block: "end" });
      logger.info("Prompt successfully pasted and focused!");
      return true;
    } catch (err) {
      logger.error("Error pasting text into input field:", err);
      return false;
    }
  }

  // limitDetector.js
  var DEFAULT_TOKEN_LIMIT = 25e3;
  function analyzeConversationHealth(messages, thresholdMessages = 250) {
    const messageCount = messages.length;
    let estimatedTokens = 0;
    for (const msg of messages) {
      estimatedTokens += estimateTokens(msg.content);
    }
    let hasExceeded = false;
    let limitType = null;
    if (messageCount >= thresholdMessages) {
      hasExceeded = true;
      limitType = "messages";
    } else if (estimatedTokens >= DEFAULT_TOKEN_LIMIT) {
      hasExceeded = true;
      limitType = "tokens";
    }
    return {
      messageCount,
      estimatedTokens,
      hasExceeded,
      limitType
    };
  }

  // memoryManager.js
  var FLOATING_POPUP_CSS = `
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
  var currentObserver = null;
  var currentConvoId = null;
  var lastMessageCountMap = /* @__PURE__ */ new Map();
  async function initializeMemoryManager() {
    logger.info("Initializing Memory Manager...");
    injectStyles();
    await handleDOMUpdate();
    startMessageObserver();
  }
  function injectStyles() {
    if (document.getElementById("chatcontinuity-styles")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "chatcontinuity-styles";
    styleEl.textContent = FLOATING_POPUP_CSS;
    document.head.appendChild(styleEl);
  }
  function startMessageObserver() {
    if (currentObserver) {
      currentObserver.disconnect();
    }
    const debouncedUpdate = debounce(async () => {
      await handleDOMUpdate();
    }, 1e3);
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
    logger.info("DOM MutationObserver started.");
  }
  async function handleDOMUpdate() {
    try {
      const convoId = getConversationIdFromUrl(window.location.href);
      if (currentConvoId !== null && convoId !== currentConvoId) {
        logger.info(`Navigation detected: swapping from ${currentConvoId} to ${convoId}. Waiting for DOM to settle...`);
        currentConvoId = convoId;
        lastMessageCountMap.set(convoId, 0);
        setTimeout(async () => {
          await handleDOMUpdate();
        }, 800);
        return;
      }
      currentConvoId = convoId;
      const extracted = extractMessages();
      if (extracted.length === 0) return;
      await saveSessionHistory(extracted, convoId);
      const settings = await getSettings();
      const threshold = settings.thresholdMessages;
      const health = analyzeConversationHealth(extracted, threshold);
      const prevCount = lastMessageCountMap.get(convoId) || 0;
      if (extracted.length > prevCount) {
        const growthDiff = extracted.length - prevCount;
        lastMessageCountMap.set(convoId, extracted.length);
        logger.info(`Conversation ${convoId} update: ${extracted.length} messages. (+${growthDiff})`);
        const shouldSyncMemory = extracted.length % settings.updateFrequency === 0 || extracted.length === 1;
        if (shouldSyncMemory) {
          logger.info(`Triggering incremental project memory sync for ${convoId}...`);
          chrome.runtime.sendMessage({
            action: "SYNC_MEMORY",
            messages: extracted,
            threshold,
            convoId
          });
        }
        if (health.hasExceeded && settings.autoPopup) {
          const lastPrompted = await getLastPromptedCount(convoId);
          if (extracted.length > lastPrompted) {
            showFloatingWarning(health.messageCount, health.estimatedTokens);
            await saveLastPromptedCount(extracted.length, convoId);
          }
        }
      }
    } catch (err) {
      logger.error("Error during DOM update evaluation:", err);
    }
  }
  function showFloatingWarning(messageCount, estimatedTokens) {
    if (document.getElementById("chatcontinuity-warning-popup")) return;
    const popup = document.createElement("div");
    popup.id = "chatcontinuity-warning-popup";
    popup.innerHTML = `
    <button class="cc-popup-close" id="cc-close-warning">&times;</button>
    <div class="cc-popup-header">
      <span class="cc-popup-icon">\u26A0\uFE0F</span>
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
    document.getElementById("cc-close-warning").addEventListener("click", () => {
      popup.remove();
    });
    document.getElementById("chatcontinuity-continue-btn").addEventListener("click", async () => {
      const btn = document.getElementById("chatcontinuity-continue-btn");
      if (btn) {
        btn.textContent = "Syncing memory...";
        btn.disabled = true;
      }
      const convoId = getConversationIdFromUrl(window.location.href);
      try {
        const messages = await getSessionHistory(convoId);
        const settings = await getSettings();
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: "SYNC_MEMORY",
            messages,
            threshold: settings.thresholdMessages,
            convoId
          }, (response) => {
            if (!response || !response.success) {
              logger.warn("Floating card sync failed:", response?.error);
            }
            resolve();
          });
        });
      } catch (err) {
        logger.error("Failed to sync before redirection:", err);
      }
      popup.remove();
      logger.info("User approved continuation from floating card.");
      await initiateContinuation(null, convoId);
    });
  }

  // content_entry.js
  (async () => {
    try {
      logger.info("Launcher script active.");
      const continuation = await getContinuationState();
      const platform = detectPlatform();
      const currentUrl = window.location.href;
      if (platform && isFreshChatPage(currentUrl, platform)) {
        logger.info("Fresh chat page loaded. Clearing default workspace slate...");
        await clearAllSessionData("default");
      }
      if (continuation && continuation.pending && platform === continuation.platform) {
        if (isFreshChatPage(currentUrl, platform)) {
          logger.info("Continuation state detected! Clearing flag and waiting for text input field...");
          await saveContinuationState(null);
          let pasted = false;
          for (let attempt = 0; attempt < 40; attempt++) {
            pasted = await pasteContinuationPrompt(continuation.promptText);
            if (pasted) {
              logger.info("Prompt successfully pasted into input!");
              showToastIndicator();
              break;
            }
            await delay(250);
          }
          if (!pasted) {
            logger.warn("Failed to auto-paste continuation prompt: input element was not found.");
          }
        }
      }
      await initializeMemoryManager();
    } catch (err) {
      console.error("[ChatContinuity] Content script error:", err);
    }
  })();
  function showToastIndicator() {
    const id = "chatcontinuity-toast";
    if (document.getElementById(id)) return;
    const toast = document.createElement("div");
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
    toast.textContent = "\u2728 ChatContinuity: Context Pasted. Focus set, ready to SEND!";
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(-10px)";
      setTimeout(() => toast.remove(), 500);
    }, 4500);
  }
})();
