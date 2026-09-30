/**
 * Multiplayer scenario harness — two isolated browser contexts against the
 * live Firebase-backed app. Run: node scripts/mp-scenarios.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.PLAY_URL || 'http://127.0.0.1:5173/';
const results = [];
const ART = '/tmp/mp-artifacts';
fs.mkdirSync(ART, { recursive: true });

function log(msg) {
  console.log(msg);
}

async function pass(name) {
  results.push({ name, ok: true });
  log(`✓ ${name}`);
}

async function fail(name, err, pages = []) {
  results.push({ name, ok: false, err: String(err) });
  log(`✗ ${name}: ${err}`);
  for (let i = 0; i < pages.length; i++) {
    try {
      const p = pages[i];
      const slug = name.replace(/\W+/g, '_').slice(0, 40);
      await p.screenshot({ path: `${ART}/${slug}_${i}.png`, fullPage: true });
      fs.writeFileSync(`${ART}/${slug}_${i}.txt`, await p.locator('body').innerText());
    } catch {
      /* ignore */
    }
  }
}

async function bootPlayer(browser, name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript((nick) => {
    localStorage.clear();
    localStorage.setItem('playplace.nickname', nick);
    localStorage.setItem(
      'playplace.playerId',
      `p_${nick.toLowerCase()}_${Math.random().toString(36).slice(2, 8)}`,
    );
  }, name);
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /let's play!/i }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /let's play!/i }).click();
  await page.getByRole('button', { name: /host room/i }).waitFor({ timeout: 15000 });
  return { context, page, name };
}

async function hostRoom(host) {
  await host.page.getByRole('button', { name: /host room/i }).click();
  await host.page.waitForSelector('.join-code-hero', { timeout: 20000 });
  const code = (await host.page.locator('.join-code-hero').innerText()).trim();
  if (!/^[A-Z0-9]{4,6}$/.test(code)) throw new Error(`Bad room code: ${code}`);
  return code;
}

async function joinWithCode(guest, code) {
  // Guest may be on library already
  const leave = guest.page.getByRole('button', { name: /leave party/i });
  if (await leave.count()) {
    await leave.click();
    await guest.page.waitForTimeout(500);
  }
  await guest.page.getByRole('button', { name: /host room/i }).waitFor({ timeout: 10000 }).catch(() => {});
  const input = guest.page.locator('input[placeholder*="JOIN" i]').first();
  await input.waitFor({ timeout: 10000 });
  await input.fill(code);
  await guest.page.getByRole('button', { name: /^join$/i }).click();
  await guest.page.waitForSelector('.join-code-hero', { timeout: 20000 });
}

async function readyUp(player) {
  const ready = player.page.getByRole('button', { name: /^ready\?$/i });
  await ready.waitFor({ timeout: 10000 });
  await ready.click();
  await player.page.getByRole('button', { name: /^ready!$/i }).waitFor({ timeout: 8000 });
}

async function startMatch(host) {
  const start = host.page.getByRole('button', { name: /start match/i });
  await start.waitFor({ timeout: 10000 });
  await start.click();
  await host.page.waitForSelector('text=/Get ready|GO!/i', { timeout: 10000 });
}

async function waitForPlaying(page) {
  await page.getByRole('button', { name: /quit game/i }).waitFor({ timeout: 20000 });
}

