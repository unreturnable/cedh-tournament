const clientId = '1366114077251866726';
const redirectUri = 'http://' + window.location.host + '/oauth/callback';
const scope = 'identify';

function showLogin() {
    document.getElementById('login').style.display = 'block';
    document.getElementById('logout').style.display = 'none';
    document.getElementById('tournaments').innerHTML = '';
}

function showLogout() {
    document.getElementById('logout').style.display = 'block';
    document.getElementById('login').style.display = 'none';
}

function saveToken(token, type) {
    localStorage.setItem('discord_access_token', token);
    localStorage.setItem('discord_token_type', type);
}

function getToken() {
    return {
        access_token: localStorage.getItem('discord_access_token'),
        token_type: localStorage.getItem('discord_token_type')
    };
}

function clearToken() {
    localStorage.removeItem('discord_access_token');
    localStorage.removeItem('discord_token_type');
}

async function fetchTournaments(userId) {
    const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
    });
    if (res.ok) {
        const tournaments = await res.json();
        if (tournaments.length > 0) {
            document.getElementById('tournaments').innerHTML =
                '<h2>Your Tournaments:</h2><ul>' +
                tournaments.map(t => {
                    let dateStr = '';
                    if (t.date) {
                        const date = new Date(t.date.trim());
                        dateStr = isNaN(date) ? 'Unknown date' : date.toLocaleString();
                    } else {
                        dateStr = 'Unknown date';
                    }
                    return `<li>
                        <a href="tournament/${t.id}" class="tournament-link">${t.title}</a>
                        <span style="color:#888;">(${dateStr})</span>
                    </li>`;
                }).join('') +
                '</ul>';
        } else {
            document.getElementById('tournaments').innerHTML = '<h2>No tournaments found for your account.</h2>';
        }
    } else {
        document.getElementById('tournaments').innerHTML = '';
    }
}

async function fetchUserInfo(token, type) {
    const res = await fetch('/api/userinfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, token_type: type })
    });
    if (res.ok) {
        const user = await res.json();
        document.getElementById('info').innerHTML = `<h1>Welcome ${user.username}!</h1>`;
        showLogout();
        await fetchTournaments(user.id);
    } else {
        document.getElementById('info').innerHTML = '<h1>Failed to fetch user info. Please log in again.</h1>';
        clearToken();
        showLogin();
    }
}

window.onload = async () => {
    // If redirected from OAuth, extract token from URL
    const params = new URLSearchParams(window.location.search);
    const access_token = params.get('access_token');
    const token_type = params.get('token_type');

    if (access_token && token_type) {
        saveToken(access_token, token_type);
        // Remove tokens from URL
        window.history.replaceState({}, document.title, '/');
    }

    const tokenData = getToken();
    if (tokenData.access_token && tokenData.token_type) {
        await fetchUserInfo(tokenData.access_token, tokenData.token_type);
    } else {
        showLogin();
    }
    // Show content after login check
    document.body.classList.remove('loading');
};

document.getElementById('logout').onclick = () => {
    clearToken();
    document.getElementById('info').innerText = 'Logged out.';
    document.getElementById('tournaments').innerHTML = '';
    showLogin();
};

// Set login link URL
document.getElementById('login').onclick = function(e) {
    e.preventDefault();
    const loginUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    window.location.href = loginUrl;
};