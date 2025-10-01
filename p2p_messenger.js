// --- Globale Variablen und Konstanten ---
const STORAGE_KEY_MESSAGES = 'p2p_chat_messages';
const STORAGE_KEY_GROUP = 'p2p_chat_group';
const MODE_SINGLE = 'single';
const MODE_GROUP = 'group';
let myID;
let peer;
let chatMode = null;
// 1:1 Chat Variablen
let singleConnection = null;
let singlePeerID = null;
// Gruppen Chat Variablen
const activeConnections = {};
let currentGroup = {
name: null,
members: new Map(),
};
// Lokaler Nachrichtenverlauf
let messages = [];
// DOM-Elemente
const myIdDisplay = document.getElementById('my-id');
const modeSingleBtn = document.getElementById('mode-single-btn');
const modeGroupBtn = document.getElementById('mode-group-btn');
const setupSingleDiv = document.getElementById('setup-single');
const targetIdInput = document.getElementById('target-id-input');
const connectSingleBtn = document.getElementById('connect-single-btn');
const setupGroupDiv = document.getElementById('setup-group');
const groupNameInput = document.getElementById('group-name-input');
const memberIdInput = document.getElementById('member-id-input');
const addMemberBtn = document.getElementById('add-member-btn');
const startGroupBtn = document.getElementById('start-group-btn');
const chatTitleDisplay = document.getElementById('chat-title-display');
const infoListDiv = document.getElementById('info-list');
const chatWindow = document.getElementById('chat-window');
const sendBtn = document.getElementById('send-btn');
const messageInput = document.getElementById('message-input');
// ##########################################
// # 1. INITIALISIERUNG & MODUS-WECHSEL
// ##########################################
function getOrCreateID() {
let id = localStorage.getItem('myP2PID');
if (!id) {
id = 'P2P_USER_' + Math.random().toString(36).substring(2, 6).toUpperCase();
localStorage.setItem('myP2PID', id);
}
myID = id;
myIdDisplay.textContent = id;
}
function initializePeer() {
// Verwendung des öffentlichen PeerJS-Servers für maximale Zuverlässigkeit
peer = new Peer(myID, {
host: 'peerjs-server-public-default.herokuapp.com',
secure: true,
port: 443,
path: '/peerjs'
});
peer.on('open', (id) => {
console.log('Mit öffentlichem Signalling Server verbunden. Eigene ID:', id);
});
peer.on('connection', (conn) => {
setupConnection(conn);
});
peer.on('error', (err) => {
console.error('PeerJS Fehler:', err);
});
}
function switchMode(newMode) {
if (chatMode === newMode) return;

chatMode = newMode;

// UI-Anpassung
modeSingleBtn.className = newMode === MODE_SINGLE ? 'primary-btn' : 'secondary-btn';
modeGroupBtn.className = newMode === MODE_GROUP ? 'primary-btn' : 'secondary-btn';

setupSingleDiv.style.display = newMode === MODE_SINGLE ? 'block' : 'none';
setupGroupDiv.style.display = newMode === MODE_GROUP ? 'block' : 'none';

chatTitleDisplay.textContent = newMode === MODE_SINGLE ? 'Warte auf 1:1-Verbindung' : 'Wähle Gruppe';

// Zustand zurücksetzen
sendBtn.disabled = true;
messageInput.disabled = true;
infoListDiv.style.display = 'none';
infoListDiv.innerHTML = '';

// Lade den korrekten Chatverlauf
loadMessagesFromLocalStorage();
displayMessage(`Modus gewechselt: ${newMode === MODE_SINGLE ? 'Einzel-Chat' : 'Gruppen-Chat'}.`, 'system');
}
modeSingleBtn.addEventListener('click', () => switchMode(MODE_SINGLE));
modeGroupBtn.addEventListener('click', () => switchMode(MODE_GROUP));
// ##########################################
// # 2. LOKALE SPEICHERUNG
// ##########################################
function saveMessagesToLocalStorage() {
const key = chatMode === MODE_SINGLE ? `msg_${singlePeerID}` : `msg_${currentGroup.name}`;
localStorage.setItem(key, JSON.stringify(messages));
}
function loadMessagesFromLocalStorage() {
messages = [];
chatWindow.innerHTML = '';

let key;
if (chatMode === MODE_SINGLE && singlePeerID) {
key = `msg_${singlePeerID}`;
} else if (chatMode === MODE_GROUP && currentGroup.name) {
key = `msg_${currentGroup.name}`;
} else {
return;
}

const storedMessages = localStorage.getItem(key);
if (storedMessages) {
messages = JSON.parse(storedMessages);
messages.forEach(msg => {
if (msg.type !== 'system') {
displayMessage(msg, msg.type, false);
}
});
chatWindow.scrollTop = chatWindow.scrollHeight;
}
}
function saveGroupToLocalStorage() {
const groupData = {
name: currentGroup.name,
members: Array.from(currentGroup.members.entries())
};
localStorage.setItem(STORAGE_KEY_GROUP, JSON.stringify(groupData));
}
function loadGroupConfig() {
const storedGroup = localStorage.getItem(STORAGE_KEY_GROUP);
if (storedGroup) {
const groupData = JSON.parse(storedGroup);
currentGroup.name = groupData.name;
currentGroup.members = new Map(groupData.members);
currentGroup.members.forEach(member => member.isConnected = false);

chatTitleDisplay.textContent = currentGroup.name;
renderMemberList();

displayMessage("Lokale Gruppe geladen. Bitte Peers neu verbinden.", 'system');
}
}
// ##########################################
// # 3. CHAT-LOGIK (1:1 & GRUPPE)
// ##########################################
function setupConnection(conn) {
const peerID = conn.peer;
if (chatMode === MODE_SINGLE && singlePeerID === peerID) {
singleConnection = conn;
singleConnection.on('open', () => {
displayMessage(`1:1-Verbindung zu ${peerID} hergestellt.`, 'system');
sendBtn.disabled = false;
messageInput.disabled = false;
});
singleConnection.on('data', (data) => handleIncomingMessage(data, peerID));
singleConnection.on('close', () => resetSingleConnection());
return;
} else if (chatMode === MODE_GROUP && currentGroup.members.has(peerID)) {
activeConnections[peerID] = conn;
currentGroup.members.get(peerID).isConnected = true;
renderMemberList();
conn.on('open', () => displayMessage(`P2P-Verbindung zu ${peerID} hergestellt.`, 'system'));
conn.on('data', (data) => handleIncomingMessage(data, peerID));
conn.on('close', () => resetGroupConnection(peerID));

sendBtn.disabled = false;
messageInput.disabled = false;
return;
}

conn.close();
}
function resetSingleConnection() {
displayMessage(`Verbindung zu ${singlePeerID} getrennt.`, 'system');
singleConnection = null;
singlePeerID = null;
sendBtn.disabled = true;
messageInput.disabled = true;
chatTitleDisplay.textContent = 'Warte auf 1:1-Verbindung';
}
function resetGroupConnection(peerID) {
delete activeConnections[peerID];
if (currentGroup.members.has(peerID)) {
currentGroup.members.get(peerID).isConnected = false;
renderMemberList();
}
displayMessage(`Verbindung zu ${peerID} getrennt.`, 'system');
}
function handleIncomingMessage(data, peerID) {
try {
const message = JSON.parse(data);
if (message.sender === myID) return;
displayMessage(message, 'partner');
if (chatMode === MODE_GROUP) {
const payload = JSON.stringify(message);
for (const otherPeerId in activeConnections) {
if (otherPeerId !== peerID && activeConnections[otherPeerId].open && otherPeerId !== message.sender) {
activeConnections[otherPeerId].send(payload);
}
}
}
} catch (e) {
console.error('Fehler beim Parsen der empfangenen Nachricht:', e);
displayMessage(`[${peerID} sendete unlesbare Daten]`, 'system');
}
}
// --- Nachrichtenversand ---
messageInput.addEventListener('keypress', (e) => {
if (e.key === 'Enter') {
sendMessage();
}
});
sendBtn.addEventListener('click', sendMessage);
function sendMessage() {
const text = messageInput.value.trim();
if (!text || (!singleConnection && Object.keys(activeConnections).length === 0)) {
alert('Bitte gib eine Nachricht ein und verbinde dich zuerst.');
return;
}

const messageObject = { sender: myID, text: text, timestamp: Date.now() };
const payload = JSON.stringify(messageObject);

displayMessage(messageObject, 'me');
messageInput.value = '';
if (chatMode === MODE_SINGLE && singleConnection && singleConnection.open) {
singleConnection.send(payload);
} else if (chatMode === MODE_GROUP) {
for (const peerId in activeConnections) {
if (activeConnections[peerId].open) {
activeConnections[peerId].send(payload);
}
}
}
}
// ##########################################
// # 4. UI-HANDLER FÜR BEIDE MODI
// ##########################################
// 1:1 Modus Handler
connectSingleBtn.addEventListener('click', () => {
const targetID = targetIdInput.value.trim().toUpperCase();
if (!targetID || targetID === myID) {
alert('Ungültige oder eigene ID.');
return;
}
if (singleConnection) {
displayMessage(`Bereits mit ${singlePeerID} verbunden.`, 'system');
return;
}
const promptValue = prompt(`Mit ${targetID} verbinden:\n1: Automatisch (ID verwenden)\n2: Manuell (ID manuell eingeben)`, '1');
let peerToConnect = targetID;
if (promptValue === '2') {
const manualID = prompt(`Bitte gib die ID von ${targetID} erneut ein.`);
if (!manualID) return;
peerToConnect = manualID;
} else if (promptValue !== '1') {
return;
}
singlePeerID = peerToConnect;
chatTitleDisplay.textContent = singlePeerID;
loadMessagesFromLocalStorage();

const conn = peer.connect(singlePeerID);
conn.on('open', () => setupConnection(conn));
conn.on('error', (err) => {
console.error('Verbindungsfehler:', err);
displayMessage(`Fehler beim Verbindungsaufbau zu ${singlePeerID}.`, 'system');
singlePeerID = null;
chatTitleDisplay.textContent = 'Verbindung fehlgeschlagen';
});
});
// Gruppenmodus Handler
addMemberBtn.addEventListener('click', () => {
const memberID = memberIdInput.value.trim().toUpperCase();
if (memberID && memberID !== myID && !currentGroup.members.has(memberID)) {
currentGroup.members.set(memberID, { isConnected: false });
displayMessage(`Mitglied ${memberID} zur Gruppe hinzugefügt.`, 'system');
memberIdInput.value = '';
saveGroupToLocalStorage();
renderMemberList();
} else {
alert('Ungültige, eigene oder doppelte ID.');
}
});
startGroupBtn.addEventListener('click', () => {
const name = groupNameInput.value.trim();
if (name) {
currentGroup.name = name;
chatTitleDisplay.textContent = name;
displayMessage(`Gruppe '${name}' aktiviert.`, 'system');
saveGroupToLocalStorage();
loadMessagesFromLocalStorage();
renderMemberList();
sendBtn.disabled = false;
messageInput.disabled = false;
} else {
alert('Bitte gib einen Gruppennamen ein.');
}
});
chatTitleDisplay.addEventListener('click', () => {
if (chatMode === MODE_GROUP) {
infoListDiv.style.display = infoListDiv.style.display === 'none' ? 'block' : 'none';
}
});
function renderMemberList() {
infoListDiv.innerHTML = '<strong>Gruppen-Mesh-Status:</strong>';
currentGroup.members.forEach((member, id) => {
const item = document.createElement('div');
item.className = 'member-item';
const statusText = member.isConnected ? 'Verbunden ✅' : 'Nicht verbunden 🔴';

item.innerHTML = `
<span>${id} (${statusText})</span>
<button onclick="attemptConnectionManual('${id}')"
${member.isConnected ? 'disabled' : ''}>
Verbinden
</button>
`;
infoListDiv.appendChild(item);
});
infoListDiv.style.display = 'block';
}
function attemptConnectionManual(targetID) {
const promptValue = prompt(`Mit ${targetID} verbinden:\n1: Automatisch (ID verwenden)\n2: Manuell (ID manuell eingeben)`, '1');

let peerToConnect = targetID;
if (promptValue === '2') {
const manualID = prompt(`Bitte gib die ID von ${targetID} erneut ein.`);
if (!manualID) return;
peerToConnect = manualID;
} else if (promptValue !== '1') {
return;
}
if (activeConnections[peerToConnect]) {
alert(`Bereits mit ${peerToConnect} verbunden.`);
return;
}

displayMessage(`Versuche, P2P-Verbindung zu ${peerToConnect} herzustellen...`, 'system');
const conn = peer.connect(peerToConnect);

conn.on('open', () => setupConnection(conn));
conn.on('error', (err) => {
console.error('Verbindungsfehler:', err);
displayMessage(`Fehler: Verbindung zu ${peerToConnect} fehlgeschlagen.`, 'system');
});
}
// Hilfsfunktion zur Anzeige von Nachrichten und Speicherung
function displayMessage(data, type, shouldSave = true) {
const messageObject = (type === 'me' || type === 'partner') ? data :
{ type: 'system', text: data, timestamp: Date.now() };
const msgElement = document.createElement('div');
let displayText;

if (type === 'me') {
displayText = `${messageObject.text}`;
msgElement.className = 'message me';
} else if (type === 'partner') {
displayText = `**${messageObject.sender}**: ${messageObject.text}`;
msgElement.className = 'message partner';
} else {
displayText = messageObject.text;
msgElement.className = 'message system';
}

msgElement.innerHTML = displayText;
chatWindow.appendChild(msgElement);
chatWindow.scrollTop = chatWindow.scrollHeight;
if (shouldSave) {
messages.push({ type: type, ...messageObject });
saveMessagesToLocalStorage();
}
}
// --- App-Start ---
document.addEventListener('DOMContentLoaded', () => {
getOrCreateID();
loadGroupConfig();
// Starte standardmäßig im Gruppenmodus
switchMode(MODE_GROUP);
initializePeer();
});







