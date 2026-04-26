// js/1-config.js

// 🌟 Your NEW retail-erp-saas Firebase Keys
const firebaseConfig = {
    apiKey: "AIzaSyAU-U1cJI58SxiT2tPOCaNpIA7SLIbuQL4",
    authDomain: "retail-erp-saas.firebaseapp.com",
    projectId: "retail-erp-saas",
    storageBucket: "retail-erp-saas.firebasestorage.app",
    messagingSenderId: "908461210160",
    appId: "1:908461210160:web:6ce8f9ce5aba59c74e0bf5",
    measurementId: "G-LVYETD33DK"
};

// Initialize Firebase using the Compat syntax your app relies on
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth(); 

// ========================================================
// 🌟 SaaS GLOBAL STATE (Multi-Tenant)
// ========================================================
let currentUserTenantId = null; // Stores the active store ID (e.g., 'tenant_oruvidhai')
let currentTenantProfile = {};  // Stores the custom store name, logo, etc.

let appData = { inventory: [], customers: [], history: [], purchaseOrders: [], lastInvoiceNum: 0, lastPoNum: 0 };
const SELLER_STATE = 33; 

let currentCart = []; let editingDocId = null; let tempDocNumber = ""; let tempDocDate = "";
let currentDocType = "invoice"; // 'invoice', 'po', or 'pos'

// Roles are no longer hardcoded! They will be fetched dynamically from the database.
let isAdmin = false; 
let isStockiest = false;

// ========================================================
// POS MULTI-CART STATE
// ========================================================
let posCarts = []; // Array of { id, name, phone, items: [] }
let activePosCartId = null;
let pendingPosItemAdd = null; // Remembers what item you clicked before the Customer Name popup