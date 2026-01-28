// Navigation & Support
window.openSupport = () => {
    window.showNotification('Техподдержка', 'Служба поддержки временно занята. Пожалуйста, попробуйте позже или напишите в Telegram: @NeoBankSupport', 'info');
};

// UI Helpers & Modal Controls
function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            window.state.currentTab = tab.dataset.tab;
            renderCoinList();
        };
    });

    // Chart time controls - Moved to market.js or handled here?
    // Let's keep specific event binding here
    document.querySelectorAll('.ctrl-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (window.state.selectedCoin?.sparkline_in_7d?.price) {
                const prices = window.state.selectedCoin.sparkline_in_7d.price;
                let slice;
                switch (btn.dataset.tf) {
                    case '1h': slice = prices.slice(-6); break;
                    case '24h': slice = prices.slice(-24); break;
                    case '7d': slice = prices.filter((_, i) => i % 4 === 0); break;
                    case '30d': slice = prices; break;
                    default: slice = prices;
                }
                const change = window.state.selectedCoin.price_change_percentage_24h || 0;
                updateChart(slice, change >= 0 ? '#0ecb81' : '#f6465d');
            }
        };
    });

    // Search
    const searchInput = document.getElementById('coinSearch');
    if (searchInput) searchInput.oninput = renderCoinList;

    // Currency selector
    const baseCur = document.getElementById('baseCurrency');
    if (baseCur) {
        baseCur.onchange = (e) => {
            window.state.baseCurrency = e.target.value;
            fetchCoins();
        };
    }

    // Exchange calculator
    ['fromAmount', 'fromCoin', 'toCoin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.oninput = calculateExchange;
            el.onchange = calculateExchange;
        }
    });

    // Forms
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.onsubmit = handleLogin;

    const regForm = document.getElementById('registerForm');
    if (regForm) regForm.onsubmit = handleRegister;
}

// Exchange Calculator
function calculateExchange() {
    const fromAmountEl = document.getElementById('fromAmount');
    const toAmountEl = document.getElementById('toAmount');
    if (!fromAmountEl || !toAmountEl) return;

    const fromAmount = parseFloat(fromAmountEl.value) || 0;
    const fromCoin = document.getElementById('fromCoin').value.toLowerCase();
    const toCoin = document.getElementById('toCoin').value.toLowerCase();

    const getRate = (symbol) => {
        const coin = window.state.allCoins.find(c => c.symbol.toLowerCase() === symbol) ||
            FIAT_PAIRS.find(f => f.symbol.toLowerCase() === symbol);
        return coin?.current_price || (coin?.rate ? (1 / coin.rate) : 1);
    };

    const rateFrom = getRate(fromCoin);
    const rateTo = getRate(toCoin);

    const fromUSD = fromAmount * rateFrom;
    const toAmount = fromUSD / rateTo;

    toAmountEl.value = toAmount.toFixed(8);
    const rateEl = document.getElementById('exchangeRate');
    if (rateEl) {
        rateEl.textContent = `1 ${fromCoin.toUpperCase()} ≈ ${(rateFrom / rateTo).toFixed(8)} ${toCoin.toUpperCase()}`;
    }
}

window.swapCoins = () => {
    const from = document.getElementById('fromCoin');
    const to = document.getElementById('toCoin');
    if (from && to) {
        [from.value, to.value] = [to.value, from.value];
        calculateExchange();
    }
};