async function scenarioJoinLeaveChat(browser) {
  const name = 'join / leave / chat / host pass';
  let host, guest;
  try {
    host = await bootPlayer(browser, 'HostAlpha');
    guest = await bootPlayer(browser, 'GuestBeta');
    const code = await hostRoom(host);
    await joinWithCode(guest, code);

    const openChat = async (page) => {
      const byLabel = page.getByLabel(/party chat/i);
      if (await byLabel.count()) {
        await byLabel.click();
        return;
      }
      await page.locator('button.chat-header-btn').click();
    };
    await openChat(host.page);
    await host.page.locator('input[placeholder*="Message" i]').fill('hello party');
    await host.page.getByRole('button', { name: /^send$/i }).click();
    await host.page.getByRole('button', { name: /^close$/i }).click();
    await guest.page.waitForTimeout(1200);
    await openChat(guest.page);
    await guest.page.waitForSelector('text=hello party', { timeout: 10000 });
    await guest.page.getByRole('button', { name: /^close$/i }).click();

    await host.page.getByRole('button', { name: /make guestbeta host/i }).click();
    await host.page.waitForTimeout(1500);
    // Guest is host now — should see Start match or "You pick"
    const guestText = await guest.page.locator('body').innerText();
    if (!/You pick the games/i.test(guestText) && !(await guest.page.getByRole('button', { name: /start match/i }).count())) {
      throw new Error('Guest did not become host UI');
    }

    await guest.page.getByRole('button', { name: /leave party/i }).click();
    await guest.page.waitForTimeout(1500);
    // Back on library with Host room
    await guest.page.getByRole('button', { name: /host room/i }).waitFor({ timeout: 10000 });

    await host.context.close();
    await guest.context.close();
    await pass(name);
  } catch (err) {
    await fail(name, err, [host?.page, guest?.page].filter(Boolean));
    try { await host?.context.close(); } catch { /* */ }
    try { await guest?.context.close(); } catch { /* */ }
  }
}

async function scenarioQuitMidMatch(browser) {
  const name = 'quit game mid-match does not pull back';
  let host, guest;
  try {
    host = await bootPlayer(browser, 'HostQuit');
    guest = await bootPlayer(browser, 'GuestQuit');
    await hostRoom(host);
    const code = (await host.page.locator('.join-code-hero').innerText()).trim();
    await joinWithCode(guest, code);
    await readyUp(host);
    await readyUp(guest);
    await startMatch(host);
    await waitForPlaying(host.page);
    await waitForPlaying(guest.page);

    await guest.page.getByRole('button', { name: /quit game/i }).click();
    await guest.page.waitForTimeout(2000);
    if (await guest.page.getByRole('button', { name: /quit game/i }).count()) {
      throw new Error('Guest still seeing Quit game after opting out');
    }
    await guest.page.waitForSelector('text=/left the match|Party lobby|in progress/i', {
      timeout: 10000,
    });
    await host.page.getByRole('button', { name: /quit game/i }).waitFor({ timeout: 5000 });

    await host.context.close();
    await guest.context.close();
    await pass(name);
  } catch (err) {
    await fail(name, err, [host?.page, guest?.page].filter(Boolean));
    try { await host?.context.close(); } catch { /* */ }
    try { await guest?.context.close(); } catch { /* */ }
  }
}

async function scenarioLateJoin(browser) {
  const name = 'late join mid-match stays out until next';
  let host, guest, late;
  try {
    host = await bootPlayer(browser, 'HostLate');
    guest = await bootPlayer(browser, 'GuestLate');
    late = await bootPlayer(browser, 'LateJoin');
    const code = await hostRoom(host);
    await joinWithCode(guest, code);
    await readyUp(host);
    await readyUp(guest);
    await startMatch(host);
    await waitForPlaying(host.page);

    await joinWithCode(late, code);
    await late.page.waitForTimeout(1500);
    if (await late.page.getByRole('button', { name: /quit game/i }).count()) {
      throw new Error('Late joiner was pulled into live match');
    }
    await late.page.waitForSelector('text=/in progress|mid-match|Party lobby|Browse games/i', {
      timeout: 10000,
    });

    await host.context.close();
    await guest.context.close();
    await late.context.close();
    await pass(name);
  } catch (err) {
    await fail(name, err, [host?.page, guest?.page, late?.page].filter(Boolean));
    try { await host?.context.close(); } catch { /* */ }
    try { await guest?.context.close(); } catch { /* */ }
    try { await late?.context.close(); } catch { /* */ }
  }
}

