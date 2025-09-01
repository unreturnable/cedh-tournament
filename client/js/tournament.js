const tokenData = {
    access_token: localStorage.getItem('discord_access_token'),
    token_type: localStorage.getItem('discord_token_type')
};
let currentUserId = null;

let roundsCollapsedState = {};

// Collapse/expand players list
const toggleBtn = document.getElementById('toggle-players-list');
const playersSection = document.getElementById('players-section');
let playersCollapsed = false;

// Logout logic (same as index.js)
document.getElementById('logout').onclick = () => {
    localStorage.removeItem('discord_access_token');
    localStorage.removeItem('discord_token_type');
    window.location.href = '/';
};

// Show logout button if logged in
if (localStorage.getItem('discord_access_token')) {
    document.getElementById('logout').style.display = 'block';
}

// Fetch user info if logged in
async function getCurrentUserId() {
    if (tokenData.access_token && tokenData.token_type) {
        try {
            const res = await fetch('/api/userinfo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tokenData)
            });
            if (res.ok) {
                const user = await res.json();
                currentUserId = user.id;
            }
        } catch {}
    }
}

let ws = null;
let wsConnected = false;
let wsReconnectTimeout = null;

function updateWsStatus(connected) {
    const statusDiv = document.getElementById('ws-status');
    if (!statusDiv) return;
    if (connected) {
        statusDiv.textContent = '🟢 Connected to server';
        statusDiv.style.color = 'green';
    } else {
        statusDiv.textContent = '🔴 Disconnected from server';
        statusDiv.style.color = 'red';
    }
}

function connectWebSocket(tournamentId) {
    if (ws) {
        ws.close();
        ws = null;
    }
    // Use same protocol as page
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        wsConnected = true;
        updateWsStatus(true); // Update status to connected
        ws.send(JSON.stringify({ type: 'subscribe', tournamentId }));
    };
    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'tournament-update' && data.tournamentId === tournamentId) {
                await renderTournament();
            }
        } catch(e) {
            console.error('Error parsing WebSocket message:', event.data, e);
        }
    };
    ws.onclose = () => {
        wsConnected = false;
        updateWsStatus(false); // Update status to disconnected
        // Try to reconnect after a delay
        if (!wsReconnectTimeout) {
            wsReconnectTimeout = setTimeout(() => {
                wsReconnectTimeout = null;
                connectWebSocket(tournamentId);
            }, 3000);
        }
    };
    ws.onerror = () => {
        ws.close();
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    updateWsStatus(false); // Show disconnected until connected
    await getCurrentUserId();
    const match = window.location.pathname.match(/\/tournament\/([^\/]+)/);
    const tournamentId = match ? match[1] : null;

    if (!tournamentId) {
        if (infoDiv) infoDiv.innerHTML = '<h2>Invalid tournament ID.</h2>';
        return;
    }

    renderTournament(true);
    connectWebSocket(tournamentId);
});

let lastTournamentData = null;

