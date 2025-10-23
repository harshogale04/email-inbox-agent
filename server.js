// server.js
import express from "express";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ES Module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static files from public directory with absolute path
app.use(express.static(path.join(__dirname, "public")));

// Gmail API setup
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

// Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// Rate limiting tracker
const rateLimitTracker = {
  lastRequestTime: Date.now(),
  requestCount: 0,
};

// Helpers
function getGmailClient() {
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(tokens);
    return google.gmail({ version: "v1", auth: oAuth2Client });
  } catch (error) {
    throw new Error("Failed to load Gmail credentials. Please authenticate first.");
  }
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
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch (error) {
    console.error("⚠️ Cache file corrupted, starting fresh.");
    return {};
  }
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error("⚠️ Failed to save cache:", error.message);
  }
}

// Enhanced rate limit handler with exponential backoff
async function handleRateLimit(attempt = 1) {
  const maxAttempts = 3;
  const baseDelay = 2000;
  
  if (attempt > maxAttempts) {
    throw new Error("Max retry attempts reached");
  }
  
  const delayTime = baseDelay * Math.pow(2, attempt - 1);
  console.log(`⏳ Rate limit - waiting ${delayTime}ms (attempt ${attempt}/${maxAttempts})`);
  await delay(delayTime);
}

// Extract email body helper
function extractEmailBody(payload) {
  let body = "";
  
  if (payload.parts) {
    // Multipart email
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" || part.mimeType === "text/html") {
        if (part.body?.data) {
          body += Buffer.from(part.body.data, "base64").toString("utf8");
        }
      }
      // Recursively check nested parts
      if (part.parts) {
        body += extractEmailBody(part);
      }
    }
  } else if (payload.body?.data) {
    // Simple email
    body = Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  
  // Clean up HTML tags and extra whitespace
  body = body.replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
  
  return body.slice(0, 2000); // Limit for safety
}

// Routes

