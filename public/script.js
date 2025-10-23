async function loadEmails() {
  const container = document.getElementById("emailContainer");
  container.innerHTML = "<p class='text-center w-full text-gray-600'>⏳ Loading emails...</p>";

  try {
    const res = await fetch("/analyze-day");
    const data = await res.json();

    if (!data.emails || data.emails.length === 0) {
      container.innerHTML =
        "<p class='text-center text-gray-500'>No recent emails found in the last 24 hours.</p>";
      return;
    }

    // Sort by urgency (high first)
    const sortedEmails = data.emails.sort((a, b) => {
      const priority = { high: 1, medium: 2, low: 3 };
      return priority[a.urgency] - priority[b.urgency];
    });

    container.innerHTML = sortedEmails
      .map((email) => {
        const urgencyColor =
          email.urgency === "high"
            ? "border-red-500 bg-red-50"
            : email.urgency === "medium"
            ? "border-yellow-400 bg-yellow-50"
            : "border-green-500 bg-green-50";

        const urgencyTextColor =
          email.urgency === "high"
            ? "text-red-700"
            : email.urgency === "medium"
            ? "text-yellow-700"
            : "text-green-700";

        return `
          <div class="email-card border-l-4 ${urgencyColor} p-4 rounded shadow">
            <div class="flex justify-between items-center mb-2">
              <h2 class="font-semibold text-lg text-gray-800 line-clamp-2">${email.subject}</h2>
              <span class="text-xs text-gray-500">${new Date(email.date).toLocaleString()}</span>
            </div>

            <p class="text-sm text-gray-600 mb-2">
              <b>From:</b> ${email.from || "Unknown sender"}
            </p>

            <p class="text-sm text-gray-700 mb-3 line-clamp-3">
              ${email.summary || "(No summary available)"}
            </p>

            <div class="flex justify-between items-center text-xs mt-2">
              <span class="px-2 py-1 rounded bg-gray-200 text-gray-700 font-medium">
                ${email.category || "Uncategorized"}
              </span>

              <span class="px-2 py-1 rounded font-semibold ${urgencyTextColor}">
                ${email.urgency?.toUpperCase() || "LOW"}
              </span>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    container.innerHTML = `<p class='text-center text-red-500'>❌ Error loading emails: ${err.message}</p>`;
  }
}

function refreshEmails() {
  loadEmails();
}

window.onload = loadEmails;
