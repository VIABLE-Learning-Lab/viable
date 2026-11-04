// The harness's store (get, put, delete, list, with JSON values) in Firestore, one document per key.
// A key's slashes are escaped, since a document ID can't hold one; a document stops at 1 MiB.
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const COLLECTION = 'viable-harness';

export function firestoreStore(db = (getApps().length || initializeApp(), getFirestore())) {
  const documents = db.collection(COLLECTION);
  const doc = (key) => documents.doc(encodeURIComponent(key));
  return {
    async get(key) {
      const found = await doc(key).get();
      return found.exists ? JSON.parse(found.data().value) : null;
    },
    async put(key, value) {
      await doc(key).set({ value: JSON.stringify(value) });
    },
    async delete(key) {
      await doc(key).delete();
    },
    async list(prefix = '') {
      const from = encodeURIComponent(prefix);
      const found = await documents.orderBy(FieldPath.documentId()).startAt(from).endBefore(`${from}`).select().get();
      return found.docs.map((item) => decodeURIComponent(item.id)).sort();
    }
  };
}
