import React, { useState, useEffect } from "react";
import { auth, provider, db } from "./firebase";
import { signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

function SignIn() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const saveUserToFirestore = async (user) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid), {
      id: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || "User",
      email: user.email,
      photoURL: user.photoURL || "https://ui-avatars.com/api/?background=8b5cf6&color=fff&bold=true",
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    }, { merge: true });
    console.log("✅ User saved:", user.displayName);
  };

  // Auto-save when user signs in
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await saveUserToFirestore(user);
      }
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const result = await signInWithPopup(auth, provider);
      await saveUserToFirestore(result.user);
      console.log("✅ Sign-in successful:", result.user.displayName);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/popup-blocked") {
        setErrorMsg("Popup blocked – please allow popups for this site.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setErrorMsg("Sign‑in cancelled – you closed the popup.");
      } else {
        setErrorMsg("Sign‑in failed: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-container">
      <div className="signin-card">
        <h2>💬 Private Chat App</h2>
        <p>One-to-One • Edit • Delete • Secure</p>
        <button onClick={signInWithGoogle} className="signin-button" disabled={loading}>
          {loading ? (
            <><span className="spinner"></span> Connecting...</>
          ) : (
            <>🚀 Sign in with Google</>
          )}
        </button>
        {errorMsg && <div className="error-message">{errorMsg}</div>}
      </div>
    </div>
  );
}

export default SignIn;