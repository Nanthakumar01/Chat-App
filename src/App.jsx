import React, { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "./firebase";
import { signOut, updateProfile } from "firebase/auth";
import { doc, updateDoc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import SignIn from "./SignIn";
import ChatRoom from "./ChatRoom";

function App() {
  const [user, loading, error] = useAuthState(auth);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Online/Offline Status
  useEffect(() => {
    if (!user) return;

    const userStatusRef = doc(db, "presence", user.uid);
    
    // Set user as online when connected
    const setOnline = async () => {
      await setDoc(userStatusRef, {
        status: "online",
        lastSeen: new Date(),
        displayName: user.displayName
      }, { merge: true });
    };
    
    setOnline();
    
    // Set user as offline when disconnected
    const handleBeforeUnload = () => {
      setDoc(userStatusRef, {
        status: "offline",
        lastSeen: new Date()
      }, { merge: true });
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      setDoc(userStatusRef, {
        status: "offline",
        lastSeen: new Date()
      }, { merge: true });
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [user]);

  // Load user's display name
  useEffect(() => {
    const loadUserName = async () => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userName = userDoc.data().displayName;
            setDisplayName(userName || user.displayName || user.email?.split('@')[0]);
          } else {
            setDisplayName(user.displayName || user.email?.split('@')[0]);
          }
        } catch (err) {
          console.error("Error loading user name:", err);
          setDisplayName(user.displayName || user.email?.split('@')[0]);
        }
      }
    };
    loadUserName();
  }, [user]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: '0 auto 12px', width: '32px', height: '32px', borderTopColor: '#a78bfa' }}></div>
        <p>✨ Loading Chat App...</p>
      </div>
    );
  }
  if (error) return <div className="error">⚠️ Error: {error.message}</div>;

  const handleUpdateProfile = async () => {
    if (!editName.trim() || !user) return;
    
    try {
      await updateProfile(auth.currentUser, {
        displayName: editName.trim()
      });
      
      await setDoc(doc(db, "users", user.uid), {
        id: user.uid,
        displayName: editName.trim(),
        email: user.email,
        photoURL: user.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff",
        updatedAt: new Date()
      }, { merge: true });
      
      setDisplayName(editName.trim());
      setShowProfileModal(false);
      setEditName("");
      alert("✅ Name updated successfully!");
      
    } catch (err) {
      console.error("Error updating name:", err);
      alert("Failed to update name: " + err.message);
    }
  };

  return (
    <div className="App">
      <header className="header">
        <span>💬 Private Chat App</span>
        <div className="header-right">
          {user && (
            <>
              <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>👤 {displayName}</span>
              <button 
                onClick={() => {
                  setEditName(displayName || "");
                  setShowProfileModal(true);
                }} 
                className="profile-button"
              >
                ✏️
              </button>
              <button onClick={() => signOut(auth)} className="signout-button">
                🚪
              </button>
            </>
          )}
        </div>
      </header>
      {user ? (
        <ChatRoom 
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
          currentUserData={{ uid: user.uid, displayName }}
        />
      ) : (
        <SignIn />
      )}

      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="edit-profile-modal" onClick={(e) => e.stopPropagation()}>
            <h3>✏️ Edit Your Name</h3>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
            <div className="modal-buttons">
              <button className="save-btn" onClick={handleUpdateProfile}>💾 Save</button>
              <button className="cancel-btn" onClick={() => setShowProfileModal(false)}>❌ Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;