import express from "express";
import { google } from "googleapis";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🧠 HELPER FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Helper function to clean HTML from email body
function cleanEmailBody(html) {
  if (!html) return "";
  
  let text = html.replace(/<style[^>]*>.*?<\/style>/gis, "");
  text = text.replace(/<script[^>]*>.*?<\/script>/gis, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/\s+/g, " ");
  text = text.trim();
  
  return text;
}

// Helper function for action descriptions
function getActionDescription(toolName, args, result) {
  if (!result.success) {
    return "Action failed: " + (result.error || "Unknown error");
  }

  switch (toolName) {
    case "add_to_calendar":
      return "Added event '" + (args.summary || 'event') + "' to your Google Calendar";
    case "send_slack_notification":
      return "Sent notification to Slack";
    case "create_notion_task":
      return "Created task '" + (args.title || 'task') + "' in Notion";
    case "store_user_insight":
      return "Stored preference for future learning";
    default:
      return "Action completed successfully";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
];

const TOKEN_PATH = "token.json";
const CACHE_PATH = "cache.json";
const PREFERENCES_PATH = "user_preferences.json";

const credentials = JSON.parse(fs.readFileSync("credentials.json", "utf8"));
const { client_secret, client_id, redirect_uris } = credentials.web;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-flash-latest",
  generationConfig: {
    temperature: 0.7,
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛠️ TOOL DEFINITIONS FOR GEMINI FUNCTION CALLING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const tools = [
  {
    name: "add_to_calendar",
    description: "Add an event to Google Calendar when an email mentions a deadline, meeting, or scheduled event",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title/summary" },
        description: { type: "string", description: "Event description with email context" },
        start_time: { type: "string", description: "ISO 8601 format datetime (e.g., 2025-10-26T14:00:00+05:30)" },
        end_time: { type: "string", description: "ISO 8601 format datetime" },
        attendees: { type: "array", items: { type: "string" }, description: "Array of email addresses" }
      },
      required: ["summary", "start_time", "end_time"]
    }
  },
  {
    name: "send_slack_notification",
    description: "Send a notification to Slack when a high-priority email needs team attention",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to send to Slack" },
        priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority level" }
      },
      required: ["message", "priority"]
    }
  },
  {
    name: "create_notion_task",
    description: "Create a task in Notion for action items mentioned in emails",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
        priority: { type: "string", enum: ["high", "medium", "low"] }
      },
      required: ["title"]
    }
  },
  {
    name: "store_user_insight",
    description: "Store insights about user preferences to learn their email patterns",
    parameters: {
      type: "object",
      properties: {
        insight_type: { type: "string", enum: ["sender_priority", "keyword_importance", "time_preference", "action_pattern"] },
        data: { type: "object", description: "Key-value pairs of insight data" }
      },
      required: ["insight_type", "data"]
    }
  }
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 TOOL IMPLEMENTATION FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function addToGoogleCalendar({ summary, description, start_time, end_time, attendees = [] }) {
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(tokens);
    
    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
    
    const event = {
      summary,
      description,
      start: { dateTime: start_time, timeZone: "Asia/Kolkata" },
      end: { dateTime: end_time, timeZone: "Asia/Kolkata" },
      attendees: attendees.map(email => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 30 },
        ],
      },
    };

    const result = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    console.log(`✅ Calendar event created: ${result.data.htmlLink}`);
    return { success: true, eventId: result.data.id, link: result.data.htmlLink };
  } catch (error) {
    console.error("❌ Calendar error:", error.message);
    return { success: false, error: error.message };
  }
}

async function sendSlackNotification({ message, priority }) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    console.log("⚠️ Slack webhook not configured");
    return { success: false, error: "Webhook not configured" };
  }

  try {
    const color = priority === "high" ? "#ff0000" : priority === "medium" ? "#ffa500" : "#00ff00";
    
    await axios.post(process.env.SLACK_WEBHOOK_URL, {
      attachments: [{
        color,
        text: message,
        footer: "Email Inbox Agent",
        ts: Math.floor(Date.now() / 1000)
      }]
    });

    console.log("✅ Slack notification sent");
    return { success: true };
  } catch (error) {
    console.error("❌ Slack error:", error.message);
    return { success: false, error: error.message };
  }
}

async function createNotionTask({ title, description, due_date, priority = "medium" }) {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    console.log("⚠️ Notion not configured");
    return { success: false, error: "Notion not configured" };
  }

  try {
    const response = await axios.post(
      "https://api.notion.com/v1/pages",
      {
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          Name: { title: [{ text: { content: title } }] },
          Priority: { select: { name: priority.charAt(0).toUpperCase() + priority.slice(1) } },
          ...(due_date && { "Due Date": { date: { start: due_date } } }),
          ...(description && { Description: { rich_text: [{ text: { content: description } }] } })
        }
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Notion task created");
    return { success: true, pageId: response.data.id };
  } catch (error) {
    console.error("❌ Notion error:", error.message);
    return { success: false, error: error.message };
  }
}

