# Monetization Implementation Plan — The American Express Times

**Goal:** $10,000/month from ads + sponsorship + higher-yield models.
**Honest timeline:** $2k–4k/mo by day 120 (stretch $10k), full $10k/mo by month 6–9.
**Source of strategy:** deep-research verdict (2026-06-06). General-news ads alone ≈ $8/1k subscribers — we must pivot the *format and sales motion*, not just grow the list.

> **The one-sentence strategy:** Stop being an "ad-supported general-news publisher." Become a **local marketing channel + lead engine that happens to deliver news** — because local/lead-gen/classifieds out-monetize general-news CPM by 3–10×.

---

## 0. Owners legend

- 🛠️ **DEV** — Claude builds it in this repo
- 💼 **CLIENT** — sales / outreach / business ops (no code)
- 📊 **DATA** — needs a number from the client before it can be modeled accurately

**Decisive unknowns to get from client NOW (📊):** open rate & CTR, can audience be geo-concentrated to a US metro/state, current monthly site pageviews + traffic source mix, existing local-advertiser relationships. These change sequencing but do **not** block the engineering work in Phase 1.

---

## 1. Revenue model stack (what we sell, ranked by yield)

| # | Product | Yield vs general-news ads | Build effort | Phase |
|---|---|---|---|---|
| 1 | **Local/geo-targeted sponsorship** (newsletter ad-slot sold to local advertisers) | 3–10× | Med (ad-slot system) | 1 |
| 2 | **Lead-gen placements** (~$150 CPM equiv) | 3–6× | Low (uses ad-slot) | 2 |
| 3 | **Job board / classifieds** (recurring, list-independent) | High, recurring | High | 2–3 |
| 4 | **"Marketing partner" services** (dedicated sends, advertorials) | Priced as services | Low–Med | 3 |
| 5 | **Affiliate** (inventory fallback — never run a blank slot) | Fills gaps | Low | 1–2 |
| 6 | **Website display ads** (AdSense → Ezoic → Raptive at scale) | Low early, grows w/ traffic | Low | 1 (AdSense), 3+ (premium) |

Display ads and marketplace fill are the **floor** (passive, low). Direct local + lead-gen + classifieds are the **engine** (active selling, real money). The build prioritizes the engine.

---

## 2. FEATURE 1 (deepest spec) — Newsletter Ad-Slot System

The core inventory. A sponsored placement block injected into the daily email, creative-driven from the DB, with per-send impression + click tracking so we can show advertisers real numbers (and justify rates).

### 2.1 Data model — new table `sponsorships`

Add to `scripts/supabase_schema.sql` + a migration `scripts/add_sponsorships_table.sql` (mirrors the `add_subscribers_table.sql` convention), and the SQLite equivalent in `src/providers/db/sqlite.py` `_init_schema`.

```sql
CREATE TABLE IF NOT EXISTS sponsorships (
  id              SERIAL PRIMARY KEY,
  advertiser      TEXT NOT NULL,            -- internal label
  headline        TEXT NOT NULL,            -- shown in email
  body            TEXT NOT NULL,            -- 1–2 sentence copy
  cta_label       TEXT NOT NULL DEFAULT 'Learn More',
  dest_url        TEXT NOT NULL,            -- advertiser landing page (raw)
  image_url       TEXT,                     -- optional logo/creative
  label_text      TEXT NOT NULL DEFAULT 'SPONSORED',
  -- targeting / scheduling
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  geo             TEXT,                     -- optional: metro/state for geo editions
  weight          INT  NOT NULL DEFAULT 1,  -- rotation weight when multiple active
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- billing/reporting
  rate_cents      INT,                      -- what advertiser paid for the flight
  -- metrics (denormalized counters; events table is source of truth)
  impressions     INT NOT NULL DEFAULT 0,
  clicks          INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_events (
  id            BIGSERIAL PRIMARY KEY,
  sponsorship_id INT NOT NULL REFERENCES sponsorships(id),
  event_type    TEXT NOT NULL,             -- 'impression' | 'click'
  digest_date   DATE,                      -- which send
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_events_sponsor ON ad_events(sponsorship_id);
```

