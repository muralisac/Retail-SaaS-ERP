// js/3-auth-db.js

auth.onAuthStateChanged(async user => {
    if (user) {
        const userEmail = user.email.toLowerCase();
        
        document.body.classList.remove('login-mode'); 
        document.body.classList.add('auth-mode');
        
        document.getElementById('app-header').style.display = 'flex'; 
        document.getElementById('screen-login').classList.remove('active'); 
        document.getElementById('loading-overlay').style.display = 'flex';
        document.getElementById('loading-text').innerText = "Identifying Store Profile...";
        
        try {
            // 🌟 1. FIND THE USER'S STORE (TENANT ID)
            const userDoc = await db.collection("users").doc(userEmail).get();
            if (!userDoc.exists) {
                auth.signOut();
                throw new Error("Access Denied: Your email is not assigned to a store. Contact support.");
            }
            
            const userData = userDoc.data();
            currentUserTenantId = userData.tenantId;
            isAdmin = userData.role === 'admin';
            isStockiest = userData.role === 'stockiest';
            
            // 🌟 2. FETCH STORE PROFILE & CHECK LICENSE
            document.getElementById('loading-text').innerText = "Loading Store Settings...";
            const tenantDoc = await db.collection("tenants").doc(currentUserTenantId).get();
            if (!tenantDoc.exists) {
                auth.signOut();
                throw new Error("Critical Error: Store profile not found in database.");
            }
            
            currentTenantProfile = tenantDoc.data();
            
            if (currentTenantProfile.subscriptionStatus !== "active") {
                auth.signOut();
                throw new Error("Your store's subscription is inactive or expired. Please contact support to renew.");
            }
            
            // 🌟 3. APPLY WHITE-LABEL UI CHANGES
            applyTenantUI(currentTenantProfile);
            applyRolePermissions();
            
            // 🌟 4. FETCH DATA SPECIFIC TO THIS STORE ONLY
            document.getElementById('loading-text').innerText = `Loading ${currentTenantProfile.storeName} Data...`;
            await fetchCloudData();
            
        } catch (error) {
            console.error("Login Error:", error);
            document.getElementById('loading-overlay').style.display = 'none';
            showCustomAlert(error.message, "Authentication Failed", "🚫");
        }
        
    } else {
        // WIPE MEMORY ON LOGOUT
        currentUserTenantId = null;
        currentTenantProfile = {};
        appData = { inventory: [], customers: [], history: [], purchaseOrders: [], lastInvoiceNum: 0, lastPoNum: 0 };
        isAdmin = false; isStockiest = false;
        
        document.body.classList.remove('auth-mode'); 
        document.body.classList.add('login-mode');
        
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('app-header').style.display = 'none'; 
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-login').classList.add('active');
    }
});

function applyTenantUI(profile) {
    // Dynamically update the Store Name in the Header!
    const headerTitle = document.querySelector('#app-header .fw-bold.text-white');
    if (headerTitle) {
        headerTitle.innerText = profile.storeName || "Retail POS";
    }
    document.title = `${profile.storeName || 'Store'} - POS System`;
}

function applyRolePermissions() {
    document.getElementById('btn-new-sale').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('btn-new-po').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('btn-add-customer').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('btn-add-product').style.display = isAdmin ? 'block' : 'none';
    
    const navBookkeeping = document.getElementById('nav-bookkeeping');
    if (navBookkeeping) {
        navBookkeeping.style.display = (isAdmin || isStockiest) ? 'block' : 'none';
    }
}

function login() { 
    const email = document.getElementById('login-email').value; 
    const pass = document.getElementById('login-password').value; 
    document.getElementById('login-error').innerText = "Authenticating..."; 
    auth.signInWithEmailAndPassword(email, pass).catch(error => { document.getElementById('login-error').innerText = error.message; }); 
}

function loginWithGoogle() { 
    document.getElementById('login-error').innerText = "Opening Google Login..."; 
    const provider = new firebase.auth.GoogleAuthProvider(); 
    auth.signInWithPopup(provider).catch(error => { document.getElementById('login-error').innerText = "Error: " + error.message; }); 
}

