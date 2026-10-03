# Play Place

Phone-friendly mini-game arcade with **14 games**, solo play, and room-code multiplayer.

Bright toybox / playground vibes (Mario-inspired colors — no Nintendo characters or assets).

## Games

1. **Number Rush** — tap 1→25
2. **Slide Race** — 3×3 slide puzzle race
3. **Memory Match** — pair cards
4. **Color Flood** — flood-fill the board
5. **Lights Out** — turn all lights off
6. **Signal Tap** — wait for green, tap fast
7. **Pipe Connect** — rotate pipes to link ends
8. **Anagram Sprint** — unscramble words
9. **Word Claim** — make words in 60s
10. **Dots & Boxes** — turn-based duel (vs CPU solo)
11. **Connect Four** — turn-based duel, 2–4 players (vs CPU solo)
12. **Memory Duel** — turn-based pair-grabbing duel (vs CPU solo)
13. **Whack Grid** — smash glowing blocks before they vanish
14. **Inertia** — slide the ball onto dashed anchors, grab gems, dodge mines

## Features

- **Quick Play** and a **Daily Challenge** (same puzzle for everyone each day, with a streak)
- Solo **personal bests**, celebratory results with confetti and share
- First-time **how to play** cards for every game
- Party **series standings**, winner picks the next game, emoji **reactions**, avatars
- Turn games show whose turn it is and buzz your phone on your turn
- Sound and haptics (with an iOS fallback), Night mode, color-blind friendly marks, reduced-motion support
- Works offline after first load (service worker)

## Live site

Play here: https://thelukehendy.github.io/play-place/

Invite links look like:

`https://thelukehendy.github.io/play-place/?room=ABCDE`

Opening that URL joins the room automatically.

### Firebase Auth domain (required for multiplayer)

In Firebase Console → Authentication → Settings → **Authorized domains**, add:

`thelukehendy.github.io`


```bash
npm install
npm run dev
```

Open the local URL on your phone (same Wi‑Fi) or use desktop Chrome device mode.

**Solo works with zero setup.** Multiplayer across two phones needs Firebase (free).

## Free multiplayer (GitHub Pages + Firebase)

GitHub Pages hosts the static app. Firebase Realtime Database syncs rooms.

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) → Add project
2. Add a **Web** app
3. Enable **Anonymous** sign-in: Authentication → Sign-in method → Anonymous
4. Create a **Realtime Database** (start in test mode, then paste rules below)
5. Copy web config values into `.env.local`:

```bash
cp .env.example .env.local
```

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 2. Database rules

In Realtime Database → Rules, use [`database.rules.json`](database.rules.json) (or the same content). For a private friend group this is fine; tighten later if you go public.

### 3. Deploy to GitHub Pages

```bash
npm run build
```

Then either:

**Option A — `gh-pages` branch**

```bash
npm install -D gh-pages
npx gh-pages -d dist
```

Enable Pages in repo Settings → Pages → Deploy from branch `gh-pages` / root.

**Option B — GitHub Actions**

Add a workflow that runs `npm ci && npm run build` and uploads `dist/` with `actions/upload-pages-artifact`.

Set the same `VITE_FIREBASE_*` values as GitHub Actions secrets / env vars at build time so they are baked into the static bundle.

> Firebase web API keys are expected to be public in client apps; protect data with Database rules + Anonymous auth, not by hiding the key.

## How to play with friends

1. Open Play Place on your phone
2. Pick a game → **Create Room** (or **Host room** on the games list)
3. Share the **room code** or **Copy invite link**
4. Friends open the link (or enter the code) → everyone taps **Ready?** → host taps **Start match!**
5. Rematch from results

### Party etiquette (built-in)

- **Quit game** leaves the current mini-game but keeps you in the party lobby
- **Leave party** removes you from the room (host crown passes to someone still online)
- Away / closed tabs show as **away**; the host can remove them
- If the host goes away, host transfers automatically after a short wait
- Players who go away mid-match are forfeited so the round can finish
- Joining mid-match parks you in the lobby until the next game
- Host can **Make X host** from the player list

Without Firebase configured, the app still runs in **demo mode**: rooms are stored in `localStorage` on that browser only (great for UI testing, not cross-device).

Deploy updated [`database.rules.json`](database.rules.json) in Firebase so `countdown` status is allowed.

## Scripts

| Command        | What it does              |
|----------------|---------------------------|
| `npm run dev`  | Local dev server          |
| `npm run build`| Production build → `dist` |
| `npm run preview` | Preview production build |

## Stack

- React + Vite + TypeScript
- Firebase Realtime Database (optional, free tier)
- GitHub Pages hosting