### 2.2 Selection logic (Python pipeline)

New module `src/ad_selector.py`:
- `get_active_sponsorship(db, digest_date, geo=None) -> Optional[Sponsorship]`
- Query `sponsorships` where `is_active AND start_date <= digest_date <= end_date` (and `geo` matches if geo edition).
- If multiple active → weighted rotation by `weight`. If none → return `None` and the email falls back to an **affiliate** house ad (Feature 5) so the slot is never blank.
- Add `get_sponsorship()` / `record_ad_event()` to the DB provider ABC (`src/providers/db/base.py`) + both impls (`sqlite.py`, `supabase_provider.py`), following the existing `save_pdf_record` pattern.

### 2.3 Email template — the ad block

In `templates/email_digest.html`, inject a sponsor row. Best placement for engagement + deliverability: **after the intro, before the first category** (single slot to start; "above the fold" but below masthead). Pass `sponsorship` into the render context.

`src/email_sender.py` → `_render_template()` currently passes `articles, date, total_count, title, subscribe_url, unsubscribe_url, website_base_url`. Add:
```python
sponsorship=self._selected_sponsorship,   # set in send_digest() once per run
```

Template block (table-based to match the existing email; inline styles for client compatibility):
```html
{% if sponsorship %}
<tr>
  <td style="padding:18px 40px;background:#F8F5EF;border-top:1px solid #eee;border-bottom:1px solid #eee;">
    <p style="margin:0 0 6px;color:#999;font-size:10px;letter-spacing:2px;
              text-transform:uppercase;font-family:Arial,sans-serif;">{{ sponsorship.label_text }}</p>
    <a href="{{ sponsorship.tracked_url }}" style="text-decoration:none;color:#1B2D5E;">
      {% if sponsorship.image_url %}<img src="{{ sponsorship.image_url }}" width="120"
           alt="" style="float:left;margin:0 16px 8px 0;border-radius:4px;"/>{% endif %}
      <strong style="font-size:16px;">{{ sponsorship.headline }}</strong>
      <span style="display:block;color:#444;font-size:14px;line-height:1.6;margin-top:4px;">
        {{ sponsorship.body }}</span>
      <span style="display:inline-block;margin-top:10px;background:#B22234;color:#fff;
            padding:8px 18px;border-radius:3px;font-size:12px;font-weight:700;
            font-family:Arial,sans-serif;">{{ sponsorship.cta_label }} &rarr;</span>
    </a>
  </td>
</tr>
{% endif %}
```

> ⚠️ **Deliverability rule (SendGrid ban-hardening already in this repo):** the slot must always render the `SPONSORED` label, keep ad density low (one slot), and use a tracked redirect on **our** domain (not a raw advertiser URL) so links stay consistent and reputation-safe.

### 2.4 Click + impression tracking

**Click redirect** — new Next.js route `web/src/app/api/ad-click/route.ts` (mirrors `unsubscribe/route.ts` pattern, Supabase service key):
- `GET /api/ad-click?s=<sponsorship_id>&d=<digest_date>` → insert `ad_events('click')`, increment `sponsorships.clicks`, then `302` redirect to `dest_url` with UTM params appended (`utm_source=newsletter&utm_medium=email&utm_campaign=<date>`).
- `tracked_url` in the template = `{{ website_base_url }}/api/ad-click?s={{ sponsorship.id }}&d={{ date }}`.

**Impression tracking** — at send time, `send_digest()` records one `ad_events('impression')` per successful delivery (or a single batched count = `sent_count`), and bumps `sponsorships.impressions`. (A tracking pixel is unreliable across mail clients; send-count is the honest, standard metric for newsletters.)

### 2.5 Admin UI (sell + manage)

