import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_seRYhFr7S9UpY3Xl8O9348Vow0eEG5M",
  authDomain: "wytetech.firebaseapp.com",
  projectId: "wytetech",
  storageBucket: "wytetech.firebasestorage.app",
  messagingSenderId: "418066704491",
  appId: "1:418066704491:web:e436fd749fec1b6ad3e92e",
  measurementId: "G-8L4LGB2X7F"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);