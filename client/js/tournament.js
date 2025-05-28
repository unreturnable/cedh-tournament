const tokenData = {
    access_token: localStorage.getItem('discord_access_token'),
    token_type: localStorage.getItem('discord_token_type')
};
let currentUserId = null;

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

                playersList.innerHTML = `
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
                                    <td class="player-deck">${p.deck ? `<a href="${p.deck}" target="_blank">deck</a>` : ''}</td>
                                    <td class="player-edit">${editBtn}</td>
                                    <td class="player-remove">${removeBtn}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            } else {
                playersList.innerHTML = '<div style="padding:1em;">No players</div>';
            }

            // Show/hide add player button
            if (currentUserId && tournament.user === String(currentUserId)) {
                addPlayerBtn.style.display = '';
            } else {
                addPlayerBtn.style.display = 'none';
            }

            // Rounds
            roundsContainer.innerHTML = '';
            tournament.rounds.forEach((round, roundIdx) => {
                const roundDiv = document.createElement('div');
                roundDiv.className = 'round';
                roundDiv.innerHTML = `<h2>Round ${round.round}</h2>`;
                round.pods.forEach((pod, podIdx) => {
                    const podDiv = document.createElement('div');
                    podDiv.className = 'pod';
                    podDiv.innerHTML = `
                      <h3>Pod ${podIdx + 1}</h3>
                      <ul>
                        ${pod.players.map(player => `<li>${typeof player === 'object' ? player.name : player}</li>`).join('')}
                      </ul>
                      <p>Result: ${pod.result}${pod.winner ? ` (Winner: ${pod.winner})` : ''}</p>
                    `;
                    roundDiv.appendChild(podDiv);
                });
                roundsContainer.appendChild(roundDiv);
            });

            // --- Button Logic ---

            // Edit Tournament
            if (currentUserId && tournament.user === String(currentUserId)) {
                editTournamentBtn.onclick = function() {
                    editTournamentModal.style.display = 'block';
                    document.getElementById('edit-tournament-error').innerText = '';
                    document.getElementById('edit-tournament-name-input').value = tournament.title;
                    document.getElementById('edit-tournament-date-input').value = tournament.date ? tournament.date.split('T')[0] : '';
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
            if (currentUserId && tournament.user === String(currentUserId)) {
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
            }

            // Edit Player
            if (currentUserId && tournament.user === String(currentUserId)) {
                playersList.querySelectorAll('.edit-player-btn').forEach(btn => {
                    btn.onclick = function() {
                        editingOldName = decodeURIComponent(btn.getAttribute('data-player-name'));
                        const deck = decodeURIComponent(btn.getAttribute('data-player-deck'));
                        document.getElementById('edit-player-name-input').value = editingOldName;
                        document.getElementById('edit-deck-link-input').value = deck;
                        editPlayerModal.style.display = 'block';
                        document.getElementById('edit-player-error').innerText = '';
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
            }
        } catch (err) {
            if (infoDiv) infoDiv.innerHTML = '<h2>Error loading tournament data.</h2>';
        }
    }

    renderTournament();
});