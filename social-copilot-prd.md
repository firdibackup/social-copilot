# Product Requirements Document (PRD)

## Social Copilot --- Personal Instagram Automation

**Status:** Draft\
**Version:** 1.0\
**Date:** 13 October 2026\
**Product type:** Personal-use web application\
**Working name:** Social Copilot

------------------------------------------------------------------------

## 1. Product Overview

Social Copilot is a personal dashboard to manage an Instagram
Professional account (Business or Creator). It combines content
planning, AI-assisted content creation, scheduled publishing, and
Instagram Direct Message management in one place.

The product takes inspiration from the general workflow and technology
choices observed in Bleam.ai. It will use its own product identity,
interface, and implementation. It will not copy Bleam.ai's proprietary
design or code.

The first release is for one owner and one connected Instagram account.
The application will start in local development and move to a publicly
accessible deployment only when required for integrations and production
use.

## 2. Problem Statement

Managing Instagram content can require several separate tools and
repetitive tasks. The owner needs one place to: - Plan posts on a
calendar. - Draft and review captions and creative assets. - Publish
content at a scheduled time. - Review and respond to supported Instagram
messages. - Generate content drafts with an AI model. - Track
publication status and failures.

## 3. Goals

### Primary goals

1.  Connect an Instagram Business or Creator account through Meta's
    official Instagram API.
2.  Provide a calendar and content library.
3.  Publish supported media through the official API.
4.  Provide an inbox for messages supported by Meta's messaging API.
5.  Generate content ideas and drafts using 9Router with the
    `Hermes-daily` combo.
6.  Keep credentials and tokens secure on the server.

### Non-goals for the first release

-   A public multi-tenant SaaS.
-   Support for multiple customers, teams, or workspaces.
-   Unofficial Instagram scraping or browser automation.
-   Automated unsolicited DMs or bulk messaging.
-   Guaranteed publishing for every Instagram media type.
-   Advanced analytics, competitor monitoring, or social listening.
-   Recreating Bleam.ai's exact interface, branding, or proprietary
    behavior.

## 4. Target User and Usage

**Primary user:** the application owner.

**Initial usage:** one Instagram Professional account, controlled by one
user, during development and personal use.

**Primary language:** Bahasa Indonesia.\
**Timezone:** configurable; default to Asia/Jakarta.\
**Initial deployment:** localhost. Some Meta workflows, webhooks, and
media publishing may require a public HTTPS URL or tunnel during
testing.

## 5. Product Scope and Priorities

### P0 --- Instagram connection and security

-   Connect Instagram through official Meta OAuth.
-   Validate OAuth `state` to protect against CSRF.
-   Store tokens only on the server.
-   Display connection status and account username.
-   Handle token expiry, revocation, and reconnection.
-   Provide a disconnect action.

### P1 --- Content calendar and library

-   Month, week, and list views.
-   Create, edit, duplicate, and delete content drafts.
-   Schedule a draft with date, time, timezone, caption, and media.
-   Content statuses: `draft`, `scheduled`, `publishing`, `published`,
    `failed`, and `cancelled`.
-   Filter by status and content type.
-   Preview content before publishing.

### P2 --- Scheduled publishing

-   Publish supported Instagram media using the official API.
-   Support the media types allowed by the current Meta API and account
    permissions.
-   Use a background job or scheduler; do not rely on an open browser
    tab.
-   Record attempts, API responses, timestamps, and failure reasons.
-   Retry transient failures safely and avoid duplicate posts.
-   Allow cancellation before a job starts.
-   Show clear success or failure status.

### P3 --- Instagram Direct Messages

-   Receive supported messaging events through Meta webhooks.
-   Display conversations and messages in an inbox.
-   Send replies when allowed by Meta's API and messaging rules.
-   Track delivery or API errors when available.
-   Provide an AI-suggested reply that the owner reviews before sending.
-   Do not send unsolicited messages or bypass Meta's messaging
    restrictions.

### P4 --- AI Content Studio

-   Generate content ideas from a topic, goal, audience, and tone.
-   Generate captions, calls to action, and hashtag suggestions.
-   Rewrite text into different tones or lengths.
-   Generate content variations.
-   Save generated output as a draft; do not publish without explicit
    scheduling or approval.
-   Use 9Router through the backend with the `Hermes-daily` combo.
-   Allow the user to edit all AI output.

## 6. Main User Flows

### Flow A --- Connect Instagram

1.  Owner opens Settings and selects **Connect Instagram**.
2.  App redirects to Meta's official Instagram Login flow.
3.  Owner signs in and approves requested permissions.
4.  Meta redirects to the configured callback URL.
5.  Backend validates OAuth state and exchanges the authorization code.
6.  Backend fetches the Instagram account profile.
7.  Backend stores the token securely and shows the connected username.

