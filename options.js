/**
 * ChatContinuity - Options Script
 */

import { getSettings, saveSettings } from './storage.js';
import { callOpenAI } from './openai.js';
import { logger } from './utils.js';

const apiKeyInput = document.getElementById('api-key');
const apiBaseUrlInput = document.getElementById('api-base-url');
const modelSelect = document.getElementById('model-select');
const customModelGroup = document.getElementById('custom-model-group');
const customModelInput = document.getElementById('custom-model-input');
const thresholdInput = document.getElementById('threshold-input');
const frequencyInput = document.getElementById('frequency-input');
const autoPopupCheckbox = document.getElementById('auto-popup-checkbox');
const form = document.getElementById('settings-form');
const btnTest = document.getElementById('btn-test');
const statusMessage = document.getElementById('status-message');

// Load configurations on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const settings = await getSettings();
    
    // API Key & Base URL
    apiKeyInput.value = settings.apiKey || '';
    apiBaseUrlInput.value = settings.apiBaseUrl || 'https://api.openai.com/v1';

    // Model selection
    const standardModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4'];
    if (standardModels.includes(settings.model)) {
      modelSelect.value = settings.model;
      customModelGroup.style.display = 'none';
    } else {
      modelSelect.value = 'custom';
      customModelInput.value = settings.model || '';
      customModelGroup.style.display = 'flex';
    }

    // Threshold & Frequency
    thresholdInput.value = settings.thresholdMessages;
    frequencyInput.value = settings.updateFrequency;
    autoPopupCheckbox.checked = settings.autoPopup;

    logger.info('Loaded settings in options page.');
  } catch (err) {
    showStatus('Failed to load settings: ' + err.message, 'error');
  }
});

// Toggle custom model input display
modelSelect.addEventListener('change', () => {
  if (modelSelect.value === 'custom') {
    customModelGroup.style.display = 'flex';
    customModelInput.focus();
  } else {
    customModelGroup.style.display = 'none';
  }
});

// Save settings handler
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const apiKey = apiKeyInput.value.trim();
  const apiBaseUrl = apiBaseUrlInput.value.trim() || 'https://api.openai.com/v1';
  let model = modelSelect.value;
  if (model === 'custom') {
    model = customModelInput.value.trim();
    if (!model) {
      showStatus('Please enter a custom model name.', 'error');
      return;
    }
  }

  const threshold = parseInt(thresholdInput.value, 10);
  const frequency = parseInt(frequencyInput.value, 10);

  if (isNaN(threshold) || threshold <= 0) {
    showStatus('Please enter a valid message threshold.', 'error');
    return;
  }

  if (isNaN(frequency) || frequency <= 0) {
    showStatus('Please enter a valid update frequency.', 'error');
    return;
  }

  const updatedSettings = {
    apiKey,
    apiBaseUrl,
    model,
    thresholdMessages: threshold,
    updateFrequency: frequency,
    autoPopup: autoPopupCheckbox.checked
  };

  try {
    await saveSettings(updatedSettings);
    showStatus('Settings saved successfully!', 'success');
  } catch (err) {
    showStatus('Failed to save settings: ' + err.message, 'error');
  }
});

// Test API connectivity handler
btnTest.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showStatus('API key is required to test connection.', 'error');
    return;
  }

  let model = modelSelect.value;
  if (model === 'custom') {
    model = customModelInput.value.trim() || 'gpt-4o';
  }

  // Set loading state
  const originalText = btnTest.textContent;
  btnTest.textContent = 'Testing...';
  btnTest.disabled = true;
  const apiBaseUrl = apiBaseUrlInput.value.trim() || 'https://api.openai.com/v1';
  showStatus('Connecting to ' + apiBaseUrl + '...', 'success');

  try {
    const result = await callOpenAI(
      [{ role: 'user', content: "Respond with the single word 'Connected' and nothing else." }],
      'You are a testing assistant.',
      {
        apiKey: apiKey,
        apiBaseUrl: apiBaseUrl,
        model: model,
        temperature: 0.0,
        max_tokens: 20,
        skipJsonMode: true
      }
    );

    btnTest.textContent = originalText;
    btnTest.disabled = false;

    if (result && result.toLowerCase().includes('connected')) {
      showStatus('✅ Connection successful! API Key is valid and model is responsive.', 'success');
    } else {
      showStatus('✅ Connection succeeded! Response: "' + result + '"', 'success');
    }
  } catch (err) {
    logger.error('API Test connection failed:', err);
    showStatus('API connection failed: ' + err.message, 'error');
    btnTest.textContent = originalText;
    btnTest.disabled = false;
  }
});

// Helper to show status message banner
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = type; // 'success' or 'error'
  
  if (type === 'success') {
    // Fade out success message after 5 seconds
    setTimeout(() => {
      if (statusMessage.className === 'success' && statusMessage.textContent === message) {
        statusMessage.style.display = 'none';
        statusMessage.className = '';
      }
    }, 5000);
  }
}
