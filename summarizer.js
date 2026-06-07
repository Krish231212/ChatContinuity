/**
 * ChatContinuity - Summarizer / Memory Engine
 * Manages incremental updates of structured project memory
 */

import { SYSTEM_PROMPT_TEMPLATE, MEMORY_SCHEMA } from './constants.js';
import { getProjectMemory, saveProjectMemory } from './storage.js';
import { callOpenAI } from './openai.js';
import { logger, retryWithDelay } from './utils.js';
import { analyzeConversationHealth } from './limitDetector.js';

/**
 * Triggers an incremental update of the project memory using the latest messages.
 * @param {Array<{role: string, content: string}>} allMessages
 * @param {number} thresholdMessages Message limit threshold
 * @param {string} convoId Conversation UUID
 * @returns {Promise<Object>} The updated structured memory JSON
 */
export async function updateMemoryIncrementally(allMessages, thresholdMessages, convoId = 'default') {
  if (!allMessages || allMessages.length === 0) {
    logger.info('No messages available for memory summarization.');
    return await getProjectMemory(convoId);
  }

  // 1. Get existing memory state
  const existingMemory = await getProjectMemory(convoId);
  const lastCount = existingMemory.conversationHealth?.messageCount || 0;

  if (allMessages.length <= lastCount) {
    logger.info(`No new messages since last summarization (current: ${allMessages.length}, last: ${lastCount}).`);
    return existingMemory;
  }

  // 2. Extract only the new chunk of messages
  const recentMessagesChunk = allMessages.slice(lastCount);
  logger.info(`Updating memory incrementally with ${recentMessagesChunk.length} new messages for conversation: ${convoId}.`);

  // 3. Format the recent messages for the prompt
  const formattedChunk = recentMessagesChunk
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  // 4. Construct system prompt
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{existingMemory}', JSON.stringify(existingMemory, null, 2))
    .replace('{recentMessages}', formattedChunk);

  let resultText = '';
  try {
    // 5. Query OpenAI API (retry up to 3 times with 1500ms delay on transient failures)
    resultText = await retryWithDelay(
      () => callOpenAI(
        [{ role: 'user', content: 'Generate updated project memory JSON based on the recent conversation chunk.' }],
        systemPrompt
      ),
      3,
      1500
    );

    // 6. Clean and parse JSON response safely
    let updatedMemory = parseJSONContent(resultText);

    // 7. Validate and sanitize schema output
    updatedMemory = sanitizeSchema(updatedMemory, existingMemory);

    // 8. Re-evaluate overall health
    const health = analyzeConversationHealth(allMessages, thresholdMessages);
    updatedMemory.conversationHealth = {
      messageCount: allMessages.length,
      estimatedTokens: health.estimatedTokens
    };

    // 9. Save to local storage
    await saveProjectMemory(updatedMemory, convoId);
    logger.info('Structured project memory successfully updated!', updatedMemory);

    return updatedMemory;
  } catch (err) {
    logger.error('Failed to update project memory incrementally:', err);
    if (err.message.toLowerCase().includes('json') || err.message.toLowerCase().includes('syntax')) {
      const snippet = resultText ? (resultText.length > 300 ? resultText.substring(0, 300) + '...' : resultText) : 'No response content';
      throw new Error(`${err.message}\n\n[Raw LLM Output Snippet]:\n${snippet}`);
    }
    throw err;
  }
}

/**
 * Helper to safely extract and parse JSON from string output.
 * Can handle markdown wrappers if present.
 */
function parseJSONContent(text) {
  let cleaned = text.trim();
  
  // If the model wrapped it in markdown code blocks: ```json ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/, '');
    cleaned = cleaned.replace(/```$/, '');
    cleaned = cleaned.trim();
  }

  // Sanitize trailing commas (invalid in JSON but common in LLM outputs)
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // 1. Try direct parsing first
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // 2. Try parsing after repairing unescaped quotes and control characters inside strings
    try {
      const repaired = repairJSONStrings(cleaned);
      return JSON.parse(repaired);
    } catch (_) {
      // 3. Try to extract the first '{' and last '}'
      const startIdx = cleaned.indexOf('{');
      const endIdx = cleaned.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const jsonCandidate = cleaned.substring(startIdx, endIdx + 1);
        try {
          return JSON.parse(jsonCandidate);
        } catch (_) {
          // Try to repair the candidate as a last resort
          try {
            const repairedCandidate = repairJSONStrings(jsonCandidate);
            return JSON.parse(repairedCandidate);
          } catch (_) {
            // Fall through to original error
          }
        }
      }
    }
    throw new Error(`Invalid JSON syntax in LLM output: ${err.message}`);
  }
}

/**
 * Helper to escape unescaped double quotes and control characters inside JSON string literals.
 */
function repairJSONStrings(str) {
  let result = '';
  let inString = false;
  let escapeNext = false;
  const closingChars = new Set([',', '}', ']', ':']);

  function findNextNonWhitespace(s, startIdx) {
    for (let idx = startIdx; idx < s.length; idx++) {
      const c = s[idx];
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') {
        return c;
      }
    }
    return null;
  }

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      if (!inString) {
        inString = true;
        result += char;
      } else {
        const nextChar = findNextNonWhitespace(str, i + 1);
        if (nextChar === null || closingChars.has(nextChar)) {
          inString = false;
          result += char;
        } else {
          result += '\\"';
        }
      }
      continue;
    }

    if (inString) {
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Ensures that the output matches the required memory schema.
 * Merges missing fields from the existing memory or defaults.
 */
function sanitizeSchema(parsed, existing) {
  const schema = JSON.parse(JSON.stringify(MEMORY_SCHEMA));
  const sanitized = {};

  // Simple string fields (support camelCase and snake_case)
  sanitized.projectName = parsed.projectName || parsed.project_name || existing.projectName || schema.projectName;
  sanitized.goal = parsed.goal || existing.goal || schema.goal;
  sanitized.currentTask = parsed.currentTask || parsed.current_task || existing.currentTask || schema.currentTask;

  // Array fields (support camelCase and snake_case)
  sanitized.completed = Array.isArray(parsed.completed) ? parsed.completed : 
                        (Array.isArray(parsed.completed_tasks) ? parsed.completed_tasks : 
                        (existing.completed || []));
  sanitized.pending = Array.isArray(parsed.pending) ? parsed.pending : 
                      (Array.isArray(parsed.pending_tasks) ? parsed.pending_tasks : 
                      (existing.pending || []));
  sanitized.importantDecisions = Array.isArray(parsed.importantDecisions) ? parsed.importantDecisions : 
                                 (Array.isArray(parsed.important_decisions) ? parsed.important_decisions : 
                                 (existing.importantDecisions || []));
  sanitized.importantMessages = Array.isArray(parsed.importantMessages) ? parsed.importantMessages : 
                                (Array.isArray(parsed.important_messages) ? parsed.important_messages : 
                                (existing.importantMessages || []));
  sanitized.recentContext = Array.isArray(parsed.recentContext) ? parsed.recentContext : 
                            (Array.isArray(parsed.recent_context) ? parsed.recent_context : 
                            (existing.recentContext || []));

  // Clean empty defaults if they were just template descriptions
  if (sanitized.projectName === schema.projectName) sanitized.projectName = 'Untitled Project';
  if (sanitized.goal === schema.goal) sanitized.goal = 'Explore current work';
  if (sanitized.currentTask === schema.currentTask) sanitized.currentTask = 'Discussing context';

  return sanitized;
}
