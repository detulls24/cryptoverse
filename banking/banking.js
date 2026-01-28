// Banking System PRO Logic
let currentBankGlobalTab = 'transfer'; // 'transfer' (Dashboard) or 'credits'
let currentTransferTab = 'transfer'; // 'transfer' or 'withdraw' (Sub-tabs)
let bankHistoryPage = 1;
const BANK_PAGE_SIZE = 5;

async function initBanking() {
    if (!window.state.currentUser) return;
    await checkLoanStatus(); // Check for defaults first
    await fetchBankAccount();
    await fetchMyLoan();
}

async function fetchBankAccount() {
    try {
        const { data, error } = await supabaseClient
            .from('bank_accounts')
            .select('*')
            .eq('user_id', window.state.currentUser.id)
            .maybeSingle();

        if (error) throw error;
        window.state.bankAccount = data;
        renderBankingUI();
        if (data) fetchBankTransfers();
    } catch (e) {
        console.error("Bank Fetch Error:", e);
    }
}

async function fetchBankTransfers() {
    if (!window.state.bankAccount) return;
    try {
        const accNum = window.state.bankAccount.account_number;

        const from = (bankHistoryPage - 1) * BANK_PAGE_SIZE;
        const to = from + BANK_PAGE_SIZE - 1;

        const { data, error, count } = await supabaseClient
            .from('bank_transfers')
            .select('*', { count: 'exact' })
            .or(`from_account.eq.${accNum},to_account.eq.${accNum}`)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;
        renderBankTransfers(data || [], count || 0);
    } catch (e) {
        console.error("Transfers Fetch Error:", e);
    }
}

