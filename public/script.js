let allEmails = [];
let currentFilter = 'all';

async function loadEmails() {
  const container = document.getElementById("emailContainer");
  container.innerHTML = `
    <div class="col-span-full flex flex-col items-center justify-center py-20">
      <div class="relative">
        <div class="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
      <p class="mt-6 text-gray-700 font-semibold text-lg">Loading your emails...</p>
      <p class="mt-2 text-gray-500 text-sm">Analyzing with AI...</p>
    </div>
  `;

  try {
    const res = await fetch("/analyze-day");
    const data = await res.json();

    if (!data.emails || data.emails.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-20">
          <div class="max-w-md mx-auto bg-white rounded-3xl shadow-lg border border-gray-200/50 p-12">
            <div class="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
              </svg>
            </div>
            <h3 class="text-xl font-bold text-gray-900 mb-2">All Caught Up!</h3>
            <p class="text-gray-500">No emails found in the last 24 hours</p>
          </div>
        </div>
      `;
      updateStats([]);
      return;
    }

    allEmails = data.emails.sort((a, b) => {
      const priority = { high: 1, medium: 2, low: 3 };
      return priority[a.urgency] - priority[b.urgency];
    });

    updateStats(allEmails);
    displayEmails(allEmails);
    updateLastUpdated();
  } catch (err) {
    container.innerHTML = `
      <div class="col-span-full text-center py-20">
        <div class="max-w-md mx-auto bg-white rounded-3xl shadow-lg border border-red-200 p-12">
          <div class="w-24 h-24 bg-gradient-to-br from-red-50 to-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg class="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <h3 class="text-xl font-bold text-gray-900 mb-2">Something went wrong</h3>
          <p class="text-gray-500 mb-6">${err.message}</p>
          <button onclick="refreshEmails()" class="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold">
            Try Again
          </button>
        </div>
      </div>
    `;
  }
}

function displayEmails(emails) {
  const container = document.getElementById("emailContainer");
  
  if (emails.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16">
        <div class="text-gray-400 text-6xl mb-4">🔍</div>
        <p class="text-gray-500 font-medium">No emails match your filter</p>
      </div>
    `;
    return;
  }

  container.innerHTML = emails
    .map((email, index) => {
      const urgencyClass = `email-card-${email.urgency}`;

      return `
        <div class="email-card ${urgencyClass}" style="animation-delay: ${index * 0.05}s" data-urgency="${email.urgency}">
          <!-- Header -->
          <div class="email-header">
            <div class="flex-1">
              <h3 class="email-subject">${email.subject}</h3>
              <p class="email-from">${email.from || 'Unknown Sender'}</p>
              <p class="email-date">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                ${formatDate(email.date)}
              </p>
            </div>
          </div>

          <!-- Full Summary Text -->
          <div class="email-summary">
            ${email.summary || 'No summary available'}
          </div>

          <!-- Footer Badges -->
          <div class="email-badges">
            <div class="category-badge">
              ${email.category || 'Other'}
            </div>
            <div class="urgency-badge urgency-${email.urgency}">
              ${email.urgency?.toUpperCase()}
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function updateStats(emails) {
  const counts = {
    high: emails.filter(e => e.urgency === 'high').length,
    medium: emails.filter(e => e.urgency === 'medium').length,
    low: emails.filter(e => e.urgency === 'low').length,
    total: emails.length
  };
  
  animateCount('highCount', counts.high);
  animateCount('mediumCount', counts.medium);
  animateCount('lowCount', counts.low);
  animateCount('totalCount', counts.total);
}

function animateCount(elementId, target) {
  const element = document.getElementById(elementId);
  const duration = 1000;
  const steps = 30;
  const increment = target / steps;
  let current = 0;
  let step = 0;
  
  const timer = setInterval(() => {
    step++;
    current = Math.min(Math.ceil(increment * step), target);
    element.textContent = current;
    
    if (step >= steps) {
      element.textContent = target;
      clearInterval(timer);
    }
  }, duration / steps);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function updateLastUpdated() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit'
  });
  document.getElementById('lastUpdated').textContent = timeString;
}

function filterEmails(filter) {
  currentFilter = filter;
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-filter') === filter) {
      btn.classList.add('active');
    }
  });
  
  const filtered = filter === 'all' 
    ? allEmails 
    : allEmails.filter(email => email.urgency === filter);
  
  displayEmails(filtered);
}

function searchEmails() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  
  let filtered = currentFilter === 'all' 
    ? allEmails 
    : allEmails.filter(email => email.urgency === currentFilter);
  
  if (searchTerm) {
    filtered = filtered.filter(email => 
      email.subject?.toLowerCase().includes(searchTerm) ||
      email.from?.toLowerCase().includes(searchTerm) ||
      email.summary?.toLowerCase().includes(searchTerm) ||
      email.category?.toLowerCase().includes(searchTerm)
    );
  }
  
  displayEmails(filtered);
}

function toggleView() {
  const container = document.getElementById('emailContainer');
  const btn = document.getElementById('viewToggle');
  const currentCols = container.classList.contains('lg:grid-cols-3');
  
  if (currentCols) {
    container.classList.remove('lg:grid-cols-3');
    container.classList.add('lg:grid-cols-2');
    btn.querySelector('span').textContent = 'List';
  } else {
    container.classList.remove('lg:grid-cols-2');
    container.classList.add('lg:grid-cols-3');
    btn.querySelector('span').textContent = 'Grid';
  }
}

function refreshEmails() {
  const btn = document.getElementById('refreshBtn');
  const icon = document.getElementById('refreshIcon');
  
  btn.classList.add('opacity-75');
  btn.disabled = true;
  icon.classList.add('animate-spin');
  
  loadEmails().finally(() => {
    setTimeout(() => {
      btn.classList.remove('opacity-75');
      btn.disabled = false;
      icon.classList.remove('animate-spin');
    }, 500);
  });
}

window.onload = loadEmails;
