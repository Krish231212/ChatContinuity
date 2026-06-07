/**
 * MemoryForge - Constants
 */

export const STORAGE_KEYS = {
  SETTINGS: 'cc_settings',
  SESSION_HISTORY: 'cc_session_history', // Raw extracted messages
  PROJECT_MEMORY: 'cc_project_memory',   // Structured project memory JSON
  CONTINUATION_STATE: 'cc_continuation_state', // Flag and data for pending redirect paste
  LAST_PROMPTED_COUNT: 'cc_last_prompted_count' // Message count when user was last shown the popup
};

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'gpt-4o',
  apiBaseUrl: 'https://api.openai.com/v1',
  thresholdMessages: 25, // For testing/real use (user default can be configured, prompt mentions default 250, but let's make it configurable, default 50 for realistic testing, user requested default 250)
  autoPopup: true,
  autoOpenFresh: true,
  updateFrequency: 10 // Update memory every 10 messages
};

export const DEFAULT_THRESHOLD = 250;

export const SUPPORTED_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o (Recommended)' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Cost-efficient)' },
  { id: 'gpt-4', name: 'GPT-4' }
];

export const MEMORY_SCHEMA = {
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

export const SYSTEM_PROMPT_TEMPLATE = `You are the ChatContinuity AI Engine.
Your task is to maintain a structured project memory (the "save state") for an AI conversation.
You will be given the Existing Project Memory (JSON) and a chunk of Recent Conversation Messages.
Analyze the new messages and increment/update the project memory JSON.

Rules:
1. Maintain continuity. Do not lose existing decisions or completed tasks unless they have been explicitly changed or updated.
2. Be concise. Summarize tasks and decisions in short bullet points.
3. Identify the "projectName", "goal", and "currentTask" dynamically from the conversation context.
4. Categorize tasks: completed tasks go to "completed", tasks discussed but not yet completed go to "pending".
5. Capture "importantDecisions" and "importantMessages" that are critical to code execution, design choices, API configurations, or user preferences.
6. Populate "recentContext" with a summary of the very last topics or immediate next steps so the next chat knows exactly where to resume.
7. Return ONLY a valid JSON object matching the schema. Do not write markdown, code blocks, explanations, or commentary.

Schema:
\`\`\`json
{
  "projectName": "string",
  "goal": "string",
  "currentTask": "string",
  "completed": ["string"],
  "pending": ["string"],
  "importantDecisions": ["string"],
  "importantMessages": ["string"],
  "recentContext": ["string"],
  "conversationHealth": {
    "messageCount": 0,
    "estimatedTokens": 0
  }
}
\`\`\`

Existing Project Memory:
{existingMemory}

Recent Conversation Messages:
{recentMessages}

Updated Project Memory JSON:`;

export const CONTINUATION_PROMPT_TEMPLATE = `We are continuing an existing project.

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
