export interface SoundOption {
  id: string
  name: string
}

export const SOUND_OPTIONS: SoundOption[] = [
  { id: "alert", name: "Alert" },
  { id: "chime", name: "Chime" },
  { id: "horn", name: "Horn" },
  { id: "siren", name: "Siren" },
  { id: "ding", name: "Ding" },
  { id: "alarm", name: "Alarm" },
  { id: "baseball", name: "Baseball" },
  { id: "fanfare", name: "Fanfare" },
  { id: "sadtrombone", name: "Sad Trombone" },
  { id: "birthday", name: "Birthday" },
  { id: "buzzer", name: "Buzzer" },
  { id: "victory", name: "Victory" },
  { id: "none", name: "None" },
]

function osc(ctx: AudioContext, type: OscillatorType, freq: number, start: number, end: number, vol: number, dest: AudioNode) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.connect(g)
  g.connect(dest)
  o.frequency.setValueAtTime(freq, ctx.currentTime + start)
  g.gain.setValueAtTime(vol, ctx.currentTime + start)
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + end)
  o.start(ctx.currentTime + start)
  o.stop(ctx.currentTime + end)
  return o
}

function note(ctx: AudioContext, freq: number, start: number, dur: number, vol = 0.2, type: OscillatorType = "sine") {
  return osc(ctx, type, freq, start, start + dur, vol, ctx.destination)
}

export function playSound(id: string) {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)

    switch (id) {
      case "alert": {
        const o = osc(ctx, "sine", 880, 0, 0.5, 0.3, ctx.destination)
        o.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
        o.frequency.setValueAtTime(880, ctx.currentTime + 0.3)
        o.onended = () => ctx.close()
        break
      }
      case "chime": {
        [523, 659, 784, 1047].forEach((f, i, a) => {
          const o = note(ctx, f, i * 0.12, 0.3, 0.25)
          if (i === a.length - 1) o.onended = () => ctx.close()
        })
        break
      }
      case "horn": {
        const o = osc(ctx, "sawtooth", 220, 0, 0.6, 0.2, ctx.destination)
        o.frequency.setValueAtTime(200, ctx.currentTime + 0.3)
        o.onended = () => ctx.close()
        break
      }
      case "siren": {
        const o = osc(ctx, "sine", 600, 0, 0.8, 0.2, ctx.destination)
        o.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.25)
        o.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.5)
        o.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.75)
        o.onended = () => ctx.close()
        break
      }
      case "ding": {
        const o = note(ctx, 1200, 0, 0.4, 0.3)
        o.onended = () => ctx.close()
        break
      }
      case "alarm": {
        const o = osc(ctx, "square", 800, 0, 0.6, 0.15, ctx.destination)
        for (let i = 0; i < 6; i++) {
          o.frequency.setValueAtTime(800, ctx.currentTime + i * 0.1)
          o.frequency.setValueAtTime(600, ctx.currentTime + i * 0.1 + 0.05)
        }
        o.onended = () => ctx.close()
        break
      }
      case "baseball": {
        // Organ charge: da da da-da-da DA!
        const notes = [
          { f: 523, t: 0, d: 0.15 },
          { f: 659, t: 0.18, d: 0.15 },
          { f: 784, t: 0.36, d: 0.12 },
          { f: 784, t: 0.5, d: 0.12 },
          { f: 784, t: 0.64, d: 0.12 },
          { f: 1047, t: 0.8, d: 0.4 },
        ]
        notes.forEach((n, i) => {
          const o = note(ctx, n.f, n.t, n.d, 0.2, "square")
          if (i === notes.length - 1) o.onended = () => ctx.close()
        })
        break
      }
      case "fanfare": {
        // Brass fanfare: Ta-da-daaaa!
        const notes = [
          { f: 392, t: 0, d: 0.2 },
          { f: 494, t: 0.2, d: 0.2 },
          { f: 587, t: 0.4, d: 0.2 },
          { f: 784, t: 0.6, d: 0.8 },
        ]
        notes.forEach((n, i) => {
          const o = note(ctx, n.f, n.t, n.d, 0.2, "sawtooth")
          if (i === notes.length - 1) o.onended = () => ctx.close()
        })
        break
      }
      case "sadtrombone": {
        // Wah wah wah wahhh (descending)
        const notes = [
          { f: 392, t: 0, d: 0.35 },
          { f: 370, t: 0.4, d: 0.35 },
          { f: 349, t: 0.8, d: 0.35 },
          { f: 330, t: 1.2, d: 0.6 },
        ]
        notes.forEach((n, i) => {
          const o = osc(ctx, "sawtooth", n.f, n.t, n.t + n.d, 0.15, ctx.destination)
          if (i === notes.length - 1) o.onended = () => ctx.close()
        })
        break
      }
      case "birthday": {
        // Happy birthday opening phrase
        const notes = [
          { f: 264, t: 0, d: 0.15 },
          { f: 264, t: 0.18, d: 0.15 },
          { f: 297, t: 0.36, d: 0.3 },
          { f: 264, t: 0.7, d: 0.3 },
          { f: 352, t: 1.05, d: 0.3 },
          { f: 330, t: 1.4, d: 0.5 },
        ]
        notes.forEach((n, i) => {
          const o = note(ctx, n.f, n.t, n.d, 0.2)
          if (i === notes.length - 1) o.onended = () => ctx.close()
        })
        break
      }
      case "buzzer": {
        // Game show wrong answer buzzer
        const o = osc(ctx, "sawtooth", 150, 0, 0.8, 0.2, ctx.destination)
        o.frequency.setValueAtTime(120, ctx.currentTime + 0.3)
        o.onended = () => ctx.close()
        break
      }
      case "victory": {
        // FF-style victory jingle
        const notes = [
          { f: 523, t: 0, d: 0.12 },
          { f: 523, t: 0.13, d: 0.12 },
          { f: 523, t: 0.26, d: 0.12 },
          { f: 523, t: 0.4, d: 0.3 },
          { f: 415, t: 0.75, d: 0.25 },
          { f: 466, t: 1.05, d: 0.25 },
          { f: 523, t: 1.35, d: 0.15 },
          { f: 466, t: 1.52, d: 0.15 },
          { f: 523, t: 1.7, d: 0.5 },
        ]
        notes.forEach((n, i) => {
          const o = note(ctx, n.f, n.t, n.d, 0.2, "square")
          if (i === notes.length - 1) o.onended = () => ctx.close()
        })
        break
      }
      case "none":
        ctx.close()
        break
      default: {
        const o = note(ctx, 880, 0, 0.3, 0.3)
        o.onended = () => ctx.close()
        break
      }
    }
  } catch { /* audio not available */ }
}
