import React, { useEffect, useRef, useState } from "react";
import { auth, db } from "./firebase";
import VideoCall from "./VideoCall";
import VoiceCall from "./VoiceCall";
import {
  collection,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  where,
  getDocs,
  setDoc
} from "firebase/firestore";
import ChatMessage from "./ChatMessage";

function ChatRoom({ selectedUser, setSelectedUser }) {
  const [messages, setMessages] = useState([]);
  const [formValue, setFormValue] = useState("");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [userStatus, setUserStatus] = useState({});
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const messagesEndRef = useRef(null);
  const currentUser = auth.currentUser;

  // Save current user to Firestore
  useEffect(() => {
    const saveCurrentUser = async () => {
      if (!currentUser) return;
      try {
        await setDoc(doc(db, "users", currentUser.uid), {
          id: currentUser.uid,
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || "User",
          email: currentUser.email,
          photoURL: currentUser.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff",
          lastSeen: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error("Error saving user:", err);
      }
    };
    saveCurrentUser();
  }, [currentUser]);

  // Listen to online/offline status of all users
  useEffect(() => {
    const presenceRef = collection(db, "presence");
    const unsubscribe = onSnapshot(presenceRef, (snapshot) => {
      const status = {};
      snapshot.docs.forEach(doc => {
        status[doc.id] = doc.data();
      });
      setUserStatus(status);
    });
    return unsubscribe;
  }, []);

  // Fetch all users
  useEffect(() => {
    const fetchUsers = async () => {
      if (!currentUser) return;
      try {
        const usersRef = collection(db, "users");
        const snapshot = await getDocs(usersRef);
        const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const otherUsers = usersList.filter(u => u.id !== currentUser.uid);
        setUsers(otherUsers);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [currentUser]);

  // Real-time messages
  useEffect(() => {
    if (!selectedUser || !currentUser) return;

    const chatId = [currentUser.uid, selectedUser.id].sort().join('_');
    const q = query(
      collection(db, "private_messages"),
      where("chatId", "==", chatId),
      orderBy("createdAt", "asc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    }, (error) => {
      console.error("Snapshot error:", error);
    });
    return unsubscribe;
  }, [selectedUser, currentUser]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setShowSidebar(false);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmed = formValue.trim();
    if (!trimmed || sending || !selectedUser || !currentUser) return;

    setSending(true);
    const chatId = [currentUser.uid, selectedUser.id].sort().join('_');
    
    try {
      await addDoc(collection(db, "private_messages"), {
        text: trimmed,
        createdAt: serverTimestamp(),
        uid: currentUser.uid,
        senderName: currentUser.displayName,
        receiverId: selectedUser.id,
        chatId: chatId,
        photoURL: currentUser.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff",
        edited: false
      });
      setFormValue("");
    } catch (err) {
      console.error("Send error:", err);
      alert("❌ Failed to send: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const editMessage = async (messageId, newText) => {
    try {
      const messageRef = doc(db, "private_messages", messageId);
      await updateDoc(messageRef, {
        text: newText,
        edited: true,
        editedAt: serverTimestamp()
      });
    } catch (err) {
      alert("Failed to edit: " + err.message);
    }
  };

  const deleteMessage = async (messageId) => {
    if (window.confirm("Delete this message?")) {
      try {
        await deleteDoc(doc(db, "private_messages", messageId));
      } catch (err) {
        alert("Failed to delete: " + err.message);
      }
    }
  };

  // Get user status
  const getUserStatus = (userId) => {
    const status = userStatus[userId];
    if (!status) return { text: "offline", isOnline: false };
    return { text: status.status, isOnline: status.status === "online" };
  };

  // Call functions
  const startVideoCall = () => {
    if (!selectedUser) return;
    setShowVideoCall(true);
  };

  const startVoiceCall = () => {
    if (!selectedUser) return;
    setShowVoiceCall(true);
  };

  if (!currentUser) return null;

  return (
    <div className="main-content">
      <div className="chat-layout">
        {showSidebar && (
          <div className="sidebar-overlay" onClick={() => setShowSidebar(false)}></div>
        )}
        
        <div className={`users-sidebar ${showSidebar ? 'active' : ''}`}>
          <div className="users-header">
            <h3>👥 Contacts ({users.length})</h3>
            <button className="close-sidebar" onClick={() => setShowSidebar(false)}>✕</button>
          </div>
          <div className="users-list">
            {loadingUsers ? (
              <div className="loading-users">
                <div className="spinner"></div>
                <p>Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="no-users">
                <p>😢 No other users yet</p>
                <small>Sign in with another Google account</small>
              </div>
            ) : (
              users.map((user) => {
                const status = getUserStatus(user.id);
                return (
                  <div
                    key={user.id}
                    className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                    onClick={() => handleSelectUser(user)}
                  >
                    <div className="user-avatar">
                      <img src={user.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff"} alt="avatar" />
                      <div className={status.isOnline ? "online-dot" : "offline-dot"}></div>
                    </div>
                    <div className="user-info">
                      <div className="user-name">{user.displayName || user.email || "User"}</div>
                      <div className={`user-status-text ${status.isOnline ? "online" : "offline"}`}>
                        {status.isOnline ? "● Online" : "○ Offline"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="chat-container">
          {!selectedUser ? (
            <div className="no-chat-selected">
              <div className="no-chat-icon">💬</div>
              <h3>Select a contact to start chatting</h3>
              <p>Choose someone from the list to begin private messaging</p>
              <button className="show-contacts-btn" onClick={() => setShowSidebar(true)}>
                📋 Show Contacts
              </button>
            </div>
          ) : (
            <>
              <div className="chat-header">
                <button className="menu-toggle" onClick={() => setShowSidebar(true)}>☰</button>
                <div className="chat-header-avatar">
                  <img src={selectedUser.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff"} alt="avatar" />
                  <div className={getUserStatus(selectedUser.id).isOnline ? "online-dot" : "offline-dot"}></div>
                </div>
                <div className="chat-header-info">
                  <h3>{selectedUser.displayName || selectedUser.email || "User"}</h3>
                  <div className={`chat-status ${getUserStatus(selectedUser.id).isOnline ? "online" : "offline"}`}>
                    <span className={`status-dot ${getUserStatus(selectedUser.id).isOnline ? "online" : "offline"}`}></span>
                    {getUserStatus(selectedUser.id).isOnline ? "Online" : "Offline"}
                  </div>
                </div>
                <div className="call-buttons">
                  <button 
                    className="call-btn video-call-btn" 
                    onClick={startVideoCall} 
                    title="Video Call"
                  >
                    📹
                  </button>
                  <button 
                    className="call-btn voice-call-btn" 
                    onClick={startVoiceCall} 
                    title="Voice Call"
                  >
                    🎙️
                  </button>
                </div>
              </div>
              
              <div className="messages">
                {messages.length === 0 ? (
                  <div className="no-messages">
                    <p>✨ No messages yet</p>
                    <small>Send a message to start chatting!</small>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <ChatMessage 
                      key={msg.id} 
                      message={msg} 
                      onEdit={editMessage}
                      onDelete={deleteMessage}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendMessage} className="form">
                <input
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  placeholder={`Message ${selectedUser.displayName || selectedUser.email}... 💫`}
                  className="input"
                  disabled={sending}
                  autoComplete="off"
                />
                <button type="submit" disabled={!formValue.trim() || sending} className="send-button">
                  {sending ? "⏳" : "➤"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Video Call Component */}
      {showVideoCall && (
        <VideoCall 
          targetUserId={selectedUser?.id}
          selectedUser={selectedUser}
          onClose={() => setShowVideoCall(false)}
        />
      )}

      {/* Voice Call Component */}
      {showVoiceCall && (
        <VoiceCall 
          targetUserId={selectedUser?.id}
          selectedUser={selectedUser}
          onClose={() => setShowVoiceCall(false)}
        />
      )}
    </div>
  );
}

export default ChatRoom;