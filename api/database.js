import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';

const firebaseConfig = {
  databaseURL: "https://will-painel-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const snapshot = await get(ref(db, 'tenants'));
    let allKeys = [];

    snapshot.forEach((tenantSnap) => {
      const database = tenantSnap.child('database').val() || {};
      // Lida com objeto { "0": {...}, "1": {...} } ou array
      Object.values(database).forEach(keyObj => {
        if (keyObj && keyObj.is_active === true) {
          allKeys.push(keyObj);
        }
      });
    });

    res.status(200).send(JSON.stringify({ database: allKeys }));
  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).send(JSON.stringify({ database: [], error: error.message }));
  }
}