Add to the existing `/admin` (already password-protected via `ADMIN_PASSWORD`):
- **`web/src/app/admin/sponsorships/page.tsx`** — list active/scheduled flights, create/edit form, and a metrics column (impressions, clicks, CTR, revenue).
- **API:** `web/src/app/api/admin/sponsorships/route.ts` (GET list, POST create) + `[id]/route.ts` (PATCH/DELETE), guarded by the existing admin auth (`web/src/lib/auth.ts`).
- This is what lets the client (or you) load a sold deal in 2 minutes and pull a screenshot of results for renewals.

### 2.6 Ship checklist (Feature 1)
1. 🛠️ migration + schema + SQLite init
2. 🛠️ DB provider methods (Python) + web DB adapter reads
3. 🛠️ `src/ad_selector.py` + wire into `pipeline.py`/`email_sender.py`
4. 🛠️ email template block
5. 🛠️ `/api/ad-click` redirect route
6. 🛠️ admin sponsorships CRUD + metrics
7. 🛠️ seed one **house ad** (promote our own subscribe/referral) so the slot is never empty before first sponsor
8. ✅ Test: load a fake flight, send a test digest, click, confirm event recorded + redirect works

---

## 3. FEATURE 2 — Sponsor rate-card page (`/advertise`)

🛠️ `web/src/app/advertise/page.tsx` — public landing page so prospects have somewhere credible to land:
- Audience stats (subscriber count, open rate, CTR — pulled live or hardcoded from 📊 client data), reach, demographics/geo.
- Ad formats + pricing tiers (primary slot, dedicated send, classifieds).
- A booking/contact form → `web/src/app/api/advertise-inquiry/route.ts` that emails the client (reuse SendGrid) + stores the lead.
- Reuses `rate-limit.ts` + honeypot pattern from `/api/subscribe`.

💼 **Pricing (starting rate card — adjust once open rate is known):** at 1k–5k subs, price by *value* not CPM. Single send $75–$250; weekly package discount; dedicated send 2–3× a normal slot; local-sponsor monthly package (4 sends) at a bundled rate. Local advertisers buy reach, not CPM — anchor on "X local readers."

---

## 4. FEATURE 3 — Job board / classifieds (recurring, list-independent)

Higher-yield, recurring, and independent of list size. Bigger build → Phase 2–3.
- 🛠️ Routes: `web/src/app/jobs/page.tsx` (+ `/classifieds`), `article/[slug]`-style listing pages, submission form.
- 🛠️ `listings` table (title, company, body, type, paid status, expires_at, contact).
- 🛠️ **Stripe checkout** per listing (`stripe:stripe-best-practices` skill available) — Checkout Sessions, one-time payment per post, webhook marks listing `paid`+`active`.
- 🛠️ Listings auto-expire (`expires_at`); featured-listing upsell.
- Cross-promote each new listing in the newsletter (free inventory → drives listing sales).

---

## 5. FEATURE 4 — Affiliate fallback + house ads

- 🛠️ Extend `ad_selector.py`: when no paid sponsorship is active, serve a rotating **affiliate** offer or **house ad** (subscribe/referral push). Same tracked-redirect plumbing.
- 💼 Join affiliate programs fitting a general-US-news audience (finance, subscriptions, deals). Keep a small `affiliate_ads` set the selector falls back to.

---

## 6. FEATURE 5 — Website display ads

- 🛠️ **Now:** add **Google AdSense** to the Next.js site (a few non-intrusive units on `article/[slug]` + `archive`). Low news RPM but passive.
- ⚠️ **MFA risk (verified):** the site is AI-rewritten aggregation. Ezoic/Raptive **prohibit auto-generated content**; MFA spend was crushed to 0.39% in Q3 2025. **Mitigation:** ensure visible original editorial value (curation, original framing, clean ad density, real about/contact pages) so we qualify and don't get throttled.
- 🛠️ **Later (month 3+):** when traffic clears **25k monthly pageviews**, apply to **Raptive** (join min lowered Oct 2025); the RPM guarantee needs 100k+ PVs and $20k+ trailing revenue, so this is a scale lever, not an early one.

---

## 7. Subscriber growth engine ($500–2k/mo budget)

