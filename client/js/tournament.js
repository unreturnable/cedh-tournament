document.addEventListener('DOMContentLoaded', async () => {
    // Get tournament ID from URL (/tournament/<id>)
    const match = window.location.pathname.match(/\/tournament\/([^\/]+)/);
    console.log(match);
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
                <p><strong>ID:</strong> ${tournament.id}</p>
                <p><strong>User ID:</strong> ${tournament.user}</p>
            `;
        }
    } catch (err) {
        if (infoDiv) infoDiv.innerHTML = '<h2>Error loading tournament data.</h2>';
    }
});