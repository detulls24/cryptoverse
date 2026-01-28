// Authentication Module
async function checkSession() {
    if (!supabaseClient) return;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            window.state.currentUser = session.user;
            updateAuthUI();
        }
    } catch (e) { }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (supabaseClient && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        window.state.currentUser = data.user;
    } else {
        window.state.currentUser = { email };
    }
    closeModal('loginModal');
    updateAuthUI();
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    if (supabaseClient && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) return alert(error.message);
        showSuccess('Поздравляем! Ваш аккаунт успешно создан. Пожалуйста, войдите в систему, используя свои данные.');
    } else {
        window.state.currentUser = { email };
        updateAuthUI();
    }
    closeModal('registerModal');
}

window.handleLogout = async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    window.state.currentUser = null;
    location.reload();
};

function updateAuthUI() {
    if (!window.state.currentUser) return;

    const authButtons = document.getElementById('authButtons');
    const userProfile = document.getElementById('userProfile');
    const dashLink = document.getElementById('dashboardLink');
    const profileLink = document.querySelector('a[onclick*="profile"]');
    const userName = document.getElementById('userName');
    const profileEmail = document.getElementById('profileEmail');
    const mobilePortfolio = document.getElementById('mobilePortfolio');

    if (authButtons) authButtons.style.display = 'none';
    if (userProfile) userProfile.style.display = 'flex';
    if (dashLink) dashLink.style.display = 'block';
    if (profileLink) profileLink.style.display = 'block';
    if (userName) userName.textContent = window.state.currentUser.email?.split('@')[0] || 'User';
    if (profileEmail) profileEmail.textContent = window.state.currentUser.email || 'Email not found';
    if (mobilePortfolio) mobilePortfolio.style.display = 'flex';

    // Update mobile menu items
    const menuProfile = document.getElementById('menuProfile');
    const menuLogin = document.getElementById('menuLogin');

    if (menuProfile) menuProfile.style.display = 'flex';

    if (menuLogin) {
        const span = menuLogin.querySelector('span');
        const icon = menuLogin.querySelector('i');
        if (span) span.textContent = 'Выход';
        if (icon) icon.className = 'fa-solid fa-right-from-bracket';
        menuLogin.onclick = () => {
            closeMobileMenu();
            handleLogout();
        };
    }

    populatePortfolio();
}
