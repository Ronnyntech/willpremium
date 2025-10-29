// index.js - servidor pra Render
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const twilio = require('twilio');
const cron = require('node-cron');

const app = express();
app.use(bodyParser.json());

// --- Config via ENV ---
const {
  PORT = 10000,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM, // ex: "whatsapp:+1415XXXXXXX"
  SECRET_WEBHOOK_TOKEN, // token simples pra proteger endpoint webhook (opcional mas recomendado)
  SERVICE_ACCOUNT_BASE64, // service account JSON base64
  FIRESTORE_COLLECTION = "clients", // nome da collection
  DAYS_BEFORE = "3", // quantos dias antes do vencimento enviar
  CRON_SCHEDULE = "0 9 * * *", // padrão: 9:00 UTC (ajusta conforme fuso)
  TIMEZONE = "America/Sao_Paulo"
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM || !SERVICE_ACCOUNT_BASE64) {
  console.error("Variáveis de ambiente faltando (TWILIO_*, SERVICE_ACCOUNT_BASE64).");
  // Não sai, mas avisa no log.
}

// --- Init Twilio ---
const clientTwilio = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// --- Init Firebase Admin ---
let serviceAccount;
try {
  const saJSON = Buffer.from(SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
  serviceAccount = JSON.parse(saJSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
} catch (err) {
  console.error("Erro ao inicializar Firebase Admin:", err.message);
}

const db = admin.firestore();

// --- Helper: enviar WhatsApp via Twilio ---
async function sendWhatsApp(toNumber, messageText) {
  // toNumber esperado no formato +55XXXXXXXXXXX
  const to = `whatsapp:${toNumber}`;
  try {
    const msg = await clientTwilio.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to,
      body: messageText
    });
    console.log("Mensagem enviada:", msg.sid, "para", toNumber);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error("Erro Twilio:", err && err.message ? err.message : err);
    return { success: false, error: err.message || err };
  }
}

// --- Endpoint webhook: recebe JSON e manda mensagem ---
// Protegido por SECRET_WEBHOOK_TOKEN (header: x-secret-token) se configurado
app.post('/send-whatsapp', async (req, res) => {
  if (SECRET_WEBHOOK_TOKEN) {
    const token = req.headers['x-secret-token'];
    if (token !== SECRET_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { phone, message, clientId } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });

  const result = await sendWhatsApp(phone, message);

  // opcional: gravar log no Firestore
  try {
    await db.collection('notifications_log').add({
      clientId: clientId || null,
      phone,
      message,
      result,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error("Erro ao gravar log:", e.message);
  }

  return res.json(result);
});

// --- Função que procura clientes com vencimento próximo e envia mensagens ---
async function checkAndNotify() {
  const daysBefore = Number(DAYS_BEFORE || 3);
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysBefore);
  // Vamos comparar apenas a data sem hora
  const start = new Date(targetDate);
  start.setHours(0,0,0,0);
  const end = new Date(targetDate);
  end.setHours(23,59,59,999);

  console.log(`Procurando clientes com vencimento em ${start.toISOString()} - ${end.toISOString()}`);

  try {
    const colRef = db.collection(FIRESTORE_COLLECTION);
    // Assumimos que a collection tem campo 'vencimento' do tipo Timestamp/ISO string
    const snapshot = await colRef
      .where('vencimento', '>=', admin.firestore.Timestamp.fromDate(start))
      .where('vencimento', '<=', admin.firestore.Timestamp.fromDate(end))
      .get();

    if (snapshot.empty) {
      console.log("Nenhum cliente encontrado para notificação hoje.");
      return;
    }

    console.log(`Encontrados ${snapshot.size} clientes. Enviando mensagens...`);
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const phone = data.phone; // esperar +55...
      const name = data.name || 'cliente';
      const id = doc.id;

      if (!phone) {
        console.log("Cliente sem telefone, pulando:", id);
        continue;
      }

      const daysLeft = daysBefore;
      const msg = `Olá ${name}, sua linha vence em ${daysLeft} dia(s). Se precisar renovar, responde essa mensagem ou acesse seu painel.`;

      const res = await sendWhatsApp(phone, msg);
      // registrar log
      await db.collection('notifications_log').add({
        clientId: id,
        phone,
        message: msg,
        result: res,
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      });
      // pequeno delay pra evitar rate limits
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (err) {
    console.error("Erro em checkAndNotify:", err && err.message ? err.message : err);
  }
}

// --- Agendador: roda conforme CRON_SCHEDULE ---
// Ex.: "0 9 * * *" -> todo dia às 09:00 (UTC) ; definimos timezone
try {
  cron.schedule(CRON_SCHEDULE, () => {
    console.log("Cron job disparado:", new Date().toISOString());
    checkAndNotify();
  }, {
    timezone: TIMEZONE || 'UTC'
  });
  console.log("Cron agendado:", CRON_SCHEDULE, "timezone:", TIMEZONE);
} catch (e) {
  console.error("Erro ao agendar cron:", e.message);
}

// --- Root
app.get('/', (req, res) => res.send('Cliente em Dia Notifier is running'));

// Start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});