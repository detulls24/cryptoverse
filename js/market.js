// Market Data & Charting Module
async function fetchCoins() {
    try {
        const url = `${API_BASE}/coins/markets?vs_currency=${window.state.baseCurrency}&order=market_cap_desc&per_page=20&sparkline=true&price_change_percentage=1h,24h,7d`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API Status: ${res.status}`);

        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Invalid API response format");

        window.state.allCoins = data.map(c => ({
            ...c,
            type: STABLE_COINS.includes(c.symbol.toLowerCase()) ? 'stable' : 'crypto'
        }));

        updateTicker();
        renderCoinList();

        if (!window.state.selectedCoin && window.state.allCoins.length > 0) {
            selectCoin(window.state.allCoins[0]);
        }

        populatePortfolio(); // Update portfolio with fresh prices
    } catch (e) {
        console.error('API Error:', e);
        // Fallback UI or silent fail
        const list = document.getElementById('coinList');
        if (list && window.state.allCoins.length === 0) {
            list.innerHTML = '<div class="p-20 text-center text-secondary">Ошибка загрузки данных. Попробуйте обновить страницу позже (лимит API).</div>';
        }
    }
}

function updateTicker() {
    const ticker = document.getElementById('tickerContent');
    if (!ticker) return;
    const items = [...window.state.allCoins.slice(0, 10), ...FIAT_PAIRS.slice(0, 2)].map(c => {
        const change = c.price_change_percentage_24h || 0;
        const price = c.current_price || (c.rate ? (1 / c.rate).toFixed(4) : 0);
        return `
            <div class="ticker-item">
                <img src="${c.image}" alt="${c.symbol}">
                <span class="symbol">${c.symbol.toUpperCase()}</span>
                <span class="price">$${typeof price === 'number' ? price.toLocaleString() : price}</span>
                <span class="change ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>
            </div>
        `;
    }).join('');
    ticker.innerHTML = items + items;
}

function renderCoinList() {
    const list = document.getElementById('coinList');
    const searchInput = document.getElementById('coinSearch');
    if (!list || !searchInput) return;
    const search = searchInput.value.toLowerCase();

    let coins = [];
    if (window.state.currentTab === 'crypto') coins = window.state.allCoins.filter(c => c.type === 'crypto');
    else if (window.state.currentTab === 'stable') coins = window.state.allCoins.filter(c => c.type === 'stable');
    else if (window.state.currentTab === 'fiat') coins = FIAT_PAIRS;

    coins = coins.filter(c =>
        c.name.toLowerCase().includes(search) ||
        c.symbol.toLowerCase().includes(search)
    );

    list.innerHTML = coins.slice(0, 15).map((c, i) => {
        const price = c.current_price || (c.rate ? `${c.rate.toFixed(2)} RUB` : '—');
        const change = c.price_change_percentage_24h || 0;
        const isActive = window.state.selectedCoin?.id === c.id ? 'active' : '';
        return `
            <li class="${isActive}" style="--i: ${i}" onclick="selectCoin(${JSON.stringify(c).replace(/"/g, '&quot;')})">
                <div class="coin-left">
                    <img src="${c.image}" alt="${c.symbol}">
                    <div>
                        <div class="coin-name">${c.name}</div>
                        <div class="coin-symbol">${c.symbol.toUpperCase()}</div>
                    </div>
                </div>
                <div class="coin-right">
                    <div class="coin-price">${typeof price === 'number' ? '$' + price.toLocaleString() : price}</div>
                    <div class="coin-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</div>
                </div>
            </li>
        `;
    }).join('');
}

window.selectCoin = (coin) => {
    if (!coin) return;
    if (typeof coin === 'string') coin = JSON.parse(coin);
    window.state.selectedCoin = coin;

    const img = document.getElementById('chartCoinImg');
    const name = document.getElementById('chartPairName');
    const priceEl = document.getElementById('chartPrice');
    const changeEl = document.getElementById('chartChange');

    if (img) img.src = coin.image || '';
    if (name) name.textContent = `${(coin.symbol || '').toUpperCase()}/${window.state.baseCurrency.toUpperCase()}`;

    const price = coin.current_price || (coin.rate ? coin.rate : 0);
    if (priceEl) {
        priceEl.textContent = coin.type === 'fiat'
            ? `${price.toFixed(2)} ${coin.symbol.toUpperCase()}`
            : `$${price.toLocaleString()}`;
    }

    const change = coin.price_change_percentage_24h || 0;
    if (changeEl) {
        changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        changeEl.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
    }

    const typeLabel = document.querySelector('.pair-type');
    if (typeLabel) {
        typeLabel.textContent = coin.type === 'fiat' ? 'Фиат' :
            coin.type === 'stable' ? 'Стейблкоин' : 'Криптовалюта';
    }

    if (coin.sparkline_in_7d?.price) {
        updateChart(coin.sparkline_in_7d.price.slice(-24), change >= 0 ? '#0ecb81' : '#f6465d');
    } else if (coin.type === 'fiat') {
        const baseRate = coin.rate || 1;
        const fiatChart = Array.from({ length: 24 }, (_, i) =>
            baseRate * (1 + (Math.sin(i / 3) * 0.002))
        );
        updateChart(fiatChart, '#f0b90b');
    }

    renderCoinList();
};

let priceChart;
function initChart() {
    const canvas = document.getElementById('priceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#0ecb81',
                backgroundColor: 'rgba(14, 203, 129, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { display: false }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function updateChart(prices, color) {
    if (!priceChart) return;
    const ctx = document.getElementById('priceChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, color.replace(')', ', 0.2)').replace('rgb', 'rgba'));
    gradient.addColorStop(1, 'transparent');

    priceChart.data.labels = prices.map((_, i) => i);
    priceChart.data.datasets[0].data = prices;
    priceChart.data.datasets[0].borderColor = color;
    priceChart.data.datasets[0].backgroundColor = gradient;
    priceChart.update('none');
}

async function populatePortfolio() {
    const tbody = document.getElementById('portfolioBody');
    const balanceEl = document.getElementById('totalBalance');
    const changeEl = document.querySelector('.balance-change');

    // Always clear/reset first
    if (balanceEl) balanceEl.textContent = '$0.00';
    if (changeEl) {
        changeEl.className = 'balance-change';
        changeEl.textContent = '+$0.00 (0%)';
    }

    if (!tbody) return;

    if (!window.state.currentUser) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Войдите, чтобы увидеть активы</td></tr>';
        return;
    }

    try {
        // Fetch Crypto Wallets
        const { data: wallets, error: wError } = await supabaseClient
            .from('wallets')
            .select('*')
            .eq('user_id', window.state.currentUser.id);

        if (wError) throw wError;

        // Fetch Bank Balance (for Total Balance calculation)
        const { data: bankData, error: bError } = await supabaseClient
            .from('bank_accounts')
            .select('balance')
            .eq('user_id', window.state.currentUser.id)
            .maybeSingle();

        const bankBalance = bankData ? parseFloat(bankData.balance) : 0;

        let totalCurrent = bankBalance;
        let totalStart = bankBalance; // Fiat doesn't change value relative to itself

        const cryptoHtml = (wallets || []).map(w => {
            const coinData = window.state.allCoins.find(c => c.symbol.toLowerCase() === w.coin_id.toLowerCase()) ||
                FIAT_PAIRS.find(f => f.symbol.toLowerCase() === w.coin_id.toLowerCase());

            const price = coinData?.current_price || (coinData?.rate ? (1 / coinData.rate) : 0) || 0;
            const value = w.balance * price;
            const changePct = coinData?.price_change_percentage_24h || 0;

            // Calculate value 24h ago: current / (1 + pct/100)
            const startValue = value / (1 + (changePct / 100));

            totalCurrent += value;
            totalStart += startValue;

            return `
                <tr>
                    <td>
                        <div class="asset-cell">
                            <img src="${coinData?.image || ''}" alt="${w.coin_id}">
                            ${coinData?.name || w.coin_id.toUpperCase()}
                        </div>
                    </td>
                    <td>${w.balance.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${w.coin_id.toUpperCase()}</td>
                    <td>$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="${changePct >= 0 ? 'positive' : 'negative'}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</td>
                </tr>
            `;
        }).join('');

        if ((!wallets || wallets.length === 0) && bankBalance === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">У вас пока нет активов</td></tr>';
        } else {
            tbody.innerHTML = cryptoHtml || '<tr><td colspan="5" style="text-align:center;">Только банковский баланс</td></tr>';
        }

        // --- UPDATE TOTALS ---
        if (balanceEl) {
            balanceEl.textContent = `$${totalCurrent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        if (changeEl) {
            const diff = totalCurrent - totalStart;
            // Avoid division by zero
            const diffPct = totalStart > 0 ? (diff / totalStart) * 100 : 0;

            const sign = diff >= 0 ? '+' : '';
            changeEl.textContent = `${sign}$${Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${diffPct.toFixed(2)}%)`;
            changeEl.className = `balance-change ${diff >= 0 ? 'positive' : 'negative'}`;
        }

    } catch (e) {
        console.error("Portfolio Error:", e);
    }

    // Always fetch history when portfolio is updated
    fetchTransactionHistory();
}

