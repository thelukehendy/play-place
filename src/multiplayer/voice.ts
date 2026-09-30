/**
 * Party push-to-talk over WebRTC, signaled through Firebase RTDB.
 *
 * Model:
 * - Opt-in "Join voice" (unlocks audio + mic permission on a user gesture)
 * - Momentary hold-to-talk (mic track disabled unless holding)
 * - Full mesh among voice members (max party size is 4)
 * - Smaller playerId initiates the offer (avoids glare)
 */

import {
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database';
import { ensureAnonAuth, getFirebase, isFirebaseConfigured } from './firebase';

export type VoiceMember = {
  id: string;
  name: string;
  talking: boolean;
  joinedAt: number;
};

type SignalPayload = {
  from: string;
  type: 'offer' | 'answer' | 'ice' | 'bye';
  sdp?: string;
  candidate?: RTCIceCandidateInit | null;
  at: number;
};

const HOLD_ARM_MS = 120;
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export type VoiceStatus =
  | 'idle'
  | 'joining'
  | 'ready'
  | 'live'
  | 'denied'
  | 'unsupported'
  | 'offline';

export type VoiceController = {
  join: () => Promise<void>;
  leave: () => Promise<void>;
  /** pointer/touch down on PTT */
  pressTalk: () => void;
  /** pointer/touch up / cancel */
  releaseTalk: () => void;
  getStatus: () => VoiceStatus;
  isHolding: () => boolean;
  getMembers: () => VoiceMember[];
  destroy: () => void;
};

type Listener = () => void;

function voiceRoot(code: string) {
  return `rooms/${code.trim().toUpperCase()}/voice`;
}

function membersPath(code: string) {
  return `${voiceRoot(code)}/members`;
}

function inboxPath(code: string, playerId: string) {
  return `${voiceRoot(code)}/inbox/${playerId}`;
}

async function unlockAudioPlayback() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    if (ctx.state === 'suspended') await ctx.resume();
    // Tiny silent buffer helps Safari treat this gesture as audio-unlocked.
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 500);
  } catch {
    /* ignore */
  }
}

