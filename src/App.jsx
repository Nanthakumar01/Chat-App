import React, { useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "./firebase";
import { signOut } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import SignIn from "./SignIn";
import ChatRoom from "./ChatRoom";

function App() {
  const [user, loading, error] = useAuthState(auth);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState("");

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
      await updateDoc(doc(db, "users", user.uid), {
        displayName: editName.trim()
      });
      setShowProfileModal(false);
      setEditName("");
      // Refresh page to update UI
      window.location.reload();
    } catch (err) {
      console.error("Error updating name:", err);
      alert("Failed to update name: " + err.message);
    }
  };

  return (
    <div className="App">
      <header className="header">
        <span>💬 Private Chat App</span>
        <div>
          {user && (
            <>
              <button 
                onClick={() => {
                  setEditName(user.displayName || "");
                  setShowProfileModal(true);
                }} 
                className="profile-button"
              >
                ✏️ Edit Name
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
        />
      ) : (
        <SignIn />
      )}

      {/* Edit Profile Modal */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="edit-profile-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Your Name</h3>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
            />
            <div className="modal-buttons">
              <button className="save-btn" onClick={handleUpdateProfile}>Save</button>
              <button className="cancel-btn" onClick={() => setShowProfileModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;