// Transaction History Pagination State
let txPage = 1;
const TX_PAGE_SIZE = 5;

async function fetchTransactionHistory() {
    if (!window.state.currentUser) return;
    const body = document.getElementById('transactionHistoryBody');
    const txCount = document.getElementById('txCount');
    if (!body) return;

    try {
        const from = (txPage - 1) * TX_PAGE_SIZE;
        const to = from + TX_PAGE_SIZE - 1;

        const { data, error, count } = await supabaseClient
            .from('transactions')
            .select('*', { count: 'exact' })
            .neq('coin_id', 'usd') // Optional: Filter if needed, but 'usd' is used for bank
            // Let's keep logic simple: show all transactions
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        if (txCount) txCount.textContent = `${count} транзакций`;

        if (data.length === 0 && txPage === 1) {
            body.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-secondary);">У вас пока нет транзакций</td></tr>';
            return;
        }

        const itemsHtml = data.map(tx => {
            const date = new Date(tx.created_at).toLocaleString('ru-RU', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            });
            const typeClass = tx.type === 'bonus' ? 'badge-bonus' :
                tx.type === 'exchange' ? 'badge-exchange' : 'badge-mining';
            let typeLabel = tx.type;
            if (tx.type === 'bonus') typeLabel = 'Бонус';
            else if (tx.type === 'exchange') typeLabel = 'Обмен';
            else if (tx.type === 'mining') typeLabel = 'Майнинг';
            else if (tx.type === 'buy_miner') typeLabel = 'Майнинг'; // New type
            else if (tx.type === 'admin_action') typeLabel = 'Админ';

            const amountClass = tx.amount >= 0 ? 'positive' : 'negative';
            const amountPrefix = tx.amount >= 0 ? '+' : '';

            // Format amount based on coin
            const isFiat = ['usd', 'rub', 'eur'].includes(tx.coin_id.toLowerCase());
            const decimals = isFiat ? 2 : 6;
            const symbol = tx.coin_id.toUpperCase();

            // If it's a purchase (negative), show amount correctly
            // In SQL we store negative amounts or positive? 
            // Purchase logic stored positive amount but deducted. Let's check stored data. 
            // In previous helper 'buy_miner_v2', we inserted positive amount. 
            // We should display it as negative if it was a cost, OR the API stored it as negative.
            // Wait, logic says: amount, type='buy_miner'. Usually transaction logs store signed amount or we infer from type.
            // buy_miner_v2 insert: amount = v_total_cost (positive).
            // So for UI to show minus, we need to check type.

            let displayAmount = tx.amount;
            let displayPrefix = amountPrefix;
            let displayClass = amountClass;

            if (tx.type === 'buy_miner') {
                displayAmount = -Math.abs(tx.amount);
                displayPrefix = '';
                displayClass = 'negative';
            }

            return `
                <tr>
                    <td style="color: var(--text-secondary); font-size: 0.85rem;">${date}</td>
                    <td><span class="badge-tx ${typeClass}">${typeLabel}</span></td>
                    <td style="font-weight: 600;">${symbol}</td>
                    <td class="tx-amount ${displayClass}">${displayPrefix}${displayAmount.toFixed(decimals)}</td>
                    <td style="color: var(--text-secondary); font-size: 0.85rem;">${tx.details || '-'}</td>
                </tr>
            `;
        }).join('');

        // Pagination Controls
        const totalPages = Math.ceil((count || 0) / TX_PAGE_SIZE);
        let paginationHtml = '';

        if (totalPages > 1) {
            paginationHtml = `
                <tr>
                    <td colspan="5">
                        <div style="display: flex; justify-content: center; align-items: center; gap: 15px; padding: 15px 0;">
                            <button class="btn-micro ${txPage <= 1 ? 'disabled' : ''}" onclick="changeTxPage(-1)">
                                <i class="fa-solid fa-chevron-left"></i>
                            </button>
                            <span style="color: var(--text-secondary); font-size: 0.9rem;">${txPage} / ${totalPages}</span>
                            <button class="btn-micro ${txPage >= totalPages ? 'disabled' : ''}" onclick="changeTxPage(1)">
                                <i class="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }

        body.innerHTML = itemsHtml + paginationHtml;

    } catch (e) {
        console.error("History Error:", e);
        body.innerHTML = '<tr><td colspan="5" class="text-center p-20 error">Ошибка загрузки истории</td></tr>';
    }
}

window.changeTxPage = (delta) => {
    txPage += delta;
    fetchTransactionHistory();
};
