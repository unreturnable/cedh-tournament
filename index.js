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

app.listen(port, () => console.log(`App listening at ${protocol}://${host}:${port}`));