function storeUserInsight({ insight_type, data }) {
  try {
    let preferences = {};
    if (fs.existsSync(PREFERENCES_PATH)) {
      preferences = JSON.parse(fs.readFileSync(PREFERENCES_PATH, "utf8"));
    }

    if (!preferences[insight_type]) {
      preferences[insight_type] = [];
    }

    preferences[insight_type].push({
      ...data,
      timestamp: new Date().toISOString()
    });

    fs.writeFileSync(PREFERENCES_PATH, JSON.stringify(preferences, null, 2));
    console.log(`✅ Stored insight: ${insight_type}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Insight storage error:", error.message);
    return { success: false, error: error.message };
  }
}

async function executeToolCall(toolCall) {
  const { name, args } = toolCall;
  
  switch (name) {
    case "add_to_calendar":
      return await addToGoogleCalendar(args);
    case "send_slack_notification":
      return await sendSlackNotification(args);
    case "create_notion_task":
      return await createNotionTask(args);
    case "store_user_insight":
      return storeUserInsight(args);
    default:
      return { success: false, error: "Unknown tool" };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getGmailClient() {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  oAuth2Client.setCredentials(tokens);
  return google.gmail({ version: "v1", auth: oAuth2Client });
}

function getPast24HoursQuery() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const formatted = date.toISOString().split("T")[0];
  return `after:${formatted}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌐 ROUTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get("/", (req, res) => {
  res.send("🚀 Agentic Email Inbox AI is running! Visit /auth to connect.");
});

app.get("/auth", (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent"
  });
  res.redirect(authUrl);
});

app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  res.redirect("http://localhost:3000");
});

