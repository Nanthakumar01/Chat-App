import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc, onSnapshot, updateDoc, setDoc, deleteDoc } from "firebase/firestore";

function SimpleVoiceCall({ targetUserId, selectedUser, onClose }) {
  const [callStatus, setCallStatus] = useState("connecting");
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const callStartTimeRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const currentUser = auth.currentUser;

  const configuration = {
    iceServers: [
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ]
  };

  const callId = [currentUser?.uid, targetUserId].sort().join("_voicecall_");

  const candidateToPlain = (candidate) => {
    if (!candidate) return null;
    return {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
      usernameFragment: candidate.usernameFragment
    };
  };

  const plainToCandidate = (plain) => {
    if (!plain) return null;
    return new RTCIceCandidate(plain);
  };

  const processPendingCandidates = async (pc) => {
    while (pendingCandidatesRef.current.length > 0) {
      const candidate = pendingCandidatesRef.current.shift();
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.error("Error adding pending candidate:", err);
      }
    }
  };

  const stopAllTracks = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }
  };

  useEffect(() => {
    if (!currentUser || !targetUserId) return;

    let isActive = true;
    let unsubscribeCall = null;
    let mounted = true;

    const initCall = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasMic = devices.some(device => device.kind === "audioinput");
        
        if (!hasMic) {
          setError("No microphone found on your device");
          setCallStatus("ended");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        if (!isActive || !mounted) {
          stopAllTracks();
          return;
        }
        
        localStreamRef.current = stream;
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection(configuration);
        peerConnectionRef.current = pc;

        stream.getTracks().forEach(track => {
          if (track.readyState === "live") {
            pc.addTrack(track, stream);
          }
        });

        pc.ontrack = (event) => {
          if (remoteAudioRef.current && event.streams[0] && mounted) {
            remoteAudioRef.current.srcObject = event.streams[0];
          }
          if (mounted) setCallStatus("active");
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && isActive && mounted) {
            const plainCandidate = candidateToPlain(event.candidate);
            updateDoc(doc(db, "voiceCalls", callId), {
              candidate: plainCandidate
            }).catch(console.error);
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
            if (mounted) setCallStatus("ended");
            setTimeout(() => {
              if (mounted) onClose();
            }, 2000);
          }
        };

        pc.onsignalingstatechange = () => {
          if ((pc.signalingState === "stable" || pc.signalingState === "have-local-offer") && mounted) {
            processPendingCandidates(pc);
          }
        };

        const callDoc = await getDoc(doc(db, "voiceCalls", callId));
        
        if (!callDoc.exists()) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setDoc(doc(db, "voiceCalls", callId), {
            callId,
            callerId: currentUser.uid,
            calleeId: targetUserId,
            status: "ringing",
            startedAt: new Date(),
            callerName: currentUser.displayName,
            offer: { type: offer.type, sdp: offer.sdp }
          });
          if (mounted) setCallStatus("ringing");
        } else {
          const data = callDoc.data();
          if (data.offer && !pc.currentRemoteDescription) {
            const offer = new RTCSessionDescription(data.offer);
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await updateDoc(doc(db, "voiceCalls", callId), {
              answer: { type: answer.type, sdp: answer.sdp }
            });
            if (mounted) setCallStatus("connecting");
          }
        }

        unsubscribeCall = onSnapshot(doc(db, "voiceCalls", callId), async (snapshot) => {
          if (!snapshot.exists() || !isActive || !mounted) return;
          const data = snapshot.data();
          
          if (data.status === "ended" || data.status === "rejected") {
            setCallStatus("ended");
            setTimeout(() => {
              if (mounted) onClose();
            }, 1000);
            return;
          }

          if (data.answer && pc.signalingState !== "stable" && !pc.currentRemoteDescription) {
            const answer = new RTCSessionDescription(data.answer);
            await pc.setRemoteDescription(answer);
            if (mounted) {
              setCallStatus("active");
              callStartTimeRef.current = Date.now();
            }
            await processPendingCandidates(pc);
          }

          if (data.candidate) {
            try {
              const candidate = plainToCandidate(data.candidate);
              if (candidate) {
                if (pc.currentRemoteDescription) {
                  await pc.addIceCandidate(candidate);
                } else {
                  pendingCandidatesRef.current.push(candidate);
                }
              }
            } catch (err) {
              console.error("ICE candidate error:", err);
            }
          }
        });

      } catch (err) {
        console.error("Voice call error:", err);
        if (err.name === "NotAllowedError") {
          setError("Microphone permission denied. Please allow access.");
        } else if (err.name === "NotFoundError") {
          setError("No microphone found on your device.");
        } else if (err.name === "NotReadableError") {
          setError("Microphone is in use by another application. Please close other apps using mic.");
        } else {
          setError(err.message || "Failed to start voice call");
        }
        setCallStatus("ended");
        stopAllTracks();
      }
    };

    initCall();

    const timer = setInterval(() => {
      if (callStartTimeRef.current && mounted) {
        setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
      }
    }, 1000);

    return () => {
      mounted = false;
      isActive = false;
      clearInterval(timer);
      if (unsubscribeCall) unsubscribeCall();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      stopAllTracks();
    };
  }, [currentUser, targetUserId]);

  const endCall = async () => {
    try {
      const callRef = doc(db, "voiceCalls", callId);
      await updateDoc(callRef, {
        status: "ended",
        endedAt: new Date()
      });
    } catch (err) {
      console.error("End call error:", err);
    }
    
    stopAllTracks();
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  return (
    <div className="voice-call-container">
      <div className="call-header">
        <div className="caller-info">
          <div className="caller-avatar">
            <img src={selectedUser?.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff"} alt="avatar" />
          </div>
          <div>
            <h3>{selectedUser?.displayName || "User"}</h3>
            <p className="call-status">
              {callStatus === "ringing" && "📞 Ringing..."}
              {callStatus === "active" && `🎙️ Call in progress • ${formatDuration(callDuration)}`}
              {callStatus === "connecting" && "🔌 Connecting..."}
            </p>
          </div>
        </div>
        <button className="close-call-btn" onClick={endCall}>✕</button>
      </div>

      <div className="call-controls">
        <audio ref={localAudioRef} autoPlay muted />
        <audio ref={remoteAudioRef} autoPlay />
        
        {error && (
          <div className="call-error">
            <p>❌ {error}</p>
            <button className="retry-btn" onClick={() => window.location.reload()}>
              🔄 Retry
            </button>
            <button className="close-error-btn" onClick={endCall}>Close</button>
          </div>
        )}
        
        <div className="call-actions">
          <button className={`control-btn ${isMuted ? 'off' : 'on'}`} onClick={toggleMic}>
            {isMuted ? "🎙️❌" : "🎙️"}
          </button>
          <button className="end-call-btn" onClick={endCall}>📞 End Call</button>
        </div>
      </div>
    </div>
  );
}

export default SimpleVoiceCall;