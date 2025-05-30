const { request } = require('undici');
const express = require('express');
const cors = require('cors');
const { JsonDB, Config } = require('node-json-db'); // Add this line
const { clientId, clientSecret, protocol, host, port, redirect } = require('./config.json');
const { v4: uuidv4 } = require('uuid'); // Add at the top: npm install uuid

// Initialize the database
const db = new JsonDB(new Config("tournaments", true, false, '/')); // DB file: tournaments.json

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('client'));

app.get('/', (req, res) => {
    return res.sendFile('index.html', { root: './client/' });
});

app.get('/tournament/:id', (req, res) => {
    return res.sendFile('tournament.html', { root: './client/' });
});

// OAuth2 callback endpoint
app.get('/oauth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');

    let redirectUri = !redirect ? `${protocol}://${host}:${port}/oauth/callback` : `${protocol}://${host}/oauth/callback`

    try {
        const tokenResponseData = await request('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
                scope: 'identify',
            }).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const oauthData = await tokenResponseData.body.json();
        // Send tokens to client (in real apps, use httpOnly cookies for security)
        return res.redirect(`/?access_token=${oauthData.access_token}&token_type=${oauthData.token_type}`);
    } catch (error) {
        console.error(error);
        return res.status(500).send('OAuth error');
    }
});

// Endpoint to get user info from Discord using access token
app.post('/api/userinfo', async (req, res) => {
    const { access_token, token_type } = req.body;
    if (!access_token || !token_type) return res.status(400).json({ error: 'Missing token' });

    try {
        const userResult = await request('https://discord.com/api/users/@me', {
            headers: {
                authorization: `${token_type} ${access_token}`,
            },
        });
        const userData = await userResult.body.json();
        if (userData.id) {
            return res.json(userData);
        } else {
            return res.status(401).json({ error: 'Invalid token' });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to fetch user info' });
    }
});

// Get tournaments for a user
app.post('/api/tournaments', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        // Get all tournament ids
        const allIds = await db.getData('/'); // returns an object with ids as keys
        const userTournaments = Object.values(allIds).filter(t => t.user === String(userId));
        return res.json(userTournaments);
    } catch (error) {
        return res.json([]);
    }
});

// Get a tournament by id
app.get('/api/tournament/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const tournament = await db.getData(`/${id}`);
        return res.json(tournament);
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Create a new tournament
app.post('/api/tournament', async (req, res) => {
    const { userId, username, title, date } = req.body;
    if (!userId || !title || !date) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const id = uuidv4();
    const tournament = {
        id,
        user: String(userId),
        username: username || '',
        title,
        date,
        players: [],
        rounds: []
    };
    try {
        await db.push(`/${id}`, tournament, true);
        return res.json({ success: true, id, tournament });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to create tournament' });
    }
});

// Delete a tournament by id (only if user owns it)
app.delete('/api/tournament/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized to delete this tournament' });
        }
        await db.delete(`/${id}`);
        return res.json({ success: true });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Add a player to a tournament (only if user owns it)
