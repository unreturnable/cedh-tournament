const { request } = require('undici');
const express = require('express');
const cors = require('cors');
const { clientId, clientSecret, protocol, host, port, redirect } = require('./config.json');

const tournamentData = [
	{
		id: "1234-5678-9101",
		user: "177871115555831810",
		title: "Super cool tournament",
        date: "2025-06-20T12:30:00+01:00",
	}
];

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

app.post('/api/tournaments', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const userTournaments = tournamentData.filter(t => t.user === String(userId));
    return res.json(userTournaments);
});

app.get('/api/tournament/:id', (req, res) => {
    const { id } = req.params;
    const tournament = tournamentData.find(t => t.id === id);
    if (!tournament) {
        return res.status(404).json({ error: 'Tournament not found' });
    }
    return res.json(tournament);
});

app.listen(port, () => console.log(`App listening at ${protocol}://${host}:${port}`));