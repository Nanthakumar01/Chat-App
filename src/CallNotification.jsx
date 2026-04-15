import React from "react";

function CallNotification({ callerName, callType, onAccept, onReject }) {
  return (
    <div className="call-notification">
      <div className="notification-content">
        <div className="caller-avatar-large">
          <span style={{ fontSize: "3rem" }}>{callType === "video" ? "📹" : "🎙️"}</span>
        </div>
        <h3>{callerName || "Someone"} is calling you...</h3>
        <p>{callType === "video" ? "Video call" : "Voice call"}</p>
        <div className="notification-buttons">
          <button className="accept-call-btn" onClick={onAccept}>
            📞 Accept
          </button>
          <button className="reject-call-btn" onClick={onReject}>
            ❌ Reject
          </button>
        </div>
      </div>
    </div>
  );
}

export default CallNotification;