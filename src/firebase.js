import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, orderBy, writeBatch } from "firebase/firestore";

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

// Save batch: metadata in main doc, items in subcollection
export async function saveBatch(batch) {
  try {
    const { id, items, ...metadata } = batch;

    // Save metadata (without items array)
    await setDoc(doc(db, BATCHES_COL, id), {
      ...metadata,
      createdAt: batch.createdAt || Date.now(),
      itemCount: items.length
    });

    // Save items in subcollection using batched writes (max 500 per batch)
    const CHUNK = 450;
    for (let i = 0; i < items.length; i += CHUNK) {
      const wb = writeBatch(db);
      const chunk = items.slice(i, i + CHUNK);
      for (const item of chunk) {
        const itemRef = doc(db, BATCHES_COL, id, "items", item.id);
        wb.set(itemRef, item);
      }
      await wb.commit();
    }
  } catch (err) {
    console.error("Error saving batch:", err);
  }
}

// Update only batch metadata (status, sectionDeliveries) without rewriting items
export async function updateBatchMeta(batch) {
  try {
    const { id, items, ...metadata } = batch;
    await setDoc(doc(db, BATCHES_COL, id), {
      ...metadata,
      createdAt: batch.createdAt || Date.now(),
      itemCount: items.length
    }, { merge: true });
  } catch (err) {
    console.error("Error updating batch meta:", err);
  }
}

// Update a single item in the subcollection
export async function updateBatchItem(batchId, item) {
  try {
    await setDoc(doc(db, BATCHES_COL, batchId, "items", item.id), item);
  } catch (err) {
    console.error("Error updating item:", err);
  }
}

// Update multiple items + batch metadata
export async function updateBatchItems(batch, changedItems) {
  try {
    const { id, items, ...metadata } = batch;
    const wb = writeBatch(db);

    // Update metadata
    wb.set(doc(db, BATCHES_COL, id), {
      ...metadata,
      createdAt: batch.createdAt || Date.now(),
      itemCount: items.length
    });

    // Update changed items
    for (const item of changedItems) {
      wb.set(doc(db, BATCHES_COL, id, "items", item.id), item);
    }

    await wb.commit();
  } catch (err) {
    console.error("Error updating batch items:", err);
  }
}

// Load all batches with their items
export async function loadBatches() {
  try {
    const q = query(collection(db, BATCHES_COL), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const batches = [];

    for (const batchDoc of snapshot.docs) {
      const data = batchDoc.data();
      // Load items from subcollection
      const itemsSnap = await getDocs(collection(db, BATCHES_COL, batchDoc.id, "items"));
      const items = itemsSnap.docs.map(d => d.data());

      batches.push({
        id: batchDoc.id,
        ...data,
        items
      });
    }

    return batches;
  } catch (err) {
    console.error("Error loading batches:", err);
    return [];
  }
}

// Delete a batch and all its items
export async function deleteBatchFromDB(batchId) {
  try {
    // Delete all items in subcollection first
    const itemsSnap = await getDocs(collection(db, BATCHES_COL, batchId, "items"));
    const wb = writeBatch(db);
    itemsSnap.docs.forEach(d => wb.delete(d.ref));
    wb.delete(doc(db, BATCHES_COL, batchId));
    await wb.commit();
  } catch (err) {
    console.error("Error deleting batch:", err);
  }
}

// Delete all batches
export async function deleteAllBatches() {
  try {
    const snapshot = await getDocs(collection(db, BATCHES_COL));
    for (const batchDoc of snapshot.docs) {
      await deleteBatchFromDB(batchDoc.id);
    }
  } catch (err) {
    console.error("Error deleting all:", err);
  }
}