app.post('/api/tournament/:id/add-player', async (req, res) => {
    const { id } = req.params;
    const { userId, playerName, deckLink } = req.body;
    if (!userId || !playerName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized to add players to this tournament' });
        }
        if (!Array.isArray(tournament.players)) tournament.players = [];
        tournament.players.push({ name: playerName, deck: deckLink || '' });
        await db.push(`/${id}/players`, tournament.players, true);
        return res.json({ success: true, players: tournament.players });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Remove a player from a tournament (only if user owns it)
app.post('/api/tournament/:id/remove-player', async (req, res) => {
    const { id } = req.params;
    const { userId, playerName } = req.body;
    if (!userId || !playerName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized to remove players from this tournament' });
        }
        if (!Array.isArray(tournament.players)) tournament.players = [];
        const initialLength = tournament.players.length;
        tournament.players = tournament.players.filter(p => p.name !== playerName);
        if (tournament.players.length === initialLength) {
            return res.status(404).json({ error: 'Player not found' });
        }
        await db.push(`/${id}/players`, tournament.players, true);
        return res.json({ success: true, players: tournament.players });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Edit a player in a tournament (only if user owns it)
app.post('/api/tournament/:id/edit-player', async (req, res) => {
    const { id } = req.params;
    const { userId, oldName, newName, newDeck } = req.body;
    if (!userId || !oldName || !newName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized to edit players in this tournament' });
        }
        if (!Array.isArray(tournament.players)) tournament.players = [];
        const player = tournament.players.find(p => p.name === oldName);
        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }
        player.name = newName;
        player.deck = newDeck || '';
        await db.push(`/${id}/players`, tournament.players, true);
        return res.json({ success: true, players: tournament.players });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Edit tournament details (only if user owns it)
app.post('/api/tournament/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { userId, title, date } = req.body;
    if (!userId || !title || !date) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized to edit this tournament' });
        }
        tournament.title = title;
        tournament.date = date;
        await db.push(`/${id}`, tournament, true);
        return res.json({ success: true, tournament });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

/**
 * Split an array of player names into pods:
 * - Maximise the number of 4 pods
 * - If the remaining players after all 4 pods are created totals 3, put them in a 3 pod
 * - Any other remaining players are put into a two pod or left on their own
 * @param {string[]} playerNames
 * @returns {string[][]} Array of pods (arrays of player names)
 */
function splitPods(playerNames) {
    const shuffled = [...playerNames].sort(() => Math.random() - 0.5);
    const pods = [];
    let i = 0;
    const n = shuffled.length;
    let podNumber = 1;

    let numFours = Math.floor(n / 4);

    for (let j = 0; j < numFours; j++) {
        pods.push({
            label: `Pod ${podNumber++}`,
            players: shuffled.slice(i, i + 4)
        });
        i += 4;
    }

    const remaining = n - i;
    if (remaining === 3) {
        pods.push({
            label: `Pod ${podNumber++}`,
            players: shuffled.slice(i, i + 3)
        });
        i += 3;
    } else if (remaining === 2) {
        pods.push({
            label: 'Bye',
            result: 'bye',
            players: shuffled.slice(i, i + 2)
        });
        i += 2;
    } else if (remaining === 1) {
        pods.push({
            label: 'Bye',
            result: 'bye',
            players: [shuffled[i]]
        });
        i += 1;
    }

    return pods;
}

// Create the next round for a tournament (only if user owns it)
app.post('/api/tournament/:id/nextRound', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized to create a round for this tournament' });
        }
        if (!Array.isArray(tournament.players) || tournament.players.length < 3) {
            return res.status(400).json({ error: 'Not enough players to create a round' });
        }
        if (!Array.isArray(tournament.rounds)) tournament.rounds = [];

        // --- Prevent next round if not all pod results are reported ---
        if (tournament.rounds.length > 0) {
            const lastRound = tournament.rounds[tournament.rounds.length - 1];
            const unreported = (lastRound.pods || []).some(
                pod => pod.label !== 'Bye' && !pod.result
            );
            if (unreported) {
                return res.status(400).json({ error: 'All pod results must be reported before starting the next round.' });
            }
        }

        // --- Create new round ---
        const pods = splitPods(tournament.players.map(p => typeof p === 'object' ? p.name : p));
        const roundNumber = tournament.rounds.length + 1;
        const roundData = {
            round: roundNumber,
            pods: pods.map(pod => ({
                players: pod.players,
                label: pod.label,
                result: pod.result || '',
                winner: ''
            })),
            pointsChanges: []
        };

        // --- Apply points for previous round ---
        if (tournament.rounds.length > 0) {
            const prevRound = tournament.rounds[tournament.rounds.length - 1];
            if (!prevRound.pointsChanges) prevRound.pointsChanges = [];
            // Map player names to player objects
            const playerMap = {};
            tournament.players.forEach(p => { playerMap[p.name] = p; });
            // Also include droppedPlayers for points changes
            if (Array.isArray(tournament.droppedPlayers)) {
                tournament.droppedPlayers.forEach(p => { playerMap[p.name] = p; });
            }
            // Apply pod results
            prevRound.pods.forEach(pod => {
                if (pod.label === 'Bye') {
                    // Bye: +5% points
                    (pod.players || []).forEach(name => {
                        const p = playerMap[name];
                        if (!p) return;
                        const change = Math.round(p.points * 0.05);
                        roundData.pointsChanges.push({ name, change });
                        p.points = (p.points || 1000) + change;
                    });
                    pod.result = 'bye';
                } else if (pod.result === 'win' && pod.winner) {
                    // Winner steals 10% of each other player's points
                    let totalStolen = 0;
                    (pod.players || []).forEach(name => {
                        if (name === pod.winner) return;
                        const p = playerMap[name];
                        if (!p) return;
                        const loss = Math.round((p.points || 1000) * 0.10);
                        roundData.pointsChanges.push({ name, change: -loss });
                        p.points = (p.points || 1000) - loss;
                        totalStolen += loss;
                    });
                    const winnerObj = playerMap[pod.winner];
                    if (winnerObj) {
                        roundData.pointsChanges.push({ name: pod.winner, change: totalStolen });
                        winnerObj.points = (winnerObj.points || 1000) + totalStolen;
                    }
                } else if (pod.result === 'draw') {
                    // All lose 5%
                    (pod.players || []).forEach(name => {
                        const p = playerMap[name];
                        if (!p) return;
                        const loss = Math.round((p.points || 1000) * 0.05);
                        roundData.pointsChanges.push({ name, change: -loss });
                        p.points = (p.points || 1000) - loss;
                    });
                }
            });
        }

        // Deduct 5% from each dropped player for this round
        if (Array.isArray(tournament.droppedPlayers)) {
            tournament.droppedPlayers.forEach(p => {
                const loss = Math.round((p.points || 1000) * 0.05);
                roundData.pointsChanges.push({ name: p.name, change: -loss, dropped: true });
                p.points = (p.points || 1000) - loss;
            });
        }

        tournament.rounds.push(roundData);
        await db.push(`/${id}`, tournament, true);

        return res.json({ success: true, round: roundData, rounds: tournament.rounds });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Cancel the last round for a tournament (only if user owns it and it's the last round)
app.post('/api/tournament/:id/cancelRound', async (req, res) => {
    const { id } = req.params;
    const { userId, round } = req.body;
    if (!userId || !round) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized to cancel a round for this tournament' });
        }
        if (!Array.isArray(tournament.rounds) || tournament.rounds.length === 0) {
            return res.status(400).json({ error: 'No rounds to cancel' });
        }
        const lastRound = tournament.rounds[tournament.rounds.length - 1];
        if (String(lastRound.round) !== String(round)) {
            return res.status(400).json({ error: 'Only the lastest round can be cancelled' });
        }
        // Revert points using pointsChanges
        if (lastRound.pointsChanges && lastRound.pointsChanges.length > 0) {
            // Map player names to player objects
            const playerMap = {};
            if (Array.isArray(tournament.players)) {
                tournament.players.forEach(p => { playerMap[p.name] = p; });
            }
            if (Array.isArray(tournament.droppedPlayers)) {
                tournament.droppedPlayers.forEach(p => { playerMap[p.name] = p; });
            }
            lastRound.pointsChanges.forEach(change => {
                const p = playerMap[change.name];
                if (p) {
                    p.points = (p.points || 1000) - change.change;
                }
            });
        }
        tournament.rounds.pop();
        await db.push(`/${id}`, tournament, true);
        return res.json({ success: true, rounds: tournament.rounds });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Drop a player from a tournament (move to droppedPlayers, only if user owns it and tournament started)
app.post('/api/tournament/:id/drop-player', async (req, res) => {
    const { id } = req.params;
    const { userId, playerName } = req.body;
    if (!userId || !playerName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized to drop players from this tournament' });
        }
        // Tournament must have started (at least one round)
        if (!Array.isArray(tournament.rounds) || tournament.rounds.length === 0) {
            return res.status(400).json({ error: 'Cannot drop players before tournament starts' });
        }
        if (!Array.isArray(tournament.players)) tournament.players = [];
        if (!Array.isArray(tournament.droppedPlayers)) tournament.droppedPlayers = [];
        const idx = tournament.players.findIndex(p => p.name === playerName);
        if (idx === -1) {
            return res.status(404).json({ error: 'Player not found' });
        }
        // Move player to droppedPlayers
        const [player] = tournament.players.splice(idx, 1);
        tournament.droppedPlayers.push(player);

        await db.push(`/${id}/players`, tournament.players, true);
        await db.push(`/${id}/droppedPlayers`, tournament.droppedPlayers, true);

        return res.json({ success: true, players: tournament.players, droppedPlayers: tournament.droppedPlayers, rounds: tournament.rounds });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Undrop a player (move from droppedPlayers back to players, only if user owns it)
app.post('/api/tournament/:id/undrop-player', async (req, res) => {
    const { id } = req.params;
    const { userId, playerName } = req.body;
    if (!userId || !playerName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized to undrop players in this tournament' });
        }
        if (!Array.isArray(tournament.droppedPlayers)) tournament.droppedPlayers = [];
        if (!Array.isArray(tournament.players)) tournament.players = [];
        const idx = tournament.droppedPlayers.findIndex(p => p.name === playerName);
        if (idx === -1) {
            return res.status(404).json({ error: 'Player not found in dropped list' });
        }
        // Move player back to players
        const [player] = tournament.droppedPlayers.splice(idx, 1);
        tournament.players.push(player);

        await db.push(`/${id}/players`, tournament.players, true);
        await db.push(`/${id}/droppedPlayers`, tournament.droppedPlayers, true);

        return res.json({ success: true, players: tournament.players, droppedPlayers: tournament.droppedPlayers, rounds: tournament.rounds });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Report pod result (win/draw)
app.post('/api/tournament/:id/report-pod-result', async (req, res) => {
    const { id } = req.params;
    const { userId, round, podIdx, result, winner } = req.body;
    if (!userId || !round || podIdx === undefined || !result) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        if (!Array.isArray(tournament.rounds)) return res.status(400).json({ error: 'No rounds' });
        const roundObj = tournament.rounds.find(r => String(r.round) === String(round));
        if (!roundObj) return res.status(404).json({ error: 'Round not found' });
        const pod = roundObj.pods[podIdx];
        if (!pod || pod.label === 'Bye') return res.status(400).json({ error: 'Invalid pod' });
        if (pod.result) return res.status(400).json({ error: 'Result already reported' });

        if (result === 'win') {
            if (!winner) return res.status(400).json({ error: 'Missing winner' });
            pod.result = 'win';
            pod.winner = winner;
        } else if (result === 'draw') {
            pod.result = 'draw';
            pod.winner = '';
        } else {
            return res.status(400).json({ error: 'Invalid result' });
        }
        await db.push(`/${id}/rounds`, tournament.rounds, true);
        return res.json({ success: true, pod });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

// Undo pod result (only for current round and owner)
app.post('/api/tournament/:id/undo-pod-result', async (req, res) => {
    const { id } = req.params;
    const { userId, round, podIdx } = req.body;
    if (!userId || round === undefined || podIdx === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const tournament = await db.getData(`/${id}`);
        if (tournament.user !== String(userId)) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        if (!Array.isArray(tournament.rounds)) return res.status(400).json({ error: 'No rounds' });
        const roundObj = tournament.rounds.find(r => String(r.round) === String(round));
        if (!roundObj) return res.status(404).json({ error: 'Round not found' });
        const pod = roundObj.pods[podIdx];
        if (!pod || pod.label === 'Bye') return res.status(400).json({ error: 'Invalid pod' });
        if (!pod.result) return res.status(400).json({ error: 'No result to undo' });

        pod.result = '';
        pod.winner = '';
        await db.push(`/${id}/rounds`, tournament.rounds, true);
        return res.json({ success: true, pod });
    } catch (error) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
});

app.listen(port, () => console.log(`App listening at ${protocol}://${host}:${port}`));