window.executeExchange = async () => {
    if (!window.state.currentUser) return window.showNotification('Вход не выполнен', 'Пожалуйста, войдите в аккаунт для совершения операций', 'info');

    const fromAmount = parseFloat(document.getElementById('fromAmount').value);
    const toAmount = parseFloat(document.getElementById('toAmount').value);
    const fromCoin = document.getElementById('fromCoin').value.toLowerCase();
    const toCoin = document.getElementById('toCoin').value.toLowerCase();

    if (!fromAmount || fromAmount <= 0) return window.showNotification('Внимание', 'Введите корректную сумму для обмена', 'error');

    const btn = document.querySelector('.exchange-form .btn-primary');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Обработка...';

    try {
        const { error } = await supabaseClient.rpc('execute_exchange', {
            p_user_id: window.state.currentUser.id,
            p_from_coin: fromCoin,
            p_to_coin: toCoin,
            p_from_amount: fromAmount,
            p_to_amount: toAmount
        });

        if (error) throw error;

        showSuccess('Обмен успешно выполнен!');
        populatePortfolio(); // Refresh dashboard
    } catch (e) {
        console.error("Exchange Error:", e);
        window.showNotification('Ошибка обмена', e.message || 'Недостаточно средств или сбой сервера', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

// Navigation
window.showSection = (id) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const section = document.getElementById(id);
    if (section) section.classList.add('active');

    document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.nav-menu a[onclick*="${id}"]`)?.classList.add('active');

    if (id === 'profile') {
        if (typeof loadProfile === 'function') loadProfile();
    }

    if (id === 'assets') {
        if (typeof AssetsModule !== 'undefined') AssetsModule.init();
    }
};

window.setMobileActive = (el) => {
    document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
};

// Modals
window.openModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
};

window.closeModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
};

// Mobile Menu Logic
window.openMobileMenu = () => {
    const modal = document.getElementById('mobileMenuModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling bg
    }
};

window.closeMobileMenu = () => {
    const modal = document.getElementById('mobileMenuModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};

window.showSuccess = (message) => {
    window.showNotification('Успешно', message, 'success');
};

// System Confirmation Modal
window.showConfirm = (title, message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('systemConfirmModal');
        const titleEl = document.getElementById('sysConfirmTitle');
        const msgEl = document.getElementById('sysConfirmMessage');
        const okBtn = document.getElementById('sysConfirmOkBtn');
        const cancelBtn = document.getElementById('sysConfirmCancelBtn');

        if (!modal) {
            // Fallback if modal missing
            return resolve(confirm(`${title}\n\n${message}`));
        }

        titleEl.textContent = title;
        msgEl.textContent = message;

        // Cleanup old listeners
        const newOk = okBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

        newOk.onclick = () => {
            modal.style.display = 'none';
            resolve(true);
        };

        newCancel.onclick = () => {
            modal.style.display = 'none';
            resolve(false);
        };

        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                resolve(false);
            }
        };

        modal.style.display = 'flex';
    });
};

// Portfolio Withdraw Logic
window.openPortfolioWithdrawModal = async () => {
    if (!window.state.currentUser) return window.showNotification('Вход не выполнен', 'Войдите в аккаунт для управления портфелем', 'info');

    // Check if bank account exists
    const { data: bank } = await supabaseClient
        .from('bank_accounts')
        .select('account_number')
        .eq('user_id', window.state.currentUser.id)
        .maybeSingle();

    if (!bank) {
        return window.showNotification('Счет не найден', 'У вас еще не открыт счет в Neo-Bank. Перейдите в раздел Neo-Bank и создайте карту.', 'info');
    }

    const select = document.getElementById('withdrawAsset');
    if (!select) return;

    // Refresh wallet data
    const { data: wallets } = await supabaseClient.from('wallets').select('*').eq('user_id', window.state.currentUser.id);
    if (!wallets || wallets.length === 0) return window.showNotification('Нет активов', 'У вас нет доступных активов для вывода', 'info');

    window.state.userWallets = wallets; // Store for validation

    select.innerHTML = wallets.map(w => {
        const bal = parseFloat(w.balance);
        const formatted = bal.toFixed(8).replace(/\.?0+$/, '');
        return `<option value="${w.coin_id}">${w.coin_id.toUpperCase()} (Доступно: ${formatted})</option>`;
    }).join('');

    document.getElementById('withdrawAssetAmount').value = '';
    openModal('portfolioWithdrawModal');
    updateWithdrawPreview();
};

window.setMaxWithdrawAmount = () => {
    const assetId = document.getElementById('withdrawAsset').value;
    const wallet = window.state.userWallets?.find(w => w.coin_id === assetId);
    if (wallet) {
        document.getElementById('withdrawAssetAmount').value = wallet.balance;
        updateWithdrawPreview();
    }
};

window.updateWithdrawPreview = () => {
    const assetId = document.getElementById('withdrawAsset').value;
    const amountVal = document.getElementById('withdrawAssetAmount').value;
    const amount = parseFloat(amountVal) || 0;
    const preview = document.getElementById('withdrawPreview');

    if (amount <= 0) {
        preview.innerHTML = 'Введите сумму для расчета';
        return;
    }

    const wallet = window.state.userWallets?.find(w => w.coin_id === assetId);
    const balance = wallet ? parseFloat(wallet.balance) : 0;

    if (wallet && amount > balance) {
        preview.innerHTML = `<b style="color: var(--danger)">Превышен доступный баланс (${balance})</b>`;
        return;
    }

    const coinData = window.state.allCoins.find(c => c.symbol.toLowerCase() === assetId.toLowerCase()) ||
        FIAT_PAIRS.find(f => f.symbol.toLowerCase() === assetId.toLowerCase());

    const price = coinData?.current_price || (coinData?.rate ? (1 / coinData.rate) : 0) || 0;
    const usdValue = amount * price;

    const rate = usdValue < 10000 ? 5 : 2.5;
    const fee = usdValue * (rate / 100);
    const final = usdValue - fee;

    preview.innerHTML = `
        Курс: <b>$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><br>
        Стоимость: <b>$${usdValue.toFixed(2)}</b><br>
        Комиссия (<b>${rate}%</b>): <b>$${fee.toFixed(2)}</b><br>
        На карту поступит: <b style="color: var(--primary)">$${final.toFixed(2)}</b>
    `;

    window._lastWithdrawData = { usdValue, amount, assetId, balance: balance };
};

window.executePortfolioWithdraw = async () => {
    const data = window._lastWithdrawData;
    const amountInput = document.getElementById('withdrawAssetAmount').value;
    const currentAmount = parseFloat(amountInput);

    if (!data || currentAmount <= 0) return window.showNotification('Ошибка', 'Введите корректную сумму вывода', 'error');

    // Balance check
    if (data.balance === undefined || currentAmount > data.balance) {
        return window.showNotification('Баланс', 'Недостаточно средств для вывода выбранного актива', 'error');
    }

    const btn = document.querySelector('#portfolioWithdrawModal .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Обработка...';

    try {
        const { error } = await supabaseClient.rpc('deposit_to_bank_from_portfolio', {
            p_coin_id: data.assetId,
            p_amount: currentAmount,
            p_usd_value: data.usdValue
        });

        if (error) throw error;

        closeModal('portfolioWithdrawModal');
        showSuccess('Средства успешно зачислены на вашу карту Neo-Bank!');
        populatePortfolio();
    } catch (e) {
        window.showNotification('Ошибка вывода', e.message || 'Ошибка вывода', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Перевести на Neo-Bank';
    }
};

// Buy Crypto Logic
// Custom Dropdown Helpers
window.renderBuyAssetDropdown = () => {
    const dropdown = document.getElementById('buyAssetDropdown');
    if (!dropdown || !window.state.buyAssets) return;

    dropdown.innerHTML = window.state.buyAssets.map(asset => {
        const icon = asset.image || '';
        const name = asset.name || asset.symbol.toUpperCase();
        const ticker = asset.symbol.toUpperCase();
        const safeName = name.replace(/'/g, "\\'");

        return `
            <div class="dropdown-option" onclick="selectBuyAsset({symbol: '${asset.symbol}', name: '${safeName}', image: '${icon}'})">
                <div style="width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                    ${icon ? `<img src="${icon}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">` : `<div style="width: 28px; height: 28px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 600;">${ticker[0]}</div>`}
                </div>
                <div style="flex: 1; min-width: 0; overflow: hidden;">
                    <div style="font-weight: 600; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${ticker}</div>
                </div>
            </div>
        `;
    }).join('');
};

window.toggleBuyAssetDropdown = () => {
    const dropdown = document.getElementById('buyAssetDropdown');
    const chevron = document.querySelector('#buyAssetDisplay i');

    if (dropdown.style.display === 'none') {
        dropdown.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        dropdown.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
};

window.selectBuyAsset = (asset) => {
    window.state.selectedBuyAsset = asset.symbol;

    const icon = document.getElementById('selectedAssetIcon');
    const text = document.getElementById('selectedAssetText');

    if (icon && asset.image) {
        icon.src = asset.image;
        icon.style.display = 'block';
    } else if (icon) {
        icon.style.display = 'none';
    }

    if (text) {
        text.textContent = `${asset.name} (${asset.symbol.toUpperCase()})`;
    }

    toggleBuyAssetDropdown();
    updateBuyPreview();
};

window.openBuyCryptoModal = async () => {
    if (!window.state.currentUser) return window.showNotification('Вход не выполнен', 'Войдите в аккаунт для покупки криптовалюты', 'info');

    // 1. Check Bank Account & Cards
    const { data: bank } = await supabaseClient
        .from('bank_accounts')
        .select('*')
        .eq('user_id', window.state.currentUser.id)
        .maybeSingle();

    if (!bank) return window.showNotification('Счет не найден', 'У вас еще не открыт счет в Neo-Bank. Перейдите в раздел Neo-Bank.', 'info');
    if (bank.is_frozen) return window.showNotification('Счет заморожен', 'Ваша карта Neo-Bank заморожена. Покупка невозможна.', 'error');

    window.state.bankAccount = bank; // Sync for validation

    // Store assets globally for dropdown
    window.state.buyAssets = [...window.state.allCoins, ...FIAT_PAIRS];
    if (window.state.buyAssets.length === 0) return window.showNotification('Загрузка', 'Маркет загружается, пожалуйста, попробуйте через секунду', 'info');

    // Render custom dropdown
    renderBuyAssetDropdown();

    // Select first asset by default
    if (window.state.buyAssets[0]) {
        selectBuyAsset(window.state.buyAssets[0]);
    }

    document.getElementById('buyAssetAmount').value = '';
    openModal('buyCryptoModal');
    updateBuyPreview();
};

window.updateBuyPreview = () => {
    const assetId = window.state.selectedBuyAsset || (window.state.buyAssets && window.state.buyAssets[0]?.symbol);
    if (!assetId) return;

    const amountVal = document.getElementById('buyAssetAmount').value;
    const amount = parseFloat(amountVal) || 0;
    const preview = document.getElementById('buyPreview');

    if (amount <= 0) {
        preview.innerHTML = 'Введите количество для расчета';
        return;
    }

    const coinData = window.state.allCoins.find(c => c.symbol.toLowerCase() === assetId.toLowerCase()) ||
        FIAT_PAIRS.find(f => f.symbol.toLowerCase() === assetId.toLowerCase());

    const price = coinData?.current_price || (coinData?.rate ? (1 / coinData.rate) : 0) || 0;
    const usdCost = amount * price;

    const feeRate = 1.25; // 1.25%
    const fee = usdCost * (feeRate / 100);
    const total = usdCost + fee;

    const bankBal = window.state.bankAccount?.balance || 0;

    preview.innerHTML = `
        Цена ${assetId.toUpperCase()}: <b>$${price.toLocaleString()}</b><br>
        Стоимость: <b>$${usdCost.toFixed(2)}</b><br>
        Комиссия (<b>1.25%</b>): <b>$${fee.toFixed(2)}</b><br>
        <hr style="margin: 10px 0; border: none; border-top: 1px solid rgba(255,255,255,0.1);">
        Итого к оплате: <b style="color: var(--primary)">$${total.toFixed(2)}</b><br>
        <span style="font-size: 0.8rem; color: ${total > bankBal ? 'var(--danger)' : 'var(--text-secondary)'}">
            Баланс карты: $${parseFloat(bankBal).toFixed(2)}
        </span>
    `;

    window._lastBuyData = { usdCost, amount, assetId, total, balance: bankBal };
};

window.executeBuyCrypto = async () => {
    const data = window._lastBuyData;
    if (!data || data.amount <= 0) return window.showNotification('Внимание', 'Введите корректное количество для покупки', 'error');

    if (data.total > data.balance) {
        return window.showNotification('Недостаточно средств', 'Недостаточно средств на вашей карте Neo-Bank для совершения этой покупки', 'error');
    }

    const btn = document.querySelector('#buyCryptoModal .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Обработка платежа...';

    try {
        const { error } = await supabaseClient.rpc('buy_crypto_with_bank_card', {
            p_coin_id: data.assetId,
            p_coin_amount: data.amount,
            p_usd_cost: data.usdCost
        });

        if (error) throw error;

        closeModal('buyCryptoModal');
        showSuccess(`Вы успешно купили ${data.amount} ${data.assetId.toUpperCase()}!`);

        // Refresh UI
        populatePortfolio();
        if (typeof fetchBankAccount === 'function') fetchBankAccount();
    } catch (e) {
        window.showNotification('Ошибка покупки', e.message || 'Ошибка при покупке', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Купить (Комиссия 1.25%)';
    }
};

window.onclick = (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
};


// --- Profile Logic ---
window.loadProfile = async () => {
    if (!window.state.currentUser) return;

    const user = window.state.currentUser;
    const { data: { user: freshUser } } = await supabaseClient.auth.getUser(); // Get latest metadata

    // Update local state if needed
    if (freshUser) window.state.currentUser = freshUser;

    const meta = freshUser?.user_metadata || {};
    const email = freshUser?.email || 'user@example.com';
    const nickname = meta.nickname || '';

    // Populate UI
    document.getElementById('profileEmailDisplay').textContent = nickname || email;
    document.getElementById('userEmailRO').value = email;
    document.getElementById('userIdRO').value = freshUser.id;
    document.getElementById('userNickname').value = nickname;

    // Initials
    const initials = (nickname ? nickname[0] : email[0]).toUpperCase();
    document.getElementById('profileInitials').textContent = initials;
};

window.saveProfile = async () => {
    const newNickname = document.getElementById('userNickname').value.trim();

    if (newNickname.length > 20) {
        return window.showNotification('Ошибка', 'Никнейм слишком длинный (макс. 20 символов)', 'error');
    }

    const btn = document.querySelector('#profile .btn-primary');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Сохранение...';

    try {
        const { data, error } = await supabaseClient.auth.updateUser({
            data: { nickname: newNickname }
        });

        if (error) throw error;

        window.state.currentUser = data.user;
        window.showNotification('Успешно', 'Профиль обновлен!', 'success');

        // Refresh display immediately
        loadProfile();

    } catch (e) {
        console.error("Profile Save Error:", e);
        window.showNotification('Ошибка', e.message || 'Не удалось сохранить профиль', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

window.executeChangePassword = async () => {
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmNewPassword').value;

    if (newPass.length < 6) return window.showNotification('Ошибка', 'Пароль должен быть минимум 6 символов', 'error');
    if (newPass !== confirmPass) return window.showNotification('Ошибка', 'Пароли не совпадают', 'error');

    const btn = document.querySelector('#changePasswordModal .btn-primary');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Меняем пароль...';

    try {
        const { error } = await supabaseClient.auth.updateUser({ password: newPass });
        if (error) throw error;

        // Force logout as requested
        await supabaseClient.auth.signOut();
        window.state.currentUser = null;

        closeModal('changePasswordModal');
        closeModal('registerModal'); // Ensure others are closed

        // Clear UI states
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';

        window.showNotification('Успешно', 'Пароль изменен. Пожалуйста, войдите снова.', 'success');

        setTimeout(() => {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            location.reload();
        }, 1500);

    } catch (e) {
        console.error("Pass Change Error:", e);
        window.showNotification('Ошибка', e.message, 'error');
        btn.disabled = false;
        btn.textContent = originalText;
    }
};


// Initialize UI
window.addEventListener('DOMContentLoaded', () => {
    if (typeof setupEventListeners === 'function') setupEventListeners();

    // Check initial user
    const checkUser = async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
            window.state.currentUser = session.user;
            if (typeof loadProfile === 'function') loadProfile();
        }
    };
    checkUser();
});
