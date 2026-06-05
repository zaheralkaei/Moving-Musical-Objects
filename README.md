# Moving Musical Objects

A generative music playground. Watch colored balls bounce around a canvas, collide with each other and the walls, and produce sound on every impact. Designed and built by Zaher Alkaei.

Live demo: https://zaheralkaei.github.io/Moving-Musical-Objects/

## Running it

This is a single static page — no build step, no package manager, no server required.

- Open `index.html` directly in a browser, or
- Serve the folder with any static server (e.g. `python -m http.server`) and visit `http://localhost:8000`

The page pulls Tone.js (v14.8.39) from a CDN. A user gesture (clicking Start) is required by the browser before audio will play.

## How it works

Each ball moves in a straight line and bounces off the canvas walls. When two balls collide they swap velocities and are nudged apart slightly so they cannot re-collide on the next frame. Every collision — ball-on-ball or ball-on-wall — triggers a note from the currently selected scale and instrument.

A continuous "drone" plays a sustained tonic (C3) underneath the percussive notes, routed through a master signal chain (lowpass filter, limiter) that tames harshness globally and prevents clipping when many notes overlap.

## Controls

### Objects

Five balls, one per checkbox. Toggle them on or off. Changes apply live: checking a box while the simulation is running adds a new ball and a new synth voice; unchecking removes them.

### Speed

Slider from 1 to 10. Controls how fast the balls move. Defaults to 3. Live; takes effect on the next frame.

### Scale Type

Choose the musical scale that notes are drawn from. Defaults to Hirajoshi. Includes 16 scales: major, chromatic, all seven church modes, blues, harmonic and melodic minor, double harmonic, Hungarian minor, Japanese, and hirajoshi.

### Synth Type

Choose the instrument for the percussive notes. Defaults to FMSynth. Available instruments:

- Synth — raw oscillator
- AMSynth, FMSynth — amplitude and frequency modulation
- DuoSynth — two oscillators with FM
- PolySynth — multi-voice polyphonic
- MonoSynth — single voice with filter, good for bass or lead
- MembraneSynth — kick / tom, configured here as a soft melodic tom
- MetalSynth — gamelan / bell tones
- NoiseSynth — pink noise burst, sounds like a percussive "thunk"

Each instrument has its own softening: per-instrument envelope, harmonicity, and filter tweaks are applied to keep the sound musical rather than raw.

### Reverb

Toggle a 2-second reverb. Defaults to ON. The reverb tail routes through the same master chain as the dry signal, so it picks up the global lowpass and limiter.

### Drone

Toggle a sustained C3 note (the tonic of every scale in the list). Defaults to ON. The drone uses a sine oscillator with a 1.5-second attack and 2-second release, so it fades in and out smoothly. It is a dedicated voice, not the user-selected synth, so it stays a smooth pad even when the active synth is percussive (Noise, Metal, Membrane).

### Drone Volume

Slider from 0 to 100, mapped logarithmically to -60 dB … 0 dB. At 0 the drone is silent; at 100 it plays at unity gain. Defaults to 100.

### Note indicator

A small panel above the controls shows the pitches currently ringing. Percussion notes appear as chips and fade out after one second (matching the audible release tail). The drone has its own chip in a different color that persists for as long as the drone is on.

## Defaults

When the page first loads: all five balls are active, the scale is Hirajoshi, the speed is 3, the synth is FMSynth, reverb is on, the drone is on, and the drone volume is at 100. These are starting points — adjust anything to taste. Toggling an effect off sticks across Stop/Start cycles.

## Mobile and background tabs

The page is responsive: the canvas scales down via CSS on narrow screens, the title shrinks at small widths, and controls cap their width to the viewport. `touch-action: manipulation` is set on the buttons so taps feel responsive on iOS Safari. The audio context is started by tapping Start, which satisfies the user-gesture requirement on all mobile browsers.

When the tab is hidden or the browser is minimized, the page automatically switches from `requestAnimationFrame` (which the browser throttles to zero in background tabs) to a `setInterval` driver that keeps the simulation running. The audio context is also resumed on visibility change, since some browsers suspend it in the background. Open the page, switch tabs, and the music should keep playing.

## Files

- `index.html` — markup, styles, and the Tone.js CDN script tag
- `app.js` — all application logic (simulation, audio routing, UI handlers)
- `LICENSE` — Apache 2.0
