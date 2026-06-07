// Unit test for repairJSONStrings in summarizer.js
import { updateMemoryIncrementally } from './summarizer.js';

// We will extract and test the repairJSONStrings logic by running a test case
import fs from 'fs';

// Read summarizer.js content to extract and run the repairJSONStrings function
const summarizerCode = fs.readFileSync('./summarizer.js', 'utf8');

// Use a simple regex evaluation or just define the function locally for verification
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

const testCases = [
  // 1. Literal newlines
  `{
    "projectName": "Untitled Project",
    "goal": "Create a modern
developer resume website",
    "currentTask": "Discussing context"
  }`,
  // 2. Unescaped quotes
  `{
    "projectName": "ChatContinuity Extension",
    "goal": "Build a "great" chrome extension",
    "currentTask": "Gather requirements like "Next.js" or "Vite""
  }`,
  // 3. Mixed quotes, newlines, and trailing commas
  `{
    "projectName": "My "Epic" Project",
    "goal": "Learn Node.js
and React",
    "currentTask": "Discuss style preference: "Simple" or "Interactive"",
  }`
];

testCases.forEach((tc, idx) => {
  console.log(`\n--- Test Case ${idx + 1} ---`);
  console.log("Original:");
  console.log(tc);
  
  // Apply trailing comma fix as done in parseJSONContent
  let cleaned = tc.trim();
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  
  const repaired = repairJSONStrings(cleaned);
  console.log("Repaired:");
  console.log(repaired);
  
  try {
    const parsed = JSON.parse(repaired);
    console.log("✅ Parse SUCCESS!");
    console.log("Parsed Object:", parsed);
  } catch (err) {
    console.log("❌ Parse FAILED:", err.message);
  }
});
