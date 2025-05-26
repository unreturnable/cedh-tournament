document.addEventListener('DOMContentLoaded', async () => {
    // Get tournament ID from URL (/tournament/<id>)
    const match = window.location.pathname.match(/\/tournament\/([^\/]+)/);
    const tournamentId = match ? match[1] : null;

    const infoDiv = document.getElementById('tournament-info');
    if (!tournamentId) {
        if (infoDiv) infoDiv.innerHTML = '<h2>Invalid tournament ID.</h2>';
        return;
    }

    try {
        const res = await fetch(`/api/tournament/${tournamentId}`);
        if (!res.ok) {
            if (infoDiv) infoDiv.innerHTML = '<h2>Tournament not found.</h2>';
            return;
        }
        const tournament = await res.json();
        if (infoDiv) {
            infoDiv.innerHTML = `
                <h1>${tournament.title}</h1>
                <p><strong>Date:</strong> ${tournament.date ? new Date(tournament.date).toLocaleString() : 'Unknown'}</p>
                <p><strong>Run by:</strong> ${tournament.username}</p>
                <h3>Players:</h3>
                <ul>
                    ${Array.isArray(tournament.players) && tournament.players.length > 0
                        ? tournament.players.map(p => `<li>${p}</li>`).join('')
                        : '<li>No players</li>'}
                </ul>
                <div id="rounds-container"></div>
            `;
        }

        // Rounds data
        const container = document.getElementById('rounds-container');
        container.innerHTML = ''; // Clear previous content

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
                    ${pod.players.map(player => `<li>${player}</li>`).join('')}
                  </ul>
                  <p>Result: ${pod.result}${pod.winner ? ` (Winner: ${pod.winner})` : ''}</p>
                `;
                roundDiv.appendChild(podDiv);
            });

            container.appendChild(roundDiv);
        });
    } catch (err) {
        if (infoDiv) infoDiv.innerHTML = '<h2>Error loading tournament data.</h2>';
    }
});