# Pipeline Digest Bot

Two things in one small app:

1. **Daily Slack digest** — accounts you own that have gone quiet (14+ days
   with no engagement), plus new-account sourcing candidates.
2. **Real-time Slack ping** on genuine email signals (reply, link click, or
   an open that happens well after send) from your 1:1 tracked HubSpot emails.

## 1. Deploy to Railway

1. Push this folder to a GitHub repo (or `railway init` directly from it).
2. In Railway: New Project > Deploy from GitHub repo.
3. Add the environment variables from `.env.example` under the Variables tab.
4. Railway will run `npm start` automatically. Note the generated public URL —
   you'll need it for the HubSpot workflow webhook in step 3.

## 2. HubSpot setup

**Private app token:**
Settings > Integrations > Private Apps > Create a private app.
Scopes needed: `crm.objects.contacts.read`, `crm.objects.companies.read`.
Copy the token into `HUBSPOT_PRIVATE_APP_TOKEN`.

**Your owner ID:**
Settings > Users & Teams > click your user > the ID is in the URL. Put it in
`HUBSPOT_OWNER_ID`.

**Portal ID:**
Any HubSpot URL has the form `app.hubspot.com/.../<PORTAL_ID>/...` — grab that
number for `HUBSPOT_PORTAL_ID` (used to build clickable links in the digest).

## 3. HubSpot workflows for real-time signals

Create three contact-based workflows (Automation > Workflows > From scratch,
object type: Contact):

| Workflow | Enrollment trigger | Webhook action body |
|---|---|---|
| Sales email replied | "Sales email replied" | `{"signalType": "replied", "contactName": "{{contact.firstname}} {{contact.lastname}}", "company": "{{contact.company}}", "emailName": "{{contact.hs_email_last_email_name}}"}` |
| Sales email clicked | "Sales email link clicked" | same, with `signalType: "clicked"` |
| Sales email opened | "Sales email opened" | same, with `signalType: "opened"`, plus `eventTimestamp` and `sendTimestamp` fields (use the workflow's available email-send/open timestamp tokens) |

Point each webhook action at:
`https://<your-railway-url>/webhook/hubspot-signal`

HubSpot's exact token names for send/open timestamps vary by portal — check
the token picker in the webhook action editor. If your portal doesn't expose
both timestamps, you can drop the 5-minute noise filter in `index.js` and let
the "opened" workflow ping immediately (it'll be noisier, but simpler).

## 4. Slack setup

1. Create an app at api.slack.com/apps > From scratch.
2. Under OAuth & Permissions, add the `chat:write` bot scope, then install the
   app to your workspace.
3. Copy the Bot User OAuth Token into `SLACK_BOT_TOKEN`.
4. For `SLACK_CHANNEL_ID`: invite the bot to a channel (or use your own Slack
   member ID for a DM) and grab the ID from the channel/user details.

## 5. Fill in ZoomInfo sourcing

`lib/zoominfo.js` is a stub — `findNewAccountCandidates()` currently returns
nothing. You'll need your own ZoomInfo API access (separate from the ZoomInfo
connector available inside Claude chat) to wire this up for real. See the
comments in that file for the intended shape.

## 6. Test

- Hit `GET /run-digest` on your Railway URL to manually fire the daily digest
  without waiting for the 8am cron.
- Log a test email to yourself in HubSpot, open/click/reply from another
  device, and confirm the workflow fires and the Slack ping lands.
