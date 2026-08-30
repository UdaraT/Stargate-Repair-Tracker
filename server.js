const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const path    = require('path');
const https   = require('https');
const db      = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000; // Updated for Render

// ─────────────────────────────────────────────
// FitSMS Configuration
// ─────────────────────────────────────────────
const SMS_CONFIG = {
  apiBase:   'https://app.fitsms.lk/api/v4',
  token:     '561|x5FcejjqXbglKaFTHUSb55H30wto4cFkVfbFtPrB79ea3434',
  senderId:  'Star Gate',
  autoSmsStatuses: ['Completed', 'Delivered']
};

// ─────────────────────────────────────────────
// SMS Helper
// ─────────────────────────────────────────────
async function sendSMS(phone, message) {
  let normalised = phone.toString().replace(/\s+/g, '').replace(/^\+/, '');
  if (normalised.startsWith('0')) normalised = '94' + normalised.slice(1);
  if (!normalised.startsWith('94')) normalised = '94' + normalised;

  const payload = JSON.stringify({
    recipient: normalised,
    sender_id: SMS_CONFIG.senderId,
    message:   message
  });

  return new Promise((resolve, reject) => {
    const url  = new URL(`${SMS_CONFIG.apiBase}/sms/send`);
    const opts = {
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${SMS_CONFIG.token}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[SMS] ✅ Sent to ${normalised}`);
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error('Invalid response from FitSMS'));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function buildSMSMessage(job, event) {
  switch (event) {
    case 'created':
      return `Dear ${job.customer}, your ${job.model} has been received at Star Gate Technologies. Job ID: ${job.id}. Estimated cost: LKR ${job.cost}. We'll keep you updated! 📞 070-3698910`;
    case 'Completed':
      return `Dear ${job.customer}, great news! Your ${job.model} repair is COMPLETE (Job: ${job.id}). Please collect at your earliest. Repair cost: LKR ${job.cost}. - Star Gate Technologies 📞 070-3698910`;
    case 'Delivered':
      return `Dear ${job.customer}, your ${job.model} (Job: ${job.id}) has been delivered. Thank you for choosing Star Gate Technologies! We appreciate your trust. 📞 070-3698910`;
    default:
      return `Dear ${job.customer}, update on your repair Job ${job.id} (${job.model}): Status is now "${event}". - Star Gate Technologies 📞 070-3698910`;
  }
}

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'sgt-stargate-repair-2024-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}

// ─────────────────────────────────────────────
// Auth Routes
// ─────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  // ADDED AWAIT
  const user = await db.getUserByUsername(username.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid username or password.' });

  req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
  return res.json({ success: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// ─────────────────────────────────────────────
// Repair Routes
// ─────────────────────────────────────────────
app.get('/api/repairs', requireAuth, async (req, res) => {
  try {
    // ADDED AWAIT
    res.json(await db.getAllRepairs());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/repairs', requireAuth, async (req, res) => {
  try {
    const { customer, phone, model, imei, fault, cost, status, notes } = req.body;
    if (!customer || !phone || !model || !imei || !fault)
      return res.status(400).json({ error: 'Required fields missing.' });

    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    // ADDED AWAIT
    const repair = await db.createRepair({
      date: dateStr, customer: customer.trim(), phone: phone.trim(), model: model.trim(),
      imei: imei.trim(), fault: fault.trim(), cost: cost || 'TBD', status: status || 'Pending',
      notes: notes || '', created_by: req.session.user.username
    });

    sendSMS(repair.phone, buildSMSMessage(repair, 'created')).catch(e => console.error(`[SMS] Failed:`, e.message));
    res.json(repair);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/repairs/:id', requireAuth, async (req, res) => {
  try {
    // ADDED AWAIT
    const repair = await db.updateRepair(req.params.id, req.body);
    res.json(repair);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/repairs/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const valid = ['Pending', 'In Progress', 'Completed', 'Cancelled', 'Delivered'];

    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status value.' });

    // ADDED AWAIT
    const repair = await db.updateRepairStatus(id, status);

    if (SMS_CONFIG.autoSmsStatuses.includes(status)) {
      sendSMS(repair.phone, buildSMSMessage(repair, status)).catch(e => console.error(`[SMS] Failed:`, e.message));
    }

    res.json(repair);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/repairs/:id', requireAuth, async (req, res) => {
  try {
    // ADDED AWAIT
    await db.deleteRepair(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Manual SMS Route
// ─────────────────────────────────────────────
app.post('/api/sms/send', requireAuth, async (req, res) => {
  const { phone, message, jobId } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message are required.' });

  try {
    const result = await sendSMS(phone, message);
    res.json({ success: true, provider_response: result });
  } catch (err) {
    res.status(500).json({ error: 'SMS send failed: ' + err.message });
  }
});

// ─────────────────────────────────────────────
// User Management (Admin only)
// ─────────────────────────────────────────────
app.get('/api/users', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  // ADDED AWAIT
  res.json(await db.getAllUsers());
});

app.post('/api/users', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  const { username, password, full_name, role } = req.body;
  try {
    // ADDED AWAIT
    await db.createUser(username, password, full_name, role);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Page Routes & Start
// ─────────────────────────────────────────────
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

app.listen(PORT, () => {
  console.log(`\n🚀 Star Gate Repair Tracker → http://localhost:${PORT}\n`);
});
