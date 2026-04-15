import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { doc, getDoc, onSnapshot, updateDoc, setDoc, deleteDoc } from "firebase/firestore";

function SimpleVideoCall({ targetUserId, selectedUser, onClose }) {
  const [callStatus, setCallStatus] = useState("connecting");
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
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

  const callId = [currentUser?.uid, targetUserId].sort().join("_videocall_");

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
        // Get media stream
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        
        if (!isActive) return;
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Create peer connection
        const pc = new RTCPeerConnection(configuration);
        peerConnectionRef.current = pc;

        // Add tracks
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // Handle remote stream
        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
          setCallStatus("active");
        };

        // ICE candidates - Convert to plain object before saving
        pc.onicecandidate = (event) => {
          if (event.candidate && isActive) {
            const plainCandidate = candidateToPlain(event.candidate);
            updateDoc(doc(db, "videoCalls", callId), {
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
          // When remote description is set, process pending candidates
          if (pc.signalingState === "stable" || pc.signalingState === "have-local-offer") {
            processPendingCandidates(pc);
          }
        };

        // Check if call document exists
        const callDoc = await getDoc(doc(db, "videoCalls", callId));
        
        if (!callDoc.exists()) {
          // Caller: Create offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          await setDoc(doc(db, "videoCalls", callId), {
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
          // Callee: Check for existing offer
          const data = callDoc.data();
          if (data.offer && !pc.currentRemoteDescription) {
            const offer = new RTCSessionDescription(data.offer);
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await updateDoc(doc(db, "videoCalls", callId), {
              answer: { type: answer.type, sdp: answer.sdp }
            });
            setCallStatus("connecting");
          }
        }

        // Listen for signaling data
        unsubscribeCall = onSnapshot(doc(db, "videoCalls", callId), async (snapshot) => {
          if (!snapshot.exists() || !isActive) return;
          const data = snapshot.data();
          
          if (data.status === "ended") {
            setCallStatus("ended");
            setTimeout(() => onClose(), 1000);
            return;
          }

          // Handle answer (for caller)
          if (data.answer && pc.signalingState !== "stable" && !pc.currentRemoteDescription) {
            const answer = new RTCSessionDescription(data.answer);
            await pc.setRemoteDescription(answer);
            setCallStatus("active");
            callStartTimeRef.current = Date.now();
            // Process any pending candidates after remote description is set
            await processPendingCandidates(pc);
          }

          // Handle ICE candidates - Queue them if remote description not ready
          if (data.candidate) {
            try {
              const candidate = plainToCandidate(data.candidate);
              if (candidate) {
                // Check if remote description is set
                if (pc.currentRemoteDescription) {
                  await pc.addIceCandidate(candidate);
                } else {
                  // Queue candidate for later
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
        console.error("Video call error:", err);
        if (err.name === "NotAllowedError") {
          setError("Camera/Microphone permission denied");
        } else if (err.name === "NotFoundError") {
          setError("No camera/microphone found");
        } else {
          setError(err.message);
        }
        setCallStatus("ended");
      }
    };

    initCall();

    // Duration timer
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
      await updateDoc(doc(db, "videoCalls", callId), {
        status: "ended",
        endedAt: new Date()
      });
      setTimeout(() => {
        deleteDoc(doc(db, "videoCalls", callId)).catch(console.error);
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

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
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
    <div className="video-call-container">
      <div className="video-call-header">
        <div>
          <h3>📹 Video Call with {selectedUser?.displayName || "User"}</h3>
          <p className="call-status">
            {callStatus === "ringing" && "📞 Ringing..."}
            {callStatus === "active" && `🎥 Call in progress • ${formatDuration(callDuration)}`}
            {callStatus === "ended" && "📞 Call ended"}
            {callStatus === "connecting" && "🔌 Connecting..."}
          </p>
        </div>
        <button className="close-call-btn" onClick={endCall}>✕</button>
      </div>

      <div className="video-container">
        <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
        <video ref={localVideoRef} className="local-video" autoPlay playsInline muted />
      </div>

      {error && (
        <div className="call-error">
          <p>❌ {error}</p>
          <button className="retry-btn" onClick={endCall}>Close</button>
        </div>
      )}

      <div className="video-controls">
        <button className={`control-btn ${isVideoOff ? 'off' : 'on'}`} onClick={toggleCamera}>
          {isVideoOff ? "📷❌" : "📷"}
        </button>
        <button className={`control-btn ${isMuted ? 'off' : 'on'}`} onClick={toggleMic}>
          {isMuted ? "🎙️❌" : "🎙️"}
        </button>
        <button className="end-call-btn" onClick={endCall}>📞 End Call</button>
      </div>
    </div>
  );
}

export default SimpleVideoCall;