import React, { useEffect } from "react";
import { playRingtone, stopRingtone } from "./ringtone";

function CallNotification({ callerName, callType, onAccept, onReject }) {
  useEffect(() => {
    // Play ringtone when notification appears
    playRingtone();
    
    return () => {
      // Stop ringtone when component unmounts
      stopRingtone();
    };
  }, []);

  const handleAccept = () => {
    stopRingtone();
    onAccept();
  };

  const handleReject = () => {
    stopRingtone();
    onReject();
  };

  return (
    <div className="call-notification">
      <div className="notification-content">
        <div className="caller-avatar-large">
          <span style={{ fontSize: "3rem" }}>{callType === "video" ? "📹" : "🎙️"}</span>
        </div>
        <h3>{callerName || "Someone"} is calling you...</h3>
        <p>{callType === "video" ? "Video call" : "Voice call"}</p>
        <div className="notification-buttons">
          <button className="accept-call-btn" onClick={handleAccept}>
            📞 Accept
          </button>
          <button className="reject-call-btn" onClick={handleReject}>
            ❌ Reject
          </button>
        </div>
      </div>
    </div>
  );
}

export default CallNotification;