// Global Configuration & State
const SUPABASE_URL = 'https://idjleezlwntzrtstmwev.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkamxlZXpsd250enJ0c3Rtd2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODI1NDIsImV4cCI6MjA4NTE1ODU0Mn0.YKolBWyv1cHTQDmZj45K2TvJsU5ix_t5aWUAgKpSRXA';
let supabaseClient;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
    console.warn("Supabase not initialized:", e.message);
}

// Global State
window.state = {
    currentUser: null,
    allCoins: [],
    selectedCoin: null,
    baseCurrency: 'usd',
    currentTab: 'crypto',
    userMiners: []
};

// Constants
const STABLE_COINS = ['usdt', 'usdc', 'dai', 'busd', 'tusd'];
const FIAT_PAIRS = [
    { id: 'rub', symbol: 'RUB', name: 'Российский Рубль', image: 'https://flagcdn.com/w40/ru.png', type: 'fiat', rate: 92.5 },
    { id: 'eur', symbol: 'EUR', name: 'Евро', image: 'https://flagcdn.com/w40/eu.png', type: 'fiat', rate: 0.92 },
    { id: 'cny', symbol: 'CNY', name: 'Китайский Юань', image: 'https://flagcdn.com/w40/cn.png', type: 'fiat', rate: 7.24 },
    { id: 'gbp', symbol: 'GBP', name: 'Британский Фунт', image: 'https://flagcdn.com/w40/gb.png', type: 'fiat', rate: 0.79 }
];

const API_BASE = 'https://api.coingecko.com/api/v3';

// --- Global Premium Notification System ---
window.showNotification = (title, message, type = 'info') => {
    let overlay = document.getElementById('neoModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'neoModalOverlay';
        overlay.className = 'neo-modal-overlay';
        overlay.innerHTML = `
            <div class="neo-modal">
                <div id="neoModalIcon" class="neo-modal-icon"></div>
                <h3 id="neoModalTitle"></h3>
                <p id="neoModalText"></p>
                <button class="neo-modal-btn" onclick="document.getElementById('neoModalOverlay').style.display='none'">Понятно</button>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.style.display = 'none';
        }
    }

    const iconEl = document.getElementById('neoModalIcon');
    const titleEl = document.getElementById('neoModalTitle');
    const textEl = document.getElementById('neoModalText');

    if (iconEl) {
        iconEl.className = 'neo-modal-icon ' + type;
        iconEl.innerHTML = type === 'success' ? '<i class="fa-solid fa-check"></i>' :
            (type === 'error' ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-circle-info"></i>');
    }

    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = message;
    overlay.style.display = 'flex';
};

// Polyfill native alert
window.alert = (msg) => {
    if (typeof msg === 'string' && msg.length > 0) {
        window.showNotification('Уведомление', msg, 'info');
    }
};
