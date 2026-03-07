const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
let audioCtx: AudioContext | null = null;

function playTone(freq: number, type: OscillatorType, duration: number, vol: number, startTime: number, masterVol: number = 100) {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx!.state === 'suspended') audioCtx!.resume();

    const ctx = audioCtx!;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    // Calculate final volume relative to master volume (0-100)
    const finalVol = vol * (masterVol / 100);
    gainNode.gain.setValueAtTime(finalVol, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
}

export const playSound = (type: "start" | "complete" | "clear" | "finding", enabled: boolean, masterVol: number = 100) => {
    if (!enabled) return;
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx!;
    const now = ctx.currentTime;

    if (type === "start") {
        playTone(440, "sine", 0.1, 0.1, now, masterVol);
        playTone(554, "sine", 0.1, 0.1, now + 0.08, masterVol);
        playTone(659, "sine", 0.3, 0.1, now + 0.16, masterVol);
    } else if (type === "complete") {
        playTone(523.25, "sine", 0.15, 0.1, now, masterVol);
        playTone(659.25, "sine", 0.15, 0.1, now + 0.1, masterVol);
        playTone(783.99, "sine", 0.4, 0.1, now + 0.2, masterVol);
    } else if (type === "clear") {
        playTone(660, "sine", 0.05, 0.08, now, masterVol);
        playTone(440, "sine", 0.05, 0.08, now + 0.06, masterVol);
    } else if (type === "finding") {
        playTone(880, "sine", 0.05, 0.12, now, masterVol);
    }
};
