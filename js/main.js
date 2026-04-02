/* ===== GOLFGIVE MAIN JAVASCRIPT ===== */

// ===== API HELPERS =====
const API = {
  base: ' ',
  async get(table, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${this.base}/${table}${qs ? '?' + qs : ''}`);
    if (!res.ok) throw new Error(`Failed to fetch ${table}`);
    return res.json();
  },
  async getOne(table, id) {
    const res = await fetch(`${this.base}/${table}/${id}`);
    if (!res.ok) throw new Error(`Not found`);
    return res.json();
  },
  async post(table, data) {
    const res = await fetch(`${this.base}/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to create`);
    return res.json();
  },
  async put(table, id, data) {
    const res = await fetch(`${this.base}/${table}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to update`);
    return res.json();
  },
  async patch(table, id, data) {
    const res = await fetch(`${this.base}/${table}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Failed to update`);
    return res.json();
  },
  async delete(table, id) {
    const res = await fetch(`${this.base}/${table}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete`);
    return true;
  }
};

// ===== AUTH MANAGER =====
const Auth = {
  key: 'golfgive_user',
  
  login(user) {
    sessionStorage.setItem(this.key, JSON.stringify(user));
    localStorage.setItem(this.key, JSON.stringify(user));
  },
  
  logout() {
    sessionStorage.removeItem(this.key);
    localStorage.removeItem(this.key);
    window.location.href = 'index.html';
  },
  
  getUser() {
    try {
      const data = sessionStorage.getItem(this.key) || localStorage.getItem(this.key);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  },
  
  isLoggedIn() { return !!this.getUser(); },
  
  isAdmin() {
    const user = this.getUser();
    return user && user.role === 'admin';
  },
  
  requireAuth(redirectTo = 'login.html') {
    if (!this.isLoggedIn()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },
  
  requireAdmin() {
    if (!this.isAdmin()) {
      window.location.href = 'dashboard.html';
      return false;
    }
    return true;
  }
};

// ===== NOTIFICATION SYSTEM =====
const Notify = {
  container: null,
  
  init() {
    this.container = document.querySelector('.notification-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'notification-container';
      document.body.appendChild(this.container);
    }
  },
  
  show(message, type = 'info', duration = 4000) {
    this.init();
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.innerHTML = `
      <span class="notification-icon">${icons[type] || icons.info}</span>
      <span>${message}</span>
    `;
    this.container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  },
  
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); }
};

// ===== ANIMATION OBSERVER =====
function initAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.delay || 0);
        setTimeout(() => entry.target.classList.add('animated'), delay);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  
  document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
}

// ===== COUNT-UP ANIMATION =====
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
        entry.target.classList.add('counted');
        animateCounter(entry.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(el => observer.observe(el));
}

function animateCounter(el) {
  const target = parseInt(el.dataset.count);
  const prefix = el.dataset.prefix || '';
  const duration = 1500;
  const start = performance.now();
  
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(eased * target);
    
    if (target >= 10000) {
      el.textContent = prefix + current.toLocaleString('en-GB');
    } else {
      el.textContent = prefix + current.toLocaleString('en-GB');
    }
    
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = prefix + target.toLocaleString('en-GB');
  }
  requestAnimationFrame(update);
}

// ===== NAVBAR SCROLL =====
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  });
  
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });
  }
  
  // Close mobile menu on link click
  document.querySelectorAll('.nav-mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu && mobileMenu.classList.remove('open');
    });
  });
}

// ===== MODAL HELPERS =====
const Modal = {
  open(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  },
  close(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('open');
      document.body.style.overflow = '';
    }
  },
  closeAll() {
    document.querySelectorAll('.modal-overlay.open').forEach(el => {
      el.classList.remove('open');
    });
    document.body.style.overflow = '';
  }
};

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) Modal.closeAll();
});

// ===== TABS =====
function initTabs(container) {
  const tabs = container.querySelectorAll('.tab-item');
  const contents = container.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = container.querySelector(`[data-tab-content="${target}"]`);
      if (content) content.classList.add('active');
    });
  });
}

// ===== DATE HELPERS =====
const DateHelper = {
  format(dateStr, options = {}) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', ...options
    });
  },
  
  relative(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return this.format(dateStr);
  },
  
  daysUntil(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Expired';
    if (days === 0) return 'Today';
    return `${days} days`;
  },
  
  isExpired(dateStr) {
    if (!dateStr) return true;
    return new Date(dateStr) < new Date();
  }
};

// ===== CURRENCY HELPER =====
function formatCurrency(amount, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

// ===== UUID GENERATOR =====
function generateId(prefix = '') {
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  return prefix ? `${prefix}-${id.slice(0, 8)}` : id;
}

// ===== SIDEBAR MOBILE =====
function initSidebar() {
  const toggleBtn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

// ===== SUBSCRIPTION VALIDATOR =====
async function validateSubscription(userId) {
  try {
    const res = await API.get('subscriptions', { limit: 100 });
    const subs = res.data || [];
    const userSub = subs.find(s => s.user_id === userId);
    if (!userSub) return { valid: false, status: 'none' };
    
    const isExpired = DateHelper.isExpired(userSub.current_period_end);
    if (userSub.status === 'active' && !isExpired) {
      return { valid: true, status: 'active', subscription: userSub };
    } else if (userSub.status === 'cancelled') {
      return { valid: false, status: 'cancelled', subscription: userSub };
    } else {
      return { valid: false, status: 'expired', subscription: userSub };
    }
  } catch {
    return { valid: false, status: 'error' };
  }
}

// ===== SCORE MANAGEMENT =====
const ScoreManager = {
  MAX_SCORES: 5,
  
  async getUserScores(userId) {
    const res = await API.get('scores', { limit: 100 });
    const all = res.data || [];
    return all
      .filter(s => s.user_id === userId)
      .sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
      .slice(0, this.MAX_SCORES);
  },
  
  async addScore(userId, scoreData) {
    const existing = await this.getUserScores(userId);
    
    // If already 5 scores, delete the oldest one
    if (existing.length >= this.MAX_SCORES) {
      const oldest = existing[existing.length - 1];
      await API.delete('scores', oldest.id);
    }
    
    // Add the new score
    return await API.post('scores', {
      id: generateId('score'),
      user_id: userId,
      score: parseInt(scoreData.score),
      played_at: scoreData.played_at,
      course_name: scoreData.course_name || '',
      sequence: Date.now()
    });
  },
  
  async deleteScore(scoreId) {
    return await API.delete('scores', scoreId);
  },
  
  async updateScore(scoreId, data) {
    return await API.patch('scores', scoreId, data);
  }
};

// ===== DRAW ENGINE =====
const DrawEngine = {
  SCORE_MIN: 1,
  SCORE_MAX: 45,
  DRAW_COUNT: 5,
  
  // Random mode - purely random lottery
  randomDraw() {
    const numbers = [];
    while (numbers.length < this.DRAW_COUNT) {
      const n = Math.floor(Math.random() * this.SCORE_MAX) + this.SCORE_MIN;
      if (!numbers.includes(n)) numbers.push(n);
    }
    return numbers.sort((a, b) => a - b);
  },
  
  // Algorithmic mode - based on score frequency from all users
  algorithmicDraw(allScores) {
    const freq = {};
    allScores.forEach(s => {
      freq[s.score] = (freq[s.score] || 0) + 1;
    });
    
    // Create weighted pool
    const pool = [];
    for (let num = this.SCORE_MIN; num <= this.SCORE_MAX; num++) {
      const weight = freq[num] || 1;
      for (let i = 0; i < weight; i++) pool.push(num);
    }
    
    // Shuffle and pick unique numbers
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const numbers = [...new Set(shuffled)].slice(0, this.DRAW_COUNT);
    
    // If not enough unique, fill with random
    while (numbers.length < this.DRAW_COUNT) {
      const n = Math.floor(Math.random() * this.SCORE_MAX) + this.SCORE_MIN;
      if (!numbers.includes(n)) numbers.push(n);
    }
    
    return numbers.sort((a, b) => a - b);
  },
  
  // Check user scores against drawn numbers
  checkMatch(userScores, drawnNumbers) {
    const scores = userScores.map(s => s.score);
    const matched = scores.filter(s => drawnNumbers.includes(s));
    return {
      matched,
      matchCount: matched.length,
      matchType: matched.length >= 5 ? 5 : matched.length >= 4 ? 4 : matched.length >= 3 ? 3 : 0
    };
  },
  
  // Calculate prize distribution
  calculatePrizes(totalPool, jackpotRollover = 0) {
    const total = totalPool + jackpotRollover;
    return {
      fiveMatch: Math.floor(total * 0.40),
      fourMatch: Math.floor(total * 0.35),
      threeMatch: Math.floor(total * 0.25)
    };
  }
};

// ===== PRIZE POOL CALCULATOR =====
async function calculatePrizePool() {
  try {
    const res = await API.get('subscriptions', { limit: 1000 });
    const subs = res.data || [];
    const active = subs.filter(s => s.status === 'active');
    const monthly = active.filter(s => s.plan === 'monthly').length;
    const yearly = active.filter(s => s.plan === 'yearly').length;
    const total = (monthly * 9.99) + (yearly * (89.99 / 12));
    return { total: Math.floor(total), monthly, yearly, totalActive: active.length };
  } catch {
    return { total: 0, monthly: 0, yearly: 0, totalActive: 0 };
  }
}

// ===== CHARITY CONTRIBUTION CALCULATOR =====
function calculateContribution(subscriptionAmount, percentage) {
  return (subscriptionAmount * percentage / 100).toFixed(2);
}

// ===== FORM VALIDATION =====
const Validate = {
  email(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  password(password) {
    return password && password.length >= 8;
  },
  score(score) {
    const n = parseInt(score);
    return !isNaN(n) && n >= 1 && n <= 45;
  },
  required(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  },
  
  showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.add('error');
    let err = field.parentElement.querySelector('.field-error');
    if (!err) {
      err = document.createElement('div');
      err.className = 'field-error';
      err.style.cssText = 'color:#f87171;font-size:12px;margin-top:4px;';
      field.parentElement.appendChild(err);
    }
    err.textContent = message;
  },
  
  clearErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    form.querySelectorAll('.field-error').forEach(el => el.remove());
  }
};

// ===== TABLE PAGINATION =====
class TablePaginator {
  constructor(options) {
    this.table = options.table;
    this.renderRow = options.renderRow;
    this.container = options.container;
    this.pageSize = options.pageSize || 10;
    this.currentPage = 1;
    this.filters = options.filters || {};
  }
  
  async load() {
    try {
      const res = await API.get(this.table, {
        page: this.currentPage,
        limit: this.pageSize,
        ...this.filters
      });
      
      const tbody = this.container.querySelector('tbody');
      if (tbody) {
        const rows = (res.data || []).map(item => this.renderRow(item)).join('');
        tbody.innerHTML = rows || `<tr><td colspan="20" style="text-align:center;padding:40px;color:var(--text-muted);">No records found</td></tr>`;
      }
      
      this.updatePagination(res.total, res.page, res.limit);
    } catch (e) {
      console.error('TablePaginator error:', e);
    }
  }
  
  updatePagination(total, page, limit) {
    const pager = this.container.parentElement.querySelector('.pagination');
    if (!pager) return;
    const pages = Math.ceil(total / limit);
    pager.innerHTML = `
      <span style="font-size:13px;color:var(--text-muted);">
        Showing ${Math.min((page-1)*limit+1, total)}–${Math.min(page*limit, total)} of ${total}
      </span>
      <div style="display:flex;gap:6px;">
        <button class="btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="this.closest('.pagination').dispatchEvent(new CustomEvent('prevPage'))">
          <i class="fas fa-chevron-left"></i>
        </button>
        <button class="btn-outline btn-sm" ${page >= pages ? 'disabled' : ''} onclick="this.closest('.pagination').dispatchEvent(new CustomEvent('nextPage'))">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    `;
    pager.addEventListener('prevPage', () => { this.currentPage--; this.load(); });
    pager.addEventListener('nextPage', () => { this.currentPage++; this.load(); });
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initAnimations();
  initCounters();
  initSidebar();
  
  // Init tabs
  document.querySelectorAll('[data-tabs]').forEach(el => initTabs(el));
  
  // Update nav for logged-in users
  const user = Auth.getUser();
  if (user) {
    const navActions = document.querySelector('.nav-actions');
    if (navActions) {
      navActions.innerHTML = `
        <a href="dashboard.html" class="btn-ghost">Dashboard</a>
        ${user.role === 'admin' ? '<a href="admin.html" class="btn-ghost">Admin</a>' : ''}
        <a href="#" onclick="Auth.logout()" class="btn-outline">Sign Out</a>
      `;
    }
  }
});

// Make modules globally available
window.API = API;
window.Auth = Auth;
window.Notify = Notify;
window.Modal = Modal;
window.DateHelper = DateHelper;
window.ScoreManager = ScoreManager;
window.DrawEngine = DrawEngine;
window.Validate = Validate;
window.formatCurrency = formatCurrency;
window.generateId = generateId;
window.validateSubscription = validateSubscription;
window.calculatePrizePool = calculatePrizePool;
window.calculateContribution = calculateContribution;
