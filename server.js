// server.js
import express from "express";
import { google } from "googleapis";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ✅ Gmail API setup
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const TOKEN_PATH = "token.json";
const CACHE_PATH = "cache.json";

// Load credentials
const credentials = JSON.parse(fs.readFileSync("credentials.json", "utf8"));
const { client_secret, client_id, redirect_uris } = credentials.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

// ✅ Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// ✅ Helpers
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

// ✅ Routes
app.get("/", (req, res) => {
  res.send(
    "🚀 Smart Inbox AI is running! Visit <a href='/auth'>/auth</a> to connect your Gmail account."
  );
});

app.get("/auth", (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  res.redirect(authUrl);
});

app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  res.send("✅ Gmail connected! You can close this tab now.");
});

// ✅ Analyze past 24 hours of emails (with batching + caching)
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

  // Fetch and store email details
  for (const m of messages) {
    if (cache[m.id]) {
      analyzedEmails.push(cache[m.id]);
      continue; // Skip cached ones
    }

    const msg = await gmail.users.messages.get({ userId: "me", id: m.id });
    const headers = msg.data.payload.headers;
    const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value || "(unknown sender)";
    const date = headers.find((h) => h.name === "Date")?.value || "(no date)";

    let body = "";
    if (msg.data.payload.parts) {
      body = msg.data.payload.parts
        .map((part) =>
          Buffer.from(part.body.data || "", "base64").toString("utf8")
        )
        .join("\n");
    } else if (msg.data.payload.body?.data) {
      body = Buffer.from(msg.data.payload.body.data, "base64").toString("utf8");
    }

    newEmails.push({
      id: m.id,
      from,
      subject,
      date,
      body: body.slice(0, 2000), // trim for safety
    });
  }

  // Batch emails (5 per request)
  const batchSize = 5;
  for (let i = 0; i < newEmails.length; i += batchSize) {
    const batch = newEmails.slice(i, i + batchSize);
    const prompt = `
You are an intelligent email organizer AI.
Analyze these emails and return a JSON array where each element has:
{
  "subject": "string",
  "category": "work priority" | "medium priority" | "low priority" | "promotions" | "spam",
  "urgency": "high" | "medium" | "low",
  "summary": "short 2-3 sentence summary"
}

Emails:
${batch.map(
  (e, idx) =>
    `${idx + 1}. From: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body}`
).join("\n\n")}
`;

    console.log(`🧠 Sending batch ${i / batchSize + 1} to Gemini...`);
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);

      parsed.forEach((p, idx) => {
        const email = { ...batch[idx], ...p };
        cache[batch[idx].id] = email;
        analyzedEmails.push(email);
      });
      saveCache(cache);
    } catch (err) {
      console.error("⚠️ Gemini batch error:", err.message);
    }

    // Wait 6 seconds between batches to avoid rate limit
    if (i + batchSize < newEmails.length) {
      console.log("⏳ Waiting 6 seconds to respect rate limits...");
      await delay(6000);
    }
  }

  // Sort by urgency
  const priorityOrder = { high: 1, medium: 2, low: 3 };
  analyzedEmails.sort((a, b) => priorityOrder[a.urgency] - priorityOrder[b.urgency]);

  res.json({
    message: `📅 Analyzed ${analyzedEmails.length} emails (last 24h). Cached: ${Object.keys(cache).length}.`,
    emails: analyzedEmails,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
