require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { getStaleContacts } = require('./lib/hubspot');
const { findNewAccountCandidates } = require('./lib/zoominfo');
const { postDigest, postSignalPing, postVisitorPing } = require('./lib/slack');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---- Real-time website visitor webhook (RB2B) ----
// In RB2B: Integrations -> Webhook -> paste this endpoint's full URL:
// https://<your-railway-url>/webhook/rb2b-visitor
// RB2B sends a fixed field-name payload (see support.rb2b.com Setup Guide: Webhook).
app.post('/webhook/rb2b-visitor', async (req, res) => {
  try {
    const body = req.body || {};
    const companyName = body['Company Name'];
    const page = body['Captured URL'];
    const city = body['City'];
    const region = body['State'];

    // RB2B's own test payload uses Company Name "RB2B" - ignore it so test
    // pings from their "Send a Test Event" button don't spam Slack.
    if (companyName === 'RB2B') {
      return res.status(200).send('ignored test payload');
    }

    await postVisitorPing({ companyName, page, city, region });
    res.status(200).send('ok');
  } catch (err) {
    console.error('Error handling RB2B webhook', err);
    res.status(500).send('error');
  }
});

// ---- Real-time email signal webhook ----
// Point a HubSpot workflow's "webhook" action at POST /webhook/hubspot-signal.
// Expected JSON body: { signalType, contactId, contactName, company, emailName,
//                        eventTimestamp, sendTimestamp }
// signalType is one of: "replied" | "clicked" | "opened"
app.post('/webhook/hubspot-signal', async (req, res) => {
  try {
    const { signalType, contactName, company, emailName, eventTimestamp, sendTimestamp } = req.body;

    // High-confidence signals: always ping immediately.
    if (signalType === 'replied' || signalType === 'clicked') {
      await postSignalPing({ signalType, contactName, company, emailName });
      return res.status(200).send('ok');
    }

    // Lower-confidence signal: a raw "opened" event.
    // Apple Mail Privacy Protection and other image-proxy prefetching "open"
    // a tracking pixel within a second or two of delivery, before a human
    // ever sees the email. Treat opens under ~5 minutes after send as noise;
    // only ping on opens that happen meaningfully later than send time.
    if (signalType === 'opened') {
      const sentAt = new Date(sendTimestamp).getTime();
      const openedAt = new Date(eventTimestamp).getTime();
      const minutesSinceSend = (openedAt - sentAt) / 1000 / 60;

      if (Number.isFinite(minutesSinceSend) && minutesSinceSend >= 5) {
        await postSignalPing({ signalType, contactName, company, emailName });
      }
      return res.status(200).send('ok');
    }

    res.status(400).send('unknown signalType');
  } catch (err) {
    console.error('Error handling signal webhook', err);
    res.status(500).send('error');
  }
});

// ---- Daily digest job ----
async function runDailyDigest() {
  try {
    const staleContacts = await getStaleContacts({ minDaysStale: 14 });
    const newAccounts = await findNewAccountCandidates();
    await postDigest({ staleContacts, newAccounts });
  } catch (err) {
    console.error('Error running daily digest', err);
  }
}

// Runs 8am server time, Mon-Fri. Adjust the cron string for a different time,
// or trigger manually by hitting GET /run-digest.
cron.schedule('0 8 * * 1-5', runDailyDigest);

app.get('/run-digest', async (req, res) => {
  await runDailyDigest();
  res.send('Digest triggered');
});

app.get('/', (req, res) => res.send('Pipeline digest bot is running.'));

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
