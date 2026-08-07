import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";

// =====================================================
// 🔴 IMPORTANTE: Reemplaza estos valores con los tuyos
// Los encuentras en Firebase Console → Configuración del proyecto → Tus apps
// =====================================================
const firebaseConfig = {
  apiKey: "PEGA_TU_API_KEY_AQUI",
  authDomain: "PEGA_TU_AUTH_DOMAIN_AQUI",
  projectId: "PEGA_TU_PROJECT_ID_AQUI",
  storageBucket: "PEGA_TU_STORAGE_BUCKET_AQUI",
  messagingSenderId: "PEGA_TU_SENDER_ID_AQUI",
  appId: "PEGA_TU_APP_ID_AQUI"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const BATCHES_COL = "batches";

// Las firmas se guardan directamente en Firestore como texto (base64)
// No necesita Firebase Storage ni plan Blaze
export async function uploadSignature(batchId, sectionName, dataUrl) {
  return dataUrl; // Se guarda directo en el documento de Firestore
}

// Load all batches
export async function loadBatches() {
  try {
    const q = query(collection(db, BATCHES_COL), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("Error loading batches:", err);
    return [];
  }
}

// Save a single batch
export async function saveBatch(batch) {
  try {
    const { id, ...data } = batch;
    await setDoc(doc(db, BATCHES_COL, id), { ...data, createdAt: batch.createdAt || Date.now() });
  } catch (err) {
    console.error("Error saving batch:", err);
  }
}

// Delete a batch
export async function deleteBatchFromDB(batchId) {
  try {
    await deleteDoc(doc(db, BATCHES_COL, batchId));
  } catch (err) {
    console.error("Error deleting batch:", err);
  }
}

// Delete all batches
export async function deleteAllBatches() {
  try {
    const snapshot = await getDocs(collection(db, BATCHES_COL));
    const promises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(promises);
  } catch (err) {
    console.error("Error deleting all:", err);
  }
}
