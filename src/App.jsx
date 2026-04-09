import React, { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "./firebase";
import { signOut, updateProfile } from "firebase/auth";
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import SignIn from "./SignIn";
import ChatRoom from "./ChatRoom";

function App() {
  const [user, loading, error] = useAuthState(auth);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Load user's display name from Firestore
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
      // 1. Update Firebase Auth displayName
      await updateProfile(auth.currentUser, {
        displayName: editName.trim()
      });
      
      // 2. Update Firestore users collection
      await setDoc(doc(db, "users", user.uid), {
        id: user.uid,
        displayName: editName.trim(),
        email: user.email,
        photoURL: user.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff",
        updatedAt: new Date()
      }, { merge: true });
      
      // 3. Update local state
      setDisplayName(editName.trim());
      setShowProfileModal(false);
      setEditName("");
      
      // Show success message
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {user && (
            <>
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>👤 {displayName}</span>
              <button 
                onClick={() => {
                  setEditName(displayName || "");
                  setShowProfileModal(true);
                }} 
                className="profile-button"
              >
                ✏️ Edit
              </button>
              <button onClick={() => signOut(auth)} className="signout-button">
                🚪 Sign Out
              </button>
            </>
          )}
        </div>
      </header>
      {user ? (
        <ChatRoom 
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
          currentUserName={displayName}
        />
      ) : (
        <SignIn />
      )}

      {/* Edit Profile Modal */}
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
              style={{
                width: '100%',
                padding: '0.8rem',
                marginBottom: '1rem',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: '0.9rem'
              }}
            />
            <div className="modal-buttons" style={{ display: 'flex', gap: '1rem' }}>
              <button className="save-btn" onClick={handleUpdateProfile} style={{ flex: 1, padding: '0.7rem', borderRadius: '12px', background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                💾 Save
              </button>
              <button className="cancel-btn" onClick={() => setShowProfileModal(false)} style={{ flex: 1, padding: '0.7rem', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;