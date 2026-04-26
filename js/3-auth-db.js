// js/3-auth-db.js

auth.onAuthStateChanged(async user => {
    if (user) {
        const userEmail = user.email.toLowerCase();
        console.log("🚦 TRAFFIC COP: User logged in with email:", userEmail);
        
        document.body.classList.remove('login-mode'); 
        document.body.classList.add('auth-mode');
        
        document.getElementById('app-header').style.display = 'flex'; 
        document.getElementById('screen-login').classList.remove('active'); 
        document.getElementById('loading-overlay').style.display = 'flex';
        document.getElementById('loading-text').innerText = "Identifying Store Profile...";
        
        try {
            // 🌟 1. FIND THE USER'S STORE
            console.log("🚦 TRAFFIC COP: Checking 'users' collection for Document ID:", userEmail);
            const userDoc = await db.collection("users").doc(userEmail).get();
            
            if (!userDoc.exists) {
                console.error("❌ TRAFFIC COP: User document does NOT exist in Firestore!");
                auth.signOut();
                throw new Error(`Access Denied: Your email (${userEmail}) is not assigned to a store. Check your Firestore 'users' collection.`);
            }
            
            const userData = userDoc.data();
            currentUserTenantId = userData.tenantId;
            isAdmin = userData.role === 'admin';
            isStockiest = userData.role === 'stockiest';
            console.log("✅ TRAFFIC COP: User belongs to Tenant ID:", currentUserTenantId);
            
            // 🌟 2. FETCH STORE PROFILE
            console.log("🚦 TRAFFIC COP: Fetching 'tenants' profile for:", currentUserTenantId);
            document.getElementById('loading-text').innerText = "Loading Store Settings...";
            const tenantDoc = await db.collection("tenants").doc(currentUserTenantId).get();
            
            if (!tenantDoc.exists) {
                console.error("❌ TRAFFIC COP: Tenant document does NOT exist in Firestore!");
                auth.signOut();
                throw new Error("Critical Error: Store profile not found in database.");
            }
            
            currentTenantProfile = tenantDoc.data();
            console.log("✅ TRAFFIC COP: Store profile loaded:", currentTenantProfile.storeName);
            
            if (currentTenantProfile.subscriptionStatus !== "active") {
                auth.signOut();
                throw new Error("Your store's subscription is inactive or expired. Please contact support to renew.");
            }
            
            // 🌟 3. APPLY UI CHANGES
            applyTenantUI(currentTenantProfile);
            applyRolePermissions();
            
            // 🌟 4. FETCH STORE DATA
            console.log("🚦 TRAFFIC COP: Fetching business data (Inventory, History, etc.)...");
            document.getElementById('loading-text').innerText = `Loading ${currentTenantProfile.storeName} Data...`;
            await fetchCloudData();
            
            console.log("🎉 TRAFFIC COP: Everything loaded successfully!");
            
        } catch (error) {
            console.error("Login Error:", error);
            document.getElementById('loading-overlay').style.display = 'none';
            showCustomAlert(error.message, "Authentication Failed", "🚫");
        }
        
    } else {
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
    const headerTitle = document.querySelector('#app-header .fw-bold.text-white');
    if (headerTitle) headerTitle.innerText = profile.storeName || "Retail POS";
    document.title = `${profile.storeName || 'Store'} - POS System`;

    const logoImg = document.getElementById('dynamic-tenant-logo');
    if (logoImg) {
        if (profile.logoUrl) logoImg.src = profile.logoUrl;

        // 🌟 NEW: Make logo clickable for Admins to upload a new one
        if (isAdmin) {
            logoImg.style.cursor = "pointer";
            logoImg.title = "Admin: Click to upload new store logo";
            logoImg.onclick = () => document.getElementById('logo-upload-input').click();
        }
    }
}

function applyRolePermissions() {
    document.getElementById('btn-new-sale').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('btn-new-po').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('btn-add-customer').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('btn-add-product').style.display = isAdmin ? 'block' : 'none';
    
    const navBookkeeping = document.getElementById('nav-bookkeeping');
    if (navBookkeeping) navBookkeeping.style.display = (isAdmin || isStockiest) ? 'block' : 'none';
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

function logout() { auth.signOut(); }

async function fetchCloudData() {
    try {
        const metaDoc = await db.collection("metadata").doc(currentUserTenantId).get();
        if (metaDoc.exists) { 
            appData.lastInvoiceNum = metaDoc.data().lastNum || 0; 
            appData.lastPoNum = metaDoc.data().lastPoNum || 0; 
        } else { 
            await db.collection("metadata").doc(currentUserTenantId).set({ lastNum: 0, lastPoNum: 0 }); 
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

        document.getElementById('loading-overlay').style.display = 'none';
        switchScreen('screen-history', false); 
        
        renderCustomerList(); renderProductList(); renderHistoryList(); renderPOList(); populateDropdowns();
    } catch (error) {
        console.error("Fetch Data Error:", error);
        document.getElementById('loading-overlay').style.display = 'none';
        showCustomAlert("Database structure error. Please check developer console.", "Setup Error", "⚠️");
    }
}

async function manualRefresh() {
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('loading-text').innerText = "Syncing with Cloud...";
    try {
        if(!currentUserTenantId) throw new Error("No active tenant");
        await fetchCloudData();
        if (document.getElementById('screen-pos').classList.contains('active')) {
            renderPOSGrid(); renderPOSCart();
        }
        showCustomAlert("App synced successfully.", "Sync Complete", "✅");
    } catch (error) {
        console.error("Sync Error:", error);
        document.getElementById('loading-overlay').style.display = 'none';
        showCustomAlert("Failed to sync data.", "Sync Error", "🔴");
    }
}

// ========================================================
// 🌟 SaaS LOGO UPLOAD ENGINE
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('logo-upload-input');
    
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Prevent massive files from slowing down the app (Limit: 2MB)
            if (file.size > 2 * 1024 * 1024) {
                return showCustomAlert("Please choose an image smaller than 2MB.", "File Too Large", "⚠️");
            }

            document.getElementById('loading-overlay').style.display = 'flex';
            document.getElementById('loading-text').innerText = "Uploading Secure Logo...";

            try {
                // 1. Send the file to Firebase Storage (Name it by Tenant ID)
                const storageRef = storage.ref(`tenant_logos/${currentUserTenantId}_logo`);
                await storageRef.put(file);

                // 2. Ask Firebase for the public, globally cached URL
                const downloadURL = await storageRef.getDownloadURL();

                // 3. Save that exact URL into the Firestore 'tenants' database
                await db.collection("tenants").doc(currentUserTenantId).update({
                    logoUrl: downloadURL
                });

                // 4. Instantly update the screen so the user sees it
                document.getElementById('dynamic-tenant-logo').src = downloadURL;
                currentTenantProfile.logoUrl = downloadURL;

                showToastMessage("Store Logo updated successfully!", false);
            } catch (error) {
                console.error("Upload error:", error);
                showCustomAlert("Failed to upload logo. Please check console.", "Upload Error", "🔴");
            } finally {
                document.getElementById('loading-overlay').style.display = 'none';
                fileInput.value = ""; // Reset the input so they can upload again if needed
            }
        });
    }
});