async function scenarioHostTransferOnClose(browser) {
  const name = 'host tab close transfers host (~10s+)';
  let host, guest;
  try {
    host = await bootPlayer(browser, 'HostGone');
    guest = await bootPlayer(browser, 'GuestHeir');
    const code = await hostRoom(host);
    await joinWithCode(guest, code);
    await host.context.close();
    host = null;
    await guest.page.waitForTimeout(14000);
    const text = await guest.page.locator('body').innerText();
    const ok =
      /You pick the games/i.test(text) ||
      (await guest.page.getByRole('button', { name: /start match/i }).count()) > 0 ||
      /GuestHeir \(you\) 👑|GuestHeir 👑 \(you\)|👑 \(you\)/i.test(text) ||
      !/HostGone picks the games/i.test(text);
    if (!ok || /HostGone picks the games/i.test(text)) {
      throw new Error('Host did not transfer after host closed');
    }
    await guest.context.close();
    await pass(name);
  } catch (err) {
    await fail(name, err, [guest?.page].filter(Boolean));
    try { await host?.context.close(); } catch { /* */ }
    try { await guest?.context.close(); } catch { /* */ }
  }
}

async function scenarioRemoveAway(browser) {
  const name = 'host can remove away player';
  let host, guest;
  try {
    host = await bootPlayer(browser, 'HostKick');
    guest = await bootPlayer(browser, 'GuestKick');
    const code = await hostRoom(host);
    await joinWithCode(guest, code);
    await guest.context.close();
    guest = null;
    await host.page.waitForSelector('text=/away/i', { timeout: 25000 });
    const remove = host.page.getByRole('button', { name: /remove guestkick/i });
    await remove.waitFor({ timeout: 8000 });
    await remove.click();
    await host.page.waitForTimeout(1500);
    const body = await host.page.locator('body').innerText();
    if (/GuestKick \(/.test(body) || /^GuestKick$/m.test(body.split('\n').find(l => l.includes('GuestKick')) || '')) {
      // still in list as a player row
      if (body.includes('GuestKick —') || body.includes('GuestKick 👑')) {
        throw new Error('Away guest still listed after remove');
      }
    }
    await host.context.close();
    await pass(name);
  } catch (err) {
    await fail(name, err, [host?.page].filter(Boolean));
    try { await host?.context.close(); } catch { /* */ }
    try { await guest?.context.close(); } catch { /* */ }
  }
}

async function scenarioForfeitAwayRacer(browser) {
  const name = 'away racer forfeits and match can end (~22s+)';
  let host, guest;
  try {
    host = await bootPlayer(browser, 'HostRace');
    guest = await bootPlayer(browser, 'GuestRace');
    const code = await hostRoom(host);
    await joinWithCode(guest, code);
    await readyUp(host);
    await readyUp(guest);
    await startMatch(host);
    await waitForPlaying(host.page);
    await waitForPlaying(guest.page);
    await guest.context.close();
    guest = null;
    await host.page.waitForTimeout(26000);
    const body = await host.page.locator('body').innerText();
    const stillInGame = (await host.page.getByRole('button', { name: /quit game/i }).count()) > 0;
    const sawForfeit = /left the match \(away\)|Away|Results!|Party lobby/i.test(body);
    if (stillInGame && !sawForfeit) {
      // Alone in match after forfeit should allow quit → lobby
      throw new Error('Forfeit notice / cleanup not observed while still in game');
    }
    if (stillInGame) {
      await host.page.getByRole('button', { name: /quit game/i }).click();
      await host.page.waitForTimeout(1500);
    }
    await host.context.close();
    await pass(name);
  } catch (err) {
    await fail(name, err, [host?.page].filter(Boolean));
    try { await host?.context.close(); } catch { /* */ }
    try { await guest?.context.close(); } catch { /* */ }
  }
}

async function main() {
  log(`Running multiplayer scenarios against ${BASE}`);
  const browser = await chromium.launch({ headless: true });
  try {
    await scenarioJoinLeaveChat(browser);
    await scenarioQuitMidMatch(browser);
    await scenarioLateJoin(browser);
    await scenarioRemoveAway(browser);
    await scenarioHostTransferOnClose(browser);
    await scenarioForfeitAwayRacer(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  log('\n==== SUMMARY ====');
  for (const r of results) log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.err ? ' — ' + r.err : ''}`);
  if (failed.length) process.exitCode = 1;
  else log('All scenarios passed.');
}

import { pathToFileURL } from 'url';
import path from 'path';

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
