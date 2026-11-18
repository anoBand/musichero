// The parts of the Firebase JS SDK the app uses, bundled into js/vendor/firebase.js so the app needs no CDN
// and works offline. Rebuild (any folder with firebase and esbuild installed):
//   npx esbuild scripts/firebase-entry.mjs --bundle --format=esm --minify --legal-comments=eof \
//     --outfile=js/vendor/firebase.js
export { initializeApp } from 'firebase/app';
export { getAuth, initializeAuth, indexedDBLocalPersistence, GoogleAuthProvider, signInWithPopup, signInWithCredential, signOut, onAuthStateChanged } from 'firebase/auth';
export {
  initializeFirestore, doc, collection, getDoc, getDocs, setDoc, writeBatch, query, where, orderBy,
  serverTimestamp, Timestamp
} from 'firebase/firestore/lite';
