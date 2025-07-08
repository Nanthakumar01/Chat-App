import React, { useEffect, useRef, useState } from "react";
import { auth, db } from "./firebase";
import { signOut } from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
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
    </div>
  );
}

export default ChatRoom;