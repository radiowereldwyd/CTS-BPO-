/**
 * CallRoom — Public WebRTC call page
 * Clients and agents join via: /call/room/:roomId?name=...&role=agent|client
 * No login required for clients. Uses Google free STUN servers.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

const WS_URL = () => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/call-signal`;
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export default function CallRoom() {
  const { roomId } = useParams();
  const [params]   = useSearchParams();
  const role       = params.get('role') || 'client';
  const myName     = params.get('name') || (role === 'agent' ? 'Agent' : 'Client');

  const [status, setStatus]         = useState('connecting'); // connecting | waiting | incall | ended | error
  const [peers, setPeers]           = useState([]);
  const [muted, setMuted]           = useState(false);
  const [camOff, setCamOff]         = useState(false);
  const [chat, setChat]             = useState([]);
  const [chatMsg, setChatMsg]       = useState('');
  const [duration, setDuration]     = useState(0);
  const [roomName, setRoomName]     = useState('');
  const [myPeerId, setMyPeerId]     = useState('');
  const [error, setError]           = useState('');

  const wsRef        = useRef(null);
  const pcRefs       = useRef({});   // peerId → RTCPeerConnection
  const localStream  = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideos = useRef({});   // peerId → <video> element
  const timerRef     = useRef(null);
  const peerId       = useRef(`${role}-${Math.random().toString(36).slice(2, 8)}`);
  const callStartRef = useRef(null);

  const startTimer = () => {
    callStartRef.current = Date.now();
    timerRef.current = setInterval(() => setDuration(Math.floor((Date.now() - callStartRef.current) / 1000)), 1000);
  };
  const stopTimer = () => { clearInterval(timerRef.current); };
  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // Get local media
  const getMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        localStream.current = stream;
        setCamOff(true);
        return stream;
      } catch (e) { setError('Could not access camera/microphone: ' + e.message); return null; }
    }
  }, []);

  // Create RTCPeerConnection for a remote peer
  const createPC = useCallback((remotePeerId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRefs.current[remotePeerId] = pc;

    // Add local tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(t => pc.addTrack(t, localStream.current));
    }

    // ICE candidates
    pc.onicecandidate = e => {
      if (e.candidate && wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate: e.candidate, to: remotePeerId }));
      }
    };

    // Remote track → video element
    pc.ontrack = e => {
      const stream = e.streams[0];
      if (remoteVideos.current[remotePeerId]) {
        remoteVideos.current[remotePeerId].srcObject = stream;
      }
      setStatus('incall');
      if (!callStartRef.current) startTimer();
    };

    pc.oniceconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
        setPeers(p => p.filter(x => x.peerId !== remotePeerId));
        delete pcRefs.current[remotePeerId];
        if (Object.keys(pcRefs.current).length === 0) setStatus('waiting');
      }
    };

    return pc;
  }, []);

  // Connect WebSocket and wire signaling
  useEffect(() => {
    let mounted = true;
    (async () => {
      const stream = await getMedia();
      if (!stream || !mounted) return;

      const ws = new WebSocket(`${WS_URL()}?room=${roomId}&peerId=${peerId.current}&role=${role}&name=${encodeURIComponent(myName)}`);
      wsRef.current = ws;

      ws.onopen = () => { if (mounted) setStatus('waiting'); };
      ws.onerror = () => { if (mounted) { setStatus('error'); setError('Connection failed. Please refresh and try again.'); } };
      ws.onclose = () => { if (mounted && status !== 'ended') setStatus('ended'); };

      ws.onmessage = async raw => {
        if (!mounted) return;
        let msg;
        try { msg = JSON.parse(raw.data); } catch { return; }

        switch (msg.type) {
          case 'room-info':
            setRoomName(msg.roomName);
            setMyPeerId(msg.peerId);
            setPeers(msg.otherPeers || []);
            // Initiate offer to each existing peer
            for (const peer of (msg.otherPeers || [])) {
              const pc = createPC(peer.peerId);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription, to: peer.peerId }));
            }
            break;

          case 'peer-joined':
            if (msg.peerId !== peerId.current) {
              setPeers(p => [...p.filter(x => x.peerId !== msg.peerId), { peerId: msg.peerId, role: msg.role, name: msg.name }]);
              setChat(c => [...c, { system: true, text: `${msg.name} joined the call`, ts: Date.now() }]);
            }
            break;

          case 'peer-left':
            setPeers(p => p.filter(x => x.peerId !== msg.peerId));
            setChat(c => [...c, { system: true, text: `${msg.name} left the call`, ts: Date.now() }]);
            if (pcRefs.current[msg.peerId]) { pcRefs.current[msg.peerId].close(); delete pcRefs.current[msg.peerId]; }
            if (Object.keys(pcRefs.current).length === 0) setStatus('waiting');
            break;

          case 'offer': {
            const pc = createPC(msg.from);
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription, to: msg.from }));
            break;
          }

          case 'answer': {
            const pc = pcRefs.current[msg.from];
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            break;
          }

          case 'ice-candidate': {
            const pc = pcRefs.current[msg.from];
            if (pc) { try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {} }
            break;
          }

          case 'chat':
            setChat(c => [...c, { from: msg.name, text: msg.text, ts: msg.ts, mine: msg.from === peerId.current }]);
            break;
        }
      };
    })();

    return () => {
      mounted = false;
      stopTimer();
      if (wsRef.current) wsRef.current.close();
      Object.values(pcRefs.current).forEach(pc => pc.close());
      if (localStream.current) localStream.current.getTracks().forEach(t => t.stop());
    };
  }, [roomId]);

  function toggleMute() {
    if (!localStream.current) return;
    localStream.current.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(!muted);
  }

  function toggleCam() {
    if (!localStream.current) return;
    localStream.current.getVideoTracks().forEach(t => { t.enabled = camOff; });
    setCamOff(!camOff);
  }

  function hangUp() {
    stopTimer();
    if (wsRef.current) wsRef.current.close();
    Object.values(pcRefs.current).forEach(pc => pc.close());
    if (localStream.current) localStream.current.getTracks().forEach(t => t.stop());
    setStatus('ended');
  }

  function sendChat() {
    if (!chatMsg.trim() || wsRef.current?.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type: 'chat', text: chatMsg }));
    setChat(c => [...c, { from: myName, text: chatMsg, ts: Date.now(), mine: true }]);
    setChatMsg('');
  }

  const statusLabel = { connecting:'Connecting…', waiting: peers.length > 0 ? 'Waiting for others…' : 'Waiting for agent…', incall:'In Call', ended:'Call Ended', error:'Connection Error' };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', fontFamily: 'Arial, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1e293b', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>📞 CTS BPO — {roomName || 'Support Call'}</div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>You are: <strong style={{ color: '#7dd3fc' }}>{myName}</strong></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {status === 'incall' && (
            <div style={{ background: '#ef4444', borderRadius: 20, padding: '4px 14px', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, background: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
              {fmt(duration)}
            </div>
          )}
          <div style={{ background: status==='incall'?'#10b981':status==='waiting'?'#f59e0b':'#ef4444', borderRadius: 20, padding: '4px 14px', color: '#fff', fontSize: 12, fontWeight: 700 }}>
            {statusLabel[status] || status}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', margin: 20, borderRadius: 10, padding: '14px 20px', color: '#dc2626', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {status === 'ended' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#fff' }}>
          <div style={{ fontSize: 60, marginBottom: 20 }}>👋</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>Call Ended</h2>
          <p style={{ color: '#94a3b8', margin: '0 0 24px' }}>Duration: {fmt(duration)}</p>
          <button onClick={() => window.close()} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 32px', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
            Close Window
          </button>
        </div>
      )}

      {status !== 'ended' && (
        <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>
          {/* Video area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>

            {/* Remote videos */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: peers.length > 1 ? '1fr 1fr' : '1fr', gap: 12 }}>
              {peers.length === 0 ? (
                <div style={{ background: '#1e293b', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#94a3b8', minHeight: 280 }}>
                  <div style={{ fontSize: 50, marginBottom: 16 }}>⏳</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{role === 'client' ? 'Waiting for an agent to join…' : 'Waiting for client to connect…'}</div>
                  <div style={{ fontSize: 13, marginTop: 8, opacity: 0.7 }}>Share this room link with {role === 'client' ? 'your agent' : 'the client'}</div>
                  <div style={{ background: '#0f172a', borderRadius: 8, padding: '8px 16px', marginTop: 16, fontFamily: 'monospace', fontSize: 12, color: '#7dd3fc' }}>
                    {window.location.href}
                  </div>
                </div>
              ) : peers.map(p => (
                <div key={p.peerId} style={{ background: '#1e293b', borderRadius: 12, position: 'relative', overflow: 'hidden', minHeight: 200 }}>
                  <video
                    ref={el => { if (el) remoteVideos.current[p.peerId] = el; }}
                    autoPlay playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{ position: 'absolute', bottom: 10, left: 12, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '3px 10px', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                    {p.name} {p.role === 'agent' ? '👤' : '🙋'}
                  </div>
                </div>
              ))}
            </div>

            {/* Local video (picture-in-picture) */}
            <div style={{ position: 'relative', width: 180, height: 120, background: '#1e293b', borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-end', border: '2px solid #334155' }}>
              <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }} />
              {camOff && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8', fontSize: 28 }}>📷</div>}
              <div style={{ position: 'absolute', bottom: 4, left: 6, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 8px', color: '#fff', fontSize: 11 }}>You</div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingTop: 8 }}>
              <button onClick={toggleMute} style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', background: muted ? '#ef4444' : '#334155', color: '#fff', fontSize: 20, cursor: 'pointer' }} title={muted ? 'Unmute' : 'Mute'}>
                {muted ? '🔇' : '🎤'}
              </button>
              <button onClick={toggleCam} style={{ width: 52, height: 52, borderRadius: '50%', border: 'none', background: camOff ? '#ef4444' : '#334155', color: '#fff', fontSize: 20, cursor: 'pointer' }} title={camOff ? 'Turn on camera' : 'Turn off camera'}>
                {camOff ? '📷' : '📹'}
              </button>
              <button onClick={hangUp} style={{ width: 64, height: 52, borderRadius: 26, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', fontSize: 22, cursor: 'pointer', fontWeight: 900 }} title="End Call">
                📵
              </button>
            </div>
          </div>

          {/* Chat panel */}
          <div style={{ width: 280, background: '#1e293b', borderLeft: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #334155', color: '#fff', fontWeight: 700, fontSize: 14 }}>
              💬 Chat
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {chat.length === 0 && <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', marginTop: 20 }}>Chat messages appear here</div>}
              {chat.map((m, i) => m.system ? (
                <div key={i} style={{ textAlign: 'center', color: '#475569', fontSize: 11, fontStyle: 'italic' }}>{m.text}</div>
              ) : (
                <div key={i} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  {!m.mine && <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>{m.from}</div>}
                  <div style={{ background: m.mine ? '#4f46e5' : '#334155', color: '#fff', padding: '8px 12px', borderRadius: m.mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13 }}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid #334155', display: 'flex', gap: 8 }}>
              <input value={chatMsg} onChange={e => setChatMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Type a message…" style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13 }} />
              <button onClick={sendChat} style={{ background: '#4f46e5', border: 'none', borderRadius: 8, padding: '8px 12px', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>→</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