function promptLogout() {
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar.classList.contains('open')) toggleMenu();
    showCustomConfirm("Are you sure you want to log out of your account?", logout, "Yes, Logout");
}

function logout() { 
    auth.signOut(); 
}

async function fetchCloudData() {
    try {
        // 🌟 Metadata is now stored per-tenant so stores don't share invoice numbers
        const metaDoc = await db.collection("metadata").doc(currentUserTenantId).get();
        if (metaDoc.exists) { 
            appData.lastInvoiceNum = metaDoc.data().lastNum || 0; 
            appData.lastPoNum = metaDoc.data().lastPoNum || 0; 
        } else { 
            await db.collection("metadata").doc(currentUserTenantId).set({ lastNum: 0, lastPoNum: 0 }); 
        }

        // 🌟 FETCH ONLY TENANT DATA using `.where()`
        const invSnap = await db.collection("inventory").where("tenantId", "==", currentUserTenantId).get(); 
        appData.inventory = invSnap.docs.map(doc => doc.data());
        
        const custSnap = await db.collection("customers").where("tenantId", "==", currentUserTenantId).get(); 
        appData.customers = custSnap.docs.map(doc => doc.data());
        
        const histSnap = await db.collection("history")
                                 .where("tenantId", "==", currentUserTenantId)
                                 .orderBy("timestamp", "desc").get(); 
        appData.history = histSnap.docs.map(doc => doc.data());
        
        const poSnap = await db.collection("purchaseOrders")
                               .where("tenantId", "==", currentUserTenantId)
                               .orderBy("timestamp", "desc").get(); 
        appData.purchaseOrders = poSnap.docs.map(doc => {
            let data = doc.data();
            if (!data.status) data.status = 'converted';
            return data;
        });

        document.getElementById('loading-overlay').style.display = 'none';
        switchScreen('screen-history', false); 
        
        renderCustomerList(); 
        renderProductList(); 
        renderHistoryList(); 
        renderPOList(); 
        populateDropdowns();
    } catch (error) {
        console.error("Error fetching tenant data:", error);
        document.getElementById('loading-overlay').style.display = 'none';
        showCustomAlert("Database structure error. Please check developer console.", "Setup Error", "⚠️");
    }
}

async function manualRefresh() {
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('loading-text').innerText = "Syncing with Cloud...";
    
    try {
        if(!currentUserTenantId) throw new Error("No active tenant");

        const metaDoc = await db.collection("metadata").doc(currentUserTenantId).get();
        if (metaDoc.exists) { 
            appData.lastInvoiceNum = metaDoc.data().lastNum || 0; 
            appData.lastPoNum = metaDoc.data().lastPoNum || 0; 
        }

        const invSnap = await db.collection("inventory").where("tenantId", "==", currentUserTenantId).get(); 
        appData.inventory = invSnap.docs.map(doc => doc.data());
        
        const custSnap = await db.collection("customers").where("tenantId", "==", currentUserTenantId).get(); 
        appData.customers = custSnap.docs.map(doc => doc.data());
        
        const histSnap = await db.collection("history").where("tenantId", "==", currentUserTenantId).orderBy("timestamp", "desc").get(); 
        appData.history = histSnap.docs.map(doc => doc.data());
        
        const poSnap = await db.collection("purchaseOrders").where("tenantId", "==", currentUserTenantId).orderBy("timestamp", "desc").get(); 
        appData.purchaseOrders = poSnap.docs.map(doc => {
            let data = doc.data();
            if (!data.status) data.status = 'converted';
            return data;
        });

        renderCustomerList(); renderProductList(); renderHistoryList(); renderPOList(); populateDropdowns();
        
        if (document.getElementById('screen-pos').classList.contains('active')) {
            renderPOSGrid(); renderPOSCart();
        }
        
        document.getElementById('loading-overlay').style.display = 'none';
        showCustomAlert("App synced successfully.", "Sync Complete", "✅");
    } catch (error) {
        console.error("Sync Error:", error);
        document.getElementById('loading-overlay').style.display = 'none';
        showCustomAlert("Failed to sync data.", "Sync Error", "🔴");
    }
}