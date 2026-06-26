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
  { id: "none", name: "None" },
]

export function playSound(id: string) {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)

    switch (id) {
      case "alert": {
        const osc = ctx.createOscillator()
        osc.connect(gain)
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.5)
        osc.onended = () => ctx.close()
        break
      }
      case "chime": {
        const freqs = [523, 659, 784, 1047]
        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          osc.connect(g)
          g.connect(ctx.destination)
          osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.12)
          g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12)
          g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.3)
          osc.start(ctx.currentTime + i * 0.12)
          osc.stop(ctx.currentTime + i * 0.12 + 0.3)
          if (i === freqs.length - 1) osc.onended = () => ctx.close()
        })
        break
      }
      case "horn": {
        const osc = ctx.createOscillator()
        osc.type = "sawtooth"
        osc.connect(gain)
        osc.frequency.setValueAtTime(220, ctx.currentTime)
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.3)
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.4)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.6)
        osc.onended = () => ctx.close()
        break
      }
      case "siren": {
        const osc = ctx.createOscillator()
        osc.connect(gain)
        osc.frequency.setValueAtTime(600, ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.25)
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.5)
        osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.75)
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.8)
        osc.onended = () => ctx.close()
        break
      }
      case "ding": {
        const osc = ctx.createOscillator()
        osc.type = "sine"
        osc.connect(gain)
        osc.frequency.setValueAtTime(1200, ctx.currentTime)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.4)
        osc.onended = () => ctx.close()
        break
      }
      case "alarm": {
        const osc = ctx.createOscillator()
        osc.type = "square"
        osc.connect(gain)
        gain.gain.setValueAtTime(0.15, ctx.currentTime)
        for (let i = 0; i < 6; i++) {
          osc.frequency.setValueAtTime(800, ctx.currentTime + i * 0.1)
          osc.frequency.setValueAtTime(600, ctx.currentTime + i * 0.1 + 0.05)
        }
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.6)
        osc.onended = () => ctx.close()
        break
      }
      case "none":
        ctx.close()
        break
      default: {
        const osc = ctx.createOscillator()
        osc.connect(gain)
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.3)
        osc.onended = () => ctx.close()
        break
      }
    }
  } catch { /* audio not available */ }
}
