let allEmails = [];
let currentFilter = 'all';

async function loadEmails() {
  const container = document.getElementById("emailContainer");
  const refreshBtn = document.getElementById("refreshBtn");
  
  // Add loading state
  refreshBtn.classList.add('refreshing');
  container.innerHTML = `
    <div class="loading-card"></div>
    <div class="loading-card"></div>
    <div class="loading-card"></div>
  `;

  try {
    const res = await fetch("/analyze-day");
    const data = await res.json();

    if (!data.emails || data.emails.length === 0) {
      container.innerHTML = `
        <div class="col-span-full empty-state">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
          </svg>
          <h3>No emails found</h3>
          <p>No recent emails found in the last 24 hours.</p>
        </div>
      `;
      updateStats({ high: 0, medium: 0, low: 0, total: 0 });
      refreshBtn.classList.remove('refreshing');
      updateLastUpdated();
      return;
    }

    // Sort by urgency (high first)
    allEmails = data.emails.sort((a, b) => {
      const priority = { high: 1, medium: 2, low: 3 };
      return priority[a.urgency] - priority[b.urgency];
    });

    renderEmails(allEmails);
    updateStats(calculateStats(allEmails));
    updateLastUpdated();
    
  } catch (err) {
    container.innerHTML = `
      <div class="col-span-full empty-state">
        <svg class="text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <h3 class="text-red-600">Error Loading Emails</h3>
        <p class="text-gray-600">${err.message}</p>
        <button onclick="loadEmails()" class="mt-6 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all font-semibold">
          Try Again
        </button>
      </div>
    `;
  } finally {
    refreshBtn.classList.remove('refreshing');
  }
}

function renderEmails(emails) {
  const container = document.getElementById("emailContainer");
  
  if (emails.length === 0) {
    container.innerHTML = `
      <div class="col-span-full empty-state">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <h3>No matches found</h3>
        <p>Try adjusting your filters or search terms.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = emails
    .map((email, index) => {
      const urgencyClass = `urgency-${email.urgency}`;
      const avatarClass = `avatar-${email.urgency}`;
      
      // Get initials from sender
      const getInitials = (from) => {
        if (!from) return '?';
        const words = from.split(' ').filter(w => w.length > 0);
        if (words.length >= 2) {
          return (words[0][0]).toUpperCase();
        }
        return from.substring(0, 2).toUpperCase();
      };

      return `
        <div class="email-card ${urgencyClass}" style="animation-delay: ${index * 0.08}s" data-urgency="${email.urgency}" data-subject="${email.subject.toLowerCase()}" data-from="${(email.from || '').toLowerCase()}">
          <div class="email-header">
            <div class="sender-avatar ${avatarClass}">
              ${getInitials(email.from)}
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="email-subject">${email.subject}</h2>
              <p class="email-from">
                <strong>From:</strong> ${email.from || "Unknown sender"}
              </p>
              <p class="email-date">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                ${formatDate(email.date)}
              </p>
            </div>
          </div>

          <p class="email-summary">
            ${email.summary || "No summary available"}
          </p>

          <div class="email-badges">
            <span class="category-badge">
              ${email.category || "Uncategorized"}
            </span>
            <span class="urgency-badge ${urgencyClass}">
              ${email.urgency?.toUpperCase() || "LOW"}
            </span>
          </div>
        </div>
      `;
    })
    .join("");
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffMins = Math.floor(diffTime / (1000 * 60));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
}

function calculateStats(emails) {
  return {
    high: emails.filter(e => e.urgency === 'high').length,
    medium: emails.filter(e => e.urgency === 'medium').length,
    low: emails.filter(e => e.urgency === 'low').length,
    total: emails.length
  };
}

function updateStats(stats) {
  document.getElementById('highCount').textContent = stats.high;
  document.getElementById('mediumCount').textContent = stats.medium;
  document.getElementById('lowCount').textContent = stats.low;
  document.getElementById('totalCount').textContent = stats.total;
}

function updateLastUpdated() {
  const now = new Date();
  document.getElementById('lastUpdated').textContent = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function filterEmails(urgency) {
  currentFilter = urgency;
  
  // Update active filter button
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.filter === urgency) {
      btn.classList.add('active');
    }
  });

  const filtered = urgency === 'all' 
    ? allEmails 
    : allEmails.filter(e => e.urgency === urgency);
  
  renderEmails(filtered);
}

function searchEmails() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  
  let filtered = currentFilter === 'all'
    ? allEmails
    : allEmails.filter(e => e.urgency === currentFilter);
  
  if (searchTerm) {
    filtered = filtered.filter(email => 
      email.subject.toLowerCase().includes(searchTerm) ||
      (email.from && email.from.toLowerCase().includes(searchTerm)) ||
      (email.summary && email.summary.toLowerCase().includes(searchTerm)) ||
      (email.category && email.category.toLowerCase().includes(searchTerm))
    );
  }
  
  renderEmails(filtered);
}

function toggleView() {
  const container = document.getElementById('emailContainer');
  const button = document.getElementById('viewToggle');
  
  if (container.classList.contains('list-view')) {
    container.classList.remove('list-view');
    button.querySelector('span').textContent = 'Grid';
  } else {
    container.classList.add('list-view');
    button.querySelector('span').textContent = 'List';
  }
}

function refreshEmails() {
  loadEmails();
}

window.onload = loadEmails;