function renderBankTransfers(transfers, totalCount) {
    const list = document.getElementById('bankTransfersList');
    if (!list) return;

    if (transfers.length === 0 && bankHistoryPage === 1) {
        list.innerHTML = '<p style="color: var(--text-secondary); padding: 20px;">Операций пока нет</p>';
        return;
    }

    const myAcc = window.state.bankAccount.account_number;

    const itemsHtml = transfers.map(t => {
        const isSent = t.from_account === myAcc;
        const isWithdraw = t.type === 'withdrawal';
        const isDeposit = t.type === 'deposit';

        let icon = 'fa-arrow-right-arrow-left';
        let typeClass = 'sent';
        let sign = '';
        let amountClass = '';

        if (isWithdraw) {
            icon = 'fa-wallet';
            typeClass = 'sent';
            sign = '-';
            amountClass = 'minus';
        } else if (isDeposit) {
            icon = 'fa-arrow-down';
            typeClass = 'recv';
            sign = '+';
            amountClass = 'plus';
        } else if (isSent) {
            icon = 'fa-paper-plane';
            typeClass = 'sent';
            sign = '-';
            amountClass = 'minus';
        } else {
            icon = 'fa-arrow-down';
            typeClass = 'recv';
            sign = '+';
            amountClass = 'plus';
        }

        let label = t.note || (isSent ? 'Перевод' : 'Пополнение');
        if (t.details) label = t.details;

        return `
            <div class="transfer-item">
                <div class="t-info">
                    <div class="t-icon ${typeClass}">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <div class="t-details">
                        <h5>${label}</h5>
                        <p>${new Date(t.created_at).toLocaleString()} ${t.fee > 0 ? `• Комиссия $${t.fee}` : ''}</p>
                    </div>
                </div>
                <div class="t-amount ${amountClass}">
                    ${sign} $${parseFloat(t.amount).toLocaleString()}
                </div>
            </div>
        `;
    }).join('');

    // Pagination Controls
    const totalPages = Math.ceil(totalCount / BANK_PAGE_SIZE);

    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `
            <div class="bank-pagination" style="display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border);">
                <button class="btn-micro ${bankHistoryPage <= 1 ? 'disabled' : ''}" onclick="changeBankPage(-1)">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <span style="color: var(--text-secondary); font-size: 0.9rem;">${bankHistoryPage} / ${totalPages}</span>
                <button class="btn-micro ${bankHistoryPage >= totalPages ? 'disabled' : ''}" onclick="changeBankPage(1)">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    }

    list.innerHTML = itemsHtml + paginationHtml;
}

window.changeBankPage = (delta) => {
    bankHistoryPage += delta;
    fetchBankTransfers();
};

async function copyCardNumber() {
    if (!window.state.bankAccount) return;
    try {
        await navigator.clipboard.writeText(window.state.bankAccount.account_number);
        showSuccess('Номер карты скопирован!');
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

// === CREDIT SYSTEM LOGIC ===

async function fetchMyLoan() {
    try {
        const { data, error } = await supabaseClient
            .from('bank_loans')
            .select('*')
            .eq('user_id', window.state.currentUser.id)
            .eq('status', 'active')
            .maybeSingle();

        if (error) throw error;
        window.state.activeLoan = data;
        renderCreditTab();
    } catch (e) {
        console.error("Fetch Loan Error:", e);
    }
}

async function checkLoanStatus() {
    try {
        // Auto-check for default on load
        await supabaseClient.rpc('check_loan_default');
    } catch (e) {
        console.error("Check Default Error:", e);
    }
}

function renderCreditTab() {
    const container = document.getElementById('bank-tab-content');
    if (!container || currentBankGlobalTab !== 'credits') return; // Guard clause

    const loan = window.state.activeLoan;

    if (!loan) {
        if (container.querySelector('.credit-calculator')) return;
        container.innerHTML = `
            <div class="credit-calculator card-anim">
                <div class="cc-header">
                    <i class="fa-solid fa-hand-holding-dollar"></i>
                    <h2>Кредитный калькулятор</h2>
                    <p>Получите средства мгновенно на любые цели</p>
                </div>
                
                <div class="cc-body">
                    <div class="loan-slider-box">
                        <label>Сумма кредита</label>
                        <div class="range-display" id="loanAmountDisplay">$5,000</div>
                        <input type="range" id="loanRange" min="1000" max="500000" step="1000" value="5000" oninput="updateLoanCalc()">
                    </div>

                    <div class="loan-summary">
                        <div class="ls-row">
                            <span>Срок кредита</span>
                            <span>7 дней</span>
                        </div>
                        <div class="ls-row">
                            <span>Процентная ставка</span>
                            <span>5% (Фиксированная)</span>
                        </div>
                        <div class="ls-row total">
                            <span>К возврату</span>
                            <span id="loanReturnAmount">$5,250</span>
                        </div>
                    </div>

                    <div class="loan-warning">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <p>Внимание: При просрочке платежа ваш банковский счет будет заморожен, а имущество конфисковано.</p>
                    </div>

                    <button class="btn btn-primary full-width" onclick="takeLoan()">Получить Кредит</button>
                </div>
            </div>
        `;
    } else {
        if (container.querySelector('.active-loan-card')) return;
        // Active Loan - Show Status
        const dueDate = new Date(loan.due_date);
        const daysLeft = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 2;

        container.innerHTML = `
            <div class="active-loan-card card-anim ${isUrgent ? 'urgent' : ''}">
                <div class="alc-header">
                    <div class="alc-status">
                        <i class="fa-solid fa-circle-check"></i> Активный кредит
                    </div>
                    <div class="alc-id">#${loan.id.slice(0, 8)}</div>
                </div>

                <div class="alc-balance">
                    <span>Сумма долга</span>
                    <h1>$${parseFloat(loan.amount_due).toLocaleString()}</h1>
                </div>

                <div class="alc-meta">
                    <div class="alc-item">
                        <span class="label">Дата возврата</span>
                        <span class="value">${dueDate.toLocaleDateString()}</span>
                    </div>
                    <div class="alc-item">
                        <span class="label">Осталось дней</span>
                        <span class="value ${isUrgent ? 'text-danger' : ''}">${daysLeft > 0 ? daysLeft : 'Сегодня!'}</span>
                    </div>
                </div>

                <div class="alc-actions">
                    <button class="btn btn-success full-width" onclick="repayLoan()">Погасить досрочно</button>
                </div>
            </div>
        `;
    }
}

window.updateLoanCalc = () => {
    const val = parseInt(document.getElementById('loanRange').value);
    document.getElementById('loanAmountDisplay').textContent = `$${val.toLocaleString()}`;
    document.getElementById('loanReturnAmount').textContent = `$${(val * 1.05).toLocaleString()}`;
};

window.takeLoan = async () => {
    const amount = parseInt(document.getElementById('loanRange').value);
    if (!await window.showConfirm('Подтверждение кредита', `Вы уверены, что хотите взять кредит $${amount.toLocaleString()}? Вернуть придется $${(amount * 1.05).toLocaleString()}.`)) return;

    try {
        const { error } = await supabaseClient.rpc('take_bank_loan', { p_amount: amount });
        if (error) throw error;

        showSuccess('Кредит успешно оформлен!');
        await fetchBankAccount();
        await fetchMyLoan();
    } catch (e) {
        alert(e.message);
    }
};

window.repayLoan = async () => {
    if (!await window.showConfirm('Погашение кредита', 'Погасить кредит текущим балансом?')) return;

    try {
        const { error } = await supabaseClient.rpc('repay_bank_loan');
        if (error) throw error;

        showSuccess('Кредит полностью погашен!');
        await fetchBankAccount();
        await fetchMyLoan();
    } catch (e) {
        alert(e.message);
    }
};

function renderBankingUI() {
    const container = document.getElementById('bankingContent');
    if (!container) return;

    // 1. If no account, show "Open Account" screen
    if (!window.state.bankAccount) {
        if (container.querySelector('.open-account-container')) return;

        container.innerHTML = `
            <div class="open-account-container">
                <i class="fa-solid fa-credit-card"></i>
                <h2>Персональная карта Neo-Bank</h2>
                <p>Получите виртуальную карту за 1 секунду. Мгновенные переводы, управление лимитами и безопасность мирового уровня.</p>
                <div style="max-width: 400px; margin: 30px auto;">
                    <div class="form-group" style="text-align: left;">
                        <label>Имя владельца (латиницей)</label>
                        <input type="text" id="regHolderName" class="form-input" placeholder="IVAN IVANOV" style="text-transform: uppercase;">
                    </div>
                    <button onclick="openBankAccount()" class="btn btn-primary bank-setup-btn full-width">Выпустить карту</button>
                </div>
            </div>
        `;
        return;
    }

    // 2. If already in dashboard, just update dynamic values
    const dashboard = container.querySelector('.bank-dashboard');
    if (dashboard) {
        updateBankingDynamicUI();
        return;
    }

    // 3. Initial Full Render for Dashboard
    const acc = window.state.bankAccount;
    const formattedAcc = acc.account_number.match(/.{1,4}/g).join(' ');
    const frozenClass = acc.is_frozen ? 'frozen' : '';

    container.innerHTML = `
        <div class="bank-nav-tabs">
            <button class="bank-tab ${currentBankGlobalTab === 'transfer' ? 'active' : ''}" onclick="switchBankTab('transfer')" id="tab-transfer">Моя Карта</button>
            <button class="bank-tab ${currentBankGlobalTab === 'credits' ? 'active' : ''}" onclick="switchBankTab('credits')" id="tab-credits">Кредиты</button>
        </div>

        <div id="bank-tab-content">
            <!-- Dynamic Content -->
        </div>
    `;

    renderBankTabContent();
}

function switchBankTab(tab) {
    currentBankGlobalTab = tab;
    document.querySelectorAll('.bank-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    renderBankTabContent();
}

function renderBankTabContent() {
    const container = document.getElementById('bank-tab-content');
    if (currentBankGlobalTab === 'credits') {
        const isAlreadyShowing = container.querySelector('.credit-calculator') || container.querySelector('.active-loan-card');
        if (!isAlreadyShowing) {
            container.innerHTML = '<div class="loading-spinner" style="text-align:center; padding: 40px; color: var(--text-secondary);"><i class="fa-solid fa-circle-notch fa-spin"></i> Загрузка кредитов...</div>';
        }
        fetchMyLoan(); // Will render credit tab inside container
        return;
    }

    // Default: Transfer Tab (Existing Dashboard)
    const acc = window.state.bankAccount;
    const formattedAcc = acc.account_number.match(/.{1,4}/g).join(' ');
    const frozenClass = acc.is_frozen ? 'frozen' : '';

    container.innerHTML = `
        <div class="bank-dashboard">
            <div class="card-column">
                <div id="visualBankCard" class="bank-card ${frozenClass}">
                    <div class="card-top">
                        <div class="card-chip"></div>
                        <button class="btn-copy-card" onclick="copyCardNumber()" title="Скопировать номер">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                    </div>
                    <div>
                        <div class="card-number" id="cardDisplayNumber">${formattedAcc}</div>
                        <div class="card-extra">
                            <div class="holder-name" id="cardDisplayHolder">${acc.holder_name}</div>
                            <div class="cvc-box">
                                <span class="cvc-label">CVC</span>
                                <span class="cvc-value" id="cardDisplayCVC">${acc.cvc}</span>
                            </div>
                        </div>
                        <div style="margin-top: 15px;">
                            <div class="card-balance-label">Баланс счета</div>
                            <div class="card-balance-value" id="cardDisplayBalance">$${parseFloat(acc.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                        </div>
                    </div>
                </div>

                <div class="bank-controls">
                ${!acc.is_frozen ? `
                    <button id="freezeBtn" onclick="toggleBankFreeze()" class="btn-bank-action danger">
                        <i class="fa-solid fa-snowflake"></i>
                        <span id="freezeBtnText">Заморозить</span>
                    </button>
                ` : (acc.frozen_by_admin ? `
                    <div class="frozen-status-msg">
                        <i class="fa-solid fa-lock"></i>
                        Заблокировано. <a href="#" onclick="openSupport()">Обратитесь в поддержку</a>
                    </div>
                ` : `
                    <button id="freezeBtn" onclick="toggleBankFreeze()" class="btn-bank-action">
                        <i class="fa-solid fa-lock-open"></i>
                        <span id="freezeBtnText">Разморозить</span>
                    </button>
                    <div class="frozen-status-hint" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 5px;">
                        Вы сами заморозили карту
                    </div>
                `)}
                    <button onclick="replaceBankCard()" class="btn-bank-action">
                        <i class="fa-solid fa-arrows-rotate"></i>
                        Заменить карту
                    </button>
                </div>
            </div>

            <div class="transfer-form-card">
                <div class="bank-tabs">
                    <button onclick="switchTransferSubTab('transfer')" class="bank-tab-btn ${currentTransferTab === 'transfer' ? 'active' : ''}">Перевод</button>
                    <button onclick="switchTransferSubTab('withdraw')" class="bank-tab-btn ${currentTransferTab === 'withdraw' ? 'active' : ''}">Вывод</button>
                </div>
                <div id="bankTabContent">
                    ${renderActiveTab()}
                </div>
            </div>
        </div>

        <div class="transfer-history">
            <h3>История транзакций</h3>
            <div id="bankTransfersList">
                <p style="color: var(--text-secondary); padding: 20px;">Загрузка...</p>
            </div>
        </div>
    `;
}

function updateBankingDynamicUI() {
    const acc = window.state.bankAccount;
    if (!acc) return;

    // Update Card Values
    const elements = {
        balance: document.getElementById('cardDisplayBalance'),
        number: document.getElementById('cardDisplayNumber'),
        holder: document.getElementById('cardDisplayHolder'),
        cvc: document.getElementById('cardDisplayCVC'),
        card: document.getElementById('visualBankCard'),
        freezeBtn: document.getElementById('freezeBtn'),
        freezeText: document.getElementById('freezeBtnText'),
        freezeIcon: document.querySelector('#freezeBtn i')
    };

    if (elements.balance) elements.balance.textContent = `$${parseFloat(acc.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (elements.number) elements.number.textContent = acc.account_number.match(/.{1,4}/g).join(' ');
    if (elements.holder) elements.holder.textContent = acc.holder_name;
    if (elements.cvc) elements.cvc.textContent = acc.cvc;

    // Update Frozen State
    if (elements.card) elements.card.className = `bank-card ${acc.is_frozen ? 'frozen' : ''}`;
    if (elements.freezeBtn) {
        elements.freezeBtn.className = `btn-bank-action ${acc.is_frozen ? '' : 'danger'}`;
    }
    if (elements.freezeText) elements.freezeText.textContent = acc.is_frozen ? 'Разморозить' : 'Заморозить';
    if (elements.freezeIcon) elements.freezeIcon.className = `fa-solid ${acc.is_frozen ? 'fa-lock-open' : 'fa-snowflake'}`;
}

function renderActiveTab() {
    if (currentTransferTab === 'transfer') {
        return `
            <div class="form-group">
                <label>Номер счета получателя</label>
                <input type="text" id="targetAccount" class="form-input" placeholder="0000 0000 0000">
            </div>
            <div class="form-group">
                <label>Сумма перевода ($)</label>
                <input type="number" id="transferAmount" class="form-input" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Комментарий</label>
                <input type="text" id="transferNote" class="form-input" placeholder="Оплата счета / Подарок">
            </div>
            <button onclick="executeBankTransfer()" class="btn btn-primary full-width" ${window.state.bankAccount.is_frozen ? 'disabled' : ''}>Отправить P2P</button>
        `;
    } else {
        return `
            <div class="form-group">
                <label>Номер внешней карты</label>
                <input type="text" id="targetCard" class="form-input" placeholder="4276 **** **** 0000">
            </div>
            <div class="form-group">
                <label>Сумма вывода ($)</label>
                <input type="number" id="withdrawAmount" class="form-input" placeholder="0.00" oninput="updateCommissionPreview(this.value)">
            </div>
            <div id="commissionPreview" class="commission-info">
                Введите сумму для расчета комиссии
            </div>
            <button onclick="executeWithdrawal()" class="btn btn-primary full-width" style="margin-top: 15px;" ${window.state.bankAccount.is_frozen ? 'disabled' : ''}>Вывести средства</button>
        `;
    }
}

function switchTransferSubTab(tab) {
    // This handles sub-tabs inside the Transfer Dashboard (Transfer vs Withdraw)
    currentTransferTab = tab;

    const tabContent = document.getElementById('bankTabContent');
    if (tabContent) {
        tabContent.innerHTML = renderActiveTab();
    }

    const buttons = document.querySelectorAll('.bank-tab-btn');
    buttons.forEach(btn => {
        const isTarget = (tab === 'transfer' && btn.textContent.includes('Перевод')) ||
            (tab === 'withdraw' && btn.textContent.includes('Вывод'));
        btn.classList.toggle('active', isTarget);
    });
}

function updateCommissionPreview(val) {
    const preview = document.getElementById('commissionPreview');
    const amount = parseFloat(val);
    if (!preview) return;

    if (isNaN(amount) || amount <= 0) {
        preview.innerHTML = 'Введите сумму для расчета комиссии';
        return;
    }

    const rate = amount < 10000 ? 5 : 2.5;
    const fee = amount * (rate / 100);
    const total = amount + fee;

    preview.innerHTML = `Комиссия (<b>${rate}%</b>): <b>$${fee.toFixed(2)}</b><br>К списанию: <b>$${total.toFixed(2)}</b>`;
}

async function openBankAccount() {
    const name = document.getElementById('regHolderName').value.trim().toUpperCase();
    if (!name || name.length < 3) return window.showNotification('Ошибка', 'Введите корректное имя держателя (минимум 3 символа)', 'error');

    try {
        const { error } = await supabaseClient.rpc('open_bank_account', { p_holder_name: name });
        if (error) throw error;
        showSuccess('Карта успешно выпущена!');
        await fetchBankAccount();
    } catch (e) {
        window.showNotification('Ошибка', e.message || 'Ошибка при открытии счета', 'error');
    }
}

async function toggleBankFreeze() {
    try {
        const { data, error } = await supabaseClient.rpc('toggle_bank_card_freeze');
        if (error) throw error;
        showSuccess(data ? 'Карта заморожена' : 'Карта разморожена');
        await fetchBankAccount();
    } catch (e) {
        window.showNotification('Ошибка', e.message, 'error');
    }
}

async function replaceBankCard() {
    const confirmed = await window.showConfirm(
        'Замена карты',
        'Вы уверены? Номер карты и CVC будут изменены. Это доступно раз в 24 часа.'
    );
    if (!confirmed) return;

    try {
        const { error } = await supabaseClient.rpc('replace_bank_card');
        if (error) throw error;
        showSuccess('Карта успешно заменена!');
        await fetchBankAccount();
    } catch (e) {
        window.showNotification('Ошибка', e.message, 'error');
    }
}

async function executeWithdrawal() {
    const target = document.getElementById('targetCard').value;
    const amount = parseFloat(document.getElementById('withdrawAmount').value);

    if (!target || isNaN(amount) || amount <= 0) return window.showNotification('Ошибка', 'Проверьте данные: номер карты и сумма должны быть заполнены', 'error');

    const confirmed = await window.showConfirm(
        'Подтверждение вывода',
        `Вывести $${amount} на карту ${target}?`
    );
    if (!confirmed) return;

    try {
        const { error } = await supabaseClient.rpc('withdraw_bank_funds', {
            p_amount: amount,
            p_card_target: target
        });

        if (error) throw error;
        showSuccess('Вывод успешно инициирован!');
        await fetchBankAccount();
    } catch (e) {
        window.showNotification('Ошибка вывода', e.message, 'error');
    }
}

async function executeBankTransfer() {
    const target = document.getElementById('targetAccount').value.replace(/\s/g, '');
    const amount = parseFloat(document.getElementById('transferAmount').value);
    const note = document.getElementById('transferNote').value;

    if (!target || isNaN(amount) || amount <= 0) return window.showNotification('Ошибка', 'Проверьте данные: номер счета и сумма должны быть заполнены', 'error');
    if (target === window.state.bankAccount.account_number) return window.showNotification('Внимание', 'Нельзя переводить самому себе', 'info');

    const btn = document.querySelector('button[onclick="executeBankTransfer()"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Поиск получателя...';

    try {
        // 1. Fetch recipient name
        const { data: recipientName, error } = await supabaseClient.rpc('get_bank_card_holder', { p_account_number: target });

        if (error) throw error;
        if (!recipientName) throw new Error('Получатель с таким номером счета не найден');

        // 2. Populate confirmation modal
        document.getElementById('confirmFrom').textContent = window.state.bankAccount.holder_name;
        document.getElementById('confirmToAccount').textContent = target.match(/.{1,4}/g).join(' ');
        document.getElementById('confirmToName').textContent = recipientName;
        document.getElementById('confirmAmount').textContent = `$${amount.toLocaleString()}`;

        window._pendingTransfer = { target, amount, note };
        openModal('bankConfirmModal');
    } catch (e) {
        window.showNotification('Ошибка', e.message || 'Ошибка поиска получателя', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function confirmBankTransfer() {
    const data = window._pendingTransfer;
    if (!data) return window.showNotification('Ошибка', 'Данные перевода потеряны. Попробуйте еще раз.', 'error');

    const btn = document.querySelector('#bankConfirmModal .btn-primary');
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = 'Выполнение...';

    try {
        const { error } = await supabaseClient.rpc('transfer_bank_funds', {
            p_target_number: data.target,
            p_amount: parseFloat(data.amount),
            p_note: data.note || ''
        });

        if (error) {
            console.error('RPC Error:', error);
            throw new Error(error.message || 'Ошибка сервера при переводе');
        }

        closeModal('bankConfirmModal');
        showSuccess('Перевод успешно выполнен!');
        window._pendingTransfer = null;
        await fetchBankAccount();
    } catch (e) {
        console.error('Transfer Exception:', e);
        window.showNotification('Ошибка перевода', e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Подтверждаю перевод';
        }
    }
}


// Observer for navigation
const bankObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.target.id === 'banking' && mutation.target.classList.contains('active')) {
            initBanking();
            bankHistoryPage = 1; // Reset on tab open
        }
    });
});

const bankSection = document.getElementById('banking');
if (bankSection) {
    bankObserver.observe(bankSection, { attributes: true, attributeFilter: ['class'] });
}
if (window.state?.currentUser) initBanking();
