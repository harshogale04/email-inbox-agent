// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌐 STATE MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let allEmails = [];
let currentFilter = 'all';
let currentEmailId = null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎨 UI HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function showLoading(text = "Processing...") {
    const overlay = document.getElementById("loadingOverlay");
    const loadingText = document.getElementById("loadingText");
    loadingText.textContent = text;
    overlay.style.display = "flex";
}

function hideLoading() {
    document.getElementById("loadingOverlay").style.display = "none";
}

function showToast(message, duration = 3000) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("active");
    
    setTimeout(() => {
        toast.classList.remove("active");
    }, duration);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getUrgencyClass(urgency) {
    const classes = {
        high: 'high',
        medium: 'medium',
        low: 'low'
    };
    return classes[urgency] || 'medium';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📧 EMAIL LOADING AND DISPLAY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function loadEmails() {
    const container = document.getElementById("emailContainer");
    container.innerHTML = `
        <div class="email-card" style="grid-column: 1/-1; text-align: center; padding: 60px;">
            <div class="loading-spinner" style="margin: 0 auto 20px;"></div>
            <h3>Loading your emails...</h3>
            <p style="color: var(--text-secondary); margin-top: 12px;">
                Analyzing with AI...
            </p>
        </div>
    `;

    try {
        const response = await fetch("/analyze-day");
        const data = await response.json();

        if (data.emails && data.emails.length > 0) {
            allEmails = data.emails;
            renderEmails();
            showToast(`✅ Loaded ${data.emails.length} emails`);
        } else {
            container.innerHTML = `
                <div class="email-card" style="grid-column: 1/-1; text-align: center; padding: 60px;">
                    <h3>📭 No emails found in the last 24 hours</h3>
                </div>
            `;
        }
    } catch (err) {
        container.innerHTML = `
            <div class="email-card" style="grid-column: 1/-1; text-align: center; padding: 60px;">
                <h3>❌ Error loading emails</h3>
                <p style="color: var(--text-secondary); margin-top: 12px;">${err.message}</p>
            </div>
        `;
    }
}

function renderEmails() {
    const container = document.getElementById("emailContainer");
    
    const filtered = currentFilter === 'all' 
        ? allEmails 
        : allEmails.filter(e => e.category === currentFilter);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="email-card" style="grid-column: 1/-1; text-align: center; padding: 60px;">
                <h3>📭 No emails match your filter</h3>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(email => `
        <div class="email-card" data-id="${email.id}" data-urgency="${email.urgency}">
            <div class="email-header">
                <div style="flex: 1;">
                    <div class="email-subject">${email.subject || '(no subject)'}</div>
                    <div class="email-from">${email.from || 'Unknown Sender'}</div>
                </div>
                <div class="email-badges">
                    <span class="badge ${getUrgencyClass(email.urgency)}">
                        ${email.urgency === 'high' ? '🔥' : email.urgency === 'medium' ? '⚡' : '📧'}
                        ${email.urgency.toUpperCase()}
                    </span>
                </div>
            </div>
            <div class="email-summary">
                ${email.summary || 'No summary available'}
            </div>
            <div style="margin-top: 12px; font-size: 0.85rem; color: var(--text-secondary);">
                📅 ${formatDate(email.date)}
            </div>
        </div>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.email-card').forEach(card => {
        card.addEventListener('click', () => {
            const emailId = card.dataset.id;
            if (emailId) {
                openEmailModal(emailId);
            }
        });
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 EMAIL MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function openEmailModal(emailId) {
    const email = allEmails.find(e => e.id === emailId);
    if (!email) return;

    currentEmailId = emailId;

    document.getElementById("modalSubject").textContent = email.subject || '(no subject)';
    document.getElementById("modalFrom").textContent = email.from || 'Unknown';
    document.getElementById("modalDate").textContent = formatDate(email.date);
    
    // Set badges
    const categoryBadge = document.getElementById("modalCategory");
    categoryBadge.textContent = email.category || 'Uncategorized';
    categoryBadge.className = 'badge medium';
    
    const urgencyBadge = document.getElementById("modalUrgency");
    urgencyBadge.textContent = email.urgency ? email.urgency.toUpperCase() : 'MEDIUM';
    urgencyBadge.className = `badge ${getUrgencyClass(email.urgency)}`;
    
    document.getElementById("modalSummary").textContent = email.summary || 'No summary available';
    document.getElementById("modalBody").textContent = email.body || 'No content';

    // Actions needed
    const actionsSection = document.getElementById("modalActionsSection");
    const actionsList = document.getElementById("modalActionsList");
    
    if (email.actions_needed && email.actions_needed.length > 0) {
        actionsSection.style.display = "block";
        actionsList.innerHTML = email.actions_needed
            .map(action => `<li>${action}</li>`)
            .join('');
    } else {
        actionsSection.style.display = "none";
    }

    // Reset sections
    document.getElementById("smartReplySection").style.display = "none";
    document.getElementById("threadSummarySection").style.display = "none";

    // Show modal
    document.getElementById("emailModal").classList.add("active");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💬 SMART REPLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function generateSmartReply() {
    showLoading("Generating smart replies...");

    try {
        const response = await fetch("/smart-reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emailId: currentEmailId })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById("replyQuick").textContent = data.replies.quick;
            document.getElementById("replyDetailed").textContent = data.replies.detailed;
            document.getElementById("replyAction").textContent = data.replies.action;
            
            document.getElementById("smartReplySection").style.display = "block";
            
            // Scroll to reply section
            document.getElementById("smartReplySection").scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest' 
            });
            
            showToast("✅ Smart replies generated!");
        } else {
            showToast("❌ Failed to generate replies");
        }
    } catch (err) {
        showToast("❌ Error: " + err.message);
    } finally {
        hideLoading();
    }
}

function useReply(type) {
    const replyText = document.getElementById(`reply${type.charAt(0).toUpperCase() + type.slice(1)}`).textContent;
    document.getElementById("replyEditor").value = replyText;
    
    // Scroll to editor
    document.querySelector('.reply-editor-section').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest' 
    });
}

async function sendReply() {
    const replyText = document.getElementById("replyEditor").value.trim();
    
    if (!replyText) {
        showToast("⚠️ Reply cannot be empty");
        return;
    }

    showLoading("Sending reply...");

    try {
        const response = await fetch("/send-reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                emailId: currentEmailId,
                replyText
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast("✅ Reply sent successfully!");
            document.getElementById("smartReplySection").style.display = "none";
            document.getElementById("replyEditor").value = "";
        } else {
            showToast("❌ Failed to send reply");
        }
    } catch (err) {
        showToast("❌ Error: " + err.message);
    } finally {
        hideLoading();
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🧵 THREAD SUMMARIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function summarizeThread() {
    const email = allEmails.find(e => e.id === currentEmailId);
    if (!email || !email.threadId) {
        showToast("⚠️ No thread information available");
        return;
    }

    showLoading("Summarizing thread...");

    try {
        const response = await fetch("/summarize-thread", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ threadId: email.threadId })
        });

        const data = await response.json();

        if (data.success) {
            const summary = data.summary;
            const content = `
                <div style="background: white; padding: 20px; border-radius: 8px;">
                    <h5><strong>📌 Topic:</strong> ${summary.topic}</h5>
                    
                    <h5 style="margin-top: 16px;"><strong>🔑 Key Points:</strong></h5>
                    <ul>
                        ${summary.key_points.map(point => `<li>${point}</li>`).join('')}
                    </ul>

                    ${summary.decisions && summary.decisions.length > 0 ? `
                        <h5 style="margin-top: 16px;"><strong>✅ Decisions:</strong></h5>
                        <ul>
                            ${summary.decisions.map(d => `<li>${d}</li>`).join('')}
                        </ul>
                    ` : ''}

                    ${summary.action_items && summary.action_items.length > 0 ? `
                        <h5 style="margin-top: 16px;"><strong>📋 Action Items:</strong></h5>
                        <ul>
                            ${summary.action_items.map(a => `<li>${a}</li>`).join('')}
                        </ul>
                    ` : ''}

                    <p style="margin-top: 16px;">
                        <strong>Status:</strong> 
                        <span class="badge ${summary.status === 'resolved' ? 'low' : 'medium'}">
                            ${summary.status ? summary.status.toUpperCase() : 'ONGOING'}
                        </span>
                    </p>

                    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 12px;">
                        📧 ${data.messageCount} messages in thread
                    </p>
                </div>
            `;

            document.getElementById("threadSummaryContent").innerHTML = content;
            document.getElementById("threadSummarySection").style.display = "block";
            
            // Scroll to summary
            document.getElementById("threadSummarySection").scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest' 
            });
            
            showToast("✅ Thread summarized!");
        } else {
            showToast("❌ Failed to summarize thread");
        }
    } catch (err) {
        showToast("❌ Error: " + err.message);
    } finally {
        hideLoading();
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📅 CALENDAR SYNC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function addToCalendar() {
    showLoading("Syncing to calendar...");

    try {
        const response = await fetch("/sync-priority-meetings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emailId: currentEmailId })
        });

        const data = await response.json();

        if (data.success) {
            showToast("✅ Event added to calendar!");
            if (data.eventLink) {
                setTimeout(() => {
                    window.open(data.eventLink, '_blank');
                }, 1000);
            }
        } else {
            showToast(data.message || "❌ No meeting information found");
        }
    } catch (err) {
        showToast("❌ Error: " + err.message);
    } finally {
        hideLoading();
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🧠 AGENTIC QUERY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function executeAgenticQuery() {
    const query = document.getElementById("agenticQuery").value.trim();
    
    if (!query) {
        showToast("⚠️ Please enter a query");
        return;
    }

    showLoading("Processing your request...");

    try {
        const response = await fetch("/agentic-query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query })
        });

        const data = await response.json();

        if (data.success) {
            const resultsDiv = document.getElementById("queryResults");
            
            let html = `
                <div style="background: white; padding: 20px; border-radius: 8px;">
                    <h4 style="margin-bottom: 12px;">🤖 Agent Response</h4>
                    <p style="margin: 12px 0; line-height: 1.6;">${data.analysis.action || 'Processing complete'}</p>
            `;

            if (data.executedActions && data.executedActions.length > 0) {
                html += `
                    <h5 style="margin-top: 16px; margin-bottom: 8px;">✅ Actions Executed:</h5>
                    <ul style="margin-left: 20px;">
                        ${data.executedActions.map(action => `
                            <li style="margin-bottom: 8px;">
                                <strong>${action.tool}</strong>: 
                                ${action.result.success ? '✅ Success' : '❌ Failed'}
                                ${action.result.error ? `<br><small style="color: var(--danger-color);">${action.result.error}</small>` : ''}
                            </li>
                        `).join('')}
                    </ul>
                `;
            }

            html += `</div>`;

            resultsDiv.innerHTML = html;
            resultsDiv.classList.add("active");
            showToast("✅ Query executed!");
        } else {
            showToast("❌ Failed to process query");
        }
    } catch (err) {
        showToast("❌ Error: " + err.message);
    } finally {
        hideLoading();
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 EVENT LISTENERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

document.addEventListener("DOMContentLoaded", () => {
    // Load emails on page load
    loadEmails();

    // Refresh button
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", loadEmails);
    }

    // Filter buttons
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentFilter = btn.dataset.filter;
            renderEmails();
        });
    });

    // Modal close button
    const closeModal = document.getElementById("closeModal");
    if (closeModal) {
        closeModal.addEventListener("click", () => {
            document.getElementById("emailModal").classList.remove("active");
        });
    }

    // Close modal on overlay click
    const emailModal = document.getElementById("emailModal");
    if (emailModal) {
        emailModal.addEventListener("click", (e) => {
            if (e.target.classList.contains("modal-overlay")) {
                emailModal.classList.remove("active");
            }
        });
    }

    // Smart reply button
    const smartReplyBtn = document.getElementById("smartReplyBtn");
    if (smartReplyBtn) {
        smartReplyBtn.addEventListener("click", generateSmartReply);
    }

    // Thread summary button
    const summarizeThreadBtn = document.getElementById("summarizeThreadBtn");
    if (summarizeThreadBtn) {
        summarizeThreadBtn.addEventListener("click", summarizeThread);
    }

    // Calendar sync button
    const addToCalendarBtn = document.getElementById("addToCalendarBtn");
    if (addToCalendarBtn) {
        addToCalendarBtn.addEventListener("click", addToCalendar);
    }

    // Use reply buttons (delegated event listener)
    document.addEventListener("click", (e) => {
        if (e.target.classList.contains("use-reply-btn")) {
            useReply(e.target.dataset.replyType);
        }
    });

    // Send reply button
    const sendReplyBtn = document.getElementById("sendReplyBtn");
    if (sendReplyBtn) {
        sendReplyBtn.addEventListener("click", sendReply);
    }

    // Cancel reply button
    const cancelReplyBtn = document.getElementById("cancelReplyBtn");
    if (cancelReplyBtn) {
        cancelReplyBtn.addEventListener("click", () => {
            document.getElementById("smartReplySection").style.display = "none";
            document.getElementById("replyEditor").value = "";
        });
    }

    // Agentic query button
    const executeQueryBtn = document.getElementById("executeQueryBtn");
    if (executeQueryBtn) {
        executeQueryBtn.addEventListener("click", executeAgenticQuery);
    }

    // Enter key for agentic query
    const agenticQuery = document.getElementById("agenticQuery");
    if (agenticQuery) {
        agenticQuery.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                executeAgenticQuery();
            }
        });
    }

    // View toggle buttons (if you want grid/list view switching)
    document.querySelectorAll(".view-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const view = btn.dataset.view;
            const container = document.getElementById("emailContainer");
            
            if (view === "list") {
                container.style.gridTemplateColumns = "1fr";
            } else {
                container.style.gridTemplateColumns = "repeat(auto-fill, minmax(350px, 1fr))";
            }
        });
    });
});