app.get("/analyze-day", async (req, res) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    return res.status(401).send("Not authenticated. Visit /auth first.");
  }

  const gmail = getGmailClient();
  const query = getPast24HoursQuery();
  const response = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 20,
  });

  const messages = response.data.messages || [];
  if (messages.length === 0) {
    return res.json({ message: "📭 No emails found in the past 24 hours." });
  }

  const cache = loadCache();
  const newEmails = [];
  const analyzedEmails = [];

  for (const m of messages) {
    if (cache[m.id]) {
      analyzedEmails.push(cache[m.id]);
      continue;
    }

    const msg = await gmail.users.messages.get({ userId: "me", id: m.id });
    const headers = msg.data.payload.headers;
    const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value || "(unknown sender)";
    const date = headers.find((h) => h.name === "Date")?.value || "(no date)";
    
    let body = "";
    if (msg.data.payload.parts) {
      body = msg.data.payload.parts
        .map((part) => Buffer.from(part.body.data || "", "base64").toString("utf8"))
        .join("\n");
    } else if (msg.data.payload.body?.data) {
      body = Buffer.from(msg.data.payload.body.data, "base64").toString("utf8");
    }

    const cleanedBody = cleanEmailBody(body);

    newEmails.push({
      id: m.id,
      from,
      subject,
      date,
      body: cleanedBody.slice(0, 3000),
      threadId: msg.data.threadId
    });
  }

  const batchSize = 3;
  
  for (let i = 0; i < newEmails.length; i += batchSize) {
    const batch = newEmails.slice(i, i + batchSize);
    
    const prompt = `You are an intelligent email agent with access to tools.

Analyze these emails and:
1. Categorize and summarize them
2. Identify actionable items (deadlines, meetings, tasks)
3. Use tools when appropriate

Emails to analyze:
${batch.map((e, idx) => `
${idx + 1}. From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Body: ${e.body}
`).join("\n")}

For each email, respond with JSON:
{
  "subject": "string",
  "category": "work priority" | "medium priority" | "low priority" | "promotions" | "spam",
  "urgency": "high" | "medium" | "low",
  "summary": "2-3 sentence summary",
  "actions_needed": ["list of actions"]
}

Respond ONLY with a JSON array.`;

    try {
      const chat = model.startChat({
        tools: [{ functionDeclarations: tools }],
        history: []
      });

      const result = await chat.sendMessage(prompt);
      const response = result.response;
      
      const functionCalls = response.functionCalls();
      
      if (functionCalls && functionCalls.length > 0) {
        console.log(`🛠️ Executing ${functionCalls.length} tool calls...`);
        
        for (const fc of functionCalls) {
          const toolResult = await executeToolCall({
            name: fc.name,
            args: fc.args
          });
          console.log(`✅ ${fc.name}:`, toolResult);
        }
      }

      const text = response.text();
let cleaned = text.replace(/``````/g, "").trim();

// Try to extract JSON array
const match = cleaned.match(/\[[\s\S]*\]/);

let parsed;
if (match) {
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    console.warn("⚠️ JSON parse failed, using fallback");
    parsed = null;
  }
} else {
  console.warn("⚠️ No JSON array found in response");
  parsed = null;
}

// If parsing failed, use the fallback below (already in your code)
if (!parsed) {
  throw new Error("Failed to parse AI response");
}


      parsed.forEach((p, idx) => {
        const email = { ...batch[idx], ...p };
        cache[batch[idx].id] = email;
        analyzedEmails.push(email);
      });

      saveCache(cache);
      
      if (i + batchSize < newEmails.length) {
        await delay(3000);
      }

    } catch (err) {
  console.log("ℹ️ Using fallback analysis (agent took actions)");
  
  batch.forEach((e) => {
    // Generate intelligent summary from email content
    let summary = "";
    let urgency = "medium";
    let category = "medium priority";
    
    // Check subject for urgency keywords
    const subjectLower = (e.subject || "").toLowerCase();
    if (subjectLower.includes("urgent") || subjectLower.includes("asap") || 
        subjectLower.includes("deadline") || subjectLower.includes("important")) {
      urgency = "high";
      category = "work priority";
    } else if (subjectLower.includes("fwd:") || subjectLower.includes("re:")) {
      urgency = "medium";
      category = "medium priority";
    } else if (subjectLower.includes("promotional") || subjectLower.includes("offer")) {
      urgency = "low";
      category = "promotions";
    }
    
    // Generate summary from body content
    if (e.body && e.body.length > 50) {
      // Take first meaningful sentence or 200 chars
      summary = e.body.slice(0, 200).trim();
      // Add ellipsis if truncated
      if (e.body.length > 200) {
        summary += "...";
      }
    } else {
      // Fallback to subject-based summary
      summary = "Email regarding: " + (e.subject || "communication from " + e.from);
    }
    
    const email = {
      ...e,
      category,
      urgency,
      summary,
      actions_needed: ["Review email content"]
    };
    
    cache[e.id] = email;
    analyzedEmails.push(email);
  });
  
  saveCache(cache);
}

  }

  const priorityOrder = { high: 1, medium: 2, low: 3 };
  analyzedEmails.sort((a, b) => priorityOrder[a.urgency] - priorityOrder[b.urgency]);

  res.json({
    message: `📅 Analyzed ${analyzedEmails.length} emails with agentic AI`,
    emails: analyzedEmails,
  });
});

