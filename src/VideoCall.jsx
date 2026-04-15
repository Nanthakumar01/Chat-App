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
  const currentUser = auth.currentUser;

  const configuration = {
    iceServers: [
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10
  };

  const callId = [currentUser?.uid, targetUserId].sort().join("_videocall_");

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
    let heartbeatInterval = null;

    const initCall = async () => {
      try {
        console.log("Starting video call...");
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        
        if (!isActive || !mounted) {
          stopAllTracks();
          return;
        }
        
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log("Local video stream attached");
        }

        const pc = new RTCPeerConnection(configuration);
        peerConnectionRef.current = pc;

        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
          console.log(`Added ${track.kind} track`);
        });

        pc.ontrack = (event) => {
          console.log(`Received remote track: ${event.track.kind}`);
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
            if (event.track.kind === "video") {
              console.log("Remote video stream attached");
            }
          }
          if (mounted && callStatus !== "active") {
            setCallStatus("active");
            callStartTimeRef.current = Date.now();
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && isActive && mounted) {
            console.log("Sending ICE candidate");
            updateDoc(doc(db, "videoCalls", callId), {
              candidate: {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex
              }
            }).catch(console.error);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("ICE connection state:", pc.iceConnectionState);
          if (pc.iceConnectionState === "connected") {
            console.log("Call connected!");
            if (mounted) setCallStatus("active");
          } else if (pc.iceConnectionState === "disconnected" || 
                     pc.iceConnectionState === "failed" || 
                     pc.iceConnectionState === "closed") {
            console.log("Call disconnected");
            if (mounted) setCallStatus("ended");
            setTimeout(() => {
              if (mounted) onClose();
            }, 2000);
          }
        };

        pc.onconnectionstatechange = () => {
          console.log("Connection state:", pc.connectionState);
          if (pc.connectionState === "connected") {
            console.log("Fully connected!");
          } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            if (mounted) setCallStatus("ended");
          }
        };

        pc.onsignalingstatechange = () => {
          console.log("Signaling state:", pc.signalingState);
        };

        // Check if call exists
        const callDoc = await getDoc(doc(db, "videoCalls", callId));
        
        if (!callDoc.exists()) {
          // Caller
          console.log("Creating offer as caller...");
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
          console.log("Offer created and saved");
        } else {
          // Callee
          const data = callDoc.data();
          if (data.offer && !pc.currentRemoteDescription) {
            console.log("Processing offer as callee...");
            const offer = new RTCSessionDescription(data.offer);
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await updateDoc(doc(db, "videoCalls", callId), {
              answer: { type: answer.type, sdp: answer.sdp }
            });
            if (mounted) setCallStatus("connecting");
            console.log("Answer created and saved");
          }
        }

        // Listen for signaling updates
        unsubscribeCall = onSnapshot(doc(db, "videoCalls", callId), async (snapshot) => {
          if (!snapshot.exists() || !isActive || !mounted) return;
          const data = snapshot.data();
          console.log("Signaling update:", data.status);
          
          if (data.status === "ended" || data.status === "rejected") {
            setCallStatus("ended");
            setTimeout(() => {
              if (mounted) onClose();
            }, 1000);
            return;
          }

          // Handle answer (for caller)
          if (data.answer && !pc.currentRemoteDescription && pc.signalingState === "have-local-offer") {
            console.log("Received answer, setting remote description");
            const answer = new RTCSessionDescription(data.answer);
            await pc.setRemoteDescription(answer);
            if (mounted) {
              setCallStatus("active");
              callStartTimeRef.current = Date.now();
            }
          }

          // Handle ICE candidates
          if (data.candidate && pc.currentRemoteDescription) {
            try {
              const candidate = new RTCIceCandidate(data.candidate);
              await pc.addIceCandidate(candidate);
              console.log("ICE candidate added");
            } catch (err) {
              console.error("ICE candidate error:", err);
            }
          }
        });

        // Heartbeat to keep call alive
        heartbeatInterval = setInterval(async () => {
          if (isActive && mounted && peerConnectionRef.current) {
            const stats = await peerConnectionRef.current.getStats();
            let hasActiveConnection = false;
            stats.forEach(stat => {
              if (stat.type === "candidate-pair" && stat.state === "succeeded") {
                hasActiveConnection = true;
              }
            });
            if (!hasActiveConnection && callStatus === "active") {
              console.log("No active connection, ending call");
              setCallStatus("ended");
            }
          }
        }, 5000);

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
      if (heartbeatInterval) clearInterval(heartbeatInterval);
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