### Flow B --- Create and schedule content

1.  Owner opens Content Studio or Calendar.
2.  Owner creates a draft or generates a draft with AI.
3.  Owner adds or uploads media and edits the caption.
4.  Owner previews the content.
5.  Owner selects a publishing date, time, and timezone.
6.  App creates a scheduled job.
7.  Worker publishes through Meta's API at the scheduled time.
8.  Calendar status updates to `published` or `failed`.

### Flow C --- Reply to a DM

1.  A supported Instagram messaging event arrives through a Meta
    webhook.
2.  Backend validates the webhook and stores the event.
3.  The inbox displays the conversation.
4.  Owner writes a reply or requests an AI suggestion.
5.  Owner reviews and sends the reply through the official API.
6.  The app records the result.

### Flow D --- Generate a content draft

1.  Owner enters topic, objective, audience, tone, and format.
2.  Backend sends a request to 9Router using `Hermes-daily`.
3.  App displays the generated draft.
4.  Owner edits and saves it to the content library.
5.  Owner may schedule it later.

## 7. Information Architecture

Primary navigation: - **Dashboard** --- upcoming posts, recent activity,
connection status, failed jobs. - **Calendar** --- scheduled content and
publishing status. - **Content Studio** --- AI generation and draft
editor. - **Content Library** --- saved drafts and published content. -
**Instagram Inbox** --- supported DMs and reply workflow. - **Settings**
--- Instagram connection, AI provider, timezone, and application
preferences.

The initial UI should be clean, responsive, and focused. Avoid excessive
metrics and unnecessary complexity.

## 8. Technology Reference

The stack is inspired by the technology profile supplied as a reference.
These are implementation choices for Social Copilot, not a claim that
every component is used by Bleam.ai.

  ------------------------------------------------------------------------
  Layer                    Technology              Purpose
  ------------------------ ----------------------- -----------------------
  Framework                Next.js App Router      UI and server endpoints

  Language                 TypeScript              Type safety

  UI                       React                   Interactive components

  Styling                  Tailwind CSS v4         Styling and responsive
                                                   layout

  Icons                    Lucide React            Interface icons

  Database                 Supabase PostgreSQL     Application data

  Authentication/storage   Supabase services as    Owner access and media
                           needed                  storage

  Instagram integration    Official Meta Instagram Account, publishing,
                           API with Instagram      and supported messaging
                           Login                   

  AI gateway               9Router API             Model access

  AI model combo           `Hermes-daily`          AI content and reply
                                                   suggestions

  Background processing    Scheduled jobs / worker Reliable publishing and
                                                   retries

  Hosting                  Railway or another      Deployment when ready
                           compatible host         

  Analytics                Optional, later phase   Product usage and
                                                   errors
  ------------------------------------------------------------------------

### 9Router configuration

Use server-side environment variables. Confirm the exact model
identifier accepted by the 9Router API before implementation.

``` env
ROUTER_API_BASE_URL=https://9router.firdiaudi.my.id/v1
ROUTER_API_KEY=
ROUTER_MODEL=Hermes-daily
```

Never expose the 9Router API key in client-side code or variables
prefixed with `NEXT_PUBLIC_`.

## 9. Proposed Data Model

Initial tables:

### `instagram_connections`

-   `id`
-   `instagram_user_id` (unique)
-   `username`
-   `access_token_encrypted` or equivalent secure server-side secret
    storage
-   `token_expires_at`
-   `connected_at`
-   `updated_at`

### `content_items`

-   `id`
-   `title`
-   `caption`
-   `media_urls`
-   `media_type`
-   `status`
-   `scheduled_at`
-   `timezone`
-   `published_at`
-   `instagram_media_id`
-   `last_error`
-   `created_at`
-   `updated_at`

### `publishing_jobs`

-   `id`
-   `content_item_id`
-   `run_at`
-   `status`
-   `attempt_count`
-   `last_attempt_at`
-   `next_attempt_at`
-   `last_error`
-   `created_at`

### `conversations` and `messages`

-   Store the conversation identifiers and message data permitted by
    Meta's API and applicable retention requirements.
-   Include message direction, timestamps, provider IDs, and send
    status.
-   Avoid storing unnecessary personal data.

### `ai_generations`

-   `id`
-   `task_type`
-   `input_summary`
-   `output_text`
-   `model_identifier`
-   `status`
-   `created_at`

Apply Row Level Security where appropriate. Never expose private tokens
or unrestricted service-role credentials to the browser.

## 10. Integration Requirements

### Meta / Instagram

-   Use official APIs and documented permissions.
-   Start with the minimum permissions required.
-   Use the correct Instagram Login flow and callback URL.
-   Use a public HTTPS tunnel during local testing if required by Meta's
    configuration.
