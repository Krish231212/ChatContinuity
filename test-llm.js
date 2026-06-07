// ChatContinuity - LLM Diagnostic Test Script (Node-compatible)

// Define mock chrome global before loading modular scripts
global.chrome = {
  storage: {
    local: {
      get: (keys, callback) => {
        callback({
          cc_settings: {
            apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
            apiKey: "YOUR_API_KEY_HERE",
            autoPopup: true,
            model: "gemini-2.5-flash",
            thresholdMessages: 25,
            updateFrequency: 10
          }
        });
      }
    }
  }
};

async function run() {
  const { callOpenAI } = await import('./openai.js');
  const { SYSTEM_PROMPT_TEMPLATE, MEMORY_SCHEMA } = await import('./constants.js');

  const mockMessages = [
    {
      "content": "et's build a static website portfolio using HTML.\"",
      "role": "user"
    },
    {
      "content": "Great — we can build a clean static portfolio website using HTML (and optionally CSS later) step by step.\nA typical portfolio website structure looks like this:\nPortfolio Website│── index.html│── style.css│── images/\nSections we usually include\n\n\nHeader / Navigation Bar — name + menu\n\n\nHero Section — intro (\"Hi, I'm ...\")\n\n\nAbout Me — short bio\n\n\nSkills — technologies you know\n\n\nProjects — showcase work\n\n\nResume / Education\n\n\nContact Section\n\n\nFooter\n\n\nSince you said static website portfolio using HTML, we’ll start with pure HTML first and add styling later.\nHere’s the basic HTML structure for a portfolio:\nHTML<!DOCTYPE html><html lang=\"en\"><head>    <meta charset=\"UTF-8\">    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">    <title>My Portfolio</title></head><body>    <!-- Header -->    <header>        <h1>Your Name</h1>        <nav>            <a href=\"#about\">About</a>            <a href=\"#skills\">Skills</a>            <a href=\"#projects\">Projects</a>            <a href=\"#contact\">Contact</a>        </nav>    </header>    <!-- Hero Section -->    <section>        <h2>Hello, I'm Your Name</h2>        <p>Aspiring Web Developer | Java Programmer</p>    </section>    <!-- About -->    <section id=\"about\">        <h2>About Me</h2>        <p>            I am a passionate developer interested in coding and web development.        </p>    </section>    <!-- Skills -->    <section id=\"skills\">        <h2>Skills</h2>        <ul>            <li>Java</li>            <li>HTML</li>            <li>DSA</li>            <li>Problem Solving</li>        </ul>    </section>    <!-- Projects -->    <section id=\"projects\">        <h2>Projects</h2>        <article>            <h3>Portfolio Website</h3>            <p>A personal portfolio website using HTML.</p>        </article>        <article>            <h3>Java Project</h3>            <p>A Java-based application project.</p>        </article>    </section>    <!-- Contact -->    <section id=\"contact\">        <h2>Contact Me</h2>        <p>Email: yourmail@example.com</p>    </section>    <!-- Footer -->    <footer>        <p>© 2026 Your Name. All rights reserved.</p>    </footer></body></html>\nThis gives us a fully working static HTML portfolio.\nBefore we continue, choose a style:\n\n\nSimple Beginner Portfolio (easy, clean HTML)\n\n\nProfessional Developer Portfolio (modern layout)\n\n\nStudent Portfolio (best for placements/internships)\n\n\nAnimated Portfolio (with effects later using CSS/JS)\n\n\nSince you like coding and are preparing for placements, I’d suggest Student Portfolio with Projects + Skills + Resume + DSA/Coding profiles.",
      "role": "assistant"
    }
  ];

  console.log("Running ChatContinuity LLM Diagnostic...");
  
  const formattedChunk = mockMessages
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  const existingMemory = JSON.parse(JSON.stringify(MEMORY_SCHEMA));

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{existingMemory}', JSON.stringify(existingMemory, null, 2))
    .replace('{recentMessages}', formattedChunk);

  try {
    const response = await callOpenAI(
      [{ role: 'user', content: 'Generate updated project memory JSON based on the recent conversation chunk.' }],
      systemPrompt
    );
    console.log("\n--- LLM RAW RESPONSE ---");
    console.log(response);
    console.log("------------------------\n");

    let parsed = null;
    let cleaned = response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json\s*/i, '');
      cleaned = cleaned.replace(/^```\s*/, '');
      cleaned = cleaned.replace(/```$/, '');
      cleaned = cleaned.trim();
    }

    try {
      parsed = JSON.parse(cleaned);
      console.log("Successfully parsed JSON directly!");
      console.log(JSON.stringify(parsed, null, 2));
    } catch (err) {
      console.log("Direct JSON parse failed:", err.message);
      
      const startIdx = cleaned.indexOf('{');
      const endIdx = cleaned.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const jsonCandidate = cleaned.substring(startIdx, endIdx + 1);
        try {
          parsed = JSON.parse(jsonCandidate);
          console.log("Successfully parsed JSON via substring candidate extraction!");
          console.log(JSON.stringify(parsed, null, 2));
        } catch (subErr) {
          console.log("Substring JSON parse also failed:", subErr.message);
        }
      }
    }
  } catch (err) {
    console.error("Diagnostic execution error:", err);
  }
}

run();
