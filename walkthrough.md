# ChatContinuity Implementation Walkthrough

ChatContinuity is a production-grade Chrome Extension that automatically aggregates structured project memory during long chats in ChatGPT and Claude, prompting users to continue in a fresh session when the tab size crosses the threshold limits.

## Extension Icon

![ChatContinuity Logo](/Users/krishbhandari/.gemini/antigravity/brain/bb9f08d5-e452-41ee-b6e9-07018d1dd229/icon_1780681601807.png)

---

## Architectural Highlights

We implemented a completely modular architecture in Vanilla JavaScript utilizing native **ES Modules** and **Manifest V3**. The dynamic launcher in the content script context enables cleanly executing modular code across `chatgpt.com` and `claude.ai` without requiring external builders or custom bundling.

### Component Map

* **Orchestration**: [content.js](file:///Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity/content.js) dynamically loads [memoryManager.js](file:///Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity/memoryManager.js) to spin up a recursive `MutationObserver`, tracking text additions.
* **Extraction Engine**: [domExtractor.js](file:///Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity/domExtractor.js) queries chat bubbles using fallbacks defined in [selectorManager.js](file:///Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity/selectorManager.js), sanitizing text nodes from system widgets or SVGs.
* **OpenAI Memory System**: [summarizer.js](file:///Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity/summarizer.js) slice-extracts new dialogue updates and issues incremental merges to the OpenAI API endpoint via [openai.js](file:///Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity/openai.js).
* **Tab Navigation & Paste**: [continuation.js](file:///Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity/continuation.js) builds structured context prompts and saves redirections, which the content script reads on new load events to auto-paste the prompt and display a success toast.
* **User Control Panels**: [popup.html](file:///Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity/popup.html) displays current project items and logs, while [options.html](file:///Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity/options.html) edits configurations and executes connectivity tests.

---

## Verification Steps

### Loading the Extension
1. Open Google Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the directory:
   `/Users/krishbhandari/.gemini/antigravity/scratch/ChatContinuity`
4. Confirm the extension is successfully loaded under the name **ChatContinuity** with its custom anvil logo.

### Setup Settings
1. Click the puzzle icon in the toolbar, select **ChatContinuity**, and click the settings icon (`⚙️`) in the top-right.
2. In the options page, insert your OpenAI API Key.
3. Select your model (or choose **Custom Model...** and write a specific string).
4. Save the settings. You can click **Test Connection** to verify connection to OpenAI.

### Execution Check
1. Open a new tab in ChatGPT (`https://chatgpt.com/`) or Claude (`https://claude.ai/`).
2. Write a message and press Send.
3. Open the ChatContinuity popup to see the message count update, showing current goals and health values.
4. When the message count crosses your configured alert threshold, verify that the floating warning card slides in.
5. Click **Continue in Fresh Chat** and confirm that a new tab opens, the context prompt is pasted, the input box is focused, and the emerald success toast is displayed.

---

## SPA Navigation & Context Leakage Fixes

We resolved a race condition and context leakage issue:
1. **SPA Transitions (Chat Swapping)**: When swapping between different conversations in ChatGPT/Claude via the sidebar, the URL changes instantly but old messages linger in the DOM for a split second. We added URL transition detection in `memoryManager.js` that triggers an 800ms debounce delay to wait for the DOM to settle before extracting or saving messages.
2. **Fresh Chat Slate isolation**: We updated `content.js` to automatically invoke `clearAllSessionData('default')` on any fresh chat page load (`isFreshChatPage`), ensuring that no transient conversation states or older "Resume Website" context prompts linger in the default slot.
3. **Continuation State preservation**: We updated `clearAllSessionData()` in `storage.js` to avoid clearing the global redirect state (`STORAGE_KEYS.CONTINUATION_STATE`), guaranteeing that new tabs reliably find the prompt text when navigating.

## Claude.ai Compatibility Improvements

We fully optimized the extension's behavior on Claude:
1. **Stable DOM Selectors**: Integrated Claude's native `data-testid="user-message"` and `data-testid="assistant-message"` elements in `selectorManager.js` to reliably target user and assistant message blocks.
2. **Framework-Bound Paste Interaction (Synthetic Paste Events)**: Updated `domExtractor.js` to first construct and dispatch a synthetic `ClipboardEvent` with type `"paste"` when pasting into contenteditable fields. Since Claude's ProseMirror input is a rich-text framework, dispatching a native-like paste event is highly reliable and correctly updates the editor's internal state (which enables the "Send" button). We kept `execCommand` and `innerHTML` as robust fallbacks.
3. **CSP Dynamic Import Bypass (Content Script Bundling)**: Claude enforces a strict Content Security Policy (CSP) that blocks content scripts from performing runtime dynamic imports (`await import(...)`). We restructured the content script entry point (`content_entry.js`) to use static imports, and used `esbuild` to compile everything into a single, self-contained `content_bundle.js` bundle file. This makes the content script immune to host-page CSP restrictions and ensures the extension executes flawlessly on Claude.ai.

## Gemini JSON Mode & Formatting Fixes

We resolved JSON parsing exceptions arising from the Google AI Studio endpoint:
1. **Gemini JSON Mode Enforcement**: Updated `openai.js` to enforce `response_format = { type: 'json_object' }` for any model name containing `"gemini"`. This forces the Google AI Studio model to escape inner double quotes (e.g., `\"Rajvi Beauty Care\"`), preventing syntax parsing crashes.
2. **Robust Trailing Comma Sanitization**: Added regex sanitization in `parseJSONContent()` inside `summarizer.js` to automatically clean up trailing commas in array/object nodes that LLMs frequently output, preventing `SyntaxError` failures during `JSON.parse()`.
3. **Fallback JSON String Repair**: Implemented a highly robust state-machine string parser `repairJSONStrings()` inside `summarizer.js` that catches unescaped double quotes (e.g. `"Build a "great" extension"`) and literal control characters/newlines inside double-quoted string values, automatically escaping them before parsing to completely eliminate `SyntaxError` crashes on malformed LLM outputs.
4. **Gemini Output Truncation Fix (Reasoning Headroom)**: Omitted the `max_tokens` parameter for Gemini models in `openai.js` (allowing it to default to the model's maximum limit of 8192 tokens). This resolves an issue where Gemini 2.5's internal "thinking/reasoning" tokens consumed the small `max_tokens: 1500` budget, causing the final JSON response to truncate prematurely (e.g., at 222 characters).



### Re-verification Steps:
1. Go to `chrome://extensions/` and click the **Reload (🔄)** icon on the ChatContinuity card.
2. Open ChatGPT or Claude and refresh the page.
3. Switch between two different old chat threads in the sidebar.
4. Open the popup on each thread: confirm that the message counts, details, and project memory displayed correctly match the active chat instead of leaking "Resume Website" context.
5. Click **Continue in Fresh Chat** or start a new conversation and verify that it starts with a clean slate without auto-pasting the old project.