-   Configure webhook verification and event subscriptions before
    implementing inbound DMs.
-   Confirm current media publishing limitations, account eligibility,
    token lifetime, and review requirements against Meta's current
    documentation.
-   Do not assume that a generated test token is equivalent to a
    completed OAuth flow.

### Media storage

-   Store media in Supabase Storage or another compatible object store.
-   For publishing, ensure media URLs satisfy Meta's current
    accessibility and format requirements.
-   Do not assume a `localhost` media URL can be fetched by Meta.

### AI

-   Call 9Router only from server-side code.
-   Use the `Hermes-daily` combo for normal content generation and reply
    suggestions.
-   Add request timeouts, error handling, and usage limits.
-   Treat model output as a draft. The owner remains in control of
    sending messages and publishing posts.

## 11. Security and Reliability Requirements

-   Keep App Secret, access tokens, Supabase service-role keys, and
    9Router API keys server-side.
-   Rotate any credential that has been exposed.
-   Validate OAuth state and callback parameters.
-   Verify webhook signatures or verification tokens according to Meta's
    requirements.
-   Use least-privilege permissions.
-   Protect settings and content routes with owner authentication before
    production.
-   Use database policies to prevent unauthorized data access.
-   Log operational errors without logging access tokens or secrets.
-   Use idempotency controls or job locks to reduce duplicate
    publications.
-   Make retries bounded and distinguish transient from permanent
    errors.
-   Provide clear states for expired permissions, disconnected accounts,
    and failed jobs.

## 12. UX Requirements

-   Clear status labels and actionable error messages.
-   Confirm before deleting content or disconnecting Instagram.
-   Show the scheduled time in the configured timezone.
-   Keep generated content editable.
-   Require explicit owner action before publishing or sending an
    AI-generated reply.
-   Display connection health and token expiry when available.
-   Make the core workflows usable on desktop and mobile.

## 13. Acceptance Criteria

### Instagram connection

-   Owner can start official Instagram Login from the app.
-   OAuth callback validates `state`.
-   Backend retrieves the account profile.
-   Connection status and username appear in the app.
-   Token is never sent to the browser.
-   Invalid state, denied permission, expired token, and API errors are
    handled.

### Calendar and publishing

-   Owner can create, edit, and schedule a draft.
-   Scheduled items appear in the calendar.
-   Worker runs independently of the browser.
-   Successful publication stores the Instagram media ID and publication
    time.
-   Failed publication shows a reason and supports a safe retry.

### DM

-   Supported webhook events appear in the inbox.
-   Owner can send an allowed reply.
-   AI suggestions require owner review before sending.
-   Unsupported actions are clearly disabled or explained.

### AI Studio

-   Owner can generate and edit a draft using `Hermes-daily`.
-   Errors from 9Router are shown without exposing secrets.
-   Generated drafts can be saved to the content library.
-   AI does not publish or send messages autonomously by default.

## 14. Delivery Plan

1.  **Foundation:** create Next.js project, configure Supabase, set
    environment variables, and establish repository structure.
2.  **Instagram OAuth:** finish official login, callback, profile
    retrieval, secure token storage, and connection status.
3.  **Content calendar:** implement drafts, media storage, editing, and
    scheduling UI.
4.  **Publishing worker:** implement scheduled jobs, official API
    publishing, status tracking, and retries.
5.  **AI Studio:** connect 9Router and save generated drafts.
6.  **DM inbox:** configure webhooks, display messages, and send
    compliant replies.
7.  **Hardening:** test token expiry, webhook security, failures,
    duplicate prevention, access controls, and deployment.

Each phase should be tested before the next phase begins.

## 15. Risks and Dependencies

-   Meta may change API permissions, endpoint behavior, supported media
    types, and review requirements.
-   Development Mode limits access to users and accounts with
    appropriate app roles.
-   Localhost alone cannot receive public webhooks or provide publicly
    accessible media to Meta.
-   Scheduled publishing requires a reliable server-side scheduler or
    worker.
-   Token expiry and revoked permissions can interrupt automation.
-   9Router combo identifiers and provider behavior must be verified
    with a test request.
-   DM automation is constrained by Meta's messaging rules.

## 16. References

-   Meta for Developers: https://developers.facebook.com/
-   Instagram API with Instagram Login:
    https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
-   Supabase Next.js guide:
    https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
-   Next.js documentation: https://nextjs.org/docs
-   Tailwind CSS documentation: https://tailwindcss.com/docs

------------------------------------------------------------------------

**Product principle:** Social Copilot should automate repetitive work
while keeping the owner in control of account access, content approval,
publishing, and message sending.
