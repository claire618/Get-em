const axios = require('axios');

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID; // a channel ID, or your own Slack user ID for a DM

const slack = axios.create({
  baseURL: 'https://slack.com/api',
  headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
});

async function postMessage(blocks, text) {
  await slack.post('/chat.postMessage', { channel: CHANNEL_ID, text, blocks });
}

async function postSignalPing({ signalType, contactName, company, emailName }) {
  const label = { opened: '👀 Open', clicked: '🔗 Click', replied: '🔥 Reply' }[signalType] || signalType;
  const text = `${label}: ${contactName} (${company}) — "${emailName}"`;

  await postMessage(
    [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${label}* — ${contactName} at *${company}* on _${emailName}_`,
        },
      },
    ],
    text
  );
}

async function postDigest({ staleContacts, newAccounts }) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `Pipeline Digest — ${new Date().toLocaleDateString()}` } },
    { type: 'section', text: { type: 'mrkdwn', text: '*🥶 Accounts going cold*' } },
  ];

  if (staleContacts.length === 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_Nothing stale — nice._' } });
  } else {
    for (const c of staleContacts.slice(0, 15)) {
      const days = Math.floor((Date.now() - new Date(c.lastEngaged).getTime()) / (1000 * 60 * 60 * 24));
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `• <${c.url}|${c.name}> — ${c.company} (${c.stage}) — quiet ${days}d` },
      });
    }
  }

  blocks.push({ type: 'divider' });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*🌱 New accounts worth a look*' } });

  if (newAccounts.length === 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_None today._' } });
  } else {
    for (const a of newAccounts.slice(0, 10)) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `• *${a.name}* — ${a.trigger}` },
      });
    }
  }

  await postMessage(blocks, 'Pipeline digest');
}

module.exports = { postMessage, postSignalPing, postDigest };
