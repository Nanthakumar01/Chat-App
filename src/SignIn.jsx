import React, { useState } from "react";
import { auth, provider } from "./firebase";
import { signInWithPopup } from "firebase/auth";

function SignIn() {
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const signInWithGoogle = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMsg("");

    try {
      const result = await signInWithPopup(auth, provider);
      console.log("Signed in user:", result.user);
    } catch (error) {
      console.error("Sign-in error:", error);
      if (error.code === "auth/popup-blocked") {
        setErrorMsg("Popup blocked. Please enable popups in your browser.");
      } else if (error.code === "auth/popup-closed-by-user") {
        setErrorMsg("You closed the popup before signing in.");
      } else if (error.code === "auth/cancelled-popup-request") {
        setErrorMsg("Sign-in cancelled due to another popup request.");
      } else {
        setErrorMsg("Sign-in failed: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-container">
      <div className="signin-card">
        <h2>Welcome to the Chat App</h2>
        <button
          onClick={signInWithGoogle}
          className="signin-button"
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>
        {errorMsg && <p style={{ color: "red", marginTop: "1rem" }}>{errorMsg}</p>}
      </div>
    </div>
  );
}

export default SignIn;