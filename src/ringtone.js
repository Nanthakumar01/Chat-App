// Web Audio API ringtone - no MP3 file required
let audioContext = null;
let oscillator = null;
let gainNode = null;
let isPlaying = false;

export const playRingtone = () => {
  stopRingtone();
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.value = 440;
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    isPlaying = true;
    
    // Create beeping pattern
    let beepCount = 0;
    const interval = setInterval(() => {
      if (!isPlaying) {
        clearInterval(interval);
        return;
      }
      
      if (beepCount % 2 === 0) {
        gainNode.gain.value = 0.3;
        oscillator.frequency.value = 440;
      } else {
        gainNode.gain.value = 0;
      }
      beepCount++;
    }, 500);
    
    window.ringtoneInterval = interval;
    
  } catch (err) {
    console.error("Ringtone error:", err);
  }
};

export const stopRingtone = () => {
  isPlaying = false;
  if (window.ringtoneInterval) {
    clearInterval(window.ringtoneInterval);
    window.ringtoneInterval = null;
  }
  if (oscillator) {
    try {
      oscillator.stop();
    } catch (e) {}
    oscillator = null;
  }
  if (audioContext) {
    audioContext.close().catch(console.error);
    audioContext = null;
  }
  gainNode = null;
};