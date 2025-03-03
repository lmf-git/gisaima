import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyDzEj04-d7UJJTInOerz24uz1d_q1VNe74",
  authDomain: "gisaima.firebaseapp.com",
  databaseURL: "https://gisaima-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "gisaima",
  storageBucket: "gisaima.firebasestorage.app",
  messagingSenderId: "1068822985331",
  appId: "1:1068822985331:web:7b90bd253b6d8aaa554806",
  measurementId: "G-28GWSL466C"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
