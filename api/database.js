import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';

const firebaseConfig = {
  databaseURL: "https://will-painel-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default async function handler(req, res) {
  try {
    const snapshot = await get(ref(db, 'tenants'));
    let allKeys = [];

    snapshot.forEach((tenantSnap) => {
      const database = tenantSnap.child('database').val() || {};

      // Se for array direto
      if (Array.isArray(database)) {
        database.forEach(keyObj => {
          if (keyObj && keyObj.is_active === true) {
            allKeys.push(keyObj);
          }
        });
      } else {
        // Se for objeto com keys "0", "1", etc. (como no seu banco)
        Object.values(database).forEach(keyObj => {
          if (keyObj && keyObj.is_active === true) {
            allKeys.push(keyObj);
          }
        });
      }
    });

    res.status(200).json({ database: allKeys });
  } catch (error) {
    console.error('Erro ao buscar chaves:', error);
    res.status(500).json({ database: [] });
  }
}
