/**
 * ChatContinuity - Selector Manager
 * Provides fallbacks for DOM elements in ChatGPT and Claude
 */

export const SELECTORS = {
  chatgpt: {
    messageList: [
      'main div.flex-1.overflow-hidden',
      'div[class*="react-scroll-to-bottom"]',
      'div.role-presentation',
      'div.flex.flex-col.text-sm',
      'main div.flex.flex-col.items-center'
    ],
    messageRow: [
      '[data-testid*="conversation-turn"]',
      'section[data-testid*="conversation-turn"]',
      'article[data-testid*="conversation-turn"]',
      'div[data-testid*="conversation-turn"]',
      'article',
      'div.group.role-presentation'
    ],
    messageContent: [
      '[data-testid="conversation-turn-answer"]',
      'div.markdown',
      'div.flex.flex-col.gpts-message',
      'div.w-full.text-token-text-primary',
      'div.text-base'
    ],
    // Function to check if a row represents a User message
    isUser: (element) => {
      const text = element.textContent || '';
      if (text.includes('You said:')) return true;
      if (text.includes('ChatGPT said:')) return false;

      // Check data testids or attributes
      if (element.querySelector('[data-testid="user-message"]') || element.getAttribute('data-testid') === 'user-message') return true;
      if (element.querySelector('[data-presentation-role="user"]')) return true;
      
      // Fallback heuristics: User messages in ChatGPT do not have an assistant/avatar button.
      // Usually, there is a header or specific classing.
      const hasAssistantAvatar = element.querySelector('img[alt="User avatar"]') === null && 
                                 (element.querySelector('div.gizmo-shadow-stroke') || element.querySelector('[class*="agent-profile"]'));
      if (hasAssistantAvatar) return false;

      // In GPT-4o DOM: user messages often reside in articles without a markdown container
      const hasMarkdown = element.querySelector('.markdown');
      if (!hasMarkdown && element.querySelector('.whitespace-pre-wrap')) {
        return true;
      }
      
      // Look for user classes or testids in children
      const userMarker = element.querySelector('.bg-token-main-surface-secondary') || 
                         element.querySelector('.bg-user-message') ||
                         element.querySelector('.font-user-message');
      if (userMarker) return true;

      // Ultimate fallback: check text elements. User messages are usually first in the grid sequence
      // and lack the GPT copy/share icons.
      const hasActionIcons = element.querySelector('button[title*="Copy"]');
      return !hasActionIcons;
    },
    inputArea: [
      '#prompt-textarea',
      'textarea[placeholder*="Message ChatGPT"]',
      'textarea[data-id]',
      'textarea',
      '[contenteditable="true"]'
    ],
    sendButton: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[data-testid*="send"]',
      '[data-testid="composer-send-button"]',
      'button.bg-black'
    ]
  },
  claude: {
    messageList: [
      'div.flex-1.overflow-y-auto',
      'div[class*="chat-container"]',
      '.grid.grid-cols-1',
      'div.max-w-3xl'
    ],
    messageRow: [
      '[data-testid="user-message"], [data-testid="assistant-message"]',
      'div.font-claude-message',
      'div.chat-turn',
      'div.group.flex.flex-col',
      'div.grid.grid-cols-1 > div.group'
    ],
    messageContent: [
      '[data-testid="user-message"], [data-testid="assistant-message"]',
      'div.font-claude-message',
      'div.contents',
      '.markdown',
      'div.whitespace-pre-wrap'
    ],
    // Function to check if a row represents a User message
    isUser: (element) => {
      // Direct data-testid check (highly reliable)
      if (element.getAttribute('data-testid') === 'user-message' || element.querySelector('[data-testid="user-message"]')) return true;
      if (element.getAttribute('data-testid') === 'assistant-message' || element.querySelector('[data-testid="assistant-message"]')) return false;

      // In Claude: User message blocks have class font-user-message or live inside user containers
      if (element.classList.contains('font-user-message') || element.querySelector('.font-user-message')) return true;
      
      // Claude user message container usually has background classbg-accent or bg-amber-50, or text-right classes
      if (element.querySelector('.bg-accent') || element.classList.contains('bg-accent')) return true;
      
      // Fallback heuristics: does it contain assistant markers
      const hasAssistantAvatar = element.querySelector('svg[viewBox*="Claude"]') || element.querySelector('img[src*="claude"]');
      if (hasAssistantAvatar) return false;

      // Checking alignment or other classes:
      const classStr = element.className || '';
      if (classStr.includes('user') || classStr.includes('human')) return true;

      // User text is usually in a div that is aligned to the right or lacks assistant menu buttons
      const hasMenuButtons = element.querySelector('button[aria-label*="Copy"]');
      return !hasMenuButtons;
    },
    inputArea: [
      'div[contenteditable="true"]',
      '[data-testid="chat-input"]',
      'textarea[placeholder*="Message Claude"]',
      'textarea',
      'div.ProseMirror'
    ],
    sendButton: [
      'button[aria-label="Send Message"]',
      'button[aria-label*="Send"]',
      'button.bg-accent',
      'button:has(svg[data-name*="PaperPlane"])',
      'button'
    ]
  }
};

/**
 * Detects whether the current site is ChatGPT or Claude
 * @returns {'chatgpt' | 'claude' | null}
 */
export function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes('chatgpt.com') || host.includes('openai.com')) {
    return 'chatgpt';
  }
  if (host.includes('claude.ai')) {
    return 'claude';
  }
  return null;
}
