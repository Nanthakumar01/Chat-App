import React, { useEffect, useRef, useState } from "react";
import { auth, db } from "./firebase";
<<<<<<< HEAD
=======
import { signOut } from "firebase/auth";
>>>>>>> b9efca0cd39f78ddf6610862c4e8c8eb331ec81d
import {
  collection,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
<<<<<<< HEAD
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
        console.log("✅ User saved:", currentUser.displayName);
      } catch (err) {
        console.error("Error saving user:", err);
      }
    };
    saveCurrentUser();
  }, [currentUser]);

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
        console.log("📋 Other users:", otherUsers.map(u => u.displayName));
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [currentUser]);

  // Real-time messages - FIXED chatId logic
  useEffect(() => {
    if (!selectedUser || !currentUser) return;

    // IMPORTANT: Consistent chatId format (sorted UIDs)
    const chatId = [currentUser.uid, selectedUser.id].sort().join('_');
    console.log("🔑 ChatId:", chatId);
    console.log("Current user:", currentUser.displayName);
    console.log("Selected user:", selectedUser.displayName);

    const q = query(
      collection(db, "private_messages"),
      where("chatId", "==", chatId),
      orderBy("createdAt", "asc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      console.log(`📨 ${msgs.length} messages loaded for chat with ${selectedUser.displayName}`);
    }, (error) => {
      console.error("Snapshot error:", error);
    });
    return unsubscribe;
  }, [selectedUser, currentUser]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmed = formValue.trim();
    if (!trimmed || sending || !selectedUser || !currentUser) return;

    setSending(true);
    // Same chatId format as above
    const chatId = [currentUser.uid, selectedUser.id].sort().join('_');
    
    try {
      const newMessage = {
        text: trimmed,
        createdAt: serverTimestamp(),
        uid: currentUser.uid,
        senderName: currentUser.displayName,
        receiverId: selectedUser.id,
        chatId: chatId,
        photoURL: currentUser.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff",
        edited: false
      };
      
      await addDoc(collection(db, "private_messages"), newMessage);
      console.log("✅ Message sent to:", selectedUser.displayName);
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

  if (!currentUser) return null;

  return (
    <div className="main-content">
      <div className="chat-layout">
        {/* Users Sidebar */}
        <div className="users-sidebar">
          <div className="users-header">
            <h3>👥 Contacts ({users.length})</h3>
          </div>
          <div className="users-list">
            {loadingUsers ? (
              <div className="loading-users">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="no-users">
                <p>😢 No other users yet</p>
                <small>Sign in with another Google account in a different browser</small>
              </div>
            ) : (
              users.map((user) => (
                <div
                  key={user.id}
                  className={`user-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedUser(user);
                    console.log("Selected user:", user.displayName);
                  }}
                >
                  <img 
                    src={user.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff"} 
                    alt="avatar" 
                  />
                  <div className="user-info">
                    <div className="user-name">{user.displayName || user.email || "User"}</div>
                    <div className="user-status">Click to chat</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="chat-container">
          {!selectedUser ? (
            <div className="no-chat-selected">
              <div className="no-chat-icon">💬</div>
              <h3>Select a contact to start chatting</h3>
              <p>Choose someone from the list to begin private messaging</p>
            </div>
          ) : (
            <>
              <div className="chat-header">
                <img 
                  src={selectedUser.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff"} 
                  alt="avatar" 
                />
                <div>
                  <h3>{selectedUser.displayName || selectedUser.email || "User"}</h3>
                  <p>Private conversation • Edit/Delete messages</p>
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
                <button
                  type="submit"
                  disabled={!formValue.trim() || sending}
                  className="send-button"
                >
                  {sending ? "⏳" : "➤"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
=======
} from "firebase/firestore";
import ChatMessage from "./ChatMessage";

function ChatRoom() {
  const dummy = useRef();
  const [messages, setMessages] = useState([]);
  const [formValue, setFormValue] = useState("");

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      dummy.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => unsubscribe();
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();
    const { uid, photoURL } = auth.currentUser;

    const newMessage = {
      text: formValue,
      createdAt: new Date(),
      uid,
      photoURL,
    };

    // Optimistic UI update
    setMessages((prev) => [...prev, { id: Date.now(), ...newMessage }]);
    setFormValue("");

    try {
      await addDoc(collection(db, "messages"), {
        text: formValue,
        createdAt: serverTimestamp(),
        uid,
        photoURL,
      });
    } catch (err) {
      alert("Message send failed: " + err.message);
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={dummy}></div>
      </div>

      <form onSubmit={sendMessage} className="form">
        <input
          value={formValue}
          onChange={(e) => setFormValue(e.target.value)}
          placeholder="Say something nice"
          className="input"
        />
        <button type="submit" disabled={!formValue} className="send-button">
          🕊️
        </button>
      </form>
>>>>>>> b9efca0cd39f78ddf6610862c4e8c8eb331ec81d
    </div>
  );
}

export default ChatRoom;