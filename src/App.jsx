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

  return (
    <div className="App">
      <header className="header">
        <span>Chat App</span>
        {user && (
          <button onClick={() => signOut(auth)} className="signout-button header-button">
            🚪 Sign Out
          </button>
        )}
      </header>
      {user ? <ChatRoom /> : <SignIn />}
    </div>
  );
}

export default App;