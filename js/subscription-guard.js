/* ===================================================================
   GOLFGIVE — SUBSCRIPTION ACCESS GUARD (Middleware)
   
   Enforces subscription-gating across all premium features.
   Include this file on ALL protected pages/sections.
   =================================================================== */

const SubscriptionGuard = {

  // Cache for performance (refresh every 60 seconds)
  _cache: null,
  _cacheTime: 0,
  _cacheTTL: 60000, // 1 minute

  // ─── CORE VALIDATION ────────────────────────────────────────────
  // Returns full subscription status object
  async validate(userId, bypassCache = false) {
    const now = Date.now();

    // Return cached result if fresh
    if (!bypassCache && this._cache && this._cache.userId === userId && 
        (now - this._cacheTime) < this._cacheTTL) {
      return this._cache.result;
    }

    let result;
    try {
      const res = await API.get('subscriptions', { limit: 100 });
      const subs = res.data || [];
      
      // Find most recent subscription for this user
      const userSubs = subs.filter(s => s.user_id === userId);
      const userSub = userSubs.sort((a, b) => 
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
      )[0];

      if (!userSub) {
        result = {
          valid: false,
          status: 'none',
          subscription: null,
          reason: 'No subscription found',
          canAccess: false,
          daysLeft: 0,
          planType: null,
          isActive: false,
          isCancelled: false,
          isPastDue: false,
          isExpired: false
        };
      } else {
        const endDate = new Date(userSub.current_period_end);
        const isExpiredByDate = endDate < new Date();
        const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));

        // Auto-expire if past period end
        if (userSub.status === 'active' && isExpiredByDate) {
          try {
            await API.patch('subscriptions', userSub.id, { status: 'expired' });
            userSub.status = 'expired';
          } catch (e) {}
        }

        const isActive = userSub.status === 'active' && !isExpiredByDate;
        const isTrialing = userSub.status === 'trialing';
        const canAccess = isActive || isTrialing;

        result = {
          valid: canAccess,
          status: userSub.status,
          subscription: userSub,
          reason: canAccess ? 'Active subscription' : this.getStatusReason(userSub.status),
          canAccess,
          daysLeft,
          planType: userSub.plan_type || userSub.plan,
          renewalDate: userSub.current_period_end,
          isActive,
          isCancelled: userSub.status === 'cancelled',
          isPastDue: userSub.status === 'past_due',
          isExpired: userSub.status === 'expired' || (userSub.status === 'active' && isExpiredByDate),
          isTrialing,
          stripeCustomerId: userSub.stripe_customer_id,
          stripeSubscriptionId: userSub.stripe_subscription_id,
          cancelAtPeriodEnd: userSub.cancel_at_period_end,
          paymentLast4: userSub.payment_method_last4,
          paymentBrand: userSub.payment_method_brand
        };
      }
    } catch (err) {
      console.error('[SubscriptionGuard] Validation error:', err);
      result = {
        valid: false,
        status: 'error',
        subscription: null,
        reason: 'Unable to verify subscription',
        canAccess: false,
        daysLeft: 0,
        planType: null,
        isActive: false
      };
    }

    // Cache result
    this._cache = { userId, result };
    this._cacheTime = now;

    return result;
  },

  // ─── CLEAR CACHE ────────────────────────────────────────────────
  clearCache() {
    this._cache = null;
    this._cacheTime = 0;
  },

  // ─── GET HUMAN-READABLE STATUS REASON ───────────────────────────
  getStatusReason(status) {
    const reasons = {
      none: 'No active subscription',
      cancelled: 'Subscription was cancelled',
      past_due: 'Payment failed — please update payment method',
      expired: 'Subscription has expired',
      incomplete: 'Subscription setup incomplete',
      inactive: 'Subscription is inactive',
      error: 'Unable to verify subscription'
    };
    return reasons[status] || 'Subscription not active';
  },

  // ─── REQUIRE SUBSCRIPTION (redirect if not active) ──────────────
  async requireSubscription(userId, redirectUrl = 'pricing.html') {
    const result = await this.validate(userId);
    
    if (!result.canAccess) {
      // Store the page they were trying to access
      sessionStorage.setItem('sub_required_redirect', window.location.href);
      
      // Show notification before redirect
      Notify.info('An active subscription is required to access this feature');
      
      setTimeout(() => {
        window.location.href = redirectUrl + '?upgrade=required&reason=' + result.status;
      }, 1500);
      
      return false;
    }
    
    return true;
  },

  // ─── GATE A FEATURE ELEMENT ──────────────────────────────────────
  // Shows a lock overlay on a DOM element for non-subscribers
  gateElement(elementId, status) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (!status.canAccess) {
      el.style.position = 'relative';
      
      // Remove existing gate if present
      el.querySelector('.sub-gate-overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.className = 'sub-gate-overlay';
      overlay.style.cssText = `
        position:absolute;inset:0;z-index:10;
        background:rgba(10,10,20,0.85);
        backdrop-filter:blur(4px);
        display:flex;flex-direction:column;
        align-items:center;justify-content:center;
        border-radius:inherit;
        padding:20px;text-align:center;
      `;
      overlay.innerHTML = `
        <div style="font-size:32px;margin-bottom:12px;">🔒</div>
        <div style="font-weight:700;font-size:16px;color:white;margin-bottom:6px;">Premium Feature</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:16px;">${this.getStatusReason(status.status)}</div>
        <a href="pricing.html" class="btn-primary btn-sm" style="text-decoration:none;">
          <i class="fas fa-unlock"></i> Upgrade to Access
        </a>
      `;
      el.appendChild(overlay);
    }
  },

  // ─── GATE A BUTTON ────────────────────────────────────────────────
  gateButton(buttonEl, status, featureName = 'this feature') {
    if (!buttonEl) return;
    
    if (!status.canAccess) {
      buttonEl.disabled = false;
      buttonEl.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showUpgradeModal(featureName, status);
      };
      
      // Add lock icon if not present
      if (!buttonEl.querySelector('.fa-lock')) {
        buttonEl.innerHTML = `<i class="fas fa-lock" style="margin-right:6px;"></i>` + buttonEl.innerHTML;
      }
    }
  },

  // ─── SHOW UPGRADE PROMPT MODAL ────────────────────────────────────
  showUpgradeModal(featureName = 'this feature', status = {}) {
    // Remove existing modal
    document.getElementById('subUpgradeModal')?.remove();

    const reason = this.getStatusReason(status.status || 'none');
    const isPastDue = status.isPastDue;
    
    const modal = document.createElement('div');
    modal.id = 'subUpgradeModal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);
      display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(6px);font-family:'Inter',sans-serif;
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    modal.innerHTML = `
      <div style="background:#0f0f1a;border:1px solid rgba(99,102,241,0.3);border-radius:20px;
        max-width:420px;width:90%;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.5);">
        
        <!-- Header with gradient -->
        <div style="background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.15));
          border-bottom:1px solid rgba(99,102,241,0.2);padding:28px 28px 20px;text-align:center;">
          <div style="width:64px;height:64px;background:linear-gradient(135deg,#6366f1,#8b5cf6);
            border-radius:16px;display:flex;align-items:center;justify-content:center;
            margin:0 auto 16px;font-size:28px;">🔒</div>
          <h3 style="color:white;font-size:20px;font-weight:800;margin:0 0 8px;">
            ${isPastDue ? 'Payment Required' : 'Subscription Required'}
          </h3>
          <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0;">${reason}</p>
        </div>
        
        <!-- Body -->
        <div style="padding:24px;">
          <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);
            border-radius:12px;padding:16px;margin-bottom:20px;">
            <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
              What you get with GolfGive
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${['Monthly prize draw entries', 'Log your golf scores', 'Charity contributions', 'Real-time prize pool'].map(f => `
                <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:rgba(255,255,255,0.8);">
                  <i class="fas fa-check" style="color:#10b981;font-size:12px;width:14px;"></i>${f}
                </div>
              `).join('')}
            </div>
          </div>
          
          <div style="display:flex;flex-direction:column;gap:10px;">
            <a href="pricing.html" style="display:flex;align-items:center;justify-content:center;gap:8px;
              background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:12px;
              padding:14px;color:white;font-size:15px;font-weight:700;text-decoration:none;cursor:pointer;">
              <i class="fas fa-credit-card"></i>
              ${isPastDue ? 'Update Payment Method' : 'Subscribe from £9.99/month'}
            </a>
            <button onclick="document.getElementById('subUpgradeModal').remove()"
              style="background:none;border:1px solid rgba(255,255,255,0.1);border-radius:12px;
              padding:12px;color:rgba(255,255,255,0.5);font-size:14px;cursor:pointer;font-family:'Inter',sans-serif;">
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  },

  // ─── SHOW SUBSCRIPTION STATUS BANNER ─────────────────────────────
  showStatusBanner(status, containerId = 'subStatusBanner') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (status.canAccess && !status.cancelAtPeriodEnd) {
      container.style.display = 'none';
      return;
    }

    let bannerClass = 'sub-banner-warning';
    let icon = 'fa-exclamation-triangle';
    let message = '';
    let action = '';

    if (status.cancelAtPeriodEnd) {
      bannerClass = 'sub-banner-warning';
      icon = 'fa-calendar-times';
      message = `Your subscription will cancel on ${DateHelper.format(status.renewalDate)}. You'll retain access until then.`;
      action = `<a href="pricing.html" style="color:inherit;font-weight:700;text-decoration:underline;">Resubscribe</a>`;
    } else if (status.isPastDue) {
      bannerClass = 'sub-banner-danger';
      icon = 'fa-credit-card';
      message = 'Your last payment failed. Please update your payment method to keep your subscription active.';
      action = `<a href="pricing.html" style="color:inherit;font-weight:700;text-decoration:underline;">Update Payment</a>`;
    } else if (status.isExpired) {
      bannerClass = 'sub-banner-danger';
      icon = 'fa-times-circle';
      message = 'Your subscription has expired. Renew now to continue accessing all features.';
      action = `<a href="pricing.html" style="color:inherit;font-weight:700;text-decoration:underline;">Renew Subscription</a>`;
    } else if (status.status === 'cancelled') {
      bannerClass = 'sub-banner-info';
      icon = 'fa-info-circle';
      message = 'Your subscription is cancelled. You can still subscribe again anytime.';
      action = `<a href="pricing.html" style="color:inherit;font-weight:700;text-decoration:underline;">Subscribe Again</a>`;
    }

    if (!message) { container.style.display = 'none'; return; }

    container.className = bannerClass;
    container.style.cssText = `
      display:flex;align-items:center;gap:12px;padding:12px 20px;border-radius:10px;
      margin-bottom:16px;font-size:14px;
    `;

    if (bannerClass === 'sub-banner-danger') {
      container.style.background = 'rgba(239,68,68,0.1)';
      container.style.border = '1px solid rgba(239,68,68,0.3)';
      container.style.color = '#fca5a5';
    } else if (bannerClass === 'sub-banner-warning') {
      container.style.background = 'rgba(245,158,11,0.1)';
      container.style.border = '1px solid rgba(245,158,11,0.3)';
      container.style.color = '#fcd34d';
    } else {
      container.style.background = 'rgba(99,102,241,0.1)';
      container.style.border = '1px solid rgba(99,102,241,0.3)';
      container.style.color = '#a5b4fc';
    }

    container.innerHTML = `
      <i class="fas ${icon}" style="font-size:18px;flex-shrink:0;"></i>
      <div style="flex:1;">${message}</div>
      ${action ? `<div style="flex-shrink:0;">${action}</div>` : ''}
      <button onclick="this.parentElement.style.display='none'" style="background:none;border:none;color:inherit;cursor:pointer;opacity:0.6;">
        <i class="fas fa-times"></i>
      </button>
    `;
  },

  // ─── RENDER SUBSCRIPTION STATUS BADGE ────────────────────────────
  renderStatusBadge(status) {
    if (!status) return '<span class="badge" style="background:rgba(255,255,255,0.1);color:#9ca3af;">Unknown</span>';

    const configs = {
      active:     { color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: 'fa-check-circle', label: 'Active' },
      trialing:   { color: '#6366f1', bg: 'rgba(99,102,241,0.15)', icon: 'fa-clock', label: 'Trial' },
      cancelled:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: 'fa-times-circle', label: 'Cancelled' },
      past_due:   { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: 'fa-exclamation-circle', label: 'Past Due' },
      expired:    { color: '#6b7280', bg: 'rgba(107,114,128,0.15)', icon: 'fa-calendar-times', label: 'Expired' },
      none:       { color: '#6b7280', bg: 'rgba(107,114,128,0.15)', icon: 'fa-minus-circle', label: 'No Plan' },
      inactive:   { color: '#6b7280', bg: 'rgba(107,114,128,0.15)', icon: 'fa-minus-circle', label: 'Inactive' }
    };

    const config = configs[status.status] || configs.none;
    return `
      <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;
        background:${config.bg};color:${config.color};font-size:12px;font-weight:700;">
        <i class="fas ${config.icon}" style="font-size:10px;"></i>
        ${config.label}
      </span>
    `;
  },

  // ─── CHECK ALL PREMIUM FEATURES ON A PAGE ───────────────────────
  async applyGates(userId) {
    const status = await this.validate(userId);
    
    // Gate elements with data-sub-gate attribute
    document.querySelectorAll('[data-sub-gate]').forEach(el => {
      if (!status.canAccess) {
        const featureName = el.dataset.subGate || 'this feature';
        if (el.tagName === 'BUTTON' || el.tagName === 'A') {
          this.gateButton(el, status, featureName);
        } else {
          this.gateElement(el.id, status);
        }
      }
    });

    // Show status banner
    this.showStatusBanner(status);

    return status;
  }
};

window.SubscriptionGuard = SubscriptionGuard;
