// ChatContinuity - Storage Inspector Script

const outputEl = document.getElementById('storage-output');
const btnRefresh = document.getElementById('btn-refresh');
const btnClearAll = document.getElementById('btn-clear-all');

async function refreshStorageView() {
  chrome.storage.local.get(null, (data) => {
    outputEl.textContent = JSON.stringify(data, null, 2);
  });
}

btnRefresh.addEventListener('click', refreshStorageView);

btnClearAll.addEventListener('click', () => {
  if (confirm('Are you absolutely sure you want to delete ALL data in chrome.storage.local? This will reset all extension settings and memories.')) {
    chrome.storage.local.clear(() => {
      alert('Local storage cleared successfully.');
      refreshStorageView();
    });
  }
});

// Initial load
refreshStorageView();
