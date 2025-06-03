const clientId = '1366114077251866726';
const redirectUri = window.location.protocol + '//' + window.location.host + '/oauth/callback';
const scope = 'identify';

let userId = 'unknown';
let username = 'unknown';

function showLogin() {
    document.getElementById('login').style.display = 'block';
    document.getElementById('logout').style.display = 'none';
    document.getElementById('tournaments').innerHTML = '';
    document.getElementById('createTournamentBtn').style.display = 'none'; // Hide button
}

function showLogout() {
    document.getElementById('logout').style.display = 'block';
    document.getElementById('login').style.display = 'none';
    document.getElementById('createTournamentBtn').style.display = 'inline-block'; // Show button
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
                `<h2>Your Tournaments:</h2>
                <table class="tournament-table" style="width:100%;">
                    <tbody>
                        ${tournaments.map((t) => {
                            let dateStr = '';
                            if (t.date) {
                                const date = new Date(t.date.trim());
                                dateStr = isNaN(date) ? 'Unknown date' : date.toLocaleString();
                            } else {
                                dateStr = 'Unknown date';
                            }
                            return `<tr data-tournament-id="${t.id}">
                                <td style="width:50%; text-align: center;"><a href="tournament/${t.id}" class="tournament-link">${t.title}</a></td>
                                <td style="width:30%; text-align: center;"><span style="color:#888;">${dateStr}</span></td>
                                <td style="width:20%;"><button class="delete-tournament-btn" style="margin-left:10px;">Delete</button></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>`;
            // Attach delete handlers
            document.querySelectorAll('.delete-tournament-btn').forEach(btn => {
                btn.onclick = async function(e) {
                    e.preventDefault();
                    const tr = btn.closest('tr[data-tournament-id]');
                    const tournamentId = tr.getAttribute('data-tournament-id');
                    if (confirm('Are you sure you want to delete this tournament? This cannot be undone.')) {
                        try {
                            const res = await fetch(`/api/tournament/${tournamentId}`, {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId })
                            });
                            const data = await res.json();
                            if (data.success) {
                                tr.remove();
                            } else {
                                alert(data.error || 'Failed to delete tournament.');
                            }
                        } catch (err) {
                            alert('Failed to delete tournament.');
                        }
                    }
                };
            });
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

        username = user.username;
        userId = user.id;

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

document.getElementById('createTournamentBtn').onclick = function() {
    document.getElementById('createTournamentModal').style.display = 'block';
    // Focus the first input in the modal by default
    const firstInput = document.querySelector('#createTournamentModal input[type="text"], #createTournamentModal input[type="date"], #createTournamentModal input, #createTournamentModal select');
    if (firstInput) firstInput.focus();
};

document.getElementById('cancelTournamentBtn').onclick = function() {
    document.getElementById('createTournamentModal').style.display = 'none';
    document.getElementById('createTournamentError').innerText = '';
};

document.getElementById('submitTournamentBtn').onclick = async function() {
    const title = document.getElementById('tournamentName').value.trim();
    const date = document.getElementById('tournamentDate').value;
    const time = document.getElementById('tournamentTime').value;
    if (!title || !date) {
        document.getElementById('createTournamentError').innerText = 'Please enter a name and date.';
        return;
    }
    // Combine date and time into ISO string
    let dateTime = date;
    if (time) dateTime += 'T' + time;
    try {
        const res = await fetch('/api/tournament', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, username, title, date: dateTime })
        });
        const data = await res.json();
        if (data.success) {
            window.location.href = `/tournament/${data.id}`;
        } else {
            document.getElementById('createTournamentError').innerText = data.error || 'Failed to create tournament.';
        }
    } catch (err) {
        document.getElementById('createTournamentError').innerText = 'Failed to create tournament.';
    }
};

window.addEventListener('pageshow', async () => {
    // Always close the create tournament modal
    document.getElementById('createTournamentModal').style.display = 'none';
    document.getElementById('createTournamentError').innerText = '';

    // If user is logged in, refresh the tournament list
    const tokenData = getToken();
    if (tokenData.access_token && tokenData.token_type) {
        // fetchUserInfo will also call fetchTournaments, but we only want to refresh tournaments
        // Use the current userId if available
        if (userId && userId !== 'unknown') {
            await fetchTournaments(userId);
        }
    }
});