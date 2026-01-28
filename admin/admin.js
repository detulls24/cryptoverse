// Admin Panel Logic
let adminState = {
    users: [],
    wallets: [],
    bankAccounts: [],
    transactions: [],
    bankTransfers: [],
    marketAssets: [],
    currentTab: 'overview',
    editingUser: null,

    // Pagination
    txPage: 1,
    txLimit: 10,
    txTotal: 0
};

// --- Initialization ---
window.onload = () => {
    initAdmin();
};

async function initAdmin() {
    console.log("Admin Initializing...");
    await refreshData();
    renderAll();

    // Auto refresh every 30 seconds
    setInterval(refreshData, 30000);
}

async function refreshData() {
    try {
        const { data, error } = await supabaseClient.rpc('admin_get_all_data');
        if (error) throw error;

        adminState.wallets = data.wallets || [];
        adminState.bankAccounts = data.bank_accounts || [];
        adminState.transactions = data.transactions || [];
        adminState.bankTransfers = data.bank_transfers || [];

        // Use real users from profiles table
        adminState.users = data.users || [];

        // Fetch Assets separately
        const { data: assetsData } = await supabaseClient.rpc('admin_get_market_assets');
        adminState.marketAssets = assetsData || [];

        updateStats();
        renderAll();

        // Load initial transaction page
        fetchTransactionsPage(adminState.txPage);
    } catch (e) {
        console.error("Admin Refresh Error:", e);
    }
}

// --- UI Rendering ---
function renderAll() {
    renderOverview();
    renderUserList(adminState.users);
    renderBankList(adminState.bankAccounts);
    renderTransactions(adminState.transactions);
    renderMarketAssets(adminState.marketAssets);
}

function updateStats() {
    document.getElementById('statTotalUsers').textContent = adminState.users.length;

    let totalFunds = 0;
    adminState.bankAccounts.forEach(b => totalFunds += parseFloat(b.balance || 0));
    document.getElementById('statTotalFunds').textContent = '$' + totalFunds.toLocaleString(undefined, { maximumFractionDigits: 0 });

    const activeBanks = adminState.bankAccounts.filter(b => !b.is_frozen).length;
    document.getElementById('statActiveAccounts').textContent = activeBanks;
}

function renderOverview() {
    const body = document.getElementById('payoutRequestsBody');
    if (!body) return;

    // Show withdrawal attempts from transactions
    const withdrawals = adminState.transactions.filter(t => t.amount < 0 && t.details?.toLowerCase().includes('вывод'));

    if (withdrawals.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Нет активных запросов</td></tr>';
        return;
    }

    body.innerHTML = withdrawals.slice(0, 10).map(w => `
        <tr>
            <td>${w.user_id.slice(0, 8)}...</td>
            <td>${w.coin_id.toUpperCase()}</td>
            <td class="negative">${w.amount}</td>
            <td><span class="badge active">Выплачено</span></td>
            <td><button class="btn-small" onclick="alert('Уже обработано')">Детали</button></td>
        </tr>
    `).join('');
}

