function renderCustomerList() { 
    const list = document.getElementById("customers-list");
    list.innerHTML = appData.customers.map(c => `
        <div class="list-item">
            <div><strong style="color:#0b2a5c;">${c.name}</strong><br><small class="text-muted">GST: ${c.gstin}</small></div>
            <div class="d-flex align-items-center gap-2">
                ${isAdmin ? `<button class="btn btn-light action-btn border shadow-sm" onclick="editCustomer('${c.id}')">Edit</button>` : ''}
                ${isAdmin ? `<button class="btn btn-danger btn-sm shadow-sm" onclick="promptDeleteCustomer('${c.id}')">🗑️</button>` : ''}
            </div>
        </div>
    `).join(''); 
    populateDropdowns(); 
}

function promptDeleteCustomer(id) {
    if(!isAdmin) return; const customer = appData.customers.find(c => c.id === id); if(!customer) return;
    showCustomConfirm(`Are you sure you want to permanently delete "${customer.name}"?`, () => executeDeleteCustomer(id), "Yes, Delete");
}

async function executeDeleteCustomer(id) {
    document.getElementById('loading-overlay').style.display = 'flex'; document.getElementById('loading-text').innerText = "Deleting Contact...";
    try {
        await db.collection("customers").doc(id).delete(); appData.customers = appData.customers.filter(c => c.id !== id);
        renderCustomerList(); showCustomAlert("Contact successfully deleted.", "Success", "✅");
    } catch (error) { showCustomAlert("Failed to delete contact.", "Error", "🔴"); } 
    finally { document.getElementById('loading-overlay').style.display = 'none'; }
}

function editCustomer(id) { 
    if(!isAdmin) return;
    const formContainer = document.getElementById('customer-form-container');
    formContainer.style.display = 'block'; document.getElementById('btn-add-customer').style.display = 'none';
    if (id === 'new') { 
        document.getElementById('cust-id').value = 'new'; document.getElementById('cust-name').value = ''; 
        document.getElementById('cust-address').value = ''; document.getElementById('cust-gstin').value = ''; 
        document.getElementById('cust-state').value = '33'; 
    } else { 
        const c = appData.customers.find(x => x.id === id); 
        document.getElementById('cust-id').value = c.id; document.getElementById('cust-name').value = c.name; 
        document.getElementById('cust-address').value = c.address.replace(/<br>/g, '\n'); 
        document.getElementById('cust-gstin').value = c.gstin; document.getElementById('cust-state').value = isNaN(c.stateCode) ? "" : c.stateCode; 
    }
    setTimeout(() => { formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
}

async function saveCustomer() {
    const id = document.getElementById("customer-id").value || 'c' + Date.now();
    const type = document.getElementById("customer-type").value;
    const name = document.getElementById("customer-name").value.trim();
    const phone = document.getElementById("customer-phone").value.trim();
    const gstin = document.getElementById("customer-gstin").value.trim() || "URP";
    const address = document.getElementById("customer-address").value.trim();
    const stateCode = parseInt(document.getElementById("customer-state-code").value) || 33;

    if (!name || !phone) return showCustomAlert("Name and Phone are required.", "Missing Info", "⚠️");

    const btn = document.getElementById("btn-save-customer");
    btn.innerText = "Saving..."; btn.disabled = true;

    // 🌟 MULTI-TENANT FIX: Rubber-stamp the tenantId!
    const customerData = {
        id: id,
        tenantId: currentUserTenantId, // <-- CRITICAL SAAS ADDITION
        type: type,
        name: name,
        phone: phone,
        gstin: gstin,
        address: address,
        stateCode: stateCode,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection("customers").doc(id).set(customerData, { merge: true });
        
        const existingIndex = appData.customers.findIndex(c => c.id === id);
        if (existingIndex > -1) {
            appData.customers[existingIndex] = customerData;
        } else {
            appData.customers.push(customerData);
        }
        
        closeCustomerModal();
        renderCustomerList();
        populateDropdowns();
        showToastMessage("Profile saved successfully!", false);
    } catch (error) {
        console.error("Error saving customer:", error);
        showCustomAlert("Failed to save profile. Check security rules.", "Error", "🔴");
    } finally {
        btn.innerText = "Save Profile"; btn.disabled = false;
    }
}

function cancelCustomerEdit() { document.getElementById('customer-form-container').style.display = 'none'; document.getElementById('btn-add-customer').style.display = isAdmin ? 'block' : 'none'; }