# GolfGive — Full-Stack SaaS Golf Platform

> Play Golf. Win Prizes. Change Lives.

A production-ready SaaS platform for golf enthusiasts with integrated Stripe subscription billing, prize draw management, and charity donation routing.

---

## 🚀 Live URLs

| Page | Path |
|------|------|
| Homepage | `/index.html` |
| Sign Up | `/signup.html` |
| Sign In | `/login.html` |
| Dashboard | `/dashboard.html` |
| Pricing | `/pricing.html` |
| Draws | `/draws.html` |
| Charities | `/charities.html` |
| Admin Panel | `/admin.html` |
| Subscription Success | `/subscription-success.html` |

---

## 🔑 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **User** | james@example.com | password123 |
| **Admin** | admin@golfcharity.com | admin123 |
| Extra User | sarah@example.com | password123 |
| Extra User | david@example.com | password123 |

---

## 🗄️ Database Tables (10 tables)

| Table | Records | Purpose |
|-------|---------|---------|
| `users` | 4 | User accounts, roles, profile info |
| `subscriptions` | 4 | Stripe subscription lifecycle per user |
| `invoices` | 6 | Invoice history per user |
| `stripe_events` | — | Webhook audit log for deduplication |
| `payments` | 5 | Payment records linked to subscriptions |
| `charities` | 6 | Featured charities on the platform |
| `user_charity_selections` | 4 | User → charity links + contribution % |
| `scores` | 11 | Stableford golf scores per user (max 5) |
| `draws` | 4 | Monthly prize draw records |
| `winners` | 3 | Prize winners with payment status |

---

## 💳 Stripe Integration

### Demo Mode (current)
- Stripe is configured in **demo/test mode**
- A simulated payment modal appears with test card: `4242 4242 4242 4242`
- Card `4000000000000002` simulates a decline
- All subscription data is stored in the database

### Activating Real Stripe
1. Get your **Publishable Key** from [Stripe Dashboard → API Keys](https://dashboard.stripe.com/apikeys)
2. Edit `js/stripe-config.js` → replace `publishableKey`
3. Create two products in Stripe:
   - **GolfGive Monthly** → Recurring £9.99/month → copy Price ID → replace `prices.monthly.id`
   - **GolfGive Yearly** → Recurring £89.99/year → copy Price ID → replace `prices.yearly.id`
4. Configure [Customer Portal](https://dashboard.stripe.com/test/settings/billing/portal)
5. Deploy a backend webhook endpoint (Node/Vercel/Netlify) using `js/stripe-webhooks.js`

---

## 🏗️ Architecture

```
Static Frontend (HTML/CSS/JS)
    │
    ├── js/main.js              Core: API, Auth, Notify, ScoreManager, DrawEngine
    ├── js/stripe-config.js     Stripe keys & plan metadata
    ├── js/stripe-checkout.js   Checkout flow + demo modal + subscription CRUD
    ├── js/stripe-webhooks.js   Webhook handlers (for backend deployment)
    ├── js/subscription-guard.js Premium access gating middleware
    │
    ├── css/main.css            Global styles (dark premium theme)
    └── css/dashboard.css       Dashboard-specific styles
```

### RESTful Table API (`tables/{table}`)
- `GET tables/{table}?page=1&limit=100` — list records
- `GET tables/{table}/{id}` — get one
- `POST tables/{table}` — create
- `PATCH tables/{table}/{id}` — update
- `DELETE tables/{table}/{id}` — soft delete

---

## ✅ Completed Features

### Core Platform
- [x] Homepage with live prize pool stats + animations
- [x] Multi-step signup wizard (personal → plan → charity → contribution)
- [x] Login with email/password + demo shortcuts
- [x] Admin guard (role-based redirect)
- [x] Responsive dark premium UI across all pages

### Subscription System
- [x] Monthly (£9.99) and Yearly (£89.99, save 25%) plans
- [x] Stripe Checkout (demo modal + real Stripe.js redirect)
- [x] Subscription lifecycle: active → past_due → expired → cancelled
- [x] Invoice history display in dashboard
- [x] Cancel subscription with confirmation
- [x] Reactivate via new checkout flow
- [x] Customer portal link (Stripe-hosted)
- [x] Subscription status badge in sidebar

### Dashboard
- [x] Overview with live stats cards
- [x] Score management (add/edit/delete up to 5 Stableford scores)
- [x] Draws & results with match checking
- [x] Winnings tracker with payment proof upload
- [x] Charity selection & contribution slider
- [x] Browse all charities
- [x] Subscription management section
- [x] Profile settings with password change

### Admin Panel
- [x] Analytics overview (MRR, subscribers, prizes, charity totals)
- [x] User management table with status
- [x] Subscriptions table with Stripe IDs + cancel/reactivate
- [x] Draw management (run draws, view history)
- [x] Winners management with payment processing
- [x] Charity management
- [x] Payments admin
- [x] Stripe events log

---

## 🐛 Bug Fixes (v2 → v3)

### Connection Error on Login — FIXED ✅
**Root Cause:** The `users` table was never created in the database. The login page calls
`API.get('users')` → `tables/users` → returned a non-200 response → caught as "Connection error".

**Fix applied:**
1. Created `users` table schema with 19 fields
2. Seeded 4 demo users (james, admin, sarah, david)
3. Re-seeded `subscriptions`, `invoices`, `payments` with correct `user_id` references
4. Created all missing tables: `charities`, `scores`, `user_charity_selections`, `draws`, `winners`, `payments`
5. Fixed `avatar_url` → `avatar` field name mismatch in `dashboard.html`, `admin.html`, `draws.html`
6. Fixed `email_verified` → `is_email_verified` in `signup.html`
7. Removed Cloudflare email obfuscation from `login.html` demo credentials display

---

## 📋 Pending / Future Enhancements

- [ ] Real bcrypt password hashing (requires backend)
- [ ] Email verification flow
- [ ] Real Stripe webhook signature verification (requires backend)
- [ ] PDF invoice generation
- [ ] Automated monthly draw scheduling
- [ ] Push notifications for draw results
- [ ] Multi-currency support
- [ ] Referral/affiliate system

---

## 🔒 Security Notes

> This is a **demo/static** implementation. For production:
> - **Never store plain-text passwords** — use bcrypt on a backend server
> - **Never verify Stripe webhooks on the frontend** — use a signed backend endpoint
> - **Never expose secret keys** — only publishable keys belong in frontend code
> - Consider adding rate limiting, CSRF protection, and proper session management
