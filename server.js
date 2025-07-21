const express = require('express');
const { authenticatedLndGrpc } = require('ln-service');
const dotenv = require('dotenv');
const cors = require('cors');
const QRCode = require('qrcode');
const path = require('path');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration LND
let lnd;

function connectToLnd() {
  try {
    const socket = process.env.LND_GRPC_HOST;
    const macaroon = process.env.LND_MACAROON_BASE64;
    const cert = process.env.LND_TLS_CERT_BASE64;

    if (!socket || !macaroon || !cert) {
      console.error('Missing LND credentials');
      process.exit(1);
    }

    const { lnd: authenticatedLnd } = authenticatedLndGrpc({
      socket,
      macaroon,
      cert,
    });

    lnd = authenticatedLnd;
    console.log('LND connection successful');
  } catch (error) {
    console.error('Connection error:', error.message);
    process.exit(1);
  }
}

// Middleware pour vérifier la connexion LND
const checkLndConnection = (req, res, next) => {
  if (!lnd) {
    return res.status(503).json({ error: 'LND not connected' });
  }
  req.lnd = lnd;
  next();
};

app.use('/api', checkLndConnection);

const {
  getWalletInfo,
  signMessage,
  verifyMessage
} = require('ln-service');

// Stockage en mémoire pour les alertes (remplacer par une base de données en production)
const alerts = [];

// API Endpoints
app.get('/api/getinfo', async (req, res) => {
  try {
    const info = await getWalletInfo({ lnd: req.lnd });
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: 'Info error', details: err.message });
  }
});

app.post('/api/alert', async (req, res) => {
  const { type, location, message, source } = req.body;
  if (!type || !location || !message || !source) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const fullMessage = `${type.toUpperCase()}|${location}|${message}|${source}|${new Date().toISOString()}`;
  try {
    const { signature } = await signMessage({
      lnd: req.lnd,
      message: Buffer.from(fullMessage),
    });
    
    const alert = {
      id: Date.now().toString(),
      type,
      location,
      message,
      source,
      timestamp: new Date().toISOString(),
      fullMessage,
      signature,
      pubkey: (await getWalletInfo({ lnd: req.lnd })).public_key
    };
    
    alerts.unshift(alert); // Ajoute au début du tableau
    
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: 'Signing error', details: err.message });
  }
});

app.post('/api/alert/verify', async (req, res) => {
  const { fullMessage, signature, pubkey } = req.body;
  if (!fullMessage || !signature || !pubkey) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const isValid = await verifyMessage({
      lnd: req.lnd,
      message: Buffer.from(fullMessage),
      signature,
      public_key: pubkey,
    });
    res.json({ isValid });
  } catch (err) {
    res.status(500).json({ error: 'Verification error', details: err.message });
  }
});

app.post('/api/alert/qr', async (req, res) => {
  const { fullMessage, signature, pubkey } = req.body;
  const data = JSON.stringify({ fullMessage, signature, pubkey });

  try {
    const qr = await QRCode.toDataURL(data);
    res.json({ qr });
  } catch (e) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

app.get('/api/alerts', (req, res) => {
  res.json(alerts);
});

app.get('/api/alert/:id', (req, res) => {
  const alert = alerts.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

// Servir l'interface
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5003;
connectToLnd();

app.listen(PORT, () => {
  console.log(`\n Server running on http://localhost:${PORT}`);
  console.log('-----------------------------------------------');
  console.log(' Available API endpoints for InfoRelay:');
  console.log(` GET    /api/getinfo            → Infos du nœud Lightning`);
  console.log(` POST   /api/alert              → Signer une alerte`);
  console.log(` POST   /api/alert/verify       → Vérifier une alerte avec pubkey`);
  console.log(` POST   /api/alert/qr           → Générer un QR Code pour une alerte`);
  console.log('-----------------------------------------------\n');
});