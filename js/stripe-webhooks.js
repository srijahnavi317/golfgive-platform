/* ===================================================================
   GOLFGIVE — STRIPE WEBHOOKS HANDLER
   
   ⚡ PRODUCTION SETUP INSTRUCTIONS:
   ─────────────────────────────────
   This file documents the complete webhook logic.
   
   Since this is a static site, REAL webhook signature verification 
   requires a backend. For production, deploy one of:
   
   Option A: Express.js endpoint (Node.js/Vercel/Railway)
   ─────────────────────────────────────────────────────
   const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
   app.post('/webhook', express.raw({type:'application/json'}), (req, res) => {
     const sig = req.headers['stripe-signature'];
     let event;
     try {
       event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
     } catch (err) {
       return res.status(400).send(`Webhook Error: ${err.message}`);
     }
     // Handle event...
     res.json({received: true});
   });
   
   Option B: Netlify/Vercel Serverless Function
   Option C: Stripe CLI for local testing: stripe listen --forward-to localhost:3000/webhook
   
   Environment Variables needed:
   STRIPE_SECRET_KEY=sk_live_xxx (server-side only, NEVER expose)
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   =================================================================== */

/* ─────────────────────────────────────────────────────────────────
   WEBHOOK EVENT HANDLERS
   These functions handle each Stripe webhook event type.
   They update the database to keep subscription state in sync.
   ───────────────────────────────────────────────────────────────── */

