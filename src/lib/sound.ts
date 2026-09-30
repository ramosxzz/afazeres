// Sons sintetizados com WebAudio (sem arquivos): sino de vento (風鈴) e "pop" de tarefa.

let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());

function tone(freq: number, start: number, duration: number, gain: number, type: OscillatorType = "sine") {
  const ac = audio();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, ac.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
}

/** Furin: parciais inarmônicos, decaimento longo. */
export function playFurin() {
  try {
    const notes = [1318.5, 1760, 2093, 1568];
    notes.forEach((f, i) => {
      tone(f, i * 0.22, 2.4, 0.08);
      tone(f * 2.76, i * 0.22, 0.9, 0.02);
    });
  } catch {
    /* sem áudio */
  }
}

export function playPop() {
  try {
    tone(880, 0, 0.12, 0.06, "triangle");
    tone(1320, 0.06, 0.18, 0.05, "triangle");
  } catch {
    /* sem áudio */
  }
}

/** Taiko curto para projeto finalizado. */
export function playTaiko() {
  try {
    const ac = audio();
    [0, 0.18].forEach((t) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.frequency.setValueAtTime(140, ac.currentTime + t);
      osc.frequency.exponentialRampToValueAtTime(50, ac.currentTime + t + 0.35);
      g.gain.setValueAtTime(0.35, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.4);
      osc.connect(g).connect(ac.destination);
      osc.start(ac.currentTime + t);
      osc.stop(ac.currentTime + t + 0.45);
    });
    tone(1568, 0.4, 1.8, 0.05);
  } catch {
    /* sem áudio */
  }
}
