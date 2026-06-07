Ever spent hours working on a coding project with Claude or ChatGPT, only for the chat to get so long that the browser tab starts lagging? Or worse, the AI completely forgets the rules you set at the start?

It’s super frustrating. You end up having to manually summarize your progress, open a new tab, copy-paste your code, and try to explain it all over again.

I built a simple Chrome extension called **ChatContinuity** to fix this.

It runs in the background and keeps track of your project state: your main goal, what tasks you’ve finished, what's left, and key decisions. 

When the chat gets too long, it warns you and lets you jump to a fresh chat with one click. It automatically compiles your project context and pastes it into the new chat, so you can keep working instantly.

Here's how to use it:
1. Load it into your browser (Developer mode -> Load unpacked).
2. Add your API key in the options page (OpenAI, Gemini, or OpenRouter all work).
3. Start chatting! The extension will watch the conversation size.
4. When you get the warning, click "Continue in Fresh Chat". It will open a new chat, auto-paste the summary, and you're good to go.

💡 One common mistake: after you load or update the extension, don’t forget to refresh your open Claude or ChatGPT tabs! Otherwise, the background scripts won't be active in those tabs yet.

Let me know if you run into this lag issue, and feel free to check out the repo!
