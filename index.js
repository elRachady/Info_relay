const express = require('express');
const { authenticatedLndGrpc } = require('ln-service');
const dotenv = require('dotenv');
const cors = require('cors');
const QRCode = require('qrcode');
const path = require('path');
const alerts = [];

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); 

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

const checkLndConnection = (req, res, next) => {
  if (!lnd) {
    return res.status(503).json({ error: 'LND not connected' });
  }
  req.lnd = lnd;
  next();
};

app.use(checkLndConnection);

const {
  getWalletInfo,
  signMessage,
  verifyMessage
} = require('ln-service');

app.get('/api/getinfo', async (req, res) => {
  try {
    const info = await getWalletInfo({ lnd: req.lnd });
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: 'Info error', details: err.message });
  }
});

app.post('/api/alert', async (req, res) => {
  const { type, location, message } = req.body;
  if (!type || !location || !message) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const fullMessage = `${type.toUpperCase()}|${location}|${message}`;
  try {
    const { signature } = await signMessage({
      lnd: req.lnd,
      message: Buffer.from(fullMessage),
    });
    // Ajoute l'alerte au tableau
    alerts.push({ type, location, message, fullMessage, signature, date: new Date() });
    res.json({ fullMessage, signature });
  } catch (err) {
    res.status(500).json({ error: 'Signing error', details: err.message });
  }
});

// Nouvelle route GET pour récupérer les alertes
app.get('/api/alerts', (req, res) => {
  res.json(alerts); // Retourne [] si aucune alerte
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
  const { fullMessage, signature } = req.body;
  const data = JSON.stringify({ fullMessage, signature });

  try {
    const qr = await QRCode.toDataURL(data);
    res.json({ qr });
  } catch (e) {
    res.status(500).json({ error: 'QR generation failed' });
  }
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

