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

  // Stop all tracks properly
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
        // Check if media devices are available
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === "videoinput");
        const hasMic = devices.some(device => device.kind === "audioinput");
        
        if (!hasCamera && !hasMic) {
          setError("No camera or microphone found on your device");
          setCallStatus("ended");
          return;
        }

        // Request media with specific constraints
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: hasCamera ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
          audio: hasMic ? true : false
        });
        
        if (!isActive || !mounted) {
          stopAllTracks();
          return;
        }
        
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Create peer connection
        const pc = new RTCPeerConnection(configuration);
        peerConnectionRef.current = pc;

        // Add tracks
        stream.getTracks().forEach(track => {
          if (track.readyState === "live") {
            pc.addTrack(track, stream);
          }
        });

        // Handle remote stream
        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0] && mounted) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
          if (mounted) setCallStatus("active");
        };

        // ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate && isActive && mounted) {
            const plainCandidate = candidateToPlain(event.candidate);
            updateDoc(doc(db, "videoCalls", callId), {
              candidate: plainCandidate
            }).catch(console.error);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("ICE connection state:", pc.iceConnectionState);
          if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
            if (mounted) setCallStatus("ended");
            setTimeout(() => {
              if (mounted) onClose();
            }, 2000);
          }
        };

        pc.onsignalingstatechange = () => {
          console.log("Signaling state:", pc.signalingState);
          if ((pc.signalingState === "stable" || pc.signalingState === "have-local-offer") && mounted) {
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
          if (mounted) setCallStatus("ringing");
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
            if (mounted) setCallStatus("connecting");
          }
        }

        // Listen for signaling data
        unsubscribeCall = onSnapshot(doc(db, "videoCalls", callId), async (snapshot) => {
          if (!snapshot.exists() || !isActive || !mounted) return;
          const data = snapshot.data();
          
          if (data.status === "ended" || data.status === "rejected") {
            setCallStatus("ended");
            setTimeout(() => {
              if (mounted) onClose();
            }, 1000);
            return;
          }

          // Handle answer (for caller)
          if (data.answer && pc.signalingState !== "stable" && !pc.currentRemoteDescription) {
            const answer = new RTCSessionDescription(data.answer);
            await pc.setRemoteDescription(answer);
            if (mounted) {
              setCallStatus("active");
              callStartTimeRef.current = Date.now();
            }
            await processPendingCandidates(pc);
          }

          // Handle ICE candidates
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
        console.error("Video call error:", err);
        if (err.name === "NotAllowedError") {
          setError("Camera/Microphone permission denied. Please allow access.");
        } else if (err.name === "NotFoundError") {
          setError("No camera or microphone found on your device.");
        } else if (err.name === "NotReadableError") {
          setError("Camera/Microphone is in use by another application. Please close other apps using camera.");
        } else {
          setError(err.message || "Failed to start video call");
        }
        setCallStatus("ended");
        // Clean up on error
        stopAllTracks();
      }
    };

    initCall();

    // Duration timer
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
      const callRef = doc(db, "videoCalls", callId);
      await updateDoc(callRef, {
        status: "ended",
        endedAt: new Date()
      });
    } catch (err) {
      console.error("End call error:", err);
    }
    
    // Clean up
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
          <button className="retry-btn" onClick={() => window.location.reload()}>
            🔄 Retry
          </button>
          <button className="close-error-btn" onClick={endCall}>Close</button>
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