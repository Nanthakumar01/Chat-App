import React, { useState } from "react";
import { auth } from "./firebase";

function ChatMessage({ message, onEdit, onDelete }) {
  const { id, text, uid, photoURL, createdAt, edited } = message;
  const currentUser = auth.currentUser;
  const messageClass = uid === currentUser?.uid ? "sent" : "received";
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    let date;
    if (timestamp?.toDate) date = timestamp.toDate();
    else if (timestamp?.seconds) date = new Date(timestamp.seconds * 1000);
    else date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleEdit = async () => {
    if (editText.trim() === text) {
      setIsEditing(false);
      return;
    }
    await onEdit(id, editText.trim());
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (window.confirm("Delete this message?")) {
      await onDelete(id);
    }
  };

  // Long press / context menu for mobile & desktop
  const handleContextMenu = (e) => {
    if (uid === currentUser?.uid) {
      e.preventDefault();
      const action = window.confirm("Edit message? Click OK to Edit, Cancel to Delete");
      if (action) {
        setIsEditing(true);
      } else {
        handleDelete();
      }
    }
  };

  if (isEditing) {
    return (
      <div className={`message ${messageClass} editing`}>
        <img src={photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff"} alt="avatar" />
        <div className="bubble">
          <input
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleEdit()}
            className="edit-input"
            autoFocus
          />
          <div className="edit-actions">
            <button onClick={handleEdit} className="edit-save">💾 Save</button>
            <button onClick={() => setIsEditing(false)} className="edit-cancel">✖ Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`message ${messageClass}`}
      onContextMenu={handleContextMenu}
      title={uid === currentUser?.uid ? "Right click / Long press to edit or delete" : ""}
    >
      <img src={photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff"} alt="avatar" />
      <div className="bubble">
        <p>{text}</p>
        <div className="message-footer">
          <span className="timestamp">{formatTime(createdAt)}</span>
          {edited && <span className="edited-badge"> (edited)</span>}
        </div>
      </div>
      {uid === currentUser?.uid && (
        <div className="message-actions">
          <button onClick={() => setIsEditing(true)} className="action-btn" title="Edit">✏️</button>
          <button onClick={handleDelete} className="action-btn" title="Delete">🗑️</button>
        </div>
      )}
import React from "react";
import { auth } from "./firebase.jsx";

function ChatMessage({ message }) {
  const { text, uid, photoURL } = message;

  const messageClass = uid === auth.currentUser.uid ? "sent" : "received";

  return (
    <div className={`message ${messageClass}`}>
      <img src={photoURL} alt="avatar" />
      <p>{text}</p>
    </div>
  );
}

export default ChatMessage;