const StripeWebhooks = {

  // ─── ROUTE EVENT TO CORRECT HANDLER ─────────────────────────────
  async processEvent(eventType, eventData, eventId) {
    console.log(`[StripeWebhooks] Processing event: ${eventType} (${eventId})`);

    // Deduplication: check if already processed
    const alreadyProcessed = await this.checkDuplicate(eventId);
    if (alreadyProcessed) {
      console.log(`[StripeWebhooks] Duplicate event skipped: ${eventId}`);
      return { success: true, duplicate: true };
    }

    let result;
    try {
      switch (eventType) {

        // ── Payment completed → activate subscription ──────────────
        case 'checkout.session.completed':
          result = await this.onCheckoutCompleted(eventData);
          break;

        // ── Recurring invoice paid → keep active ──────────────────
        case 'invoice.paid':
          result = await this.onInvoicePaid(eventData);
          break;

        // ── Payment failed → mark past_due ────────────────────────
        case 'invoice.payment_failed':
          result = await this.onPaymentFailed(eventData);
          break;

        // ── Subscription cancelled/deleted ────────────────────────
        case 'customer.subscription.deleted':
          result = await this.onSubscriptionDeleted(eventData);
          break;

        // ── Subscription updated (plan change, trial end etc.) ─────
        case 'customer.subscription.updated':
          result = await this.onSubscriptionUpdated(eventData);
          break;

        // ── Trial ending soon ─────────────────────────────────────
        case 'customer.subscription.trial_will_end':
          result = await this.onTrialWillEnd(eventData);
          break;

        default:
          console.log(`[StripeWebhooks] Unhandled event type: ${eventType}`);
          result = { success: true, unhandled: true };
      }

      // Log processed event
      await this.logEvent(eventId, eventType, 'processed', eventData, result);
      return result;

    } catch (err) {
      console.error(`[StripeWebhooks] Error handling ${eventType}:`, err);
      await this.logEvent(eventId, eventType, 'failed', eventData, null, err.message);
      throw err;
    }
  },

  // ─── CHECKOUT.SESSION.COMPLETED ─────────────────────────────────
  // Fired when customer completes Stripe Checkout
  async onCheckoutCompleted(session) {
    const { 
      customer: customerId, 
      subscription: subscriptionId, 
      customer_email: email,
      client_reference_id: userId,
      metadata = {}
    } = session;

    const planType = metadata.plan_type || 'monthly';
    const amount = planType === 'yearly' ? 8999 : 999;

    // Find user by email or client_reference_id
    let user = null;
    if (userId) {
      try {
        user = await API.getOne('users', userId);
      } catch (e) {}
    }
    if (!user && email) {
      const res = await API.get('users', { limit: 100 });
      user = (res.data || []).find(u => u.email?.toLowerCase() === email?.toLowerCase());
    }

    if (!user) {
      console.warn('[StripeWebhooks] User not found for checkout session');
      return { success: false, reason: 'user_not_found' };
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (planType === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    // Check for existing subscription
    const subsRes = await API.get('subscriptions', { limit: 100 });
    const existingSub = (subsRes.data || []).find(s => s.user_id === user.id);

    const subPayload = {
      user_id: user.id,
      stripe_customer_id: customerId || '',
      stripe_subscription_id: subscriptionId || '',
      stripe_price_id: StripeConfig.prices[planType]?.id || '',
      plan_type: planType,
      plan: planType,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      amount: amount,
      currency: 'GBP',
      checkout_session_id: session.id || '',
      cancel_at_period_end: false
    };

    if (existingSub) {
      await API.patch('subscriptions', existingSub.id, subPayload);
    } else {
      await API.post('subscriptions', { id: generateId('sub'), ...subPayload });
    }

    // Record invoice
    await API.post('invoices', {
      id: generateId('inv'),
      user_id: user.id,
      stripe_invoice_id: session.invoice || '',
      subscription_id: existingSub?.id || '',
      amount: amount,
      currency: 'GBP',
      status: 'paid',
      invoice_date: now.toISOString(),
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
      plan_type: planType
    });

    console.log(`[StripeWebhooks] Subscription activated for user: ${user.id}`);
    return { success: true, userId: user.id };
  },

  // ─── INVOICE.PAID ────────────────────────────────────────────────
  // Fired on successful recurring payment (auto-renewal)
  async onInvoicePaid(invoice) {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return { success: false, reason: 'no_subscription_id' };

    const res = await API.get('subscriptions', { limit: 100 });
    const sub = (res.data || []).find(s => s.stripe_subscription_id === subscriptionId);

    if (!sub) {
      console.warn('[StripeWebhooks] Subscription not found for invoice:', subscriptionId);
      return { success: false, reason: 'subscription_not_found' };
    }

    // Calculate new period end
    const newPeriodEnd = new Date();
    if (sub.plan_type === 'monthly') {
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
    } else {
      newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
    }

    // Renew subscription
    await API.patch('subscriptions', sub.id, {
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: newPeriodEnd.toISOString(),
      cancel_at_period_end: false
    });

    // Record invoice
    await API.post('invoices', {
      id: generateId('inv'),
      user_id: sub.user_id,
      stripe_invoice_id: invoice.id || '',
      subscription_id: sub.id,
      amount: sub.amount,
      currency: sub.currency,
      status: 'paid',
      invoice_date: new Date().toISOString(),
      period_start: new Date().toISOString(),
      period_end: newPeriodEnd.toISOString(),
      plan_type: sub.plan_type,
      invoice_pdf_url: invoice.invoice_pdf || ''
    });

    console.log(`[StripeWebhooks] Subscription renewed for: ${sub.user_id}`);
    return { success: true, userId: sub.user_id };
  },

  // ─── INVOICE.PAYMENT_FAILED ──────────────────────────────────────
  // Fired when recurring payment fails
  async onPaymentFailed(invoice) {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return { success: false };

    const res = await API.get('subscriptions', { limit: 100 });
    const sub = (res.data || []).find(s => s.stripe_subscription_id === subscriptionId);

    if (sub) {
      await API.patch('subscriptions', sub.id, { status: 'past_due' });
      console.log(`[StripeWebhooks] Payment failed, marked past_due: ${sub.user_id}`);
      return { success: true, userId: sub.user_id, action: 'marked_past_due' };
    }

    return { success: false };
  },

  // ─── CUSTOMER.SUBSCRIPTION.DELETED ──────────────────────────────
  // Fired when subscription is fully cancelled
  async onSubscriptionDeleted(subscription) {
    const subscriptionId = subscription.id;
    const res = await API.get('subscriptions', { limit: 100 });
    const sub = (res.data || []).find(s => s.stripe_subscription_id === subscriptionId);

    if (sub) {
      await API.patch('subscriptions', sub.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_at_period_end: true
      });
      console.log(`[StripeWebhooks] Subscription cancelled: ${sub.user_id}`);
      return { success: true, userId: sub.user_id };
    }

    return { success: false };
  },

  // ─── CUSTOMER.SUBSCRIPTION.UPDATED ──────────────────────────────
  // Fired when subscription is modified (plan change, cancel pending etc.)
  async onSubscriptionUpdated(subscription) {
    const subscriptionId = subscription.id;
    const res = await API.get('subscriptions', { limit: 100 });
    const sub = (res.data || []).find(s => s.stripe_subscription_id === subscriptionId);

    if (sub) {
      const updates = {
        status: subscription.status || sub.status,
        cancel_at_period_end: subscription.cancel_at_period_end || false
      };

      if (subscription.current_period_end) {
        updates.current_period_end = new Date(subscription.current_period_end * 1000).toISOString();
      }
      if (subscription.current_period_start) {
        updates.current_period_start = new Date(subscription.current_period_start * 1000).toISOString();
      }

      await API.patch('subscriptions', sub.id, updates);
      return { success: true };
    }

    return { success: false };
  },

  // ─── CUSTOMER.SUBSCRIPTION.TRIAL_WILL_END ────────────────────────
  // Fired 3 days before trial ends
  async onTrialWillEnd(subscription) {
    console.log('[StripeWebhooks] Trial ending soon for subscription:', subscription.id);
    // In production: trigger email notification
    return { success: true, action: 'trial_ending_notification_queued' };
  },

  // ─── CHECK DUPLICATE EVENT ───────────────────────────────────────
  async checkDuplicate(eventId) {
    try {
      const res = await API.get('stripe_events', { limit: 100 });
      const events = res.data || [];
      return events.some(e => e.stripe_event_id === eventId && e.status === 'processed');
    } catch {
      return false;
    }
  },

  // ─── LOG EVENT ───────────────────────────────────────────────────
  async logEvent(eventId, eventType, status, payload, result, errorMsg = null) {
    try {
      await API.post('stripe_events', {
        id: generateId('evt'),
        stripe_event_id: eventId,
        event_type: eventType,
        status: status,
        payload: JSON.stringify({ data: payload, result }),
        error_message: errorMsg || ''
      });
    } catch (err) {
      console.error('[StripeWebhooks] Failed to log event:', err);
    }
  },

  // ─── SIMULATE WEBHOOK (for testing without Stripe account) ──────
  async simulateEvent(eventType, overrides = {}) {
    console.log(`[StripeWebhooks] Simulating event: ${eventType}`);
    
    const user = Auth.getUser();
    if (!user) { Notify.error('Not logged in'); return; }

    const subsRes = await API.get('subscriptions', { limit: 100 });
    const userSub = (subsRes.data || []).find(s => s.user_id === user.id);

    const mockData = {
      'checkout.session.completed': {
        id: 'cs_sim_' + Date.now(),
        customer: userSub?.stripe_customer_id || 'cus_sim',
        subscription: userSub?.stripe_subscription_id || 'sub_sim',
        customer_email: user.email,
        client_reference_id: user.id,
        metadata: { plan_type: userSub?.plan_type || 'monthly' }
      },
      'invoice.paid': {
        id: 'in_sim_' + Date.now(),
        subscription: userSub?.stripe_subscription_id || 'sub_sim',
        invoice_pdf: null
      },
      'invoice.payment_failed': {
        id: 'in_fail_' + Date.now(),
        subscription: userSub?.stripe_subscription_id || 'sub_sim'
      },
      'customer.subscription.deleted': {
        id: userSub?.stripe_subscription_id || 'sub_sim'
      },
      ...overrides
    };

    const eventData = mockData[eventType];
    if (!eventData) {
      Notify.error('Unknown event type: ' + eventType);
      return;
    }

    const result = await this.processEvent(eventType, eventData, 'evt_sim_' + Date.now());
    Notify.success(`Webhook simulated: ${eventType}`);
    return result;
  }
};

// ─── AUTO-CHECK SUBSCRIPTION EXPIRY ON PAGE LOAD ─────────────────────
// Checks if subscriptions have expired and updates status accordingly
async function checkSubscriptionExpiry() {
  try {
    const res = await API.get('subscriptions', { limit: 100 });
    const subs = res.data || [];
    const now = new Date();

    for (const sub of subs) {
      if (sub.status === 'active' && sub.current_period_end) {
        const endDate = new Date(sub.current_period_end);
        if (endDate < now) {
          // Subscription has expired — mark as expired
          await API.patch('subscriptions', sub.id, { status: 'expired' });
          console.log(`[AutoExpiry] Subscription expired for user: ${sub.user_id}`);
        }
      }
    }
  } catch (err) {
    console.error('[AutoExpiry] Error:', err);
  }
}

export default StripeWebhooks;
window.checkSubscriptionExpiry = checkSubscriptionExpiry;
