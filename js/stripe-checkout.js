/* ===================================================================
   GOLFGIVE — STRIPE CHECKOUT ENGINE
   Production-ready Stripe payment flow using Stripe.js
   =================================================================== */

/* ── HOW STRIPE CHECKOUT WORKS IN A STATIC SITE ──────────────────────
   
   Since this is a static/frontend-only site, we use Stripe's 
   hosted Checkout page flow (no server needed for the checkout itself):
   
   1. User clicks "Subscribe" 
   2. We load Stripe.js from Stripe's CDN
   3. We call stripe.redirectToCheckout() with the Price ID
   4. User is redirected to Stripe's secure hosted payment page
   5. After payment, Stripe redirects back to our success/cancel URLs
   6. Our success page reads the session_id from URL params
   7. We update the subscription record in our database
   8. Webhooks (simulated here) handle the server-side sync

   NOTE FOR PRODUCTION: 
   → Real server-side webhook verification requires a backend server
   → For production: deploy an Express/Node server or use a serverless 
     function (Vercel/Netlify) to handle webhook signature verification
   → The webhook handler in stripe-webhooks.js shows the full logic
     that should run on your backend

================================================================== */

const StripeCheckout = {

  stripe: null,
  initialized: false,

  // ─── INITIALIZE STRIPE.JS ───────────────────────────────────────
  async init() {
    if (this.initialized) return this.stripe;
    
    if (!StripeConfig.isConfigured()) {
      console.warn('[StripeCheckout] Using demo mode — Stripe not configured');
      this.initialized = true;
      return null;
    }

    // Load Stripe.js dynamically
    if (!window.Stripe) {
      await this.loadStripeJS();
    }
    
    this.stripe = window.Stripe(StripeConfig.publishableKey);
    this.initialized = true;
    return this.stripe;
  },

  loadStripeJS() {
    return new Promise((resolve, reject) => {
      if (window.Stripe) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },

  // ─── CREATE CHECKOUT SESSION & REDIRECT ─────────────────────────
  async startCheckout(planType, userEmail = '', userId = '') {
    const stripe = await this.init();
    const planConfig = StripeConfig.prices[planType];
    
    if (!planConfig) {
      throw new Error(`Invalid plan type: ${planType}`);
    }

    // If Stripe is not configured, use demo mode
    if (!stripe || !StripeConfig.isConfigured()) {
      return this.demoCheckout(planType, userEmail, userId);
    }

    try {
      // Build checkout session parameters
      const sessionParams = {
        lineItems: [{
          price: planConfig.id,
          quantity: 1
        }],
        mode: 'subscription',
        successUrl: StripeConfig.successUrl + '?session_id={CHECKOUT_SESSION_ID}&plan=' + planType,
        cancelUrl: StripeConfig.cancelUrl,
        customerEmail: userEmail || undefined,
        clientReferenceId: userId || undefined,
        allowPromotionCodes: StripeConfig.allowPromoCode,
        billingAddressCollection: StripeConfig.collectBillingAddress ? 'required' : 'auto',
        subscriptionData: {
          metadata: {
            golfgive_user_id: userId,
            plan_type: planType,
            source: 'golfgive_web'
          }
        }
      };

      // Add trial if configured
      if (StripeConfig.trialDays > 0) {
        sessionParams.subscriptionData.trialPeriodDays = StripeConfig.trialDays;
      }

      const { error } = await stripe.redirectToCheckout(sessionParams);
      
      if (error) {
        console.error('[StripeCheckout] Error:', error);
        throw new Error(error.message);
      }

    } catch (err) {
      console.error('[StripeCheckout] Checkout failed:', err);
      throw err;
    }
  },

  // ─── DEMO CHECKOUT (when Stripe not configured) ─────────────────
  async demoCheckout(planType, userEmail, userId) {
    console.log('[StripeCheckout] Demo mode — simulating checkout for', planType);
    
    const planConfig = StripeConfig.prices[planType];
    const sessionId = 'cs_demo_' + Math.random().toString(36).slice(2, 12);
    const customerId = 'cus_demo_' + Math.random().toString(36).slice(2, 12);
    const subscriptionId = 'sub_demo_' + Math.random().toString(36).slice(2, 12);

    // Store pending checkout in sessionStorage
    const pendingData = {
      sessionId,
      customerId,
      subscriptionId,
      planType,
      userId,
      userEmail,
      amount: planConfig.amount,
      currency: planConfig.currency,
      timestamp: Date.now(),
      isDemo: true
    };
    
    sessionStorage.setItem('stripe_pending_checkout', JSON.stringify(pendingData));

    // Show demo payment modal
    return this.showDemoPaymentModal(pendingData);
  },

  // ─── DEMO PAYMENT MODAL ─────────────────────────────────────────
  showDemoPaymentModal(checkoutData) {
    return new Promise((resolve) => {
      const planLabel = StripeConfig.prices[checkoutData.planType]?.display || '£9.99/month';
      
      // Remove existing modal if any
      document.getElementById('stripeModalOverlay')?.remove();
      
      const modal = document.createElement('div');
      modal.id = 'stripeModalOverlay';
      modal.style.cssText = `
        position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);
        display:flex;align-items:center;justify-content:center;
        font-family:'Inter',sans-serif;backdrop-filter:blur(8px);
      `;
      
      modal.innerHTML = `
        <div style="background:#1a1a2e;border:1px solid rgba(99,102,241,0.3);border-radius:20px;
          padding:0;max-width:460px;width:90%;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.6);">
          
          <!-- Stripe-style header -->
          <div style="background:linear-gradient(135deg,#635bff,#7c5cfc);padding:28px 28px 22px;text-align:center;">
            <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:12px;">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="rgba(255,255,255,0.15)"/>
                <path d="M21.3 13.8c0-2.8-1.4-4.8-4.8-4.8-3.4 0-5.5 2.2-5.5 5.2 0 3.4 2.1 5.2 5.5 5.2 1.6 0 2.9-.4 3.8-1.1v-1.8c-.9.7-2 1.1-3.5 1.1-2 0-3.4-1.1-3.6-3h7.9c.1-.3.2-.5.2-.8zm-7.9-.8c.2-1.7 1.3-2.7 2.9-2.7 1.6 0 2.6 1 2.6 2.7h-5.5z" fill="white"/>
              </svg>
              <span style="color:white;font-size:16px;font-weight:700;">Stripe Checkout Demo</span>
            </div>
            <div style="color:rgba(255,255,255,0.9);font-size:13px;">GolfGive Subscription</div>
            <div style="color:white;font-size:32px;font-weight:800;margin-top:8px;">${planLabel}</div>
          </div>
          
          <!-- Test mode banner -->
          <div style="background:rgba(245,158,11,0.15);border-bottom:1px solid rgba(245,158,11,0.2);
            padding:10px 20px;display:flex;align-items:center;gap:8px;">
            <span style="background:#f59e0b;color:#000;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">TEST MODE</span>
            <span style="font-size:12px;color:#f59e0b;">Use test card: 4242 4242 4242 4242</span>
          </div>
          
          <!-- Form -->
          <div style="padding:24px;">
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Card Number</label>
              <input id="demo-card-number" type="text" maxlength="19" placeholder="4242 4242 4242 4242"
                style="width:100%;background:#111827;border:1px solid #374151;border-radius:8px;padding:12px 14px;
                color:white;font-size:16px;font-family:'Inter',sans-serif;box-sizing:border-box;outline:none;"
                oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/(.{4})/g,'$1 ').trim()" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
              <div>
                <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Expiry</label>
                <input id="demo-expiry" type="text" maxlength="5" placeholder="MM/YY"
                  style="width:100%;background:#111827;border:1px solid #374151;border-radius:8px;padding:12px 14px;
                  color:white;font-size:16px;font-family:'Inter',sans-serif;box-sizing:border-box;outline:none;" />
              </div>
              <div>
                <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">CVC</label>
                <input id="demo-cvc" type="text" maxlength="3" placeholder="123"
                  style="width:100%;background:#111827;border:1px solid #374151;border-radius:8px;padding:12px 14px;
                  color:white;font-size:16px;font-family:'Inter',sans-serif;box-sizing:border-box;outline:none;" />
              </div>
            </div>
            <div id="stripePayError" style="display:none;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);
              border-radius:8px;padding:10px 14px;color:#f87171;font-size:13px;margin-bottom:14px;"></div>
            <button id="stripePayBtn" onclick="StripeCheckout.processDemo()"
              style="width:100%;background:linear-gradient(135deg,#635bff,#7c5cfc);
              border:none;border-radius:10px;padding:14px;color:white;font-size:16px;font-weight:700;
              cursor:pointer;font-family:'Inter',sans-serif;transition:opacity 0.2s;">
              <span id="stripePayBtnText">Pay ${planLabel}</span>
            </button>
            <div style="text-align:center;margin-top:14px;">
              <button onclick="StripeCheckout.cancelDemo()" style="background:none;border:none;color:#6b7280;
                cursor:pointer;font-size:13px;font-family:'Inter',sans-serif;">Cancel</button>
            </div>
            <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:16px;color:#4b5563;font-size:11px;">
              <svg width="12" height="14" viewBox="0 0 12 14" fill="none"><path d="M10 6H9V4a3 3 0 0 0-6 0v2H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zM6 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2.1-5H3.9V4a2.1 2.1 0 0 1 4.2 0v2z" fill="#4b5563"/></svg>
              Payments secured by Stripe
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // Store resolve for later use
      this._demoResolve = resolve;
      this._pendingCheckoutData = checkoutData;
    });
  },

  // ─── PROCESS DEMO PAYMENT ────────────────────────────────────────
  async processDemo() {
    const cardInput = document.getElementById('demo-card-number');
    const expiryInput = document.getElementById('demo-expiry');
    const cvcInput = document.getElementById('demo-cvc');
    const errorEl = document.getElementById('stripePayError');
    const btn = document.getElementById('stripePayBtn');
    const btnText = document.getElementById('stripePayBtnText');

    errorEl.style.display = 'none';

    // Validate card
    const cardNum = (cardInput?.value || '').replace(/\s/g, '');
    const expiry = (expiryInput?.value || '');
    const cvc = (cvcInput?.value || '');

    if (cardNum.length < 16) {
      errorEl.textContent = 'Please enter a valid card number (try 4242 4242 4242 4242)';
      errorEl.style.display = 'block';
      return;
    }
    if (!expiry.match(/^\d{2}\/\d{2}$/)) {
      errorEl.textContent = 'Please enter a valid expiry date (MM/YY)';
      errorEl.style.display = 'block';
      return;
    }
    if (cvc.length < 3) {
      errorEl.textContent = 'Please enter a valid CVC';
      errorEl.style.display = 'block';
      return;
    }

    // Simulate processing
    btn.disabled = true;
    btnText.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;"><span style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span>Processing...</span>';

    // Add spinner animation
    if (!document.getElementById('stripeSpinStyle')) {
      const style = document.createElement('style');
      style.id = 'stripeSpinStyle';
      style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
    }

    await new Promise(r => setTimeout(r, 1800));

    // Simulate success (card 4000000000000002 = decline)
    if (cardNum === '4000000000000002') {
      btn.disabled = false;
      btnText.textContent = 'Pay ' + StripeConfig.prices[this._pendingCheckoutData?.planType]?.display;
      errorEl.textContent = 'Your card was declined. Please use a different card.';
      errorEl.style.display = 'block';
      return;
    }

    // Payment successful - close modal and proceed
    document.getElementById('stripeModalOverlay')?.remove();
    
    const checkoutData = this._pendingCheckoutData;
    if (checkoutData) {
      await this.handleSuccessfulPayment(checkoutData, {
        last4: cardNum.slice(-4),
        brand: this.detectCardBrand(cardNum)
      });
    }
    
    if (this._demoResolve) {
      this._demoResolve({ success: true });
    }
  },

  cancelDemo() {
    document.getElementById('stripeModalOverlay')?.remove();
    sessionStorage.removeItem('stripe_pending_checkout');
    if (this._demoResolve) this._demoResolve({ success: false, cancelled: true });
  },

  detectCardBrand(number) {
    if (number.startsWith('4')) return 'visa';
    if (number.startsWith('5')) return 'mastercard';
    if (number.startsWith('3')) return 'amex';
    return 'card';
  },

  // ─── HANDLE SUCCESSFUL PAYMENT ──────────────────────────────────
  // Called after checkout.session.completed (real) or demo payment
  async handleSuccessfulPayment(checkoutData, cardInfo = {}) {
    try {
      const now = new Date();
      let periodEnd = new Date(now);
      
      if (checkoutData.planType === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      // Check if subscription already exists for this user
      const existingRes = await API.get('subscriptions', { limit: 100 });
      const existingSubs = existingRes.data || [];
      const existingSub = existingSubs.find(s => s.user_id === checkoutData.userId);

      const subData = {
        user_id: checkoutData.userId,
        stripe_customer_id: checkoutData.customerId,
        stripe_subscription_id: checkoutData.subscriptionId,
        stripe_price_id: StripeConfig.prices[checkoutData.planType]?.id || '',
        plan_type: checkoutData.planType,
        plan: checkoutData.planType,  // legacy field
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        amount: checkoutData.amount,
        currency: checkoutData.currency || 'GBP',
        payment_method_last4: cardInfo.last4 || '',
        payment_method_brand: cardInfo.brand || '',
        checkout_session_id: checkoutData.sessionId,
        cancel_at_period_end: false
      };

      let subscription;
      if (existingSub) {
        // Update existing subscription
        subscription = await API.patch('subscriptions', existingSub.id, subData);
      } else {
        // Create new subscription
        subscription = await API.post('subscriptions', {
          id: generateId('sub'),
          ...subData
        });
      }

      // Create invoice record
      await API.post('invoices', {
        id: generateId('inv'),
        user_id: checkoutData.userId,
        stripe_invoice_id: 'in_demo_' + checkoutData.sessionId,
        subscription_id: subscription.id,
        amount: checkoutData.amount,
        currency: checkoutData.currency || 'GBP',
        status: 'paid',
        invoice_date: now.toISOString(),
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
        plan_type: checkoutData.planType
      });

      // Log Stripe event
      await API.post('stripe_events', {
        id: generateId('evt'),
        user_id: checkoutData.userId,
        stripe_event_id: 'evt_demo_' + checkoutData.sessionId,
        event_type: 'checkout.session.completed',
        status: 'processed',
        payload: JSON.stringify(checkoutData),
        subscription_id: subscription.id
      });

      // Update user session to reflect active subscription
      const currentUser = Auth.getUser();
      if (currentUser && currentUser.id === checkoutData.userId) {
        const updatedUser = { ...currentUser, subscription_status: 'active', plan_type: checkoutData.planType };
        Auth.login(updatedUser);
      }

      sessionStorage.removeItem('stripe_pending_checkout');
      
      return { success: true, subscription };

    } catch (err) {
      console.error('[StripeCheckout] handleSuccessfulPayment error:', err);
      throw err;
    }
  },

  // ─── HANDLE SUBSCRIPTION RENEWAL (invoice.paid) ─────────────────
  async handleInvoicePaid(subscriptionId, newPeriodEnd) {
    try {
      const res = await API.get('subscriptions', { limit: 100 });
      const subs = res.data || [];
      const sub = subs.find(s => s.stripe_subscription_id === subscriptionId);
      
      if (sub) {
        await API.patch('subscriptions', sub.id, {
          status: 'active',
          current_period_end: newPeriodEnd,
          cancel_at_period_end: false
        });

        // Create invoice record
        await API.post('invoices', {
          id: generateId('inv'),
          user_id: sub.user_id,
          stripe_invoice_id: 'in_renewal_' + Date.now(),
          subscription_id: sub.id,
          amount: sub.amount,
          currency: sub.currency,
          status: 'paid',
          invoice_date: new Date().toISOString(),
          period_end: newPeriodEnd,
          plan_type: sub.plan_type
        });

        return { success: true };
      }
    } catch (err) {
      console.error('[StripeCheckout] handleInvoicePaid error:', err);
    }
    return { success: false };
  },

  // ─── HANDLE PAYMENT FAILURE (invoice.payment_failed) ────────────
  async handlePaymentFailed(subscriptionId) {
    try {
      const res = await API.get('subscriptions', { limit: 100 });
      const subs = res.data || [];
      const sub = subs.find(s => s.stripe_subscription_id === subscriptionId);
      
      if (sub) {
        await API.patch('subscriptions', sub.id, { status: 'past_due' });
        return { success: true };
      }
    } catch (err) {
      console.error('[StripeCheckout] handlePaymentFailed error:', err);
    }
    return { success: false };
  },

  // ─── HANDLE CANCELLATION (customer.subscription.deleted) ────────
  async handleSubscriptionDeleted(subscriptionId) {
    try {
      const res = await API.get('subscriptions', { limit: 100 });
      const subs = res.data || [];
      const sub = subs.find(s => s.stripe_subscription_id === subscriptionId);
      
      if (sub) {
        await API.patch('subscriptions', sub.id, {
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_at_period_end: true
        });
        return { success: true };
      }
    } catch (err) {
      console.error('[StripeCheckout] handleSubscriptionDeleted error:', err);
    }
    return { success: false };
  },

  // ─── CANCEL SUBSCRIPTION (user-initiated) ───────────────────────
  async cancelSubscription(subscriptionId, userId) {
    try {
      const res = await API.get('subscriptions', { limit: 100 });
      const subs = res.data || [];
      const sub = subs.find(s => 
        (s.id === subscriptionId || s.stripe_subscription_id === subscriptionId) 
        && s.user_id === userId
      );
      
      if (!sub) throw new Error('Subscription not found');

      // In production: call your backend to cancel via Stripe API
      // POST /api/cancel-subscription with stripe_subscription_id
      // Stripe will then fire customer.subscription.deleted webhook

      // For demo: update directly
      await API.patch('subscriptions', sub.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_at_period_end: true
      });

      // Log event
      await API.post('stripe_events', {
        id: generateId('evt'),
        user_id: userId,
        stripe_event_id: 'evt_cancel_' + Date.now(),
        event_type: 'customer.subscription.deleted',
        status: 'processed',
        subscription_id: sub.id
      });

      return { success: true, subscription: sub };

    } catch (err) {
      console.error('[StripeCheckout] cancelSubscription error:', err);
      throw err;
    }
  },

  // ─── REACTIVATE SUBSCRIPTION ────────────────────────────────────
  async reactivateSubscription(userId) {
    // Redirect to checkout for a new subscription
    const user = Auth.getUser();
    return this.startCheckout('monthly', user?.email || '', userId);
  },

  // ─── OPEN CUSTOMER PORTAL ────────────────────────────────────────
  openCustomerPortal(stripeCustomerId) {
    if (!StripeConfig.isConfigured()) {
      Notify.info('Billing portal not available in demo mode. Configure Stripe to enable.');
      return;
    }
    // In production: call your backend to generate a portal session
    // GET /api/portal-session?customer_id=cus_xxx
    // Then redirect to the returned URL
    Notify.info('Opening Stripe Billing Portal...');
    window.open(StripeConfig.customerPortalUrl, '_blank');
  },

  // ─── PROCESS SUCCESS PAGE ────────────────────────────────────────
  async processSuccessPage() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const planType = params.get('plan') || 'monthly';
    
    if (!sessionId) return null;

    const user = Auth.getUser();
    if (!user) return null;

    // Check if already processed
    const pending = sessionStorage.getItem('stripe_pending_checkout');
    if (pending) {
      try {
        const data = JSON.parse(pending);
        if (data.userId === user.id) {
          return await this.handleSuccessfulPayment(data);
        }
      } catch (e) {
        console.error('Error processing success page:', e);
      }
    }

    return { already_processed: true };
  }
};

// ─── SUBSCRIPTION BUTTON HELPER ─────────────────────────────────────
async function startSubscription(planType, btn) {
  const user = Auth.getUser();
  
  if (!user) {
    // Not logged in — save plan selection and redirect to signup
    sessionStorage.setItem('pending_plan', planType);
    window.location.href = 'signup.html?plan=' + planType;
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner spinner-sm" style="border-color:rgba(255,255,255,0.3);border-top-color:white;"></div><span>Loading Stripe...</span>`;
  }

  try {
    await StripeCheckout.startCheckout(planType, user.email, user.id);
  } catch (err) {
    Notify.error('Failed to start checkout: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-credit-card"></i> Subscribe — ${StripeConfig.prices[planType]?.display || ''}`;
    }
  }
}

window.StripeCheckout = StripeCheckout;
window.startSubscription = startSubscription;
