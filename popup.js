/**
 * ChatContinuity - Popup Script
 */

import { getSettings, getSessionHistory, getProjectMemory, clearAllSessionData } from './storage.js';
import { detectPlatform } from './selectorManager.js';
import { analyzeConversationHealth } from './limitDetector.js';
import { initiateContinuation } from './continuation.js';
import { logger, getConversationIdFromUrl } from './utils.js';

// DOM Elements
const emptyState = document.getElementById('empty-state');
const activeState = document.getElementById('active-state');
const platformBadge = document.getElementById('platform-badge');
const btnSettings = document.getElementById('btn-settings');

// Active state fields
const projectName = document.getElementById('project-name');
const projectGoal = document.getElementById('project-goal');
const completedCount = document.getElementById('task-completed-count');
const pendingCount = document.getElementById('task-pending-count');
const healthStatusBadge = document.getElementById('health-status-badge');
const turnsValue = document.getElementById('turns-value');
const tokensValue = document.getElementById('tokens-value');

// Collapsible
const btnToggleMemory = document.getElementById('btn-toggle-memory');
const memoryDetails = document.getElementById('memory-details');
const memCurrentTask = document.getElementById('mem-current-task');
const memDecisions = document.getElementById('mem-decisions');
const memContext = document.getElementById('mem-context');

// Actions
const btnContinue = document.getElementById('btn-continue');
const btnSync = document.getElementById('btn-sync');
const btnClear = document.getElementById('btn-clear');
const syncStatusBanner = document.getElementById('sync-status');

// Page state cache
let cachedMessages = [];
let cachedThreshold = 250;
let activePlatform = null;
let activeConvoId = 'default';

document.addEventListener('DOMContentLoaded', async () => {
  // Bind settings button click
  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Collapsible view toggle
  btnToggleMemory.addEventListener('click', () => {
    const isHidden = memoryDetails.style.display === 'none';
    memoryDetails.style.display = isHidden ? 'flex' : 'none';
    btnToggleMemory.querySelector('.arrow').textContent = isHidden ? '▲' : '▼';
  });

  // Action listeners
  btnContinue.addEventListener('click', async () => {
    // Toggle sync status loading banner
    syncStatusBanner.style.display = 'flex';
    btnContinue.disabled = true;

    chrome.runtime.sendMessage({
      action: 'SYNC_MEMORY',
      messages: cachedMessages,
      threshold: cachedThreshold,
      convoId: activeConvoId
    }, async (response) => {
      syncStatusBanner.style.display = 'none';
      btnContinue.disabled = false;

      if (!response || !response.success) {
        const errorMsg = (response && response.error) ? response.error : 'API Key missing or invalid';
        logger.warn('Pre-redirect memory sync failed:', errorMsg);
        alert(`Memory Sync warning: ${errorMsg}. Continuing with last saved state.`);
      }

      const success = await initiateContinuation(activePlatform, activeConvoId);
      if (success) {
        window.close(); // Close extension popup on successful redirect
      }
    });
  });

  btnSync.addEventListener('click', forceMemorySync);
  btnClear.addEventListener('click', resetSessionData);

  // Initialize UI data
  await evaluateCurrentTab();
  await updateUIState();
});

/**
 * Checks the current tab hostname to see if we're on ChatGPT or Claude.
 */
async function evaluateCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const url = tabs[0].url || '';
        activeConvoId = getConversationIdFromUrl(url);
        let platformName = 'Inactive';
        
        if (url.includes('chatgpt.com') || url.includes('openai.com')) {
          platformName = 'ChatGPT';
          activePlatform = 'chatgpt';
        } else if (url.includes('claude.ai')) {
          platformName = 'Claude';
          activePlatform = 'claude';
        }

        platformBadge.textContent = platformName;
        if (platformName !== 'Inactive') {
          platformBadge.classList.add('badge-success');
          platformBadge.style.color = '#10b981';
        }
      }
      resolve();
    });
  });
}

/**
 * Reads local storage data and updates all UI elements.
 */
async function updateUIState() {
  try {
    const settings = await getSettings();
    cachedThreshold = settings.thresholdMessages;

    const messages = await getSessionHistory(activeConvoId);
    cachedMessages = messages;

    if (messages.length === 0) {
      emptyState.style.display = 'flex';
      activeState.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    activeState.style.display = 'block';

    const memory = await getProjectMemory(activeConvoId);
    const health = analyzeConversationHealth(messages, cachedThreshold);

    // 1. Populate project details
    projectName.textContent = memory.projectName || 'Untitled Project';
    projectGoal.textContent = `Goal: ${memory.goal || 'No goal set'}`;
    
    completedCount.textContent = memory.completed ? memory.completed.length : 0;
    pendingCount.textContent = memory.pending ? memory.pending.length : 0;

    // 2. Metrics and Health status
    turnsValue.textContent = `${health.messageCount} / ${cachedThreshold}`;
    tokensValue.textContent = `${health.estimatedTokens.toLocaleString()} tokens`;

    // Health badges classes mapping
    healthStatusBadge.className = 'badge';
    if (health.messageCount >= cachedThreshold) {
      healthStatusBadge.textContent = 'Limit Reached';
      healthStatusBadge.classList.add('badge-warning');
      healthStatusBadge.style.color = '#ef4444'; // Red limit alert
    } else if (health.messageCount >= cachedThreshold * 0.7) {
      healthStatusBadge.textContent = 'Warning';
      healthStatusBadge.classList.add('badge-warning');
      healthStatusBadge.style.color = '#f59e0b'; // Amber warning
    } else {
      healthStatusBadge.textContent = 'Healthy';
      healthStatusBadge.classList.add('badge-success');
      healthStatusBadge.style.color = '#10b981'; // Green healthy
    }

    // 3. Project Memory lists
    memCurrentTask.textContent = memory.currentTask || 'No task identified.';
    populateList(memDecisions, memory.importantDecisions);
    populateList(memContext, memory.recentContext);

  } catch (err) {
    logger.error('Failed to update popup UI:', err);
  }
}

/**
 * Standard utility to populate list elements dynamically.
 */
function populateList(parentElement, array) {
  parentElement.innerHTML = '';
  if (!array || array.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'None recorded.';
    li.style.listStyle = 'none';
    li.style.color = 'var(--text-muted)';
    parentElement.appendChild(li);
    return;
  }
  array.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    parentElement.appendChild(li);
  });
}

/**
 * Triggers manual API memory synchronization
 */
async function forceMemorySync() {
  if (cachedMessages.length === 0) return;

  // Toggle spinner banner
  syncStatusBanner.style.display = 'flex';
  btnSync.disabled = true;

  chrome.runtime.sendMessage({
    action: 'SYNC_MEMORY',
    messages: cachedMessages,
    threshold: cachedThreshold,
    convoId: activeConvoId
  }, async (response) => {
    syncStatusBanner.style.display = 'none';
    btnSync.disabled = false;

    if (response && response.success) {
      logger.info('Manual memory sync completed successfully.');
      await updateUIState();
    } else {
      const errorMsg = (response && response.error) ? response.error : 'Unknown API failure';
      alert(`Memory sync failed: ${errorMsg}\n\nPlease check your API Key in options.`);
    }
  });
}

/**
 * Resets current conversation data
 */
async function resetSessionData() {
  const confirmClear = confirm('Are you sure you want to reset the current ChatContinuity session? This will clear all tracked messages and active project memory for this tab.');
  if (confirmClear) {
    await clearAllSessionData(activeConvoId);
    await updateUIState();
  }
}
