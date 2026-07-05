/* ==========================================================================
   FIREBASE CONFIG — DS.Calc
   ==========================================================================
   GANTI semua nilai di bawah ini dengan config dari project Firebase-mu:
   Firebase Console > (pilih project) > ⚙ Project Settings > General
   > scroll ke "Your apps" > pilih/klik ikon Web (</>) > copy objek config.

   Catatan: apiKey Firebase BUKAN rahasia yang perlu disembunyikan — ini
   memang selalu terlihat di kode frontend (itu wajar & memang didesain
   begitu oleh Google). Keamanan sesungguhnya diatur lewat Firestore
   Security Rules (lihat FIREBASE_SETUP.md), bukan dengan menyembunyikan
   file ini.
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyCY1MNTaU4nQQ7REDPJr8Ica45NasrPtro",
  authDomain: "dscalcbyfathur.firebaseapp.com",
  projectId: "dscalcbyfathur",
  storageBucket: "dscalcbyfathur.firebasestorage.app",
  messagingSenderId: "497279466874",
  appId: "1:497279466874:web:48c73694cab6c12ed12ac3"
};

firebase.initializeApp(firebaseConfig);

window.firebaseDb = firebase.firestore();
window.firebaseAuth = firebase.auth();