Ad revenue scales with **engaged opens**, not raw list size — so grow *and* protect open rate.

| Channel | Owner | Cost | Expected | Notes |
|---|---|---|---|---|
| 🛠️ **Referral program** | DEV | free | compounding | per-subscriber referral link + milestone rewards; new `referrals` table; share block in email footer |
| **beehiiv recommendations / SparkLoop** | CLIENT | low–med | cheapest scalable subs | requires platform setup; pay-per-sub |
| **Newsletter swaps** | CLIENT | free | med | cross-promote with similar-size newsletters |
| **Meta / Reddit ads** | CLIENT | $$ | ~$2–3 CAC | $500–2k/mo → ~165–1,000 paid subs/mo |
| **SEO** (article pages already exist) | DEV | free | slow compounding | improves display-ad traffic too |

📊 Realistic blended growth: **~1,000–2,500 subs/month**. Track **CAC by channel** weekly — kill anything above ~$3/sub.

---

## 8. 90–120 day plan with milestones, owners, targets

### Month 1 — Build the engine + start selling (target $500–1.5k)
- 🛠️ Ship **Feature 1 (ad-slot system)** end-to-end + house ad.
- 🛠️ Ship **Feature 2 (`/advertise` page)** + inquiry form.
- 🛠️ Add AdSense (Feature 6 baseline) + **referral program** (Feature 7).
- 💼 Build a list of **50+ local advertisers**; start outreach. Join Paved/beehiiv ad network for marketplace fill.
- 📊 Confirm open rate, geo-concentration, pageviews → re-price rate card.
- **KPIs:** ad-slot live, first sponsor or marketplace fill, referral live, baseline open/CTR.

### Month 2 — Layer higher-yield + grow (target $1.5k–3k)
- 🛠️ Ship **Job board / classifieds** (Feature 3) with Stripe.
- 🛠️ Affiliate fallback (Feature 4) live.
- 💼 Close **2–3 recurring local sponsors**; run first **lead-gen** test placement.
- 💼 Turn on paid acquisition (Meta/Reddit) + swaps; measure CAC.
- **KPIs:** recurring sponsor count, first classifieds revenue, CAC by channel, list growth rate.

### Month 3 — Scale what works (target $3k–5k)
- 🛠️ Launch a **geo/niche spin-off edition** if data supports it (geo column already in `sponsorships`).
- 🛠️ **Dedicated-send** product + advertorial format (Feature 4 services).
- 💼 Sell dedicated sends; renew Month-1 sponsors with metrics screenshots.
- 🛠️ Apply to Raptive if PVs ≥ 25k.
- **KPIs:** revenue per send, renewal rate, edition open rates.

### Month 4 — Lock in recurring revenue (target $5k–8k+, stretch $10k)
- 💼 Convert sponsors to **multi-month / quarterly packages**.
- 🛠️ Scale the best growth channel; optimize ad density vs open rate.
- **KPIs:** MRR from sponsors, total monthly revenue, churn.

---

## 9. KPIs dashboard (track weekly)

Open rate · CTR · list size & growth rate · CAC by channel · sponsor fill rate · revenue per send · ad-slot impressions/clicks/CTR · site pageviews (toward 25k Raptive) · classifieds revenue · MRR.

(Consider a simple `/admin/metrics` page in Phase 2 pulling from `ad_events` + `subscribers` + `listings`.)

---

## 10. The blunt risks (say these to the client)

1. **General-news CPM is the lowest-yield category that exists (~$8/1k).** The plan only works because we pivot to local/lead-gen/classifieds. If the client insists on staying pure national-news display ads, $10k/mo needs ~40k–100k subs = 12–24 months.
2. **$10k by day 120 depends on direct sales effort, not code.** The engineering can be done in weeks; landing local sponsors and lead-gen deals is the gating, human, outbound-sales work. Someone must own selling.
3. **MFA/AI-content risk** can get the site rejected by ad networks — we must keep visible original editorial value.
4. **Open rate is the hidden multiplier** — every estimate here doubles between 25% and 50% open. Get this number first.
```
