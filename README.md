# Ayo Heritage Game — Enhanced Build

Ayo (Ayoayo) is a traditional Yoruba sowing game in the wider African mancala family. This build combines game play with heritage learning, realistic seed presentation and browser-to-browser multiplayer.

## New features in this version

### 1. Game History / Heritage Learning
- “Learn the History of Ayo” is available from the main menu.
- “Game History” remains available while playing.
- The history panel explains origins, the traditional board, social learning, community value, preservation challenges and digital heritage.
- It also notes that Ayo has living regional/community variations rather than claiming one digital ruleset is the only traditional form.

### 2. More realistic seeds + multiple seed selection
Players can select one or several visual seed sets:
- Ayo Brown
- Ivory Cowrie
- Ebony
- Red Bean
- Speckled

When multiple sets are selected, pits display a repeatable natural-looking mixture. Seed shapes use varied gradients, highlights, seams, speckles, rotations and small offsets to look less procedural.

### 3. Same-Wi-Fi online multiplayer
The new “Play Online · Same Wi-Fi” mode uses WebRTC DataChannels.

How to connect:
1. Put both computers/phones on the same Wi-Fi or LAN.
2. Player 1 chooses **Host Game** and clicks **Create Invitation**.
3. Copy the invitation code to Player 2 (message, QR transfer, etc.).
4. Player 2 chooses **Join Game**, pastes the invitation and clicks **Create Answer**.
5. Player 2 sends the answer code back to Player 1.
6. Player 1 pastes the answer and clicks **Connect to Player 2**.
7. The game opens automatically once the direct WebRTC data channel connects.

This implementation deliberately uses `iceServers: []`, so it does not depend on a cloud relay. It is intended for devices that can reach one another on the same local network. Some managed/public Wi-Fi networks enable client isolation and may block device-to-device WebRTC traffic.

For deployment, serve the project over `http://localhost` during local development or HTTPS on a hosted site. Modern browsers may restrict WebRTC or clipboard functionality for plain HTTP pages opened from another machine.

## Existing play modes
- Local friend vs friend
- Player vs computer
- Same-Wi-Fi browser-to-browser online play

## Rules implemented in this build
- 12 pits, 6 per player, starting with 4 seeds in each pit (48 seeds total).
- Counter-clockwise sowing.
- Capturing occurs on the opponent's row when the last seed creates a pit containing 2, 3 or 4 seeds; eligible preceding opponent pits can chain-capture.
- Feeding rule is enforced when an opponent row is empty.
- Three consecutive match wins creates a Champion.

## Run locally
Because this is a static web project, use any small local web server. For example, with Python installed:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

For Wi-Fi play on two devices, serve the files from the host machine and open the host machine's LAN address from the second device (subject to browser secure-context restrictions), or deploy the static site over HTTPS.

## Heritage source used for the new learning panel
The supplied Historical Nigeria article, “Ayo: The Nigerian Board Game That Ruled Homes Before Smartphones” (19 May 2026), plus the original project README.