// --- Main render function ---
async function renderTournament(force = false) {
    const match = window.location.pathname.match(/\/tournament\/([^\/]+)/);
    const tournamentId = match ? match[1] : null;

    if (!tournamentId) {
        if (infoDiv) infoDiv.innerHTML = '<h2>Invalid tournament ID.</h2>';
        return;
    }

    const infoDiv = document.getElementById('tournament-info');
    const playersList = document.getElementById('players-list');
    const addPlayerBtn = document.getElementById('add-player-btn');
    const addPlayerModal = document.getElementById('add-player-modal');
    const editPlayerModal = document.getElementById('edit-player-modal');
    const editTournamentBtn = document.getElementById('edit-tournament-btn');
    const editTournamentModal = document.getElementById('edit-tournament-modal');
    const roundsContainer = document.getElementById('rounds-container');

    let editingOldName = '';

    try {
        // Always send userId as query param if available
        let url = `/api/tournament/${tournamentId}`;
        if (currentUserId) url += `?userId=${encodeURIComponent(currentUserId)}`;
        const res = await fetch(url);
        if (!res.ok) {
            if (infoDiv) infoDiv.innerHTML = '<h2>Tournament not found.</h2>';
            return;
        }
        const tournament = await res.json();

        // Add this line:
        const isOwner = currentUserId && tournament.user === String(currentUserId);

        // Only update UI if data changed or force is true
        const tournamentString = JSON.stringify(tournament);
        if (!force && lastTournamentData === tournamentString) {
            return;
        }
        lastTournamentData = tournamentString;
        lastUpdateTime = Date.now();

        // Tournament Info
        infoDiv.innerHTML = `
            <h1>${tournament.title}</h1>
            <p><strong>Date:</strong> ${
                tournament.date
                    ? (() => {
                        const d = new Date(tournament.date);
                        return isNaN(d) ? tournament.date : d.toLocaleString();
                    })()
                    : 'Unknown'
            }</p>
            <p><strong>Run by:</strong> ${tournament.username}</p>
        `;

        // Show/hide edit tournament button
        if (currentUserId && tournament.user === String(currentUserId)) {
            editTournamentBtn.style.display = '';
        } else {
            editTournamentBtn.style.display = 'none';
        }

        // Players List
        if (Array.isArray(tournament.players) && tournament.players.length >= 0) {
            const sortedPlayers = tournament.players; // Already sorted by server

            // Build players section header with collapse button
            const playersHeaderDiv = document.createElement('div');
            playersHeaderDiv.className = 'round-header'; // reuse round style

            const playersToggleBtn = document.createElement('button');
            playersToggleBtn.className = 'round-toggle-btn';
            playersToggleBtn.innerHTML = playersCollapsed ? '&#9654;' : '&#9660;';

            playersToggleBtn.onclick = function () {
                playersCollapsed = !playersCollapsed;
                playersToggleBtn.innerHTML = playersCollapsed ? '&#9654;' : '&#9660;';
                playersTableContainer.style.display = playersCollapsed ? 'none' : 'block';
            };

            const playersTitle = document.createElement('h2');
            playersTitle.textContent = 'Players';
            playersTitle.style.margin = 0;

            playersHeaderDiv.appendChild(playersToggleBtn);
            playersHeaderDiv.appendChild(playersTitle);

            // Players table container
            const playersTableContainer = document.createElement('div');
            playersTableContainer.id = 'players-table-container';
            playersTableContainer.style.display = playersCollapsed ? 'none' : 'block';

            // Determine which columns to show
            const showPoints = (!tournament.hideScores || isOwner) || tournament.locked;
            const showDeck = (!tournament.hideDecklists || isOwner)  || tournament.locked;

            // Build table header
            let tableHeader = `
                <tr>
                    <th>#</th>
                    <th>Name</th>
                    ${showPoints ? '<th>Points</th>' : ''}
                    ${showDeck ? '<th>Deck</th>' : ''}
                    <th></th>
                    <th></th>
                </tr>
            `;

            // Build table rows
            let tableRows = sortedPlayers.map((p, idx) => {
                let editBtn = '';
                let removeBtn = '';
                if (currentUserId && tournament.user === String(currentUserId)) {
                    editBtn = `<button class="edit-player-btn" data-player-name="${encodeURIComponent(p.name)}" data-player-deck="${encodeURIComponent(p.deck || '')}">Edit</button>`;
                    removeBtn = `<button class="remove-player-btn" data-player-name="${encodeURIComponent(p.name)}">Remove</button>`;
                }
                const points = (typeof p === 'object' && typeof p.points === 'number') ? p.points : 1000;
                return `<tr>
                        <td class="player-position">${idx + 1}</td>
                        <td class="player-name">${p.name}</td>
                        ${showPoints ? `<td class="player-points">${points} pts</td>` : ''}
                        ${showDeck ? `<td class="player-deck">${p.deck ? `<a href="${p.deck}" target="_blank">Deck List</a>` : ''}</td>` : ''}
                        <td class="player-edit">${editBtn}</td>
                        <td class="player-remove">${removeBtn}</td>
                    </tr>`;
            }).join('');

            playersTableContainer.innerHTML = `
                <table class="player-table">
                    <thead>${tableHeader}</thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;

            // Clear and rebuild playersList area
            playersList.innerHTML = '';
            playersList.appendChild(playersHeaderDiv);
            playersList.appendChild(playersTableContainer);

            // --- Add Player Button Logic ---
            let addPlayerBtn = document.getElementById('add-player-btn');
            if (
                currentUserId &&
                tournament.user === String(currentUserId) &&
                (!Array.isArray(tournament.rounds) || tournament.rounds.length === 0)
            ) {
                // If button doesn't exist, create it
                if (!addPlayerBtn) {
                    addPlayerBtn = document.createElement('button');
                    addPlayerBtn.id = 'add-player-btn';
                    addPlayerBtn.textContent = 'Add Player';
                }
                addPlayerBtn.style.display = '';
                // Wrap the button in a div for centering
                let addPlayerBtnWrapper = document.createElement('div');
                addPlayerBtnWrapper.style.display = 'flex';
                addPlayerBtnWrapper.style.justifyContent = 'center';
                addPlayerBtnWrapper.style.marginTop = '10px';
                addPlayerBtnWrapper.appendChild(addPlayerBtn);
                playersList.appendChild(addPlayerBtnWrapper);

                // Always (re-)attach the click handler after (re)creating/appending the button
                addPlayerBtn.onclick = function() {
                    addPlayerModal.style.display = 'block';
                    document.getElementById('add-player-error').innerText = '';
                    document.getElementById('player-name-input').value = '';
                    document.getElementById('deck-link-input').value = '';
                    // Focus first input
                    document.getElementById('player-name-input').focus();
                };
            } else if (addPlayerModal) {
                addPlayerModal.style.display = 'none';
            }

            // Rounds
            roundsContainer.innerHTML = '';
            if (!Array.isArray(tournament.rounds) || tournament.rounds.length === 0) {
                // No rounds yet: show "Start Tournament" button if user is owner AND at least 3 players
                if (
                    currentUserId &&
                    tournament.user === String(currentUserId) &&
                    Array.isArray(tournament.players) &&
                    tournament.players.length >= 3
                ) {
                    const startBtn = document.createElement('button');
                    startBtn.textContent = 'Start Tournament';
                    startBtn.className = 'start-tournament-btn';
                    startBtn.onclick = async function() {
                        const confirmed = await showConfirmModal('Are you sure you want to start the tournament? This will lock the tournament settings and you will not be able to edit the tournament name, date, or player list.');
                        if (!confirmed) return;
                        try {
                            const res = await fetch(`/api/tournament/${tournamentId}/nextRound`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: currentUserId })
                            });
                            const data = await res.json();
                            if (data.success) {
                                await renderTournament();
                            } else {
                                await showAlertModal(data.error || 'Failed to start tournament.');
                            }
                        } catch (err) {
                            await showAlertModal('Failed to start tournament.');
                        }
                    };
                    const btnWrapper = document.createElement('div');
                    btnWrapper.style.display = 'flex';
                    btnWrapper.style.justifyContent = 'center';
                    btnWrapper.appendChild(startBtn);
                    roundsContainer.appendChild(btnWrapper);
                } else if (
                    currentUserId &&
                    tournament.user === String(currentUserId) &&
                    (!Array.isArray(tournament.players) || tournament.players.length < 3)
                ) {
                    // Show message if not enough players
                    roundsContainer.innerHTML = '<div style="padding:1em;">At least 3 players are required to start the tournament.</div>';
                } else {
                    roundsContainer.innerHTML = '<div style="padding:1em;">Tournament has not started yet.</div>';
                }
                // Hide edit tournament button if not started
                editTournamentBtn.style.display = (currentUserId && tournament.user === String(currentUserId)) ? '' : 'none';
            } else {
                // Tournament started: hide edit tournament button
                editTournamentBtn.style.display = 'none';
                tournament.rounds.forEach((round, roundIdx) => {
                    const roundDiv = document.createElement('div');
                    roundDiv.className = 'round';
                    roundDiv.style.position = 'relative';

                    const toggleBtn = document.createElement('button');
                    toggleBtn.className = 'round-toggle-btn';
                    toggleBtn.innerHTML = '&#9660;';

                    // Pods/results container
                    const podsContainer = document.createElement('div');
                    podsContainer.className = 'pods-container';

                    // Collapsible logic
                    const roundKey = round.label || `Round${round.round}`;
                    roundsCollapsedState[roundKey] = roundsCollapsedState[roundKey] || false;
                    podsContainer.style.display = roundsCollapsedState[roundKey] ? 'none' : 'flex';
                    toggleBtn.innerHTML = roundsCollapsedState[roundKey] ? '&#9654;' : '&#9660;';

                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'round-header';
                    headerDiv.style.position = 'relative';

                    const title = document.createElement('h2');
                    // Use special label if present, otherwise default to "Round X"
                    title.textContent = round.label ? round.label : `Round ${round.round}`;
                    title.style.margin = 0;

                    headerDiv.appendChild(toggleBtn);
                    headerDiv.appendChild(title);

                    // Add "Cancel Round" button if this is the last round and user is owner
                    if (
                        currentUserId &&
                        tournament.user === String(currentUserId) &&
                        roundIdx === tournament.rounds.length - 1 &&
                        !tournament.locked // <-- Only show if not locked
                    ) {
                        const cancelBtn = document.createElement('button');
                        cancelBtn.className = 'cancel-round-btn';
                        cancelBtn.textContent = 'Cancel Round';
                        cancelBtn.style.zIndex = 2; // Ensure it's above other elements
                        headerDiv.appendChild(cancelBtn); // <-- append to headerDiv, not roundDiv
                        cancelBtn.onclick = async function () {
                            const confirmed = await showConfirmModal('Are you sure you want to cancel this round? This will remove all data for this round.');
                            if (!confirmed) return;
                            try {
                                const res = await fetch(`/api/tournament/${tournamentId}/cancelRound`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: currentUserId, round: round.round })
                                });
                                const data = await res.json();
                                if (data.success) {
                                    await renderTournament();
                                } else {
                                    await showAlertModal(data.error || 'Failed to cancel round.');
                                }
                            } catch (err) {
                                await showAlertModal('Failed to cancel round.');
                            }
                        };
                    }

                    round.pods.forEach((pod, podIdx) => {
                        const podDiv = document.createElement('div');
                        podDiv.className = 'pod';

                        // Build a 2x2 grid for seats (show only filled seats)
                        let gridHtml = '<div class="pod-seat-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">';
                        for (let seatIdx = 0; seatIdx < 4; seatIdx++) {
                            const player = pod.players[seatIdx];
                            if (!player) continue; // Skip empty seats
                            const seatLabel = `Seat ${seatIdx + 1}`;
                            let seatClass = 'pod-seat';
                            let crown = '';
                            if (
                                (pod.result === 'win' && pod.winner === (typeof player === 'object' ? player.name : player)) ||
                                pod.result === 'bye'
                            ) {
                                seatClass += ' pod-seat-winner';
                                crown = '👑 ';
                            } else if (pod.result === 'draw') {
                                seatClass += ' pod-seat-draw';
                            } else if (pod.result === 'win' && pod.winner !== (typeof player === 'object' ? player.name : player)) {
                                seatClass += ' pod-seat-loser';
                            }
                            gridHtml += `<div class="${seatClass}" style="border: 1px solid #ccc; border-radius: 4px; padding: 6px; min-width: 80px; min-height: 32px;">
                                <strong>${crown}${seatLabel}:</strong> ${typeof player === 'object' ? player.name : player}
                            </div>`;
                        }
                        gridHtml += '</div>';

                        // Result reporting buttons (not for Bye pods, only if not already reported and user is owner)
                        let resultBtns = '';
                        if (
                            pod.label !== 'Bye' &&
                            !pod.result &&
                            currentUserId &&
                            tournament.user === String(currentUserId) &&
                            roundIdx === tournament.rounds.length - 1 && // Only for current round
                            !tournament.locked // <-- Only show if not locked
                        ) {
                            resultBtns = `
                                <div class="pod-result-btns" style="margin-bottom:8px;">
                                    <button class="report-win-btn" data-pod-idx="${podIdx}">Win</button>
                                    <button class="report-draw-btn" data-pod-idx="${podIdx}">Draw</button>
                                </div>
                            `;
                        }

                        podDiv.innerHTML = `
                            <h3>${pod.label ? pod.label : `Pod ${podIdx + 1}`}</h3>
                            ${gridHtml}
                            ${resultBtns}
                            <p>Result: ${
                            pod.result === 'win'
                                ? `Win (Winner: ${pod.winner})`
                                : pod.result === 'draw'
                                    ? 'Draw'
                                    : pod.result === 'bye'
                                        ? 'Bye'
                                        : 'Not reported'
                            }</p>
                        `;
                        podsContainer.appendChild(podDiv);
                    });

                    // Toggle logic
                    toggleBtn.onclick = function () {
                        roundsCollapsedState[roundKey] = !roundsCollapsedState[roundKey];
                        podsContainer.style.display = roundsCollapsedState[roundKey] ? 'none' : 'flex';
                        toggleBtn.innerHTML = roundsCollapsedState[roundKey] ? '&#9654;' : '&#9660;';
                    };

                    roundDiv.appendChild(headerDiv);
                    roundDiv.appendChild(podsContainer);
                    roundsContainer.appendChild(roundDiv);
                });
            }
        }

        // --- Button Logic ---

        // Edit Tournament
        if (currentUserId && tournament.user === String(currentUserId)) {
            editTournamentBtn.onclick = function() {
                editTournamentModal.style.display = 'block';
                document.getElementById('edit-tournament-error').innerText = '';
                document.getElementById('edit-tournament-name-input').value = tournament.title;
                const dateOnly = tournament.date ? tournament.date.split('T')[0] : '';
                const timeOnly = tournament.date && tournament.date.includes('T') ? tournament.date.split('T')[1].slice(0,5) : '';
                document.getElementById('edit-tournament-date-input').value = dateOnly;
                document.getElementById('edit-tournament-time-input').value = timeOnly;
                document.getElementById('edit-hide-scores-checkbox').checked = !!tournament.hideScores;
                document.getElementById('edit-hide-decklists-checkbox').checked = !!tournament.hideDecklists;
                // Focus first input
                document.getElementById('edit-tournament-name-input').focus();
            };
            document.getElementById('cancel-edit-tournament-btn').onclick = function() {
                editTournamentModal.style.display = 'none';
                document.getElementById('edit-tournament-error').innerText = '';
            };
            document.getElementById('submit-edit-tournament-btn').onclick = async function() {
                const newTitle = document.getElementById('edit-tournament-name-input').value.trim();
                const newDate = document.getElementById('edit-tournament-date-input').value;
                const newTime = document.getElementById('edit-tournament-time-input').value;
                const hideScores = document.getElementById('edit-hide-scores-checkbox').checked;
                const hideDecklists = document.getElementById('edit-hide-decklists-checkbox').checked;
                if (!newTitle || !newDate) {
                    document.getElementById('edit-tournament-error').innerText = 'Please enter a name and date.';
                    return;
                }
                let dateTime = newDate;
                if (newTime) dateTime += 'T' + newTime;
                try {
                    const res = await fetch(`/api/tournament/${tournamentId}/edit`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUserId, title: newTitle, date: dateTime, hideScores, hideDecklists })
                    });
                    const data = await res.json();
                    if (data.success) {
                        editTournamentModal.style.display = 'none';
                        await renderTournament();
                    } else {
                        document.getElementById('edit-tournament-error').innerText = data.error || 'Failed to edit tournament.';
                    }
                } catch (err) {
                    document.getElementById('edit-tournament-error').innerText = 'Failed to edit tournament.';
                }
            };
        }

        // Add Player
        if (currentUserId && tournament.user === String(currentUserId) && addPlayerBtn) {
            addPlayerBtn.onclick = function() {
                addPlayerModal.style.display = 'block';
                document.getElementById('add-player-error').innerText = '';
                document.getElementById('player-name-input').value = '';
                document.getElementById('deck-link-input').value = '';
                // Focus first input
                document.getElementById('player-name-input').focus();
            };
            document.getElementById('cancel-add-player-btn').onclick = function() {
                addPlayerModal.style.display = 'none';
                document.getElementById('add-player-error').innerText = '';
            };
            document.getElementById('submit-add-player-btn').onclick = async function() {
                const playerName = document.getElementById('player-name-input').value.trim();
                const deckLink = document.getElementById('deck-link-input').value.trim();
                if (!playerName) {
                    document.getElementById('add-player-error').innerText = 'Please enter a player name.';
                    return;
                }
                try {
                    const res = await fetch(`/api/tournament/${tournamentId}/add-player`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUserId, playerName, deckLink })
                    });
                    const data = await res.json();
                    if (data.success) {
                        addPlayerModal.style.display = 'none';
                        await renderTournament();
                    } else {
                        document.getElementById('add-player-error').innerText = data.error || 'Failed to add player.';
                        await showAlertModal(data.error || 'Failed to add player.');
                    }
                } catch (err) {
                    document.getElementById('add-player-error').innerText = 'Failed to add player.';
                    await showAlertModal('Failed to add player.');
                }
            };
        }

        // Remove Player
        // Only allow remove if user is owner AND tournament has NOT started (no rounds)
        if (
            currentUserId &&
            tournament.user === String(currentUserId) &&
            (!Array.isArray(tournament.rounds) || tournament.rounds.length === 0)
        ) {
            playersList.querySelectorAll('.remove-player-btn').forEach(btn => {
                btn.onclick = async function() {
                    const playerName = decodeURIComponent(btn.getAttribute('data-player-name'));
                    const confirmed = await showConfirmModal(`Remove player "${playerName}"?`);
                    if (!confirmed) return;
                    try {
                        const res = await fetch(`/api/tournament/${tournamentId}/remove-player`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: currentUserId, playerName })
                        });
                        const data = await res.json();
                        if (data.success) {
                            await renderTournament();
                        } else {
                            await showAlertModal(data.error || 'Failed to remove player.');
                        }
                    } catch (err) {
                        await showAlertModal('Failed to remove player.');
                    }
                };
            });
        } else {
            // Hide/remove all remove buttons if not allowed
            playersList.querySelectorAll('.remove-player-btn').forEach(btn => {
                btn.style.display = 'none';
            });
        }

        // Edit Player
        // Only allow edit if user is owner AND tournament has NOT started (no rounds)
        if (
            currentUserId &&
            tournament.user === String(currentUserId) &&
            (!Array.isArray(tournament.rounds) || tournament.rounds.length === 0)
        ) {
            playersList.querySelectorAll('.edit-player-btn').forEach(btn => {
                btn.onclick = function() {
                    editingOldName = decodeURIComponent(btn.getAttribute('data-player-name'));
                    const deck = decodeURIComponent(btn.getAttribute('data-player-deck'));
                    document.getElementById('edit-player-name-input').value = editingOldName;
                    document.getElementById('edit-deck-link-input').value = deck;
                    editPlayerModal.style.display = 'block';
                    document.getElementById('edit-player-error').innerText = '';
                    // Focus first input
                    document.getElementById('edit-player-name-input').focus();
                };
            });

            document.getElementById('cancel-edit-player-btn').onclick = function() {
                editPlayerModal.style.display = 'none';
                document.getElementById('edit-player-error').innerText = '';
            };

            document.getElementById('submit-edit-player-btn').onclick = async function() {
                const newName = document.getElementById('edit-player-name-input').value.trim();
                const newDeck = document.getElementById('edit-deck-link-input').value.trim();
                if (!newName) {
                    document.getElementById('edit-player-error').innerText = 'Please enter a player name.';
                    return;
                }
                try {
                    const res = await fetch(`/api/tournament/${tournamentId}/edit-player`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUserId, oldName: editingOldName, newName, newDeck })
                    });
                    const data = await res.json();
                    if (data.success) {
                        editPlayerModal.style.display = 'none';
                        await renderTournament();
                    } else {
                        document.getElementById('edit-player-error').innerText = data.error || 'Failed to edit player.';
                        await showAlertModal(data.error || 'Failed to edit player.');
                    }
                } catch (err) {
                    document.getElementById('edit-player-error').innerText = 'Failed to edit player.';
                    await showAlertModal('Failed to edit player.');
                }
            };
        } else {
            // Hide/remove all edit buttons if not allowed
            playersList.querySelectorAll('.edit-player-btn').forEach(btn => {
                btn.style.display = 'none';
            });
        }

        // --- DROPPED PLAYERS SECTION ---
        // Show dropped players if any
        if (Array.isArray(tournament.droppedPlayers) && tournament.droppedPlayers.length > 0) {
            const droppedHeader = document.createElement('h3');
            droppedHeader.textContent = 'Dropped Players';
            droppedHeader.style.color = 'var(--solarized-red)';
            playersList.appendChild(droppedHeader);

            // Determine which columns to show for dropped players
            const showPoints = !tournament.hideScores || isOwner;
            const showDeck = !tournament.hideDecklists || isOwner;

            // Build dropped players table header
            const droppedTableHeader = `
                <tr>
                    <th>#</th>
                    <th>Name</th>
                    ${showPoints ? '<th>Points</th>' : ''}
                    ${showDeck ? '<th>Deck</th>' : ''}
                    <th></th>
                    <th></th>
                </tr>
            `;

            // Build dropped players table rows
            let droppedTableRows = tournament.droppedPlayers.map((p, idx) => {
                const player = typeof p === 'object' ? p : { name: p, points: 1000, deck: '' };
                let undropBtn = '';
                if (
                    currentUserId &&
                    tournament.user === String(currentUserId)
                ) {
                    undropBtn = `<button class="undrop-player-btn" data-player-name="${encodeURIComponent(player.name)}">Undrop</button>`;
                }
                const points = player.points !== undefined ? player.points : 1000;
                return `<tr>
                    <td class="player-position">${idx + 1}</td>
                    <td class="player-name">${player.name}</td>
                    ${showPoints ? `<td class="player-points">${points} pts</td>` : ''}
                    ${showDeck ? `<td class="player-deck">${player.deck ? `<a href="${player.deck}" target="_blank">Deck List</a>` : ''}</td>` : ''}
                    <td class="player-edit"></td>
                    <td class="player-remove">${undropBtn}</td>
                </tr>`;
            }).join('');

            const droppedTableContainer = document.createElement('div');
            droppedTableContainer.style.marginBottom = '1em';
            droppedTableContainer.innerHTML = `
                <table class="player-table">
                    <thead>${droppedTableHeader}</thead>
                    <tbody>
                        ${droppedTableRows}
                    </tbody>
                </table>
            `;
            playersList.appendChild(droppedTableContainer);

            // Attach undrop logic to undrop buttons
            droppedTableContainer.querySelectorAll('.undrop-player-btn').forEach(btn => {
                btn.onclick = async function () {
                    const playerName = decodeURIComponent(btn.getAttribute('data-player-name'));
                    try {
                        const res = await fetch(`/api/tournament/${tournamentId}/undrop-player`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: currentUserId, playerName })
                        });
                        const data = await res.json();
                        if (data.success) {
                            await renderTournament();
                        } else {
                            await showAlertModal(data.error || 'Failed to undrop player.');
                        }
                    } catch (err) {
                        await showAlertModal('Failed to undrop player.');
                    }
                };
            });
        }

        // --- DROP PLAYER BUTTONS ---
        // Add drop buttons to players table (only if tournament started and user is owner)
        if (
            currentUserId &&
            tournament.user === String(currentUserId) &&
            Array.isArray(tournament.rounds) &&
            tournament.rounds.length > 0 &&
            !tournament.locked // <-- Only show if not locked
        ) {
            playersList.querySelectorAll('.player-table tr').forEach(row => {
                const nameCell = row.querySelector('.player-name');
                if (!nameCell) return;
                const playerName = nameCell.textContent;
                // Only add drop button if not already dropped
                if (
                    !tournament.droppedPlayers ||
                    !tournament.droppedPlayers.some(p => (typeof p === 'object' ? p.name : p) === playerName)
                ) {
                    const dropCell = document.createElement('td');
                    const dropBtn = document.createElement('button');
                    dropBtn.textContent = 'Drop';
                    dropBtn.className = 'drop-player-btn';
                    dropBtn.onclick = async function () {
                        const confirmed = await showConfirmModal(`Drop player "${playerName}" from the tournament?`);
                        if (!confirmed) return;
                        try {
                            const res = await fetch(`/api/tournament/${tournamentId}/drop-player`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: currentUserId, playerName })
                            });
                            const data = await res.json();
                            if (data.success) {
                                await renderTournament(true);
                            } else {
                                await showAlertModal(data.error || 'Failed to drop player.');
                            }
                        } catch (err) {
                            await showAlertModal('Failed to drop player.');
                        }
                    };
                    dropCell.appendChild(dropBtn);
                    row.appendChild(dropCell);
                }
            });
        }

        // --- NEXT ROUND & TOP CUT BUTTONS ---
        if (
            Array.isArray(tournament.rounds) &&
            tournament.rounds.length > 0 &&
            currentUserId &&
            tournament.user === String(currentUserId)
        ) {
            // Only show if tournament is not ended (optional: check for ended flag)
            const nextRoundBtnWrapper = document.createElement('div');
            nextRoundBtnWrapper.style.display = 'flex';
            nextRoundBtnWrapper.style.justifyContent = 'center';
            nextRoundBtnWrapper.style.margin = '16px 0';

            // Check if top cut has been performed
            const isTopCut = !!tournament.topCut;

            // Check if the last round is the final
            const lastRound = tournament.rounds[tournament.rounds.length - 1];
            const isFinalRound = lastRound && lastRound.label === 'Final';

            if (!isTopCut) {
                // Next Round button
                const nextRoundBtn = document.createElement('button');
                nextRoundBtn.textContent = 'Next Round';
                nextRoundBtn.className = 'next-round-btn';
                nextRoundBtn.onclick = async function () {
                    const confirmed = await showConfirmModal('Start the next round?');
                    if (!confirmed) return;
                    try {
                        const res = await fetch(`/api/tournament/${tournamentId}/nextRound`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: currentUserId })
                        });
                        const data = await res.json();
                        if (data.success) {
                            await renderTournament();
                        } else {
                            await showAlertModal(data.error || 'Failed to start next round.');
                        }
                    } catch (err) {
                        await showAlertModal('Failed to start next round.');
                    }
                };
                nextRoundBtnWrapper.appendChild(nextRoundBtn);

                // Top Cut button
                const topCutBtn = document.createElement('button');
                topCutBtn.textContent = 'Top Cut';
                topCutBtn.className = 'top-cut-btn';
                topCutBtn.style.marginLeft = '8px';
                topCutBtn.onclick = function () {
                    document.getElementById('top-cut-modal').style.display = 'block';
                    document.getElementById('top-cut-error').innerText = '';
                    // Focus the auto-final-count input when modal opens
                    setTimeout(() => {
                        document.getElementById('auto-final-count').focus();
                    }, 0);
                };
                nextRoundBtnWrapper.appendChild(topCutBtn);

                roundsContainer.appendChild(nextRoundBtnWrapper);

                // Modal logic
                document.getElementById('cancel-top-cut-btn').onclick = function () {
                    document.getElementById('top-cut-modal').style.display = 'none';
                    document.getElementById('top-cut-error').innerText = '';
                };
                document.getElementById('submit-top-cut-btn').onclick = async function () {
                    const autoFinalCount = parseInt(document.getElementById('auto-final-count').value, 10);
                    const semiFinalCount = parseInt(document.getElementById('semi-final-count').value, 10);
                    if (isNaN(autoFinalCount) || isNaN(semiFinalCount) || autoFinalCount < 0 || semiFinalCount < 0) {
                        document.getElementById('top-cut-error').innerText = 'Please enter valid numbers.';
                        return;
                    }
                    try {
                        const res = await fetch(`/api/tournament/${tournamentId}/topcut`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: currentUserId, autoFinalCount, semiFinalCount })
                        });
                        const data = await res.json();
                        if (data.success) {
                            document.getElementById('top-cut-modal').style.display = 'none';
                            await renderTournament();
                        } else {
                            document.getElementById('top-cut-error').innerText = data.error || 'Failed to create top cut.';
                        }
                    } catch (err) {
                        document.getElementById('top-cut-error').innerText = 'Failed to create top cut.';
                    }
                };
            } else if (!isFinalRound) {
                // Only show "Go to final" button if top cut performed and not already in final
                const goToFinalBtn = document.createElement('button');
                goToFinalBtn.textContent = 'Go to final';
                goToFinalBtn.className = 'go-to-final-btn';
                goToFinalBtn.onclick = async function () {
                    const confirmed = await showConfirmModal('Create the final round?');
                    if (!confirmed) return;
                    try {
                        const res = await fetch(`/api/tournament/${tournamentId}/final`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: currentUserId })
                        });
                        const data = await res.json();
                        if (data.success) {
                            await renderTournament();
                        } else {
                            await showAlertModal(data.error || 'Failed to create final round.');
                        }
                    } catch (err) {
                        await showAlertModal('Failed to create final round.');
                    }
                };
                nextRoundBtnWrapper.appendChild(goToFinalBtn);
                roundsContainer.appendChild(nextRoundBtnWrapper);
            }
        }

        // --- LOCK/UNLOCK TOURNAMENT BUTTON ---
        // Only show if final round exists and user is owner
        if (
            currentUserId &&
            tournament.user === String(currentUserId) &&
            Array.isArray(tournament.rounds) &&
            tournament.rounds.length > 0
        ) {
            const finalRound = tournament.rounds[tournament.rounds.length - 1];
            if (finalRound && finalRound.label === 'Final') {
                // Remove existing lock/unlock button if present
                let lockBtnDiv = document.getElementById('lock-tournament-btn-div');
                if (lockBtnDiv) lockBtnDiv.remove();

                lockBtnDiv = document.createElement('div');
                lockBtnDiv.id = 'lock-tournament-btn-div';
                lockBtnDiv.style.display = 'flex';
                lockBtnDiv.style.justifyContent = 'center';
                lockBtnDiv.style.margin = '32px 0 16px 0';

                let btn = document.createElement('button');
                btn.style.fontSize = '1.1em';
                btn.style.padding = '10px 24px';

                if (tournament.locked) {
                    btn.textContent = 'Unlock Tournament';
                    btn.className = 'unlock-tournament-btn';
                    btn.onclick = async function () {
                        const confirmed = await showConfirmModal('Unlock the tournament? This will allow editing again.');
                        if (!confirmed) return;
                        try {
                            const res = await fetch(`/api/tournament/${tournamentId}/unlock`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: currentUserId })
                            });
                            const data = await res.json();
                            if (data.success) {
                                await renderTournament();
                            } else {
                                await showAlertModal(data.error || 'Failed to unlock tournament.');
                            }
                        } catch (err) {
                            await showAlertModal('Failed to unlock tournament.');
                        }
                    };
                    lockBtnDiv.appendChild(btn);
                } else {
                    // Only allow lock if all final pod results are reported
                    const allReported = (finalRound.pods || []).every(pod => pod.result);
                    btn.textContent = 'Lock Tournament';
                    btn.className = 'lock-tournament-btn';
                    btn.disabled = !allReported;
                    btn.title = allReported ? '' : 'All final results must be reported before locking.';
                    btn.onclick = async function () {
                        if (!allReported) return;
                        const confirmed = await showConfirmModal('Lock the tournament? This will finalize all results and scoring.');
                        if (!confirmed) return;
                        try {
                            const res = await fetch(`/api/tournament/${tournamentId}/lock`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: currentUserId })
                            });
                            const data = await res.json();
                            if (data.success) {
                                await renderTournament();
                            } else {
                                await showAlertModal(data.error || 'Failed to lock tournament.');
                            }
                        } catch (err) {
                            await showAlertModal('Failed to lock tournament.');
                        }
                    };
                    lockBtnDiv.appendChild(btn);
                }
                // Add to bottom of roundsContainer
                roundsContainer.appendChild(lockBtnDiv);
            }
        }

        // Attach result reporting logic (only for current round and owner)
        if (
            currentUserId &&
            tournament.user === String(currentUserId) &&
            Array.isArray(tournament.rounds) &&
            tournament.rounds.length > 0 &&
            !tournament.locked // <-- Only attach if not locked
        ) {
            const currentRoundIdx = tournament.rounds.length - 1;
            const currentRound = tournament.rounds[currentRoundIdx];
            // Find the pods for the current round only
            const roundDivs = roundsContainer.querySelectorAll('.round');
            const currentRoundDiv = roundDivs[roundDivs.length - 1];
            const pods = currentRoundDiv ? currentRoundDiv.querySelectorAll('.pod') : [];
            pods.forEach((podDiv, podIdx) => {
                const pod = currentRound.pods[podIdx];
                if (!pod) return;

                // Undo Result button (if result submitted)
                if (
                    pod.result && 
                    pod.result !== 'bye' && 
                    pod.label !== 'Automatically qualified for final'
                ) {
                    let undoBtn = podDiv.querySelector('.undo-pod-result-btn');
                    if (!undoBtn) {
                        undoBtn = document.createElement('button');
                        undoBtn.className = 'undo-pod-result-btn';
                        undoBtn.textContent = 'Undo Result';
                        undoBtn.style.marginLeft = '8px';
                        podDiv.appendChild(undoBtn);
                    }
                    undoBtn.onclick = async function () {
                        try {
                            const res = await fetch(`/api/tournament/${tournamentId}/undo-pod-result`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    userId: currentUserId,
                                    round: currentRound.round,
                                    podIdx
                                })
                            });
                            const data = await res.json();
                            if (data.success) {
                                await renderTournament(true);
                            } else {
                                await showAlertModal(data.error || 'Failed to undo pod result.');
                            }
                        } catch (err) {
                            await showAlertModal('Failed to undo pod result.');
                        }
                    };
                }

                // Win button
                const winBtn = podDiv.querySelector('.report-win-btn');
                if (winBtn) {
                    winBtn.onclick = function () {
                        // Show modal with player buttons
                        const modal = document.getElementById('pod-win-modal');
                        const modalPlayers = document.getElementById('pod-win-modal-players');
                        const modalError = document.getElementById('pod-win-modal-error');
                        modalError.innerText = '';
                        modalPlayers.innerHTML = '';
                        (pod.players || []).forEach(player => {
                            const name = typeof player === 'object' ? player.name : player;
                            const btn = document.createElement('button');
                            btn.textContent = name;
                            btn.onclick = async function () {
                                try {
                                    const res = await fetch(`/api/tournament/${tournamentId}/report-pod-result`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            userId: currentUserId,
                                            round: currentRound.round,
                                            podIdx,
                                            result: 'win',
                                            winner: name
                                        })
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                        modal.style.display = 'none';
                                        await renderTournament(true); // <-- Force update here
                                    } else {
                                        modalError.innerText = data.error || 'Failed to report result.';
                                    }
                                } catch (err) {
                                    modalError.innerText = 'Failed to report result.';
                                }
                            };
                            modalPlayers.appendChild(btn);
                        });
                        modal.style.display = 'block';
                        document.getElementById('pod-win-modal-cancel').onclick = function () {
                            modal.style.display = 'none';
                        };
                    };
                }
                // Draw button
                const drawBtn = podDiv.querySelector('.report-draw-btn');
                if (drawBtn) {
                    drawBtn.onclick = async function () {
                        try {
                            const res = await fetch(`/api/tournament/${tournamentId}/report-pod-result`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    userId: currentUserId,
                                    round: currentRound.round,
                                    podIdx,
                                    result: 'draw'
                                })
                            });
                            const data = await res.json();
                            if (data.success) {
                                await renderTournament(true); // <-- Force update here
                            } else {
                                alert(data.error || 'Failed to report result.');
                            }
                        } catch (err) {
                            alert('Failed to report result.');
                        }
                    };
                }
            });
        }
    } catch (err) {
        console.log('Error rendering tournament:', err);
        if (infoDiv) infoDiv.innerHTML = '<h2>Error loading tournament data.</h2>';
    }
}

// --- Custom Modal Helpers ---
function showConfirmModal(message) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-confirm-modal');
        const msg = document.getElementById('custom-confirm-message');
        const yesBtn = document.getElementById('custom-confirm-yes');
        const noBtn = document.getElementById('custom-confirm-no');
        msg.innerText = message;
        modal.style.display = 'block';
        // Move Okay and Cancel to left, Okay first
        const btnContainer = yesBtn.parentElement;
        btnContainer.style.textAlign = 'left';
        if (btnContainer.firstChild !== yesBtn) {
            btnContainer.insertBefore(yesBtn, btnContainer.firstChild);
        }
        if (btnContainer.children[1] !== noBtn) {
            btnContainer.insertBefore(noBtn, btnContainer.children[1]);
        }
        yesBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(true);
        };
        noBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(false);
        };
    });
}

function showAlertModal(message) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-alert-modal');
        const msg = document.getElementById('custom-alert-message');
        const okBtn = document.getElementById('custom-alert-ok');
        msg.innerText = message;
        modal.style.display = 'block';
        // Move Okay button to left
        okBtn.parentElement.style.textAlign = 'left';
        okBtn.onclick = () => {
            modal.style.display = 'none';
            resolve();
        };
    });
}