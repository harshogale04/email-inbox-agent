# 📧 Email Inbox Agent (with Chrome Extension + Gmail Integration)

### 🧠 Overview

**Email Inbox Agent** is a Chrome Extension + Node.js-powered backend that connects securely to your Gmail, fetches your latest emails (past 24 hours), and summarizes key insights instantly — all using AI.

It helps users quickly understand their daily email activity without opening the Gmail interface, saving time and improving productivity.

---

### 🚀 Features

* 🔐 **Secure Gmail Authentication** using OAuth2
* 📥 **Fetches last 24 hours of emails** automatically
* 🤖 **Summarizes emails** using Gemini AI
* 💬 **Displays summaries directly in the extension popup**
* ⚡ **Real-time and local-first** — works instantly after login
* 🌐 **Built for scalability** — can be extended to include labeling, sentiment analysis, or task extraction

---

### 🏗️ Tech Stack

**Frontend (Extension):**

* HTML, CSS, JavaScript
* Chrome Extension Manifest v3

**Backend:**

* Node.js + Express.js
* Gmail API (Google Cloud Console)

**Other:**

* OAuth2 Authentication
* RESTful Architecture
* Localhost testing + GitHub hosted source

---

### 📸 Workflow

1. **User installs the Chrome Extension**
2. **On first use, signs in with their Gmail account**
3. **Backend (server.js)** handles OAuth and fetches last 24 hours of emails
4. **AI (Gemini)** processes and summarizes the content
5. **Results displayed instantly** in the extension popup

---

### 🧩 Project Structure

```
email-inbox-agent/
│
├── extension/            # Chrome Extension files (popup.html, popup.js, manifest.json)
├── public/               # Static assets served by backend
├── server.js             # Main backend entry point
├── gemini.js             # (ignored) AI logic
├── listModels.js         # (ignored) Gemini model listing
├── package.json          # Dependencies & scripts
└── .gitignore            # Sensitive files excluded
```

---

### ⚙️ Setup Instructions

#### 1️⃣ Clone the repo

```bash
git clone https://github.com/harshogale04/email-inbox-agent.git
cd email-inbox-agent
```

#### 2️⃣ Install dependencies

```bash
npm install
```

#### 3️⃣ Add environment variables

Create a `.env` file:

```
CLIENT_ID=your_google_client_id
CLIENT_SECRET=your_google_client_secret
REDIRECT_URI=http://localhost:3000/oauth2callback
SESSION_SECRET=your_secret_key
```

#### 4️⃣ Run locally

```bash
node server.js
```

#### 5️⃣ Load the Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `/extension` folder
4. Use the extension — authenticate, and view summarized emails!

---