// Enhanced root route - serves the dashboard
app.get("/", (req, res) => {
  const isAuthenticated = fs.existsSync(TOKEN_PATH);
  
  if (!isAuthenticated) {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Smart Email Inbox - Setup</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen flex items-center justify-center p-4">
          <div class="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div class="mb-6">
              <div class="mx-auto w-20 h-20 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mb-4">
                <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <h1 class="text-3xl font-bold text-gray-800 mb-2">Smart Email Inbox</h1>
              <p class="text-gray-600">AI-Powered Email Analysis Dashboard</p>
            </div>
            
            <div class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p class="text-sm text-yellow-800">
                <strong>⚠️ Authentication Required</strong><br>
                Please connect your Gmail account to get started.
              </p>
            </div>
            
            <a href="/auth" class="inline-block w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:-translate-y-1 hover:shadow-lg">
              🔐 Connect Gmail Account
            </a>
            
            <div class="mt-6 text-xs text-gray-500">
              <p>Your data is processed securely and never stored permanently.</p>
            </div>
          </div>
        </body>
      </html>
    `);
  } else {
    // Serve the main dashboard
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

app.get("/auth", (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force consent screen to get refresh token
  });
  res.redirect(authUrl);
});

app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Authentication Error</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gradient-to-br from-red-50 to-red-100 min-h-screen flex items-center justify-center p-4">
          <div class="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div class="text-red-600 text-5xl mb-4">❌</div>
            <h1 class="text-2xl font-bold text-gray-800 mb-2">Authentication Failed</h1>
            <p class="text-gray-600 mb-6">No authorization code received.</p>
            <a href="/" class="inline-block bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition-all">
              Try Again
            </a>
          </div>
        </body>
      </html>
    `);
  }
  
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Connected Successfully</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gradient-to-br from-green-50 to-green-100 min-h-screen flex items-center justify-center p-4">
          <div class="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div class="text-green-600 text-5xl mb-4">✅</div>
            <h1 class="text-2xl font-bold text-gray-800 mb-2">Successfully Connected!</h1>
            <p class="text-gray-600 mb-6">Your Gmail account has been connected successfully.</p>
            <a href="/" class="inline-block bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-all">
              Go to Dashboard
            </a>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("❌ OAuth error:", error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Authentication Error</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gradient-to-br from-red-50 to-red-100 min-h-screen flex items-center justify-center p-4">
          <div class="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div class="text-red-600 text-5xl mb-4">❌</div>
            <h1 class="text-2xl font-bold text-gray-800 mb-2">Authentication Error</h1>
            <p class="text-gray-600 mb-6">${error.message}</p>
            <a href="/" class="inline-block bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition-all">
              Try Again
            </a>
          </div>
        </body>
      </html>
    `);
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  const status = {
    status: "OK",
    timestamp: new Date().toISOString(),
    authenticated: fs.existsSync(TOKEN_PATH),
    cacheSize: Object.keys(loadCache()).length,
  };
  res.json(status);
});

// Clear cache endpoint
app.post("/clear-cache", (req, res) => {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      fs.unlinkSync(CACHE_PATH);
    }
    res.json({ message: "✅ Cache cleared successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear cache" });
  }
});

// Analyze past 24 hours of emails (Enhanced with better error handling)
app.get("/analyze-day", async (req, res) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    return res.status(401).json({ 
      error: "Not authenticated",
      message: "Please visit /auth to connect your Gmail account first.",
    });
  }

  let gmail;
  try {
    gmail = getGmailClient();
  } catch (error) {
    return res.status(401).json({
      error: "Authentication failed",
      message: error.message,
    });
  }

  const query = getPast24HoursQuery();
  let attempt = 1;
  const maxAttempts = 3;

  while (attempt <= maxAttempts) {
    try {
      console.log(`📥 Fetching emails (attempt ${attempt}/${maxAttempts})...`);
      
      const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 20,
      });

      const messages = response.data.messages || [];
      
      if (messages.length === 0) {
        return res.json({ 
          message: "📭 No emails found in the past 24 hours.",
          emails: [],
        });
      }

      const cache = loadCache();
      const newEmails = [];
      const analyzedEmails = [];

      // Fetch and store email details
      for (const m of messages) {
        if (cache[m.id]) {
          analyzedEmails.push(cache[m.id]);
          continue;
        }

        try {
          const msg = await gmail.users.messages.get({ 
            userId: "me", 
            id: m.id,
            format: "full",
          });
          
          const headers = msg.data.payload.headers;
          const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
          const from = headers.find((h) => h.name === "From")?.value || "(unknown sender)";
          const date = headers.find((h) => h.name === "Date")?.value || new Date().toISOString();

          const body = extractEmailBody(msg.data.payload);

          newEmails.push({
            id: m.id,
            from,
            subject,
            date,
            body,
          });
          
          // Small delay to respect rate limits
          await delay(100);
        } catch (error) {
          console.error(`⚠️ Error fetching email ${m.id}:`, error.message);
        }
      }

      console.log(`✅ Fetched ${messages.length} emails (${newEmails.length} new, ${analyzedEmails.length} cached)`);

      // Batch emails for AI analysis
      const batchSize = 5;
      for (let i = 0; i < newEmails.length; i += batchSize) {
        const batch = newEmails.slice(i, i + batchSize);
        const prompt = `
You are an intelligent email organizer AI.
Analyze these emails and return a JSON array where each element has:
{
  "subject": "string",
  "category": "Work" | "Personal" | "Promotions" | "Social" | "Updates" | "Spam",
  "urgency": "high" | "medium" | "low",
  "summary": "short 2-3 sentence summary"
}

Classification guidelines:
- HIGH urgency: Action required, time-sensitive, important meetings, deadlines
- MEDIUM urgency: Informational but relevant, follow-ups, non-urgent requests
- LOW urgency: Newsletters, promotions, social updates, FYI emails

Emails:
${batch.map((e, idx) => `${idx + 1}. From: ${e.from}\nSubject: ${e.subject}\nBody: ${e.body}`).join("\n\n")}

Return ONLY valid JSON array, no markdown formatting.`;

        console.log(`🧠 Analyzing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(newEmails.length / batchSize)}...`);
        
        try {
          const result = await model.generateContent(prompt);
          const text = result.response.text().replace(/``````/g, "").trim();
          const parsed = JSON.parse(text);

          parsed.forEach((p, idx) => {
            const email = { ...batch[idx], ...p };
            cache[batch[idx].id] = email;
            analyzedEmails.push(email);
          });
          
          saveCache(cache);
          console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} analyzed successfully`);
        } catch (err) {
          console.error("⚠️ Gemini batch error:", err.message);
          
          // Add unanalyzed emails with default values
          batch.forEach((email) => {
            const defaultEmail = {
              ...email,
              category: "Uncategorized",
              urgency: "medium",
              summary: "Unable to analyze this email automatically.",
            };
            cache[email.id] = defaultEmail;
            analyzedEmails.push(defaultEmail);
          });
          saveCache(cache);
        }

        // Wait between batches to respect rate limits
        if (i + batchSize < newEmails.length) {
          console.log("⏳ Waiting 6 seconds to respect rate limits...");
          await delay(6000);
        }
      }

      // Sort by urgency
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      analyzedEmails.sort((a, b) => priorityOrder[a.urgency] - priorityOrder[b.urgency]);

      return res.json({
        message: `📅 Analyzed ${analyzedEmails.length} emails from the last 24 hours.`,
        emails: analyzedEmails,
        stats: {
          total: analyzedEmails.length,
          cached: Object.keys(cache).length,
          newlyAnalyzed: newEmails.length,
        },
      });

    } catch (error) {
      console.error(`❌ Error (attempt ${attempt}):`, error.message);
      
      // Handle rate limit errors
      if (error.code === 429 || error.message.includes("rate")) {
        if (attempt < maxAttempts) {
          await handleRateLimit(attempt);
          attempt++;
          continue;
        }
      }
      
      // Other errors
      return res.status(500).json({
        error: "Failed to analyze emails",
        message: error.message,
        details: "Please try again in a few moments.",
      });
    }
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.url} not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Smart Email Inbox Server`);
  console.log(`📍 Running on http://localhost:${PORT}`);
  console.log(`🔐 Authentication: ${fs.existsSync(TOKEN_PATH) ? "✅ Connected" : "⚠️ Not connected"}`);
  console.log(`💾 Cache: ${Object.keys(loadCache()).length} emails cached\n`);
});