export function createVoiceController(
  code: string,
  self: { id: string; name: string },
  onChange: Listener,
): VoiceController {
  const emptyMembers = () => [] as VoiceMember[];

  if (!isFirebaseConfigured()) {
    let status: VoiceStatus = 'offline';
    return {
      join: async () => {
        status = 'offline';
        onChange();
      },
      leave: async () => undefined,
      pressTalk: () => undefined,
      releaseTalk: () => undefined,
      getStatus: () => status,
      isHolding: () => false,
      destroy: () => undefined,
      getMembers: emptyMembers,
    };
  }

  if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      join: async () => onChange(),
      leave: async () => undefined,
      pressTalk: () => undefined,
      releaseTalk: () => undefined,
      getStatus: () => 'unsupported' as VoiceStatus,
      isHolding: () => false,
      destroy: () => undefined,
      getMembers: emptyMembers,
    };
  }

  let status: VoiceStatus = 'idle';
  let holding = false;
  let armTimer: number | null = null;
  let localStream: MediaStream | null = null;
  let micTrack: MediaStreamTrack | null = null;
  let destroyed = false;

  const peers = new Map<string, RTCPeerConnection>();
  const makingOffer = new Map<string, boolean>();
  const audioEls = new Map<string, HTMLAudioElement>();
  const unsubs: Unsubscribe[] = [];
  let membersUnsub: Unsubscribe | null = null;
  let inboxUnsub: Unsubscribe | null = null;
  let knownMembers = new Map<string, VoiceMember>();

  const emit = () => {
    if (!destroyed) onChange();
  };

  const setStatus = (next: VoiceStatus) => {
    if (status === next) return;
    status = next;
    emit();
  };

  const ensureAudioEl = (peerId: string, stream: MediaStream) => {
    let el = audioEls.get(peerId);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.setAttribute('webkit-playsinline', 'true');
      el.style.display = 'none';
      document.body.appendChild(el);
      audioEls.set(peerId, el);
    }
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  };

  const removeAudioEl = (peerId: string) => {
    const el = audioEls.get(peerId);
    if (!el) return;
    el.pause();
    el.srcObject = null;
    el.remove();
    audioEls.delete(peerId);
  };

  const sendSignal = async (to: string, payload: Omit<SignalPayload, 'from' | 'at'>) => {
    if (destroyed || to === self.id) return;
    await ensureAnonAuth();
    const { db } = getFirebase();
    const msg: SignalPayload = { ...payload, from: self.id, at: Date.now() };
    await push(ref(db, inboxPath(code, to)), msg);
  };

  const closePeer = (peerId: string) => {
    const pc = peers.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      peers.delete(peerId);
    }
    makingOffer.delete(peerId);
    removeAudioEl(peerId);
  };

  const setMicEnabled = async (on: boolean) => {
    if (micTrack) micTrack.enabled = on;
    holding = on;
    if (status === 'ready' || status === 'live') {
      status = on ? 'live' : 'ready';
    }
    try {
      await ensureAnonAuth();
      const { db } = getFirebase();
      await update(ref(db, `${membersPath(code)}/${self.id}`), {
        talking: on,
        at: Date.now(),
      });
    } catch {
      /* ignore */
    }
    emit();
  };

  const createPeer = (peerId: string) => {
    if (destroyed || peers.has(peerId) || peerId === self.id) {
      return peers.get(peerId) ?? null;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(peerId, pc);

    if (localStream) {
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }
    }

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      void sendSignal(peerId, { type: 'ice', candidate: ev.candidate.toJSON() });
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      ensureAudioEl(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        closePeer(peerId);
        // Retry shortly if they are still in voice
        if (knownMembers.has(peerId) && !destroyed) {
          window.setTimeout(() => {
            if (!destroyed && knownMembers.has(peerId) && !peers.has(peerId)) {
              void connectTo(peerId);
            }
          }, 800);
        }
      }
    };

    return pc;
  };

  const connectTo = async (peerId: string) => {
    if (destroyed || peerId === self.id) return;
    // Only the lexicographically smaller id initiates.
    if (self.id >= peerId) return;
    const pc = createPeer(peerId);
    if (!pc) return;
    try {
      makingOffer.set(peerId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(peerId, { type: 'offer', sdp: offer.sdp });
    } catch (err) {
      console.warn('voice offer failed', err);
      closePeer(peerId);
    } finally {
      makingOffer.set(peerId, false);
    }
  };

  const handleSignal = async (msg: SignalPayload) => {
    if (destroyed || msg.from === self.id) return;
    if (msg.type === 'bye') {
      closePeer(msg.from);
      return;
    }

    let pc = peers.get(msg.from);
    if (!pc) pc = createPeer(msg.from) ?? undefined;
    if (!pc) return;

    try {
      if (msg.type === 'offer' && msg.sdp) {
        // Polite peer: if we also offered, roll back
        const offerCollision = makingOffer.get(msg.from) || pc.signalingState !== 'stable';
        const polite = self.id > msg.from;
        if (offerCollision) {
          if (!polite) return;
          await pc.setLocalDescription({ type: 'rollback' });
        }
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(msg.from, { type: 'answer', sdp: answer.sdp });
      } else if (msg.type === 'answer' && msg.sdp) {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        }
      } else if (msg.type === 'ice' && msg.candidate) {
        try {
          await pc.addIceCandidate(msg.candidate);
        } catch {
          /* out-of-order ICE before remote description — ignore */
        }
      }
    } catch (err) {
      console.warn('voice signal error', err);
    }
  };

  const syncMembers = async (members: Record<string, VoiceMember>) => {
    const next = new Map<string, VoiceMember>();
    for (const [id, m] of Object.entries(members || {})) {
      if (!m || !id) continue;
      next.set(id, { id, name: m.name, talking: !!m.talking, joinedAt: m.joinedAt || 0 });
    }
    knownMembers = next;
    emit();

    // Connect to new peers; drop left peers
    for (const id of [...peers.keys()]) {
      if (!next.has(id)) closePeer(id);
    }
    for (const id of next.keys()) {
      if (id === self.id) continue;
      if (!peers.has(id)) void connectTo(id);
    }
  };

  const join = async () => {
    if (destroyed) return;
    if (status === 'joining' || status === 'ready' || status === 'live') return;
    setStatus('joining');

    try {
      await ensureAnonAuth();
      await unlockAudioPlayback();

      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      micTrack = localStream.getAudioTracks()[0] ?? null;
      if (micTrack) micTrack.enabled = false;

      const { db } = getFirebase();
      const memberRef = ref(db, `${membersPath(code)}/${self.id}`);
      const body: VoiceMember = {
        id: self.id,
        name: self.name,
        talking: false,
        joinedAt: Date.now(),
      };
      await set(memberRef, body);
      try {
        await onDisconnect(memberRef).remove();
      } catch {
        /* ignore */
      }

      // Clear stale inbox then listen
      await remove(ref(db, inboxPath(code, self.id))).catch(() => undefined);
      inboxUnsub = onChildAdded(ref(db, inboxPath(code, self.id)), (snap) => {
        const msg = snap.val() as SignalPayload | null;
        void remove(snap.ref).catch(() => undefined);
        if (msg) void handleSignal(msg);
      });

      membersUnsub = onValue(ref(db, membersPath(code)), (snap) => {
        const val = (snap.exists() ? snap.val() : {}) as Record<string, VoiceMember>;
        void syncMembers(val);
      });

      setStatus('ready');
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      cleanupMediaOnly();
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus('denied');
      } else {
        setStatus('unsupported');
      }
    }
  };

  const cleanupMediaOnly = () => {
    if (armTimer != null) {
      window.clearTimeout(armTimer);
      armTimer = null;
    }
    holding = false;
    micTrack?.stop();
    localStream?.getTracks().forEach((t) => t.stop());
    micTrack = null;
    localStream = null;
  };

  const leave = async () => {
    if (armTimer != null) {
      window.clearTimeout(armTimer);
      armTimer = null;
    }
    holding = false;

    for (const peerId of [...peers.keys()]) {
      void sendSignal(peerId, { type: 'bye' });
      closePeer(peerId);
    }

    membersUnsub?.();
    membersUnsub = null;
    inboxUnsub?.();
    inboxUnsub = null;
    for (const u of unsubs) u();
    unsubs.length = 0;

    cleanupMediaOnly();
    knownMembers = new Map();

    try {
      if (isFirebaseConfigured()) {
        await ensureAnonAuth();
        const { db } = getFirebase();
        const memberRef = ref(db, `${membersPath(code)}/${self.id}`);
        try {
          await onDisconnect(memberRef).cancel();
        } catch {
          /* ignore */
        }
        await remove(memberRef);
        await remove(ref(db, inboxPath(code, self.id))).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }

    setStatus('idle');
  };

  const pressTalk = () => {
    if (status !== 'ready' && status !== 'live') return;
    if (armTimer != null) return;
    armTimer = window.setTimeout(() => {
      armTimer = null;
      void setMicEnabled(true);
    }, HOLD_ARM_MS);
  };

  const releaseTalk = () => {
    if (armTimer != null) {
      window.clearTimeout(armTimer);
      armTimer = null;
    }
    if (holding || status === 'live') void setMicEnabled(false);
  };

  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      releaseTalk();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', releaseTalk);

  const destroy = () => {
    destroyed = true;
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', releaseTalk);
    void leave();
  };

  // Expose members via closure for UI — attach to controller
  return {
    join,
    leave,
    pressTalk,
    releaseTalk,
    getStatus: () => status,
    isHolding: () => holding,
    destroy,
    getMembers: () => [...knownMembers.values()].sort((a, b) => a.joinedAt - b.joinedAt),
  };
}

export type VoiceControllerWithMembers = VoiceController;

/** Subscribe to voice members without joining (for lobby badges). */
export function subscribeVoiceMembers(
  code: string,
  cb: (members: VoiceMember[]) => void,
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    cb([]);
    return () => undefined;
  }
  const { db } = getFirebase();
  return onValue(ref(db, membersPath(code)), (snap) => {
    const val = (snap.exists() ? snap.val() : {}) as Record<string, VoiceMember>;
    const list = Object.values(val || {})
      .filter(Boolean)
      .map((m) => ({
        id: m.id,
        name: m.name,
        talking: !!m.talking,
        joinedAt: m.joinedAt || 0,
      }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
    cb(list);
  });
}

export async function clearOwnVoice(code: string, playerId: string) {
  if (!isFirebaseConfigured()) return;
  try {
    await ensureAnonAuth();
    const { db } = getFirebase();
    await remove(ref(db, `${membersPath(code)}/${playerId}`));
    await remove(ref(db, inboxPath(code, playerId))).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
