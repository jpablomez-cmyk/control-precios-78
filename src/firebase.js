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

export async function saveBatch(batch) {
  try {
    const { id, items, ...metadata } = batch;
    await setDoc(doc(db, BATCHES_COL, id), {
      ...metadata, createdAt: batch.createdAt || Date.now(),
      itemCount: items.length, chunkCount: Math.ceil(items.length / CHUNK_SIZE)
    });
    const chunks = chunkArray(items, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i += 400) {
      const wb = writeBatch(db);
      chunks.slice(i, i + 400).forEach((chunk, j) => {
        const ci = i + j;
        wb.set(doc(db, BATCHES_COL, id,
