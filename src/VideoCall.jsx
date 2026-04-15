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

  // Helper function to convert ICE candidate to plain object
  const candidateToPlain = (candidate) => {
    if (!candidate) return null;
    return {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
      usernameFragment: candidate.usernameFragment
    };
  };

  // Helper function to convert plain object back to ICE candidate
  const plainToCandidate = (plain) => {
    if (!plain) return null;
    return new RTCIceCandidate(plain);
  };

  // Process pending ICE candidates
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

  useEffect(() => {
    if (!currentUser || !targetUserId) return;

    let isActive = true;
    let unsubscribeCall = null;

    const initCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isActive) return;
        localStreamRef.current = stream;
        if (localAudioRef.current) localAudioRef.current.srcObject = stream;

        const pc = new RTCPeerConnection(configuration);
        peerConnectionRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          if (remoteAudioRef.current && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0];
          }
          setCallStatus("active");
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && isActive) {
            const plainCandidate = candidateToPlain(event.candidate);
            updateDoc(doc(db, "voiceCalls", callId), {
              candidate: plainCandidate
            }).catch(console.error);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("ICE connection state:", pc.iceConnectionState);
          if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
            setCallStatus("ended");
            setTimeout(() => onClose(), 2000);
          }
        };

        pc.onsignalingstatechange = () => {
          console.log("Signaling state:", pc.signalingState);
          if (pc.signalingState === "stable" || pc.signalingState === "have-local-offer") {
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
          setCallStatus("ringing");
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
            setCallStatus("connecting");
          }
        }

        unsubscribeCall = onSnapshot(doc(db, "voiceCalls", callId), async (snapshot) => {
          if (!snapshot.exists() || !isActive) return;
          const data = snapshot.data();
          
          if (data.status === "ended") {
            setCallStatus("ended");
            setTimeout(() => onClose(), 1000);
            return;
          }

          if (data.answer && pc.signalingState !== "stable" && !pc.currentRemoteDescription) {
            const answer = new RTCSessionDescription(data.answer);
            await pc.setRemoteDescription(answer);
            setCallStatus("active");
            callStartTimeRef.current = Date.now();
            await processPendingCandidates(pc);
          }

          if (data.candidate) {
            try {
              const candidate = plainToCandidate(data.candidate);
              if (candidate) {
                if (pc.currentRemoteDescription) {
                  await pc.addIceCandidate(candidate);
                } else {
                  console.log("Queueing ICE candidate until remote description is set");
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
          setError("Microphone permission denied");
        } else if (err.name === "NotFoundError") {
          setError("No microphone found");
        } else {
          setError(err.message);
        }
        setCallStatus("ended");
      }
    };

    initCall();

    const timer = setInterval(() => {
      if (callStartTimeRef.current) {
        setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
      }
    }, 1000);

    return () => {
      isActive = false;
      clearInterval(timer);
      if (unsubscribeCall) unsubscribeCall();
      if (peerConnectionRef.current) peerConnectionRef.current.close();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [currentUser, targetUserId]);

  const endCall = async () => {
    try {
      await updateDoc(doc(db, "voiceCalls", callId), {
        status: "ended",
        endedAt: new Date()
      });
      setTimeout(() => {
        deleteDoc(doc(db, "voiceCalls", callId)).catch(console.error);
        onClose();
      }, 1000);
    } catch (err) {
      console.error("End call error:", err);
      onClose();
    }
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