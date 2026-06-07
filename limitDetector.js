/**
 * ChatContinuity - Limit Detector
 * Tracks conversation thresholds and health
 */

import { estimateTokens } from './utils.js';

// Default token limit (approx. 100k characters ≈ 25k tokens, where browser rendering starts slowing down)
const DEFAULT_TOKEN_LIMIT = 25000;

/**
 * Checks if the conversation history has exceeded user-defined thresholds.
 * @param {Array<{role: string, content: string}>} messages 
 * @param {number} thresholdMessages 
 * @returns {{
 *   messageCount: number,
 *   estimatedTokens: number,
 *   hasExceeded: boolean,
 *   limitType: 'messages' | 'tokens' | null
 * }}
 */
export function analyzeConversationHealth(messages, thresholdMessages = 250) {
  const messageCount = messages.length;
  
  // Calculate total tokens
  let estimatedTokens = 0;
  for (const msg of messages) {
    estimatedTokens += estimateTokens(msg.content);
  }

  let hasExceeded = false;
  let limitType = null;

  if (messageCount >= thresholdMessages) {
    hasExceeded = true;
    limitType = 'messages';
  } else if (estimatedTokens >= DEFAULT_TOKEN_LIMIT) {
    hasExceeded = true;
    limitType = 'tokens';
  }

  return {
    messageCount,
    estimatedTokens,
    hasExceeded,
    limitType
  };
}
