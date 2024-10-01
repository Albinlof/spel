const socket = io();
let playerRole = '';
let isMafia = false;
let lobbyCode = '';
let players = [];
let eliminated = false;  // Håll reda på om spelaren är ute ur spelet

// UI-element
const statusDiv = document.getElementById('status');
const playerListDiv = document.getElementById('playerList');
const startGameBtn = document.getElementById('startGameBtn');
const gameBoard = document.getElementById('gameBoard');
const lobbyForm = document.getElementById('lobbyForm');
const playerNameInput = document.getElementById('playerNameInput');
const lobbyCodeInput = document.getElementById('lobbyCodeInput');
const joinLobbyBtn = document.getElementById('joinLobbyBtn');
const roleImage = document.getElementById('roleImage');
const phaseTitle = document.getElementById('phaseTitle');
const instructions = document.getElementById('instructions');
const mafiaChoicesDiv = document.createElement('div');
mafiaChoicesDiv.id = 'mafiaChoices';
gameBoard.appendChild(mafiaChoicesDiv);

// Anslut till en lobby
joinLobbyBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    lobbyCode = lobbyCodeInput.value;
    if (playerName && lobbyCode) {
        socket.emit('joinLobby', { playerName, lobbyCode });
        lobbyForm.style.display = 'none';
    }
});

// När spelaren registreras
socket.on('playerRegistered', (playerName) => {
    statusDiv.innerHTML = `Välkommen, ${playerName}! Väntar på fler spelare...`;
});

// Visa spelarens roll
socket.on('roleAssigned', (role) => {
    playerRole = role;
    statusDiv.innerHTML = `Din roll är: ${role}`;
    let roleImageUrl = '';
    if (role === 'Mafia') {
        roleImageUrl = '/images/Mafia.png';
        isMafia = true;
    } else if (role === 'Bybo') {
        roleImageUrl = '/images/villager.png';
    }
    roleImage.innerHTML = `<img src="${roleImageUrl}" alt="${role}">`;
    gameBoard.style.display = 'block';
});

// Starta spelet
startGameBtn.addEventListener('click', () => {
    socket.emit('startGame', lobbyCode);
});

// Hantera nattfasen
socket.on('nightPhase', () => {
    if (!eliminated) {
        phaseTitle.innerHTML = 'Nattfas';
        instructions.innerHTML = 'Zombiesarna väljer ett offer...';
        if (isMafia) {
            displayPlayerListForMafia();
        }
    }
});

// Visa röstningsknappar för maffian
function displayPlayerListForMafia() {
    playerListDiv.innerHTML = '<h3>Välj en spelare att eliminera:</h3>';
    players.forEach(player => {
        if (player.role !== 'Mafia' && !player.eliminated) {
            const playerButton = document.createElement('button');
            playerButton.textContent = player.name;
            playerButton.onclick = () => {
                socket.emit('mafiaVote', { victim: player.name, lobbyCode });
            };
            playerListDiv.appendChild(playerButton);
        }
    });
}

// Uppdatera maffians val
socket.on('updateMafiaChoices', (choices) => {
    mafiaChoicesDiv.innerHTML = `<h3>Zombiesarnas val:</h3> ${choices.join(', ')}`;
});

// Hantera dagfasen
socket.on('dayPhase', (victimName) => {
    if (!eliminated) {
        phaseTitle.innerHTML = 'Dagfas';
        instructions.innerHTML = `Nattens offer var ${victimName}. Diskutera och rösta ut en misstänkt.`;
        mafiaChoicesDiv.innerHTML = '';  // Rensa maffians val
        displayPlayerListForDayVoting();
    }
});

// Visa lista för röstning under dagfasen
function displayPlayerListForDayVoting() {
    playerListDiv.innerHTML = '<h3>Välj en spelare att rösta ut:</h3>';
    players.forEach(player => {
        if (!player.eliminated) {
            const playerButton = document.createElement('button');
            playerButton.textContent = player.name;
            playerButton.onclick = () => {
                socket.emit('dayVote', { suspect: player.name, lobbyCode });
            };
            playerListDiv.appendChild(playerButton);
        }
    });
}

// Spelaren blir eliminerad
socket.on('eliminated', (playerName) => {
    if (playerName === playerRole) {
        statusDiv.innerHTML = 'Du har blivit utröstad och är nu ute ur spelet!';
        eliminated = true;
    }
});

// Uppdatera listan över spelare
socket.on('updatePlayerList', (playersList) => {
    players = playersList;
    playerListDiv.innerHTML = `<h3>Spelare i lobbyn:</h3> ${players.map(p => p.name).join(', ')}`;
});

// Hantera att en spelare blivit eliminerad
socket.on('playerEliminated', (playerName) => {
    instructions.innerHTML = `${playerName} blev utröstad och är ute ur spelet.`;
    players = players.filter(player => player.name !== playerName);
    updatePlayerListUI();
});

// Uppdatera spelarlistan i UI:t
function updatePlayerListUI() {
    playerListDiv.innerHTML = `<h3>Spelare i lobbyn:</h3> ${players.map(p => p.name).join(', ')}`;
}

// När spelet avslutas
socket.on('gameEnded', (message) => {
    instructions.innerHTML = message;
    phaseTitle.innerHTML = 'Spelet är över';
    playerListDiv.innerHTML = '';
    startGameBtn.style.display = 'none';
});
