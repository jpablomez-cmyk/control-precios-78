import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAFiFbRylxcOVcwKizIW_nORwvz7-hvfl4",
  authDomain: "control-precios-78.firebaseapp.com",
  projectId: "control-precios-78",
  storageBucket: "control-precios-78.firebasestorage.app",
  messagingSenderId: "781995819353",
  appId: "1:781995819353:web:99c251e493c8510c7e4c48",
  measurementId: "G-7BS4N7Y7EK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const BATCHES_COL = "batches";

export async function uploadSignature(batchId, sectionName, dataUrl) {
  return dataUrl;
}

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

export async function saveBatch(batch) {
  try {
    const { id, ...data } = batch;
    await setDoc(doc(db, BATCHES_COL, id), { ...data, createdAt: batch.createdAt || Date.now() });
  } catch (err) {
    console.error("Error saving batch:", err);
  }
}

export async function deleteBatchFromDB(batchId) {
  try {
    await deleteDoc(doc(db, BATCHES_COL, batchId));
  } catch (err) {
    console.error("Error deleting batch:", err);
  }
}

export async function deleteAllBatches() {
  try {
    const snapshot = await getDocs(collection(db, BATCHES_COL));
    const promises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(promises);
  } catch (err) {
    console.error("Error deleting all:", err);
  }
}
