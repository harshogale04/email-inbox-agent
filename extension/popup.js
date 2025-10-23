const connectBtn = document.getElementById("connect");
const analyzeBtn = document.getElementById("analyze");
const statusDiv = document.getElementById("status");
const resultsDiv = document.getElementById("results");

let checkingInterval = null;

connectBtn.addEventListener("click", () => {
  statusDiv.textContent = "🔗 Connecting to Gmail...";
  connectBtn.disabled = true;

  // Step 1: Open Gmail auth in new tab
  chrome.tabs.create({ url: "http://localhost:3000/auth" }, () => {
    statusDiv.textContent = "🧭 Waiting for Gmail authentication...";
  });

  // Step 2: Start checking for the OAuth completion
  checkingInterval = setInterval(() => {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url && tab.url.includes("localhost:3000/oauth2callback")) {
          clearInterval(checkingInterval);
          statusDiv.textContent = "✅ Gmail connected! Opening dashboard...";
          connectBtn.disabled = false;
          analyzeBtn.disabled = false;

          // Step 3: Open dashboard automatically
          chrome.tabs.create({ url: "http://localhost:3000" });
          return;
        }
      }
    });
  }, 3000);
});

// Analyze emails (same as before)
analyzeBtn.addEventListener("click", async () => {
  statusDiv.textContent = "🧠 Analyzing emails from the last 24 hours...";
  analyzeBtn.disabled = true;

  try {
    const res = await fetch("http://localhost:3000/analyze-day");
    const data = await res.json();

    resultsDiv.innerHTML = "";
    if (data.emails && data.emails.length > 0) {
      data.emails.forEach((email) => {
        const card = document.createElement("div");
        card.className = `email-card urgency-${email.urgency}`;
        card.innerHTML = `
          <h3>${email.subject}</h3>
          <p><strong>From:</strong> ${email.from}</p>
          <p><strong>Category:</strong> ${email.category}</p>
          <p><strong>Urgency:</strong> ${email.urgency}</p>
          <p class="summary">${email.summary}</p>
        `;
        resultsDiv.appendChild(card);
      });
      statusDiv.textContent = "✅ Analysis complete!";
    } else {
      resultsDiv.innerHTML = `<p>${data.message}</p>`;
      statusDiv.textContent = "📭 No emails found in the last 24 hours.";
    }
  } catch (error) {
    console.error(error);
    statusDiv.textContent = "⚠️ Error analyzing emails. Check server logs.";
  } finally {
    analyzeBtn.disabled = false;
  }
});
