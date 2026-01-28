const MINING_REWARD_INTERVAL = 60000; // 1 minute for demo purposes (real could be longer)

const getIcon = (cat) => {
    switch (cat?.toLowerCase()) {
        case 'gpu': return 'fa-memory';
        case 'farm': return 'fa-network-wired';
        default: return 'fa-microchip';
    }
};

async function initMining() {
    if (!window.state.currentUser) return;
    await fetchMiningEquipment();
    await fetchUserMiners();

    // Start interval to calculate pending rewards visually
    setInterval(updatePendingUI, 5000);
}

async function fetchMiningEquipment() {
    try {
        const { data, error } = await supabaseClient
            .from('mining_equipment')
            .select('*');
        if (error) throw error;
        window.state.miningStore = data; // Cache for modal
        renderMiningStore(data);
    } catch (e) {
        console.error("Mining Store Error:", e);
    }
}

async function fetchUserMiners() {
    if (!window.state.currentUser) return;
    try {
        const { data, error } = await supabaseClient
            .from('user_mining')
            .select('*, mining_equipment(*)');
        if (error) throw error;
        window.state.userMiners = data || [];
        renderUserMiningDashboard();
    } catch (e) {
        console.error("User Miners Error:", e);
    }
}

function renderMiningStore(equipment) {
    const grid = document.getElementById('miningStoreGrid');
    if (!grid) return;

    grid.innerHTML = equipment.map(item => {
        const catClass = `badge-${(item.category || 'ASIC').toLowerCase()}`;
        return `
            <div class="miner-card">
                <div class="miner-badge ${catClass}">${item.category || 'ASIC'}</div>
                <div class="miner-icon"><i class="fa-solid ${getIcon(item.category)}"></i></div>
                <div class="miner-info">
                    <h3>${item.name}</h3>
                    <div class="miner-stats">
                        <div class="m-stat">
                            <span class="m-label">Доход/день</span>
                            <span class="m-value profit">+$${item.daily_profit}</span>
                        </div>
                        <div class="m-stat">
                            <span class="m-label">Свет/день</span>
                            <span class="m-value cost">-$${item.daily_electricity}</span>
                        </div>
                    </div>
                </div>
                <div class="miner-price">
                    <div class="price-box">
                        <span class="price-label">Цена покупки</span>
                        <span class="price-amount">$${item.price.toLocaleString()}</span>
                    </div>
                    <button onclick="buyMiner('${item.id}')" class="btn btn-primary">Купить</button>
                </div>
            </div>
        `;
    }).join('');
}

let selectedMiner = null;

function buyMiner(minerId) {
    if (!window.state.currentUser) return openModal('loginModal');

    // Find miner data
    // existing renderMiningStore map doesn't save data globally cleanly, let's fetch from DOM or store.
    // Better: Helper was passed entire object to render, but here we only have ID.
    // Let's assume we can re-find it from a global cache or just pass price to this function?
    // Let's use a global cache since we fetch it.

    // Refactoring fetchMiningEquipment to store data
    // We need to modify fetchMiningEquipment first to store data in window.state.miningStore
    const miner = window.state.miningStore?.find(m => m.id === minerId);

    if (!miner) {
        // Fallback or error
        console.error('Miner not found in local cache');
        return;
    }

    selectedMiner = miner;

    // Setup Modal
    const info = document.getElementById('buyMinerInfo');
    if (info) {
        info.innerHTML = `
            <div class="buy-miner-preview">
                <div class="bmp-icon"><i class="fa-solid ${getIcon(miner.category)}"></i></div>
                <div>
                    <h4>${miner.name}</h4>
                    <span class="bmp-price">$${miner.price.toLocaleString()} / шт.</span>
                </div>
            </div>
        `;
    }

    document.getElementById('minerQuantity').value = 1;
    updateMinerTotal();
    openModal('buyMinerModal');
}

window.updateMinerTotal = () => {
    if (!selectedMiner) return;
    const qty = parseInt(document.getElementById('minerQuantity').value) || 1;
    const total = selectedMiner.price * qty;
    document.getElementById('minerTotalCost').textContent = `$${total.toLocaleString()}`;
};

