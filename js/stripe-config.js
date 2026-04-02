/* ===================================================================
   GOLFGIVE — STRIPE CONFIGURATION & PRODUCT CATALOG
   ===================================================================
   Production-ready Stripe integration layer.
   
   🔑 SETUP INSTRUCTIONS:
   1. Create a Stripe account at https://stripe.com
   2. Go to Developers → API Keys
   3. Copy your Publishable Key and replace STRIPE_PUBLISHABLE_KEY below
   4. Create Products + Prices in Stripe Dashboard:
      - Product: "GolfGive Monthly Subscription"
        → Recurring price: £9.99/month → Copy Price ID
      - Product: "GolfGive Yearly Subscription"  
        → Recurring price: £89.99/year → Copy Price ID
   5. Replace PRICE_IDS below with your actual Stripe Price IDs
   6. Set up Webhook endpoint:
      → Add endpoint: https://yoursite.com/stripe-webhook (or use /api/webhooks)
      → Select events: checkout.session.completed, invoice.paid,
        invoice.payment_failed, customer.subscription.deleted,
        customer.subscription.updated
      → Copy Webhook Secret
   =================================================================== */

const StripeConfig = {

  // ─── PUBLIC KEY (safe to expose in frontend) ────────────────────
  // Replace with your actual Stripe Publishable Key
  publishableKey: 'pk_test_51THP9KQiT6r8AezdKfVQFg5O2Z7E83qMEuPKyqK5LtLeQUiOGccwa6GkmLO6NqBOHvbNT3ZH5jP1CqpcpjR29dVy006HOMnHIa',

  // ─── PRICE IDs (from Stripe Dashboard → Products) ──────────────
  prices: {
    monthly: {
      id: 'price_monthly_GBP_999',       // Replace: e.g. price_1ABC123defGHI
      amount: 999,                        // 999 pence = £9.99
      currency: 'GBP',
      interval: 'month',
      display: '£9.99/month',
      label: 'Monthly Plan',
      savings: null
    },
    yearly: {
      id: 'price_yearly_GBP_8999',       // Replace: e.g. price_1XYZ789defMNO
      amount: 8999,                       // 8999 pence = £89.99
      currency: 'GBP',
      interval: 'year',
      display: '£89.99/year',
      label: 'Yearly Plan',
      savings: 'Save 25% — £29.89/year'
    }
  },

  // ─── URLS ────────────────────────────────────────────────────────
  successUrl: window.location.origin + '/subscription-success.html',
  cancelUrl: window.location.origin + '/pricing.html?cancelled=true',
  
  // Stripe Customer Portal (configure at dashboard.stripe.com/test/settings/billing/portal)
  customerPortalUrl: 'https://billing.stripe.com/p/login/test_YOUR_PORTAL_ID',

  // ─── FEATURE FLAGS ───────────────────────────────────────────────
  trialDays: 0,              // Set to 7 for free trial
  allowPromoCode: true,      // Allow promotional codes
  collectBillingAddress: false,

  // ─── PLAN METADATA ───────────────────────────────────────────────
  planDetails: {
    monthly: {
      name: 'Monthly',
      price: 9.99,
      billingInterval: 'month',
      features: [
        'Monthly prize draw entry',
        'Up to 5 Stableford scores',
        'Choose your charity (10–50%)',
        '3-match, 4-match, 5-match prizes',
        'Real-time prize pool tracking',
        'Cancel anytime'
      ]
    },
    yearly: {
      name: 'Yearly',
      price: 89.99,
      billingInterval: 'year',
      features: [
        '12 monthly prize draw entries',
        'Up to 5 Stableford scores',
        'Choose your charity (10–50%)',
        '3-match, 4-match, 5-match prizes',
        'Real-time prize pool tracking',
        'Priority email support',
        '25% annual saving'
      ]
    }
  },

  // ─── CHECK IF PROPERLY CONFIGURED ───────────────────────────────
  isConfigured() {
    return this.publishableKey !== 'pk_test_YOUR_STRIPE_PUBLISHABLE_KEY_HERE' 
      && this.publishableKey.startsWith('pk_');
  },

  isTestMode() {
    return this.publishableKey.startsWith('pk_test_');
  },

  getPriceId(planType) {
    return this.prices[planType]?.id;
  },

  getPlanDetails(planType) {
    return this.planDetails[planType] || this.planDetails.monthly;
  }
};

window.StripeConfig = StripeConfig;
