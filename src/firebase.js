import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDZVlXMsqYWE7LbTo0w5mhTFg7-UiDSbPk",
  authDomain: "cambiosdeprecios-78.firebaseapp.com",
  projectId: "cambiosdeprecios-78",
  storageBucket: "cambiosdeprecios-78.firebasestorage.app",
  messagingSenderId: "143911932080",
  appId: "1:143911932080:web:ebd0af710642bab8a72b75"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const BATCHES_COL = "batches";
const CHUNK_SIZE = 200;

export async function uploadSignature(batchId, sectionName, dataUrl) {
  return dataUrl;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function buildMeta(batch) {
  const { id, items, sectionDeliveries, ...rest } = batch;
  return { ...rest, createdAt: batch.createdAt || Date.now(), itemCount: (items || []).length, chunkCount: Math.ceil((items || []).length / CHUNK_SIZE) };
}

export async function saveBatch(batch, onProgress) {
  try {
    const { id, items } = batch;
    const chunks = chunkArray(items, CHUNK_SIZE);
    const totalSteps = chunks.length + 1;
    if (onProgress) onProgress({ step: 0, total: totalSteps, message: "Guardando información del lote..." });
    await setDoc(doc(db, BATCHES_COL, id), buildMeta(batch));
    if (batch.sectionDeliveries) {
      for (const [secName, delivery] of Object.entries(batch.sectionDeliveries)) {
        await setDoc(doc(db, BATCHES_COL, id, "deliveries", secName), delivery);
      }
    }
    for (let i = 0; i < chunks.length; i += 400) {
      const wb = writeBatch(db);
      chunks.slice(i, i + 400).forEach((chunk, j) => {
        const ci = i + j;
        wb.set(doc(db, BATCHES_COL, id, "chunks", "chunk_" + String(ci).padStart(4, "0")), { items: chunk, index: ci });
      });
      await wb.commit();
      const done = Math.min(i + 400, chunks.length);
      const itemsDone = Math.min(done * CHUNK_SIZE, items.length);
      if (onProgress) onProgress({ step: done, total: totalSteps, message: `Guardando productos... ${itemsDone.toLocaleString()} / ${items.length.toLocaleString()}` });
    }
    if (onProgress) onProgress({ step: totalSteps, total: totalSteps, message: "¡Listo!" });
  } catch (err) { console.error("Error saving batch:", err); throw err; }
}

export async function updateBatchMeta(batch) {
  try {
    const { id } = batch;
    await setDoc(doc(db, BATCHES_COL, id), buildMeta(batch), { merge: true });
    if (batch.sectionDeliveries) {
      for (const [secName, delivery] of Object.entries(batch.sectionDeliveries)) {
        await setDoc(doc(db, BATCHES_COL, id, "deliveries", secName), delivery);
      }
    }
  } catch (err) { console.error("Error updating meta:", err); }
}

export async function updateBatchItem(batchId, item, chunkIndex) {
  try {
    // If we know the chunk index, update directly (saves reads)
    if (chunkIndex !== undefined) {
      const chunkRef = doc(db, BATCHES_COL, batchId, "chunks", "chunk_" + String(chunkIndex).padStart(4, "0"));
      const snap = await getDocs(query(collection(db, BATCHES_COL, batchId, "chunks")));
      for (const chunkDoc of snap.docs) {
        const data = chunkDoc.data();
        const idx = data.items.findIndex(it => it.id === item.id);
        if (idx !== -1) { data.items[idx] = item; await setDoc(chunkDoc.ref, data); return; }
      }
    } else {
      const chunksSnap = await getDocs(collection(db, BATCHES_COL, batchId, "chunks"));
      for (const chunkDoc of chunksSnap.docs) {
        const data = chunkDoc.data();
        const idx = data.items.findIndex(it => it.id === item.id);
        if (idx !== -1) { data.items[idx] = item; await setDoc(chunkDoc.ref, data); return; }
      }
    }
  } catch (err) { console.error("Error updating item:", err); }
}

export async function updateBatchItems(batch, changedItems) {
  try {
    const { id, items } = batch;
    const changedIds = new Set(changedItems.map(it => it.id));
    const chunksSnap = await getDocs(collection(db, BATCHES_COL, id, "chunks"));
    const wb = writeBatch(db);
    wb.set(doc(db, BATCHES_COL, id), buildMeta(batch));
    if (batch.sectionDeliveries) {
      for (const [secName, delivery] of Object.entries(batch.sectionDeliveries)) {
        wb.set(doc(db, BATCHES_COL, id, "deliveries", secName), delivery);
      }
    }
    for (const chunkDoc of chunksSnap.docs) {
      const data = chunkDoc.data();
      let modified = false;
      data.items = data.items.map(it => {
        if (changedIds.has(it.id)) { modified = true; return changedItems.find(ci => ci.id === it.id) || it; }
        return it;
      });
      if (modified) wb.set(chunkDoc.ref, data);
    }
    await wb.commit();
  } catch (err) {
    console.error("Error updating items:", err);
  }
}

// MIGRATION: detects old format (sectionDeliveries in main doc) and migrates
async function migrateIfNeeded(batchDoc, data) {
  if (data.sectionDeliveries && Object.keys(data.sectionDeliveries).length > 0) {
    console.log("Migrating batch", batchDoc.id, "deliveries to subcollection...");
    try {
      for (const [secName, delivery] of Object.entries(data.sectionDeliveries)) {
        await setDoc(doc(db, BATCHES_COL, batchDoc.id, "deliveries", secName), delivery);
      }
      // Remove sectionDeliveries from main doc to free space
      const { sectionDeliveries, ...cleanData } = data;
      await setDoc(batchDoc.ref, cleanData);
      console.log("Migration complete for batch", batchDoc.id);
    } catch (err) { console.error("Migration error:", err); }
    return data.sectionDeliveries;
  }
  return null;
}

export async function loadBatches(onProgress) {
  try {
    const q = query(collection(db, BATCHES_COL), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const batches = [];
    const total = snapshot.docs.length;
    for (let i = 0; i < snapshot.docs.length; i++) {
      const batchDoc = snapshot.docs[i];
      const data = batchDoc.data();
      if (onProgress) onProgress({ step: i + 1, total, message: `Cargando lote ${i + 1} de ${total}...` });

      // Load items from chunks
      const chunksSnap = await getDocs(query(collection(db, BATCHES_COL, batchDoc.id, "chunks"), orderBy("index", "asc")));
      let items = [];
      chunksSnap.docs.forEach(c => { if (c.data().items) items = items.concat(c.data().items); });

      // If no chunks, items might be in the main doc (very old format)
      if (items.length === 0 && data.items) {
        items = data.items;
      }

      // Migrate old sectionDeliveries format if needed
      const migratedDeliveries = await migrateIfNeeded(batchDoc, data);

      // Load sectionDeliveries from subcollection
      const deliveriesSnap = await getDocs(collection(db, BATCHES_COL, batchDoc.id, "deliveries"));
      const sectionDeliveries = migratedDeliveries || {};
      deliveriesSnap.docs.forEach(d => { sectionDeliveries[d.id] = d.data(); });

      const { itemCount, chunkCount, sectionDeliveries: _, ...batchMeta } = data;
      batches.push({ id: batchDoc.id, ...batchMeta, items, sectionDeliveries });
    }
    return batches;
  } catch (err) { console.error("Error loading:", err); return []; }
}

export async function deleteBatchFromDB(batchId) {
  try {
    const chunksSnap = await getDocs(collection(db, BATCHES_COL, batchId, "chunks"));
    const deliveriesSnap = await getDocs(collection(db, BATCHES_COL, batchId, "deliveries"));
    const wb = writeBatch(db);
    chunksSnap.docs.forEach(d => wb.delete(d.ref));
    deliveriesSnap.docs.forEach(d => wb.delete(d.ref));
    wb.delete(doc(db, BATCHES_COL, batchId));
    await wb.commit();
  } catch (err) { console.error("Error deleting:", err); }
}

export async function deleteAllBatches() {
  try {
    const snapshot = await getDocs(collection(db, BATCHES_COL));
    for (const batchDoc of snapshot.docs) await deleteBatchFromDB(batchDoc.id);
  } catch (err) { console.error("Error deleting all:", err); }
}