window.selectMinerPayment = (method, element) => {
    document.querySelectorAll('.payment-method').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    element.querySelector('input').checked = true;
};

async function confirmBuyMiner() {
    if (!selectedMiner) return;

    const qty = parseInt(document.getElementById('minerQuantity').value) || 1;
    const method = document.querySelector('input[name="minerPayment"]:checked').value;
    const total = selectedMiner.price * qty;

    const btn = event.currentTarget || document.querySelector('#buyMinerModal .btn-primary');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Обработка...';

    try {
        const { error } = await supabaseClient.rpc('buy_miner_v2', {
            p_miner_id: selectedMiner.id,
            p_quantity: qty,
            p_payment_method: method
        });

        if (error) throw error;

        showSuccess(`Успешно куплено ${qty} шт. ${selectedMiner.name}!`);
        closeModal('buyMinerModal');
        await fetchUserMiners();

        // Refresh balances
        if (method === 'crypto') {
            populatePortfolio();
        } else {
            // Refresh bank if needed (it usually refreshes on tab switch, but good to force if visible)
            if (window.initBanking) window.initBanking(); // Force bank refresh
        }
    } catch (e) {
        console.error(e);
        alert(e.message || 'Ошибка при покупке');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Pagination State
let miningPage = 1;
const MINING_PAGE_SIZE = 5;

function renderUserMiningDashboard() {
    const statsRow = document.getElementById('miningStats');
    const minersList = document.getElementById('myMinersList');
    const minersHeader = document.getElementById('myEquipmentHeader');
    if (!statsRow) return;

    let totalProfit = 0;
    let totalExpenses = 0;

    const validMiners = (window.state.userMiners || []).filter(m => m.mining_equipment);

    validMiners.forEach(m => {
        totalProfit += parseFloat(m.mining_equipment.daily_profit || 0);
        totalExpenses += parseFloat(m.mining_equipment.daily_electricity || 0);
    });

    statsRow.innerHTML = `
        <div class="m-global-stat">
            <i class="fa-solid fa-bolt"></i>
            <div class="m-stat-content">
                <span class="m-label">Всего майнеров</span>
                <span class="m-value">${validMiners.length} шт.</span>
            </div>
        </div>
        <div class="m-global-stat">
            <i class="fa-solid fa-sack-dollar"></i>
            <div class="m-stat-content">
                <span class="m-label">Чистая прибыль/день</span>
                <span class="m-value profit">$${(totalProfit - totalExpenses).toFixed(2)}</span>
            </div>
        </div>
        <div class="m-global-stat">
            <i class="fa-solid fa-clock"></i>
            <div class="m-stat-content">
                <span class="m-label">В обработке</span>
                <div class="m-value">
                    <span id="pendingReward">$0.0000</span>
                    <button id="collectBtn" onclick="collectProfit()" class="btn-collect" disabled>Вывести</button>
                </div>
            </div>
        </div>
    `;

    // Group miners by equipment_id
    const groupedMinersMap = new Map();
    validMiners.forEach(m => {
        const eqId = m.mining_equipment.id;
        if (!groupedMinersMap.has(eqId)) {
            groupedMinersMap.set(eqId, {
                ...m,
                count: 0
            });
        }
        groupedMinersMap.get(eqId).count++;
    });

    const groupedMinersArray = Array.from(groupedMinersMap.values());

    // Render My Equipment List with Pagination
    if (minersList) {
        if (groupedMinersArray.length > 0) {
            if (minersHeader) minersHeader.style.display = 'block';

            // Pagination Logic
            const totalPages = Math.ceil(groupedMinersArray.length / MINING_PAGE_SIZE);
            if (miningPage > totalPages) miningPage = 1;

            const start = (miningPage - 1) * MINING_PAGE_SIZE;
            const end = start + MINING_PAGE_SIZE;
            const paginatedMiners = groupedMinersArray.slice(start, end);

            const itemsHtml = paginatedMiners.map(m => {
                const item = m.mining_equipment;
                const cat = item.category || 'ASIC';
                const catClass = `badge-${cat.toLowerCase()}`;

                return `
                    <div class="my-miner-item anim-fade-in" style="position: relative;">
                        <div class="my-miner-info">
                            <div class="my-miner-icon">
                                <i class="fa-solid ${getIcon(cat)}"></i>
                            </div>
                            <div class="my-miner-details">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <h4>${item.name || 'Оборудование'}</h4>
                                    ${m.count > 1 ? `<span class="miner-qty-tag">x${m.count}</span>` : ''}
                                </div>
                                <span class="badge-tx ${catClass}">${cat}</span>
                            </div>
                        </div>
                        <div class="my-miner-payout">
                            <span class="profit">+$${parseFloat(item.daily_profit || 0).toFixed(2)} / день</span>
                            <span class="cost">-$${parseFloat(item.daily_electricity || 0).toFixed(2)} свет</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Pagination Controls
            let paginationHtml = '';
            if (totalPages > 1) {
                paginationHtml = `
                    <div style="display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 20px;">
                        <button class="btn-micro ${miningPage <= 1 ? 'disabled' : ''}" onclick="changeMiningPage(-1)">
                            <i class="fa-solid fa-chevron-left"></i>
                        </button>
                        <span style="color: var(--text-secondary); font-size: 0.9rem;">${miningPage} / ${totalPages}</span>
                        <button class="btn-micro ${miningPage >= totalPages ? 'disabled' : ''}" onclick="changeMiningPage(1)">
                            <i class="fa-solid fa-chevron-right"></i>
                        </button>
                    </div>
                `;
            }

            minersList.innerHTML = itemsHtml + paginationHtml;

        } else {
            if (minersHeader) minersHeader.style.display = 'none';
            minersList.innerHTML = '<div class="text-center p-20" style="color: var(--text-secondary); background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border);">У вас пока нет оборудования. Купите что-нибудь в магазине выше!</div>';
        }
    }

    // Update profile stats if exists
    const profileStats = document.getElementById('profileMiningStats');
    if (profileStats) {
        profileStats.textContent = `${validMiners.length} шт / $${(totalProfit - totalExpenses).toFixed(2)}`;
    }

    updatePendingUI();
}

window.changeMiningPage = (delta) => {
    miningPage += delta;
    renderUserMiningDashboard();
    // Scroll to header
    const header = document.getElementById('myEquipmentHeader');
    if (header) header.scrollIntoView({ behavior: 'smooth', block: 'center' });
};


let lastPendingValue = 0;

function updatePendingUI() {
    const el = document.getElementById('pendingReward');
    const btn = document.getElementById('collectBtn');
    if (!el || !window.state.userMiners?.length) return;

    let pending = 0;
    const now = new Date();

    window.state.userMiners.forEach(m => {
        const lastClaim = new Date(m.last_claim_at || m.purchased_at);
        const hoursPassed = (now - lastClaim) / (1000 * 60 * 60);
        const hourlyProfit = (m.mining_equipment.daily_profit - m.mining_equipment.daily_electricity) / 24;
        pending += Math.max(0, hoursPassed * hourlyProfit);
    });

    el.textContent = `$${pending.toFixed(4)}`;
    lastPendingValue = pending;

    if (btn) {
        btn.disabled = pending < 0.01;
        btn.title = pending < 0.01 ? 'Минимум $0.01' : 'Вывести на баланс';
    }
}

async function collectProfit() {
    if (lastPendingValue < 0.01) return;

    const btn = document.getElementById('collectBtn');
    btn.disabled = true;
    btn.textContent = '...';

    try {
        const { error } = await supabaseClient.rpc('collect_mining_profit');
        if (error) throw error;

        showSuccess(`Прибыль $${lastPendingValue.toFixed(4)} зачислена на ваш баланс USDT!`);
        await fetchUserMiners();
        populatePortfolio();
    } catch (e) {
        alert(e.message || 'Ошибка вывода');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Вывести';
        }
    }
}

// Initial pull when miner section is shown
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.target.id === 'mining' && mutation.target.classList.contains('active')) {
            initMining();
            miningPage = 1; // Reset pagination
        }
    });
});

const miningSection = document.getElementById('mining');
if (miningSection) {
    observer.observe(miningSection, { attributes: true, attributeFilter: ['class'] });
    // If already active on load
    if (miningSection.classList.contains('active')) initMining();
}

// Global safety call
if (window.state?.currentUser) initMining();