function renderUserList(users = adminState.users) {
    const body = document.getElementById('userListBody');
    if (!body) return;

    if (users.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Пользователи не найдены</td></tr>';
        return;
    }

    body.innerHTML = users.map(u => {
        const userWallets = adminState.wallets.filter(w => w.user_id === u.id);
        const walletInfo = userWallets.map(w => `${w.coin_id.toUpperCase()}: ${parseFloat(w.balance).toFixed(2)}`).join('<br>');

        return `
            <tr>
                <td style="font-family: monospace;">${u.id}</td>
                <td>${u.email}</td>
                <td style="font-size: 0.8rem;">${walletInfo || 'Нет активов'}</td>
                <td>
                    <button class="btn-small btn-warn" onclick="openEditModal('${u.id}', 'wallet')">Баланс</button>
                    <button class="btn-small btn-danger" onclick="deleteUser('${u.id}')">Удалить</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderBankList(banks = adminState.bankAccounts) {
    const body = document.getElementById('bankListBody');
    if (!body) return;

    if (banks.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Счета не найдены</td></tr>';
        return;
    }

    body.innerHTML = banks.map(b => `
        <tr>
            <td>${b.holder_name}</td>
            <td style="font-family: monospace;">${b.account_number}</td>
            <td>$${parseFloat(b.balance).toLocaleString()}</td>
            <td><span class="badge ${b.is_frozen ? 'frozen' : 'active'}">${b.is_frozen ? 'Заморожен' : 'Активен'}</span></td>
            <td>
                <button class="btn-small btn-warn" onclick="openEditModal('${b.user_id}', 'bank')">Баланс</button>
                <button class="btn-small btn-danger" style="background: rgba(255,255,255,0.05); color: white; border: 1px solid #474d57;" onclick="toggleFreeze('${b.user_id}', ${b.is_frozen})">
                    ${b.is_frozen ? 'Разморозить' : 'Заморозить'}
                </button>
            </td>
        </tr>
    `).join('');
}

window.handleSearch = () => {
    const query = document.getElementById('adminSearch').value.toLowerCase().trim();

    if (!query) {
        renderAll();
        return;
    }

    // Filter Users
    const filteredUsers = adminState.users.filter(u =>
        u.id.toLowerCase().includes(query) ||
        (u.email && u.email.toLowerCase().includes(query))
    );
    renderUserList(filteredUsers);

    // Filter Bank Accounts
    const filteredBanks = adminState.bankAccounts.filter(b =>
        b.holder_name.toLowerCase().includes(query) ||
        b.account_number.toLowerCase().includes(query) ||
        b.user_id.toLowerCase().includes(query)
    );
    renderBankList(filteredBanks);

    // Filter Transactions
    const filteredTx = adminState.transactions.filter(t =>
        t.user_id.toLowerCase().includes(query) ||
        t.type.toLowerCase().includes(query) ||
        t.coin_id.toLowerCase().includes(query)
    );
    renderTransactions(filteredTx);
};

// --- Interactions ---
window.switchTab = (tabId) => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById('tab-' + tabId).classList.add('active');
    event.currentTarget.classList.add('active');

    const titles = {
        overview: 'Обзор системы',
        users: 'Управление пользователями',
        banking: 'Банковские счета',
        transactions: 'История всех операций',
        assets: 'Управление недвижимостью'
    };
    document.getElementById('tabTitle').textContent = titles[tabId];
    adminState.currentTab = tabId;
};

window.openEditModal = (userId, type) => {
    adminState.editingUser = userId;
    const user = adminState.users.find(u => u.id === userId);
    document.getElementById('editUserEmail').textContent = user?.email || userId;
    document.getElementById('balanceType').value = type;

    updateCoinSelect(userId);
    document.getElementById('adminEditModal').style.display = 'flex';
};

function updateCoinSelect(userId) {
    const type = document.getElementById('balanceType').value;
    const container = document.getElementById('walletSelectContainer');
    const select = document.getElementById('coinIdSelect');

    if (type === 'bank') {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
        const userWallets = adminState.wallets.filter(w => w.user_id === userId);
        select.innerHTML = userWallets.map(w => `<option value="${w.coin_id}">${w.coin_id.toUpperCase()}</option>`).join('');
    }
}

document.getElementById('balanceType').addEventListener('change', () => updateCoinSelect(adminState.editingUser));

window.closeAdminModal = () => {
    document.getElementById('adminEditModal').style.display = 'none';
};

window.saveAdminChanges = async (actionType = 'set') => {
    const userId = adminState.editingUser;
    const type = document.getElementById('balanceType').value;
    const amountInput = document.getElementById('newAmount');
    const amount = parseFloat(amountInput.value);

    if (isNaN(amount)) return alert('Введите корректную сумму');

    try {
        let rpcName = '';
        let params = {};
        const reason = document.getElementById('adminReason').value;

        if (type === 'bank') {
            rpcName = actionType === 'set' ? 'admin_set_bank_balance' : 'admin_alter_bank_balance';
            params = {
                p_user_id: userId,
                [actionType === 'set' ? 'p_new_balance' : 'p_amount']: amount
            };
            if (actionType === 'alter') params.p_reason = reason;
        } else {
            const coinId = document.getElementById('coinIdSelect').value;
            rpcName = actionType === 'set' ? 'admin_update_wallet_balance' : 'admin_alter_wallet_balance';
            params = {
                p_user_id: userId,
                p_coin_id: coinId,
                [actionType === 'set' ? 'p_new_balance' : 'p_amount']: amount
            };
            if (actionType === 'alter') params.p_reason = reason;
        }

        console.log("Executing RPC:", rpcName, params);
        const { error } = await supabaseClient.rpc(rpcName, params);
        if (error) throw error;

        const actionMsg = actionType === 'set' ? 'Баланс установлен' : (amount > 0 ? 'Счет пополнен' : 'Средства списаны');
        window.showNotification('Успешно', `${actionMsg}\nСумма: ${amount}\nПричина: ${reason}`, 'success');

        amountInput.value = '';
        closeAdminModal();
        refreshData();
    } catch (e) {
        console.error("RPC Error Details:", e);
        window.showNotification('Ошибка выполнения', e.message, 'error');
    }
};

window.toggleFreeze = async (userId, currentState) => {
    try {
        const { error } = await supabaseClient.rpc('admin_toggle_bank_freeze', {
            p_user_id: userId,
            p_freeze: !currentState
        });
        if (error) throw error;
        refreshData();
    } catch (e) {
        alert(e.message);
    }
};

window.deleteUser = async (userId) => {
    if (!confirm('Вы уверены? Это полностью очистит все данные пользователя через SQL RPC.')) return;

    try {
        const { error } = await supabaseClient.rpc('admin_clear_user_data', {
            p_user_id: userId
        });
        if (error) throw error;

        alert('Данные пользователя полностью удалены');
        refreshData();
    } catch (e) {
        alert(e.message);
    }
};

// --- Market Assets Management ---
function renderMarketAssets(assets = adminState.marketAssets) {
    const body = document.getElementById('marketAssetsBody');
    if (!body) return;

    if (!assets || assets.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Нет активов в продаже</td></tr>';
        return;
    }

    body.innerHTML = assets.map(a => `
        <tr>
            <td><img src="${a.image_url}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;"></td>
            <td>${a.name}</td>
            <td>${a.type}</td>
            <td>$${parseFloat(a.price).toLocaleString()}</td>
            <td>
                <button class="btn-small btn-danger" onclick="deleteMarketAsset('${a.id}')">Удалить</button>
            </td>
        </tr>
    `).join('');
}

window.addMarketAsset = async () => {
    const name = document.getElementById('newAssetName').value;
    const type = document.getElementById('newAssetType').value;
    const price = document.getElementById('newAssetPrice').value;
    const image = document.getElementById('newAssetImage').value;
    const desc = document.getElementById('newAssetDesc').value;
    const qty = document.getElementById('newAssetQty').value;

    if (!name || !price || !image) return alert('Заполните основные поля');

    try {
        const { error } = await supabaseClient.rpc('admin_add_market_asset', {
            p_name: name,
            p_type: type,
            p_price: parseFloat(price),
            p_image_url: image,
            p_desc: desc,
            p_quantity: parseInt(qty)
        });
        if (error) throw error;

        window.showNotification('Успешно', 'Актив добавлен', 'success');
        refreshData();

        // Clear form
        document.getElementById('newAssetName').value = '';
        document.getElementById('newAssetPrice').value = '';
        document.getElementById('newAssetImage').value = '';
        document.getElementById('newAssetDesc').value = '';
    } catch (e) {
        alert(e.message);
    }
};

window.deleteMarketAsset = async (id) => {
    if (!confirm('Удалить этот актив с продажи?')) return;
    try {
        const { error } = await supabaseClient.rpc('admin_delete_market_asset', { p_id: id });
        if (error) throw error;
        refreshData();
    } catch (e) {
        alert(e.message);
    }
};

// --- Pagination ---
window.fetchTransactionsPage = async (page = 1) => {
    try {
        const { data, error } = await supabaseClient.rpc('admin_get_transactions_paginated', {
            p_page: page,
            p_page_size: adminState.txLimit
        });

        if (error) throw error;

        adminState.transactions = data.data; // Update current view data
        adminState.txPage = data.page;
        adminState.txTotal = data.total;

        renderTransactions(adminState.transactions);
        updatePaginationControls();

    } catch (e) {
        console.error("Pagination Error:", e);
    }
};

function updatePaginationControls() {
    const totalPages = Math.ceil(adminState.txTotal / adminState.txLimit);
    document.getElementById('pageIndicator').textContent = `Страница ${adminState.txPage} из ${totalPages || 1}`;

    document.getElementById('btnPrevPage').disabled = adminState.txPage <= 1;
    document.getElementById('btnNextPage').disabled = adminState.txPage >= totalPages;

    // Grey out buttons style if disabled
    document.getElementById('btnPrevPage').style.opacity = adminState.txPage <= 1 ? '0.5' : '1';
    document.getElementById('btnNextPage').style.opacity = adminState.txPage >= totalPages ? '0.5' : '1';
}

window.changeTransactionPage = (delta) => {
    const newPage = adminState.txPage + delta;
    if (newPage > 0 && newPage <= Math.ceil(adminState.txTotal / adminState.txLimit)) {
        fetchTransactionsPage(newPage);
    }
};

function renderTransactions(transactions = adminState.transactions) {
    const body = document.getElementById('fullTransactionHistoryBody');
    if (!body) return;

    if (!transactions || transactions.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Транзакции не найдены</td></tr>';
        return;
    }

    body.innerHTML = transactions.map(t => `
        <tr>
            <td>${new Date(t.created_at).toLocaleString()}</td>
            <td>${t.user_id.slice(0, 8)}...</td>
            <td>${t.type}</td>
            <td>${t.coin_id.toUpperCase()}</td>
            <td class="${t.amount >= 0 ? 'positive' : 'negative'}">${t.amount >= 0 ? '+' : ''}${t.amount}</td>
        </tr>
    `).join('');
}
