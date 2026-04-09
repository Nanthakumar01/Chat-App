<<<<<<< HEAD
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
=======
import React from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "./firebase";
import SignIn from "./SignIn";
import ChatRoom from "./ChatRoom";
import "./index.css";
import { signOut } from "firebase/auth";

function App() {
  const [user, loading, error] = useAuthState(auth);

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;
>>>>>>> b9efca0cd39f78ddf6610862c4e8c8eb331ec81d

  return (
    <div className="App">
      <header className="header">
<<<<<<< HEAD
        <span>💬 Private Chat App</span>
        {user && (
          <button onClick={() => signOut(auth)} className="signout-button">
=======
        <span>Chat App</span>
        {user && (
          <button onClick={() => signOut(auth)} className="signout-button header-button">
>>>>>>> b9efca0cd39f78ddf6610862c4e8c8eb331ec81d
            🚪 Sign Out
          </button>
        )}
      </header>
<<<<<<< HEAD
      {user ? (
        <ChatRoom 
          selectedUser={selectedUser} 
          setSelectedUser={setSelectedUser} 
        />
      ) : (
        <SignIn />
      )}
=======
      {user ? <ChatRoom /> : <SignIn />}
>>>>>>> b9efca0cd39f78ddf6610862c4e8c8eb331ec81d
    </div>
  );
}

export default App;