import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://will-painel-default-rtdb.firebaseio.com"
});

const db = getDatabase();

export default async function handler(req, res) {
  try {
    const snapshot = await db.ref('tenants').once('value');
    let allKeys = [];

    snapshot.forEach((tenantSnap) => {
      const database = tenantSnap.child('database').val() || {};
      Object.values(database).forEach(keyObj => {
        if (keyObj && keyObj.is_active === true) {
          allKeys.push(keyObj);
        }
      });
    });

    res.status(200).json({ database: allKeys });
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ database: [] });
  }
}
