import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  // Aceita o JSON inteiro da conta de serviço numa única variável
  // (FIREBASE_SERVICE_ACCOUNT) — evita problemas de formatação que dá pra ter
  // separando em 3 variáveis diferentes.
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const conta = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    return initializeApp({ credential: cert(conta) });
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

export function getDb() {
  return getFirestore(getAdminApp());
}

