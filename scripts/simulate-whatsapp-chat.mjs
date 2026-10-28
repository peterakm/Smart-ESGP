// Simulates a full WhatsApp farmer conversation against a running Smart-ESGP server,
// so the chatbot flow can be exercised without a real Meta WhatsApp account.
//
// Usage:
//   node scripts/simulate-whatsapp-chat.mjs
//   node scripts/simulate-whatsapp-chat.mjs --base http://localhost:3000 --phone 60123456789 --mpob 500189 --activity harvest
//   node scripts/simulate-whatsapp-chat.mjs --token <auditor token>   (when dashboard auth is on)
//
// Requires a running dashboard dev server (npm run dev) or the standalone
// WhatsApp service, with the webhook route enabled (on by default in dev).

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const base = getArg('base', 'http://localhost:3000');
const phone = getArg('phone', '60123456789');
const mpob = getArg('mpob', '500189');
const activity = getArg('activity', 'harvest');
const lat = Number(getArg('lat', '2.035'));
const lng = Number(getArg('lng', '103.328'));
const auditorToken = getArg('token', process.env.SMART_ESGP_AUDITOR_TOKEN || '');

let messageCount = 0;
const nextMessageId = () => `sim-${Date.now()}-${++messageCount}`;

const textMessage = (text) => ({
  from: phone,
  id: nextMessageId(),
  timestamp: String(Math.floor(Date.now() / 1000)),
  type: 'text',
  text: { body: text },
});

const locationMessage = () => ({
  from: phone,
  id: nextMessageId(),
  timestamp: String(Math.floor(Date.now() / 1000)),
  type: 'location',
  location: { latitude: lat, longitude: lng },
});

const imageMessage = (caption) => ({
  from: phone,
  id: nextMessageId(),
  timestamp: String(Math.floor(Date.now() / 1000)),
  type: 'image',
  image: { id: `sim-media-${nextMessageId()}`, mime_type: 'image/jpeg', caption },
});

const sendMessage = async (message) => {
  const response = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [message] } }] }] }),
  });

  if (!response.ok) {
    throw new Error(`Webhook call failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
};

const step = async (label, message) => {
  console.log(`\n--- ${label} ---`);
  console.log(`farmer > ${message.text?.body ?? message.type}`);
  const result = await sendMessage(message);
  console.log('webhook summary:', JSON.stringify(result));
};

console.log(`Simulating a WhatsApp conversation from ${phone} against ${base}`);

await step('1. Say hello (bot asks for a language)', textMessage('hi'));
await step('2. Choose language', textMessage('EN'));
await step('3. Give PDPA consent', textMessage('I AGREE'));
await step('4. Link MPOB licence (sent to FELDA for review)', textMessage(mpob));

console.log('\n--- 4b. FELDA officer approves the link (dashboard "Approve link") ---');
const approval = await fetch(`${base}/api/whatsapp/sessions/${encodeURIComponent(phone)}/identity-conflict`, {
  method: 'PATCH',
  headers: {
    'content-type': 'application/json',
    ...(auditorToken ? { authorization: `Bearer ${auditorToken}` } : {}),
  },
  body: JSON.stringify({ decision: 'approve', reviewedBy: 'Simulated FELDA officer' }),
});
if (!approval.ok) {
  throw new Error(`Link approval failed: ${approval.status} ${await approval.text()} (pass --token if auth is on)`);
}
console.log('link approved');

await step('5. State today\'s activity', textMessage(activity));
await step('6. Share live GPS location', locationMessage());
await step('7. Send today\'s activity photo', imageMessage(activity));

console.log(`\nDone. Open ${base} and check:`);
console.log('- Evidence Dashboard -> WhatsApp intake / evidence review queue');
console.log(`- GET ${base}/api/whatsapp/sessions (this phone should show step "active")`);
console.log(`- GET ${base}/api/evidence?limit=5 (a new daily_checkin record for this farmer)`);
