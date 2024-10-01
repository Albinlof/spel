const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
let lobbies = {};  // Hantera lobbies med lobbykod som nyckel

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('En spelare anslöt:', socket.id);

    // Anslutning till lobby
    socket.on('joinLobby', ({ playerName, lobbyCode }) => {
        if (!lobbies[lobbyCode]) {
            lobbies[lobbyCode] = { players: [], gameStarted: false, mafiaVotes: {}, dayVotes: {}, mafiaMembers: [] };
        }

        if (lobbies[lobbyCode].players.length < 6) {
            const newPlayer = { name: playerName, socketId: socket.id, role: '', eliminated: false };
            lobbies[lobbyCode].players.push(newPlayer);
            socket.join(lobbyCode);

            socket.emit('playerRegistered', playerName);
            io.to(lobbyCode).emit('updatePlayerList', lobbies[lobbyCode].players);

            if (lobbies[lobbyCode].players.length === 4) {
                assignRoles(lobbyCode);
            }
        } else {
            socket.emit('maxPlayersReached');
        }
    });

    // Starta spelet
    socket.on('startGame', (lobbyCode) => {
        if (!lobbies[lobbyCode].gameStarted && lobbies[lobbyCode].players.length >= 4) {
            lobbies[lobbyCode].gameStarted = true;
            io.to(lobbyCode).emit('gameStarted');
            io.to(lobbyCode).emit('nightPhase');
        }
    });

    // Maffian väljer ett offer
    socket.on('mafiaVote', ({ victim, lobbyCode }) => {
        if (lobbies[lobbyCode]) {
            lobbies[lobbyCode].mafiaVotes[socket.id] = victim;

            // Uppdatera alla mafia-medlemmar om valet
            const mafiaChoices = Object.values(lobbies[lobbyCode].mafiaVotes);
            lobbies[lobbyCode].mafiaMembers.forEach(member => {
                io.to(member.socketId).emit('updateMafiaChoices', mafiaChoices);
            });

            if (mafiaChoices.length === lobbies[lobbyCode].mafiaMembers.length) {
                const chosenVictim = mafiaChoices[0]; // Välj det första valet
                eliminatePlayer(lobbyCode, chosenVictim); // Eliminera spelaren
                io.to(lobbyCode).emit('dayPhase', chosenVictim);
                lobbies[lobbyCode].mafiaVotes = {};  // Nollställ röster
            }
        }
    });

    // Spelarna röstar under dagfasen
    socket.on('dayVote', ({ suspect, lobbyCode }) => {
        if (lobbies[lobbyCode]) {
            lobbies[lobbyCode].dayVotes[socket.id] = suspect;

            // Räkna antal röster på varje spelare
            const votesCount = {};
            Object.values(lobbies[lobbyCode].dayVotes).forEach(vote => {
                votesCount[vote] = (votesCount[vote] || 0) + 1;
            });

            // Om alla spelare har röstat
            if (Object.keys(lobbies[lobbyCode].dayVotes).length === lobbies[lobbyCode].players.filter(p => !p.eliminated).length) {
                let maxVotes = 0;
                let playerToEliminate = null;

                for (const [player, count] of Object.entries(votesCount)) {
                    if (count > maxVotes) {
                        maxVotes = count;
                        playerToEliminate = player;
                    }
                }

                if (playerToEliminate) {
                    eliminatePlayer(lobbyCode, playerToEliminate); // Eliminera spelaren
                    io.to(lobbyCode).emit('playerEliminated', playerToEliminate);

                    // Kontrollera om spelet är över eller om vi ska börja en ny nattfas
                    if (checkGameEnd(lobbyCode)) {
                        io.to(lobbyCode).emit('gameEnded', getGameResult(lobbyCode));
                    } else {
                        io.to(lobbyCode).emit('nightPhase'); // Starta ny nattfas om spelet inte är över
                    }
                }
                lobbies[lobbyCode].dayVotes = {};  // Nollställ röster
            }
        }
    });

    // Hantera bortkoppling
    socket.on('disconnect', () => {
        for (const lobbyCode in lobbies) {
            lobbies[lobbyCode].players = lobbies[lobbyCode].players.filter(player => player.socketId !== socket.id);
            io.to(lobbyCode).emit('updatePlayerList', lobbies[lobbyCode].players);
        }
    });
});

// Tilldela roller
function assignRoles(lobbyCode) {
    const roles = ["Mafia", "Bybo", "Bybo", "Bybo"];
    shuffleArray(roles);
    lobbies[lobbyCode].players.forEach((player, index) => {
        player.role = roles[index];
        io.to(player.socketId).emit('roleAssigned', player.role);
        
        if (roles[index] === "Mafia") {
            lobbies[lobbyCode].mafiaMembers.push(player);
        }
    });
}

// Blanda arrayen (för roller)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Eliminera en spelare från spelet
function eliminatePlayer(lobbyCode, playerName) {
    const player = lobbies[lobbyCode].players.find(p => p.name === playerName);
    if (player) {
        player.eliminated = true;  // Markera spelaren som eliminerad
        io.to(player.socketId).emit('eliminated', playerName);  // Meddela spelaren att de är ute ur spelet
    }
}

// Kontrollera om spelet är över
function checkGameEnd(lobbyCode) {
    const remainingPlayers = lobbies[lobbyCode].players.filter(p => !p.eliminated);
    const remainingMafia = remainingPlayers.filter(p => p.role === "Mafia");
    return remainingMafia.length === 0 || remainingPlayers.length <= 2;  // Sluta om alla maffior är borta eller om 2 spelare kvarstår
}

// Bestäm vinnaren och skicka meddelande
function getGameResult(lobbyCode) {
    const remainingPlayers = lobbies[lobbyCode].players.filter(p => !p.eliminated);
    const remainingMafia = remainingPlayers.filter(p => p.role === "Mafia");
    if (remainingMafia.length === 0) {
        return "Byborna har vunnit! Alla maffior är eliminerade.";
    } else if (remainingPlayers.length <= 2) {
        return "Maffian har vunnit! Maffian har uppnått numerär överlägsenhet.";
    }
}
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servern körs på http://0.0.0.0:${PORT}`);
});