app.post("/smart-reply", async (req, res) => {
  const { emailId, tone = "professional" } = req.body;
  const cache = loadCache();
  const email = cache[emailId];
  
  if (!email) {
    return res.status(404).json({ error: "Email not found" });
  }

  try {
    const prompt = `Generate a smart email reply based on:

From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}
Urgency: ${email.urgency}

Generate 3 reply options:
1. Quick acknowledgment (1-2 sentences)
2. Detailed response (3-4 sentences)
3. Action-oriented response (with next steps)

Tone: ${tone}

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "quick": "...",
  "detailed": "...",
  "action": "..."
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    let cleaned = text.replace(/``````/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    const replies = JSON.parse(jsonMatch[0]);

    res.json({
      success: true,
      emailId,
      replies,
    });

  } catch (error) {
    console.error("Smart reply error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/send-reply", async (req, res) => {
  const { emailId, replyText } = req.body;
  const cache = loadCache();
  const email = cache[emailId];
  
  if (!email) {
    return res.status(404).json({ error: "Email not found" });
  }

  try {
    const gmail = getGmailClient();
    const toEmail = email.from.match(/<(.+)>/)?.[1] || email.from;
    
    const message = [
      `To: ${toEmail}`,
      `Subject: Re: ${email.subject}`,
      `In-Reply-To: ${emailId}`,
      `References: ${emailId}`,
      "",
      replyText
    ].join("\n");

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
        threadId: email.threadId
      }
    });

    res.json({ success: true, message: "Reply sent successfully" });

  } catch (error) {
    console.error("❌ Send reply error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/summarize-thread", async (req, res) => {
  const { threadId } = req.body;

  try {
    const gmail = getGmailClient();
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId
    });

    const messages = thread.data.messages || [];
    
    const conversationText = messages.map((msg, idx) => {
      const headers = msg.payload.headers;
      const from = headers.find(h => h.name === "From")?.value || "Unknown";
      const date = headers.find(h => h.name === "Date")?.value || "";
      
      let body = "";
      if (msg.payload.parts) {
        body = msg.payload.parts
          .map(part => Buffer.from(part.body.data || "", "base64").toString("utf8"))
          .join("\n");
      } else if (msg.payload.body?.data) {
        body = Buffer.from(msg.payload.body.data, "base64").toString("utf8");
      }

      return `Message ${idx + 1} (${date}):\nFrom: ${from}\n${body.slice(0, 1000)}`;
    }).join("\n\n---\n\n");

    const prompt = `Summarize this email thread conversation:

${conversationText}

Provide:
1. Main topic/subject
2. Key points discussed
3. Decisions made
4. Action items
5. Current status

Format as JSON:
{
  "topic": "...",
  "key_points": ["...", "..."],
  "decisions": ["..."],
  "action_items": ["..."],
  "status": "ongoing|resolved|waiting"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/``````/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const summary = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);

    res.json({
      success: true,
      threadId,
      messageCount: messages.length,
      summary
    });

  } catch (error) {
    console.error("❌ Thread summary error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/sync-priority-meetings", async (req, res) => {
  const { emailId } = req.body;
  const cache = loadCache();
  const email = cache[emailId];
  
  if (!email || email.urgency !== "high") {
    return res.status(400).json({ error: "Only high-priority emails with meeting info" });
  }

  try {
    const prompt = `Extract meeting/calendar information from this email:

Subject: ${email.subject}
Body: ${email.body}

If this email contains a meeting invitation or deadline, extract:
- Event title
- Date and time
- Duration
- Participants

Respond with JSON:
{
  "has_event": true/false,
  "title": "...",
  "start": "ISO 8601 datetime",
  "end": "ISO 8601 datetime",
  "attendees": ["email1", "email2"]
}

If no event found, set has_event to false.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/``````/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const eventData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(cleaned);

    if (!eventData.has_event) {
      return res.json({ success: false, message: "No meeting information found" });
    }

    const calendarResult = await addToGoogleCalendar({
      summary: eventData.title,
      description: `Auto-synced from email: ${email.subject}\n\nFrom: ${email.from}`,
      start_time: eventData.start,
      end_time: eventData.end,
      attendees: eventData.attendees || []
    });

    res.json({
      success: calendarResult.success,
      eventLink: calendarResult.link,
      eventData
    });

  } catch (error) {
    console.error("❌ Calendar sync error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/agentic-query", async (req, res) => {
  const { query } = req.body;
  const cache = loadCache();
  const allEmails = Object.values(cache);

  try {
    const emailSummaries = allEmails.slice(0, 10).map((e, idx) => 
      "Email " + (idx + 1) + ": From " + e.from + ", Subject: " + e.subject + ", Priority: " + e.urgency
    ).join("\n");

    const prompt = "User question: " + query + "\n\nRecent emails:\n" + emailSummaries + 
      "\n\nProvide a clear, natural language answer to the user's question. " +
      "Do NOT use JSON format or asterisks. " +
      "Write like you're talking to a person. " +
      "Be concise and helpful.";

    const chat = model.startChat({
      tools: [{ functionDeclarations: tools }],
      history: []
    });

    const result = await chat.sendMessage(prompt);
    const response = result.response;
    
    let answerText = response.text();
    answerText = answerText.replace(/\*\*/g, "");
    answerText = answerText.replace(/\*/g, "");
    answerText = answerText.replace(/##/g, "");
    answerText = answerText.trim();
    
    const functionCalls = response.functionCalls();
    const executedActions = [];
    
    if (functionCalls && functionCalls.length > 0) {
      for (const fc of functionCalls) {
        const toolResult = await executeToolCall({
          name: fc.name,
          args: fc.args
        });
        executedActions.push({
          tool: fc.name,
          result: toolResult,
          description: getActionDescription(fc.name, fc.args, toolResult)
        });
      }
    }

    res.json({
      success: true,
      query,
      analysis: {
        action: answerText || "I've processed your request."
      },
      executedActions
    });

  } catch (error) {
    console.error("Agentic query error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 START SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.listen(PORT, () => {
  console.log(`🚀 Agentic Email Agent running on http://localhost:${PORT}`);
  console.log(`📧 Gmail integration: Ready`);
  console.log(`📅 Calendar sync: ${SCOPES.includes("https://www.googleapis.com/auth/calendar") ? "Enabled" : "Disabled"}`);
  console.log(`💬 Slack: ${process.env.SLACK_WEBHOOK_URL ? "Configured" : "Not configured"}`);
  console.log(`📝 Notion: ${process.env.NOTION_API_KEY ? "Configured" : "Not configured"}`);
});
