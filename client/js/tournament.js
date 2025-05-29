const tokenData = {
    access_token: localStorage.getItem('discord_access_token'),
    token_type: localStorage.getItem('discord_token_type')
};
let currentUserId = null;

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

document.addEventListener('DOMContentLoaded', async () => {
    await getCurrentUserId();
    // Get tournament ID from URL (/tournament/<id>)
    const match = window.location.pathname.match(/\/tournament\/([^\/]+)/);
    const tournamentId = match ? match[1] : null;

    const infoDiv = document.getElementById('tournament-info');
    const playersList = document.getElementById('players-list');
    const addPlayerBtn = document.getElementById('add-player-btn');
    const addPlayerModal = document.getElementById('add-player-modal');
    const editPlayerModal = document.getElementById('edit-player-modal');
    const editTournamentBtn = document.getElementById('edit-tournament-btn');
    const editTournamentModal = document.getElementById('edit-tournament-modal');
    const roundsContainer = document.getElementById('rounds-container');

    if (!tournamentId) {
        if (infoDiv) infoDiv.innerHTML = '<h2>Invalid tournament ID.</h2>';
        return;
    }

    let editingOldName = '';

    async function renderTournament() {
        try {
            const res = await fetch(`/api/tournament/${tournamentId}`);
            if (!res.ok) {
                if (infoDiv) infoDiv.innerHTML = '<h2>Tournament not found.</h2>';
                return;
            }
            const tournament = await res.json();

            // Tournament Info
            infoDiv.innerHTML = `
                <h1>${tournament.title}</h1>
                <p><strong>Date:</strong> ${tournament.date ? new Date(tournament.date).toLocaleDateString() : 'Unknown'}</p>
                <p><strong>Run by:</strong> ${tournament.username}</p>
            `;

            // Show/hide edit tournament button
            if (currentUserId && tournament.user === String(currentUserId)) {
                editTournamentBtn.style.display = '';
            } else {
                editTournamentBtn.style.display = 'none';
            }

            // Players List
            if (Array.isArray(tournament.players) && tournament.players.length > 0) {
                // Sort players by points descending
                const sortedPlayers = [...tournament.players].sort((a, b) => {
                    const pointsA = typeof a === 'object' && a.points !== undefined ? a.points : 1000;
                    const pointsB = typeof b === 'object' && b.points !== undefined ? b.points : 1000;
                    return pointsB - pointsA;
                });

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

                playersTableContainer.innerHTML = `
                    <table class="player-table">
                        <tbody>
                            ${sortedPlayers.map((p, idx) => {
                                let editBtn = '';
                                let removeBtn = '';
                                if (currentUserId && tournament.user === String(currentUserId)) {
                                    editBtn = `<button class="edit-player-btn" data-player-name="${encodeURIComponent(p.name)}" data-player-deck="${encodeURIComponent(p.deck || '')}">Edit</button>`;
                                    removeBtn = `<button class="remove-player-btn" data-player-name="${encodeURIComponent(p.name)}">Remove</button>`;
                                }
                                const points = typeof p === 'object' && p.points !== undefined ? p.points : 1000;
                                return `<tr>
                                    <td class="player-position">${idx + 1}</td>
                                    <td class="player-name">${p.name}</td>
                                    <td class="player-points">${points} pts</td>
                                    <td class="player-deck">${p.deck ? `<a href="${p.deck}" target="_blank">Deck List</a>` : ''}</td>
                                    <td class="player-edit">${editBtn}</td>
                                    <td class="player-remove">${removeBtn}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                `;

                // Clear and rebuild playersList area
                playersList.innerHTML = '';
                playersList.appendChild(playersHeaderDiv);
                playersList.appendChild(playersTableContainer);
            } else {
                playersList.innerHTML = '<div style="padding:1em;">No players</div>';
            }

            // Show/hide add player button (move it outside the players check)
            // Only show if user is owner AND tournament has NOT started (no rounds)
            if (
                currentUserId &&
                tournament.user === String(currentUserId) &&
                (!Array.isArray(tournament.rounds) || tournament.rounds.length === 0)
            ) {
                addPlayerBtn.style.display = '';
                // Wrap the button in a div for centering
                let addPlayerBtnWrapper = document.createElement('div');
                addPlayerBtnWrapper.style.display = 'flex';
                addPlayerBtnWrapper.style.justifyContent = 'center';
                addPlayerBtnWrapper.style.marginTop = '10px';
                addPlayerBtnWrapper.appendChild(addPlayerBtn);
                playersList.appendChild(addPlayerBtnWrapper);
            } else {
                addPlayerBtn.style.display = 'none';
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
                        if (confirm('Are you sure you want to start the tournament? This will lock the tournament settings and you will not be able to edit the tournament name, date, or player list.')) {
                            try {
                                const res = await fetch(`/api/tournament/${tournamentId}/nextRound`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: currentUserId })
                                });
                                const data = await res.json();
                                if (data.success) {
                                    renderTournament();
                                } else {
                                    alert(data.error || 'Failed to start tournament.');
                                }
                            } catch (err) {
                                alert('Failed to start tournament.');
                            }
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

                    // Collapsible logic
                    let collapsed = false;
                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'round-header';
                    headerDiv.style.position = 'relative'; // Ensure positioning context

                    const toggleBtn = document.createElement('button');
                    toggleBtn.className = 'round-toggle-btn';
                    toggleBtn.innerHTML = '&#9660;';

                    const title = document.createElement('h2');
                    title.textContent = `Round ${round.round}`;
                    title.style.margin = 0;

                    headerDiv.appendChild(toggleBtn);
                    headerDiv.appendChild(title);

                    // Add "Cancel Round" button if this is the last round and user is owner
                    if (
                        currentUserId &&
                        tournament.user === String(currentUserId) &&
                        roundIdx === tournament.rounds.length - 1
                    ) {
                        const cancelBtn = document.createElement('button');
                        cancelBtn.className = 'cancel-round-btn';
                        cancelBtn.textContent = 'Cancel Round';
                        cancelBtn.style.zIndex = 2; // Ensure it's above other elements
                        headerDiv.appendChild(cancelBtn); // <-- append to headerDiv, not roundDiv
                        cancelBtn.onclick = async function () {
                            if (confirm('Are you sure you want to cancel this round? This will remove all data for this round.')) {
                                try {
                                    const res = await fetch(`/api/tournament/${tournamentId}/cancelRound`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ userId: currentUserId, round: round.round })
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                        renderTournament();
                                    } else {
                                        alert(data.error || 'Failed to cancel round.');
                                    }
                                } catch (err) {
                                    alert('Failed to cancel round.');
                                }
                            }
                        };
                    }

                    // Pods/results container
                    const podsContainer = document.createElement('div');
                    podsContainer.className = 'pods-container';

                    round.pods.forEach((pod, podIdx) => {
                        const podDiv = document.createElement('div');
                        podDiv.className = 'pod';

                        // Build a 2x2 grid for seats (show only filled seats)
                        let gridHtml = '<div class="pod-seat-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">';
                        for (let seatIdx = 0; seatIdx < 4; seatIdx++) {
                            const player = pod.players[seatIdx];
                            if (!player) continue; // Skip empty seats
                            const seatLabel = `Seat ${seatIdx + 1}`;
                            gridHtml += `<div class="pod-seat" style="border: 1px solid #ccc; border-radius: 4px; padding: 6px; min-width: 80px; min-height: 32px; background: #f9f9f9;">
                                <strong>${seatLabel}:</strong> ${typeof player === 'object' ? player.name : player}
                            </div>`;
                        }
                        gridHtml += '</div>';

                        podDiv.innerHTML = `
                          <h3>${pod.label ? pod.label : `Pod ${podIdx + 1}`}</h3>
                          ${gridHtml}
                          <p>Result: ${pod.result}${pod.winner ? ` (Winner: ${pod.winner})` : ''}</p>
                        `;
                        podsContainer.appendChild(podDiv);
                    });

                    // Toggle logic
                    toggleBtn.onclick = function () {
                        collapsed = !collapsed;
                        podsContainer.style.display = collapsed ? 'none' : 'flex';
                        toggleBtn.innerHTML = collapsed ? '&#9654;' : '&#9660;';
                    };

                    roundDiv.appendChild(headerDiv);
                    roundDiv.appendChild(podsContainer);
                    roundsContainer.appendChild(roundDiv);
                });
            }

            // --- Button Logic ---

            // Edit Tournament
            if (currentUserId && tournament.user === String(currentUserId)) {
                editTournamentBtn.onclick = function() {
                    editTournamentModal.style.display = 'block';
                    document.getElementById('edit-tournament-error').innerText = '';
                    document.getElementById('edit-tournament-name-input').value = tournament.title;
                    document.getElementById('edit-tournament-date-input').value = tournament.date ? tournament.date.split('T')[0] : '';
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
                    if (!newTitle || !newDate) {
                        document.getElementById('edit-tournament-error').innerText = 'Please enter a name and date.';
                        return;
                    }
                    try {
                        const res = await fetch(`/api/tournament/${tournamentId}/edit`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: currentUserId, title: newTitle, date: newDate })
                        });
                        const data = await res.json();
                        if (data.success) {
                            editTournamentModal.style.display = 'none';
                            renderTournament();
                        } else {
                            document.getElementById('edit-tournament-error').innerText = data.error || 'Failed to edit tournament.';
                        }
                    } catch (err) {
                        document.getElementById('edit-tournament-error').innerText = 'Failed to edit tournament.';
                    }
                };
            }

            // Add Player
            if (currentUserId && tournament.user === String(currentUserId)) {
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
                            renderTournament();
                        } else {
                            document.getElementById('add-player-error').innerText = data.error || 'Failed to add player.';
                        }
                    } catch (err) {
                        document.getElementById('add-player-error').innerText = 'Failed to add player.';
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
                        if (!confirm(`Remove player "${playerName}"?`)) return;
                        try {
                            const res = await fetch(`/api/tournament/${tournamentId}/remove-player`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: currentUserId, playerName })
                            });
                            const data = await res.json();
                            if (data.success) {
                                renderTournament();
                            } else {
                                alert(data.error || 'Failed to remove player.');
                            }
                        } catch (err) {
                            alert('Failed to remove player.');
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
                            renderTournament();
                        } else {
                            document.getElementById('edit-player-error').innerText = data.error || 'Failed to edit player.';
                        }
                    } catch (err) {
                        document.getElementById('edit-player-error').innerText = 'Failed to edit player.';
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

                // Build dropped players table (same style as players table)
                const droppedTableContainer = document.createElement('div');
                droppedTableContainer.style.marginBottom = '1em';
                droppedTableContainer.innerHTML = `
                    <table class="player-table">
                        <tbody>
                            ${tournament.droppedPlayers.map((p, idx) => {
                                const player = typeof p === 'object' ? p : { name: p, points: 1000, deck: '' };
                                let undropBtn = '';
                                if (
                                    currentUserId &&
                                    tournament.user === String(currentUserId) &&
                                    (!Array.isArray(tournament.rounds) || tournament.rounds.length === 0 || !tournament.ended)
                                ) {
                                    undropBtn = `<button class="undrop-player-btn" data-player-name="${encodeURIComponent(player.name)}">Undrop</button>`;
                                }
                                const points = player.points !== undefined ? player.points : 1000;
                                return `<tr>
                                    <td class="player-position">${idx + 1}</td>
                                    <td class="player-name">${player.name}</td>
                                    <td class="player-points">${points} pts</td>
                                    <td class="player-deck">${player.deck ? `<a href="${player.deck}" target="_blank">Deck List</a>` : ''}</td>
                                    <td class="player-edit"></td>
                                    <td class="player-remove">${undropBtn}</td>
                                </tr>`;
                            }).join('')}
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
                                renderTournament();
                            } else {
                                alert(data.error || 'Failed to undrop player.');
                            }
                        } catch (err) {
                            alert('Failed to undrop player.');
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
                tournament.rounds.length > 0
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
                            if (!confirm(`Drop player "${playerName}" from the tournament?`)) return;
                            try {
                                const res = await fetch(`/api/tournament/${tournamentId}/drop-player`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: currentUserId, playerName })
                                });
                                const data = await res.json();
                                if (data.success) {
                                    renderTournament();
                                } else {
                                    alert(data.error || 'Failed to drop player.');
                                }
                            } catch (err) {
                                alert('Failed to drop player.');
                            }
                        };
                        dropCell.appendChild(dropBtn);
                        row.appendChild(dropCell);
                    }
                });
            }

            // --- NEXT ROUND BUTTON ---
            // Show "Next Round" button after the last round if user is owner
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

                const nextRoundBtn = document.createElement('button');
                nextRoundBtn.textContent = 'Next Round';
                nextRoundBtn.className = 'next-round-btn';
                nextRoundBtn.onclick = async function () {
                    if (confirm('Start the next round?')) {
                        try {
                            const res = await fetch(`/api/tournament/${tournamentId}/nextRound`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: currentUserId })
                            });
                            const data = await res.json();
                            if (data.success) {
                                renderTournament();
                            } else {
                                alert(data.error || 'Failed to start next round.');
                            }
                        } catch (err) {
                            alert('Failed to start next round.');
                        }
                    }
                };
                nextRoundBtnWrapper.appendChild(nextRoundBtn);
                roundsContainer.appendChild(nextRoundBtnWrapper);
            }
        } catch (err) {
            if (infoDiv) infoDiv.innerHTML = '<h2>Error loading tournament data.</h2>';
        }
    }

    renderTournament();
});