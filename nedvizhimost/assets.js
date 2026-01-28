// Logic for Dynamic Assets
const AssetsModule = {
    marketData: [],

    // State
    currentFilter: 'all',

    // Pagination State
    marketPage: 1,
    marketPageSize: 8,

    myAssetsPage: 1,
    myAssetsPageSize: 8,

    // Purchase State
    pendingAsset: null,
    selectedPayment: 'crypto', // 'crypto' or 'bank'

    init: async () => {
        await AssetsModule.loadMarket();
        AssetsModule.loadUserAssets();
    },

    setFilter: (filter) => {
        AssetsModule.currentFilter = filter;
        AssetsModule.marketPage = 1; // Reset to page 1

        // Update UI
        const buttons = document.querySelectorAll('#marketFilters .chip');
        buttons.forEach(btn => {
            const btnFilter = btn.getAttribute('onclick').includes(`'${filter}'`);
            btn.classList.toggle('active', btnFilter);
            if (filter === 'all' && btn.textContent === 'Все') btn.classList.add('active'); // fallback safety
        });

        // Better: Select by exact click handler in loop logic above is flaky if strings vary. 
        // Let's rely on standard re-rendering or just DOM manipulation.
        // Actually simplest is just to update active class based on index or text, but text varies.
        // Let's iterate and check onclick string content as done above, logic is okay for simple app.

        AssetsModule.renderMarket();
    },

    switchTab: (tabName) => {
        document.querySelectorAll('.assets-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.onclick.toString().includes(tabName));
        });

        document.querySelectorAll('.assets-tab-content').forEach(content => {
            content.classList.remove('active');
        });

        if (tabName === 'market') {
            document.getElementById('marketTabContent').classList.add('active');
        } else {
            document.getElementById('myAssetsTabContent').classList.add('active');
            AssetsModule.loadUserAssets();
        }
    },

    loadMarket: async () => {
        const container = document.getElementById('assetsGrid');
        if (!container) return;

        container.innerHTML = '<div class="loading-spinner">Загрузка лотов...</div>';

        try {
            const { data, error } = await supabaseClient
                .from('market_assets')
                .select('*')
                .order('price', { ascending: true });

            if (error) throw error;
            AssetsModule.marketData = data;
            AssetsModule.renderMarket();
        } catch (e) {
            console.error(e);
            container.innerHTML = '<p class="text-error">Ошибка загрузки рынка</p>';
        }
    },

    renderMarket: () => {
        const container = document.getElementById('assetsGrid');
        if (!container) return;

        // Clean previous pagination
        const existingPag = document.getElementById('marketPagination');
        if (existingPag) existingPag.remove();

        // FILTER LOGIC
        let filteredData = AssetsModule.marketData;

        if (AssetsModule.currentFilter === 'archive') {
            // Show only sold out items
            filteredData = filteredData.filter(i => i.quantity === 0);
        } else {
            // Exclude sold out items from main lists
            filteredData = filteredData.filter(i => i.quantity !== 0);

            if (AssetsModule.currentFilter === 'real_estate') {
                const types = ['real_estate', 'land', 'business'];
                filteredData = filteredData.filter(i => types.includes(i.type));
            } else if (AssetsModule.currentFilter === 'transport') {
                const types = ['transport', 'car', 'yacht', 'plane', 'helicopter'];
                filteredData = filteredData.filter(i => types.includes(i.type));
            }
        }

        if (filteredData.length === 0) {
            container.innerHTML = `<p class="text-secondary" style="grid-column: 1/-1; text-align: center; padding: 40px;">${AssetsModule.currentFilter === 'archive' ? 'Архив пока пуст.' : 'В данной категории нет предложений.'}</p>`;
            return;
        }

        // Pagination Logic
        const totalPages = Math.ceil(filteredData.length / AssetsModule.marketPageSize);
        if (AssetsModule.marketPage > totalPages) AssetsModule.marketPage = 1;

        const start = (AssetsModule.marketPage - 1) * AssetsModule.marketPageSize;
        const end = start + AssetsModule.marketPageSize;
        const paginatedItems = filteredData.slice(start, end);

        container.innerHTML = paginatedItems.map(item => `
            <div class="asset-card-premium">
                <div class="asset-img-premium" style="background-image: url('${item.image_url}')">
                    <span class="asset-badge-premium">${AssetsModule.getTypeName(item.type)}</span>
                </div>
                <div class="asset-content-premium">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <h3 style="margin: 0;">${item.name}</h3>
                        ${item.quantity > 0 ? `<span class="qty-badge">осталось: ${item.quantity}</span>` : ''}
                        ${item.quantity === 0 ? `<span class="qty-badge sold-out">ПРОДАНО</span>` : ''}
                    </div>
                    <p class="asset-desc-premium">${item.description || ''}</p>
                    <div class="asset-footer-premium">
                        <div class="asset-price-premium">$${parseFloat(item.price).toLocaleString()}</div>
                        ${item.quantity !== 0 ?
                `<button class="btn-buy-premium" onclick="AssetsModule.buy('${item.id}')">Купить</button>` :
                `<button class="btn-buy-premium disabled" disabled>Архив</button>`
            }
                    </div>
                </div>
            </div>
        `).join('');

        AssetsModule.renderPagination('market', container, totalPages, AssetsModule.marketPage);
    },

    renderPagination: (type, container, totalPages, currentPage) => {
        if (totalPages <= 1) return;

        const paginationDiv = document.createElement('div');
        paginationDiv.id = `${type}Pagination`;
        paginationDiv.className = 'assets-pagination';

        paginationDiv.innerHTML = `
            <button class="btn-micro ${currentPage <= 1 ? 'disabled' : ''}" onclick="AssetsModule.changePage('${type}', -1)">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <span style="color: var(--text-secondary); font-size: 0.9rem;">${currentPage} / ${totalPages}</span>
            <button class="btn-micro ${currentPage >= totalPages ? 'disabled' : ''}" onclick="AssetsModule.changePage('${type}', 1)">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        `;

        container.parentNode.insertBefore(paginationDiv, container.nextSibling);
    },

    changePage: (type, delta) => {
        if (type === 'market') {
            AssetsModule.marketPage += delta;
            AssetsModule.renderMarket();
            document.getElementById('assetsGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            AssetsModule.myAssetsPage += delta;
            AssetsModule.loadUserAssets();
            // Note: loadUserAssets re-fetches or re-renders. 
            // Since we define fetch separately, we should splitting fetch and render for 'My Assets' too for efficiency, 
            // but for now re-calling loadUserAssets (which likely should just render if data kept) is ok or we refactor.
            // Refactoring below to split fetch from render to avoid re-fetching on page change.
        }
    },

    userAssetsData: [], // Cache for pagination

    loadUserAssets: async () => {
        const container = document.getElementById('myAssetsList');
        if (!container) return;

        // Only fetch if empty or force reload needed (simplification: fetch always for now to get fresh data, but optimize if needed)
        // actually better to fetch once on tab switch.
        // Let's keep simple: fetch.

        try {
            const { data: assets, error } = await supabaseClient
                .from('user_assets')
                .select('*')
                .order('purchased_at', { ascending: false });

            if (error) throw error;
            AssetsModule.userAssetsData = assets || [];
            AssetsModule.renderUserAssets();

        } catch (e) {
            console.error('Error loading assets:', e);
            container.innerHTML = '<p class="text-error">Ошибка загрузки активов</p>';
        }
    },

    renderUserAssets: () => {
        const container = document.getElementById('myAssetsList');

        // Grouping items by asset_id
        const groups = {};
        AssetsModule.userAssetsData.forEach(a => {
            if (!groups[a.asset_id]) {
                groups[a.asset_id] = { ...a, count: 0 };
            }
            groups[a.asset_id].count++;
        });

        const groupedArray = Object.values(groups);

        // Clean pagination
        const existingPag = document.getElementById('myAssetsPagination');
        if (existingPag) existingPag.remove();

        if (groupedArray.length === 0) {
            container.innerHTML = '<p class="text-secondary text-center" style="grid-column: 1/-1; padding: 40px;">У вас пока нет активов.</p>';
            const header = document.querySelector('.my-assets-header h2');
            if (header) header.innerHTML = 'Мои приобретения';
            return;
        }

        // Update header with total count
        const totalItems = AssetsModule.userAssetsData.length;
        const header = document.querySelector('.my-assets-header h2');
        if (header) header.innerHTML = `Мои приобретения <span class="qty-badge" style="margin-left: 10px; vertical-align: middle;">${totalItems} шт.</span>`;

        // Pagination
        const totalPages = Math.ceil(groupedArray.length / AssetsModule.myAssetsPageSize);
        if (AssetsModule.myAssetsPage > totalPages) AssetsModule.myAssetsPage = 1;

        const start = (AssetsModule.myAssetsPage - 1) * AssetsModule.myAssetsPageSize;
        const end = start + AssetsModule.myAssetsPageSize;
        const paginated = groupedArray.slice(start, end);

        container.innerHTML = paginated.map(a => `
            <div class="my-asset-card-premium">
                <div class="my-asset-img-small" style="background-image: url('${a.image_url}')"></div>
                <div class="asset-content-premium" style="padding: 0; border: none; background: none;">
                    <div class="my-asset-info-premium">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <h4 style="margin: 0;">${a.name}</h4>
                            ${a.count > 1 ? `<span class="qty-badge">x${a.count}</span>` : ''}
                        </div>
                        <div class="my-asset-date">
                            <i class="fa-regular fa-calendar"></i>
                            ${new Date(a.purchased_at).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        AssetsModule.renderPagination('myAssets', container, totalPages, AssetsModule.myAssetsPage);

        // Adjust grid columns if needed based on count, but CSS handles auto-fill
    },

    buy: (assetId) => {
        const item = AssetsModule.marketData.find(a => a.id === assetId);
        if (!item || item.quantity === 0) return;

        if (!window.state.currentUser) {
            return window.showNotification('Вход не выполнен', 'Пожалуйста, войдите в аккаунт для совершения покупок', 'error');
        }

        AssetsModule.pendingAsset = item;
        AssetsModule.selectedPayment = 'crypto'; // Default

        // Update UI info
        const info = document.getElementById('buyAssetInfo');
        if (info) {
            info.innerHTML = `
                <div style="display: flex; gap: 15px; align-items: center;">
                    <img src="${item.image_url}" style="width: 80px; height: 80px; border-radius: 12px; object-fit: cover;">
                    <div>
                        <h4 style="margin: 0; font-size: 1.1rem;">${item.name}</h4>
                        <p style="margin: 5px 0 0; color: var(--text-secondary); font-size: 0.9rem;">${AssetsModule.getTypeName(item.type)}</p>
                    </div>
                </div>
            `;
        }

        const costEl = document.getElementById('assetTotalCost');
        if (costEl) {
            costEl.textContent = `$${parseFloat(item.price).toLocaleString()}`;
        }

        // Reset payment methods selection UI
        const methods = document.querySelectorAll('#buyAssetModal .payment-method');
        methods.forEach(m => {
            const isCrypto = m.getAttribute('onclick').includes('crypto');
            m.classList.toggle('selected', isCrypto);
        });

        window.openModal('buyAssetModal');
    },

    selectPayment: (method, el) => {
        AssetsModule.selectedPayment = method;
        const methods = document.querySelectorAll('#buyAssetModal .payment-method');
        methods.forEach(m => m.classList.remove('selected'));
        el.classList.add('selected');
    },

    confirmBuy: async () => {
        const item = AssetsModule.pendingAsset;
        if (!item) return;

        const btn = document.querySelector('#buyAssetModal .btn-primary');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Обработка...';

        try {
            // Determine balance check and coin_id
            let coinId = 'usdt';
            if (AssetsModule.selectedPayment === 'bank') {
                coinId = 'usd';

                // Fetch Bank Balance
                const { data: bank } = await supabaseClient
                    .from('bank_accounts')
                    .select('balance')
                    .eq('user_id', window.state.currentUser.id)
                    .maybeSingle();

                if (!bank || parseFloat(bank.balance) < parseFloat(item.price)) {
                    throw new Error('Недостаточно средств на карте Neo-Bank');
                }
            } else {
                // Fetch USDT Balance
                const { data: wallet } = await supabaseClient
                    .from('wallets')
                    .select('balance')
                    .eq('user_id', window.state.currentUser.id)
                    .eq('coin_id', 'usdt')
                    .maybeSingle();

                if (!wallet || parseFloat(wallet.balance) < parseFloat(item.price)) {
                    throw new Error('Недостаточно USDT в вашем крипто-кошельке');
                }
            }

            const { error } = await supabaseClient.rpc('buy_asset', {
                p_asset_id: item.id,
                p_asset_type: item.type,
                p_name: item.name,
                p_image_url: item.image_url,
                p_price: item.price,
                p_coin_id: coinId
            });

            if (error) throw error;

            window.showNotification('Успешно', `Поздравляем! Вы приобрели ${item.name}`, 'success');
            window.closeModal('buyAssetModal');

            // Refresh dashboard and other states if needed
            if (typeof populatePortfolio === 'function') populatePortfolio();
            if (typeof fetchBankAccount === 'function') fetchBankAccount();

            AssetsModule.loadUserAssets();

        } catch (e) {
            console.error(e);
            window.showNotification('Ошибка', e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    getTypeName: (type) => {
        const names = {
            'real_estate': 'Недвижимость',
            'transport': 'Транспорт',
            'land': 'Земля',
            'item': 'Предмет',
            'car': 'Автомобиль',
            'yacht': 'Яхта',
            'plane': 'Самолет',
            'helicopter': 'Вертолет',
            'business': 'Бизнес',
            'jewelry': 'Ювелирное',
            'watch': 'Часы',
            'art': 'Искусство'
        };
        return names[type] || type;
    }
};

window.AssetsModule = AssetsModule;
