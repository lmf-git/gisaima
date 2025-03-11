import { getDatabase } from "firebase/database";
import { app } from "./firebase.js";

// Initialize database
export const db = getDatabase(app);
