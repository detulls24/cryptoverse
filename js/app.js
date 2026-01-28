// Main App Entry Point
document.addEventListener('DOMContentLoaded', async () => {
    console.log("App initializing...");

    // 1. Fetch initial data
    await fetchCoins();

    // 2. Initialize UI components
    initChart();
    setupEventListeners();

    // 3. Check auth session
    checkSession();

    // 4. Set update interval
    setInterval(fetchCoins, 60000);

    // 5. Initial exchange calc
    setTimeout(calculateExchange, 100);
});
