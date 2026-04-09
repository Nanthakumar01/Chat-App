import React, { useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "./firebase";
import { signOut } from "firebase/auth";
import SignIn from "./SignIn";
import ChatRoom from "./ChatRoom";

function App() {
  const [user, loading, error] = useAuthState(auth);
  const [selectedUser, setSelectedUser] = useState(null);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: '0 auto 12px', width: '32px', height: '32px', borderTopColor: '#a78bfa' }}></div>
        <p>✨ Loading Chat App...</p>
      </div>
    );
  }
  if (error) return <div className="error">⚠️ Error: {error.message}</div>;

  return (
    <div className="App">
      <header className="header">
        <span>💬 Private Chat App</span>
        {user && (
          <button onClick={() => signOut(auth)} className="signout-button">
            🚪 Sign Out
          </button>
        )}
      </header>
      {user ? (
        <ChatRoom 
          selectedUser={selectedUser} 
          setSelectedUser={setSelectedUser} 
        />
      ) : (
        <SignIn />
      )}
    </div>
  );
}

export default App;