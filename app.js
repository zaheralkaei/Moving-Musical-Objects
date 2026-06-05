const canvas = document.getElementById('musicCanvas');
const ctx = canvas.getContext('2d');

let objects = [];
let isPlaying = false;
let animationFrameId;
let reverbOn = true; // Reverb defaults to ON. Button text is set in HTML to match.

// Audio effects — created lazily on Start so they don't pre-allocate before a user gesture.
let reverb = null;
// Master chain — sits between every synth (and the reverb return) and the
// destination. A gentle lowpass rolls off the high-end harshness that builds up
// when many overlapping notes fire at once, and a limiter prevents clipping
// from simultaneous triggers. Created lazily on Start for the same reason as
// reverb: don't pre-allocate audio nodes before a user gesture.
let masterLowpass = null;
let masterLimiter = null;

// Drone — a sustained tonic note that plays underneath the percussive
// triggered notes. It's a separate dedicated synth (always a clean sine) so
// the drone stays a smooth pad even when the active synth is percussive
// (Metal, Noise, Membrane). Routed through a dedicated volume node and into
// the master chain, so it picks up the same lowpass + limiter harshness
// control as everything else.
let drone = null;
let droneVolume = null;
let droneOn = true; // Drone defaults to ON. Button text is set in HTML to match.

// Define musical scales
const scales = {
  tonal: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  chromatic: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  minor: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  pentatonic: ['C', 'D', 'E', 'G', 'A'],
  dorian: ['C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'],
  phrygian: ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  lydian: ['C', 'D', 'E', 'F#', 'G', 'A', 'B'],
  mixolydian: ['C', 'D', 'E', 'F', 'G', 'A', 'Bb'],
  locrian: ['C', 'Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb'],
  blues: ['C', 'Eb', 'F', 'F#', 'G', 'Bb'],
  harmonicMinor: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'B'],
  melodicMinor: ['C', 'D', 'Eb', 'F', 'G', 'A', 'B'],
  doubleHarmonic: ['C', 'Db', 'E', 'F', 'G', 'Ab', 'B'],
  hungarianMinor: ['C', 'D', 'Eb', 'F#', 'G', 'Ab', 'B'],
  japanese: ['C', 'Db', 'F', 'G', 'Ab'],
  hirajoshi: ['C', 'D', 'Eb', 'G', 'Ab']
};

// Control elements
const objectSpeedInput = document.getElementById('objectSpeed');
const speedDisplay = document.getElementById('speedDisplay');
const scaleTypeInput = document.getElementById('scaleType');
const synthTypeInput = document.getElementById('synthType');
const reverbButton = document.getElementById('reverbButton');
const droneButton = document.getElementById('droneButton');
const droneVolumeInput = document.getElementById('droneVolume');
const droneVolumeDisplay = document.getElementById('droneVolumeDisplay');
const startButton = document.getElementById('startButton');
const noteIndicator = document.getElementById('noteIndicator');
const objectCheckboxes = [
  document.getElementById('object1'),
  document.getElementById('object2'),
  document.getElementById('object3'),
  document.getElementById('object4'),
  document.getElementById('object5')
];

let synths = [];

// Create a synth of the currently-selected type. Does NOT connect to destination yet —
// connectSynths() handles routing so reverb can be toggled without rebuilding synths.
// Default envelope is shaped for a softer, more musical attack and a longer release
// so adjacent notes blend instead of clicking against each other.
function createSynth() {
  const selectedSynth = synthTypeInput.value;
  let synth;
  switch (selectedSynth) {
    case 'amsynth':
      synth = new Tone.AMSynth();
      break;
    case 'fmsynth':
      synth = new Tone.FMSynth();
      break;
    case 'duosynth':
      synth = new Tone.DuoSynth();
      break;
    case 'polysynth':
      synth = new Tone.PolySynth();
      break;
    case 'membrane':
      // Kick / tom — percussive, great for impact sounds on collision.
      synth = new Tone.MembraneSynth();
      break;
    case 'metal':
      // Ring-mod + envelope — gamelan / bell / industrial metallic tones.
      synth = new Tone.MetalSynth();
      break;
    case 'noise':
      // Filtered noise burst — hat / cymbal / texture. No pitch; the 'note'
      // argument is ignored, so we still pass it for API uniformity.
      synth = new Tone.NoiseSynth();
      break;
    case 'mono':
      // Single-voice subtractive synth with filter — good for bass / lead.
      synth = new Tone.MonoSynth();
      break;
    default:
      // Default to a PolySynth instead of a raw Synth — PolySynth supports
      // overlapping voices, which is essential since the user has de-dup'd note
      // retriggering and notes will now overlap naturally.
      synth = new Tone.PolySynth();
      break;
  }
  // Soften instruments that have an amplitude envelope. Some (MetalSynth,
  // NoiseSynth) have non-standard envelope objects — we only touch them if
  // the expected attack/release properties exist, so we don't crash.
  // This runs BEFORE the per-instrument block so each instrument can override
  // the generic defaults with values tuned for its character.
  if (synth.envelope && typeof synth.envelope.attack === 'number') {
    synth.envelope.attack = 0.01;
  }
  if (synth.envelope && typeof synth.envelope.release === 'number') {
    synth.envelope.release = 0.4;
  }
  // Per-instrument softening. The generic envelope tweaks above can't reach
  // these parameters because they live on different sub-objects (or don't
  // exist at all on the base class), so we apply them case by case. Runs
  // AFTER the generic block so per-instrument values take precedence.
  switch (selectedSynth) {
    case 'membrane':
      // Default MembraneSynth sounds like a kick drum: short pitchDecay and
      // high octaves create a percussive "boom" that gets harsh as a melodic
      // voice. Slow the pitchDecay to nearly nothing and limit to 0.5 octaves
      // so it sounds like a soft tom rather than a kick — and won't pierce
      // at high pitches.
      if (typeof synth.pitchDecay === 'number') synth.pitchDecay = 0.01;
      if (typeof synth.octaves === 'number') synth.octaves = 0.5;
      break;
    case 'metal':
      // MetalSynth's default clang is ear-splitting. Reduce harmonicity
      // (fewer overtones), cut modulation index (less FM depth), and pull
      // octaves down. Also lengthen the envelope decay so the attack doesn't
      // slap, and bump the release above the generic default for a longer
      // ring-out.
      if (typeof synth.harmonicity === 'number') synth.harmonicity = 2;
      if (typeof synth.modulationIndex === 'number') synth.modulationIndex = 5;
      if (typeof synth.octaves === 'number') synth.octaves = 0.5;
      if (synth.envelope) {
        if (typeof synth.envelope.decay === 'number') synth.envelope.decay = 0.5;
        if (typeof synth.envelope.release === 'number') synth.envelope.release = 0.6;
      }
      break;
    case 'noise':
      // Default NoiseSynth is white noise through a highpass — the harshest
      // possible noise burst. Switch to pink noise (less high-frequency
      // energy), apply a bandpass filter to give it a "thunk" character
      // instead of a cymbal hiss, and lengthen decay for a softer tail.
      if (synth.noise && typeof synth.noise.type === 'string') {
        synth.noise.type = 'pink';
      }
      if (synth.filter && typeof synth.filter.frequency === 'object') {
        synth.filter.frequency.value = 2000;
        if (typeof synth.filter.Q === 'object') synth.filter.Q.value = 1;
      }
      if (synth.envelope) {
        if (typeof synth.envelope.decay === 'number') synth.envelope.decay = 0.3;
        if (typeof synth.envelope.sustain === 'number') synth.envelope.sustain = 0;
        if (typeof synth.envelope.release === 'number') synth.envelope.release = 0.5;
      }
      break;
    case 'mono':
      // MonoSynth's filter is already constrained by its filterEnvelope
      // (default base 200Hz, 3 octaves, slow attack) which keeps it in a
      // bass-friendly range. Don't override the base frequency — pushing it
      // up actually makes the synth brighter because the envelope sweeps up
      // from the base. The master chain's 6kHz lowpass is enough global
      // high-end control.
      break;
  }
  return synth;
}

// Build the master chain (lowpass → limiter → destination) if it doesn't exist
// yet. Called lazily from connectSynths / startSimulation so we don't allocate
// audio nodes before the user clicks Start (which is the AudioContext gesture).
function ensureMasterChain() {
  if (!masterLowpass) {
    // Gentle 12dB/oct lowpass at 6kHz. Cuts the harshness from cymbal-like
    // noise bursts and from the MetalSynth's high-frequency clang, while
    // leaving the fundamental range of every scale fully audible.
    masterLowpass = new Tone.Filter(6000, 'lowpass').toDestination();
  }
  if (!masterLimiter) {
    // -3dB ceiling. Permissive enough that nothing sounds squashed, but
    // catches the rare moment when 5+ notes overlap and would otherwise
    // clip the output.
    masterLimiter = new Tone.Limiter(-3).connect(masterLowpass);
  }
}

function ensureReverb() {
  if (!reverb) {
    // Reverb's tail routes through the master chain (limiter → lowpass →
    // destination) rather than directly to destination, so reverbed signal
    // gets the same harshness taming as the dry signal.
    ensureMasterChain();
    reverb = new Tone.Reverb(2).connect(masterLimiter);
  }
  return reverb;
}

// Build the drone synth + volume node on first use. The drone is a dedicated
// sine-oscillator synth with a long attack and release so the note fades in
// and out smoothly — no clicks, no perceivable "start". The volume node lets
// the slider attenuate the drone independently of the master chain's limiter.
function ensureDrone() {
  if (drone) return drone;
  ensureMasterChain();
  // Plain Synth with explicit oscillator type. The generic envelope tweak in
  // createSynth doesn't run for the drone (it's not user-switchable), so we
  // shape the envelope inline here.
  drone = new Tone.Synth({ oscillator: { type: 'sine' } });
  drone.envelope.attack = 1.5;
  drone.envelope.release = 2;
  // Volume node starts silent (-Infinity dB) — the slider brings it up.
  // Apply the current slider value immediately so the first time the user
  // toggles the drone on mid-session, the volume is already correct.
  droneVolume = new Tone.Volume(-Infinity);
  const sliderVal = parseInt(droneVolumeInput.value, 10);
  droneVolume.volume.value = sliderVal === 0 ? -Infinity : -60 + (sliderVal / 100) * 60;
  drone.connect(droneVolume);
  droneVolume.connect(masterLimiter);
  return drone;
}

function toggleDrone() {
  // Allow toggling on/off whether the simulation is running or not, but the
  // drone only actually sounds during play so the master chain exists.
  if (!isPlaying) {
    // Not playing yet — just flip the flag and let startSimulation handle it.
    droneOn = !droneOn;
    droneButton.textContent = droneOn ? 'Disable Drone' : 'Enable Drone';
    return;
  }
  ensureDrone();
  if (droneOn) {
    // Toggling off — release the held note. The 2s envelope release will
    // make the drone fade out smoothly rather than cutting off.
    drone.triggerRelease();
  } else {
    // Toggling on — attack the tonic. C3 is the root of every scale in the
    // list, so it's always musically correct regardless of the active scale.
    drone.triggerAttack('C3');
  }
  droneOn = !droneOn;
  droneButton.textContent = droneOn ? 'Disable Drone' : 'Enable Drone';
  // Update the indicator immediately so the drone shows up in the panel.
  if (droneOn) addNoteChip('C3', true);
  else removeNoteChip('C3', true);
}

// Route each synth to either the reverb bus or the master chain input, based
// on the current flag. The master chain handles lowpass + limiter for every
// signal, so we never call toDestination() here.
function connectSynths() {
  ensureMasterChain();
  synths.forEach(synth => {
    try { synth.disconnect(); } catch (e) { /* synth may not have been connected yet */ }
    if (reverbOn && reverb) {
      synth.connect(reverb);
    } else {
      synth.connect(masterLimiter);
    }
  });
}

// Reverb toggle — (re)routes all currently-active synths.
reverbButton.addEventListener('click', () => {
  reverbOn = !reverbOn;
  reverbButton.textContent = reverbOn ? 'Disable Reverb' : 'Enable Reverb';
  if (isPlaying) {
    if (reverbOn) ensureReverb();
    connectSynths();
  }
});

// Drone toggle — start/stop the sustained tonic note. The button works
// whether the simulation is running or not; when stopped, the flag is just
// stored and the drone is started on the next startSimulation.
droneButton.addEventListener('click', toggleDrone);

// Drone volume slider — maps the 0–100 slider value to -60dB…0dB. A linear
// 0–100 → dB mapping would be perceptually wrong (the lower half of the
// slider would be inaudible). The -60dB floor matches typical musical
// "effect send" levels: 0 is silent, 100 is full.
droneVolumeInput.addEventListener('input', event => {
  const value = parseInt(event.target.value, 10);
  droneVolumeDisplay.textContent = value;
  if (droneVolume) {
    // Use a -60dB floor so the slider has audible range across its travel.
    // 0 → -60dB (effectively silent), 100 → 0dB (unity gain).
    droneVolume.volume.value = value === 0 ? -Infinity : -60 + (value / 100) * 60;
  }
});

// Start/Stop button. The click is a user gesture, so this is the right place to
// resume the AudioContext. Without Tone.start() the context can stay suspended in
// stricter browsers and the whole app is silent.
startButton.addEventListener('click', async () => {
  if (isPlaying) {
    stopSimulation();
  } else {
    await Tone.start();
    startSimulation();
  }
});

// Recreate synths in place when the user changes the synth type mid-run.
// (Stop + Start would also work but is more disruptive; this preserves the simulation.)
synthTypeInput.addEventListener('change', () => {
  if (!isPlaying) return;
  // Release any held notes on the old synths before swapping.
  synths.forEach(s => { try { s.triggerRelease(); } catch (e) {} s.dispose(); });
  synths = objects.map(() => createSynth());
  connectSynths();
});

// Live add/remove of objects while the simulation is running. Toggling a
// checkbox on adds a new object + synth; toggling it off removes them.
// The object's sourceIndex is the checkbox index, which is how removeObject
// finds the right one — array position alone wouldn't work because indices
// shift as objects are added/removed.
objectCheckboxes.forEach((checkbox, index) => {
  checkbox.addEventListener('change', () => {
    if (!isPlaying) return;
    if (checkbox.checked) {
      addObject(index);
    } else {
      removeObject(index);
    }
  });
});

// Create object with movement. Speed is read at construction; the animate loop scales
// the per-frame step by the live slider value, so the slider takes effect immediately.
// `sourceIndex` is the checkbox index (0–4) so we can find/remove this object
// later when the user toggles the corresponding checkbox at runtime.
function createObject(size, sourceIndex) {
  const baseSpeed = parseFloat(objectSpeedInput.value) || 1;
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size,
    baseSpeedX: (Math.random() < 0.5 ? -1 : 1) * baseSpeed,
    baseSpeedY: (Math.random() < 0.5 ? -1 : 1) * baseSpeed,
    color: `hsl(${Math.random() * 360}, 100%, 70%)`,
    currentNote: null,
    sourceIndex,
  };
}

// Move and bounce objects. The step is scaled by the current speed slider divided by
// the slider's midpoint (5), so the slider is centred and changes take effect immediately.
//
// Wall bounce clamps the CENTER of the ball to (radius, width - radius), not to the
// canvas edge. Otherwise the ball's center crosses the wall by its own radius before
// the bounce triggers, so the ball appears to sink halfway into the wall before
// reversing direction. The bounce point is where the ball's CIRCUMFERENCE touches
// the wall, which is the physically correct behaviour.
function moveObject(obj) {
  const liveFactor = (parseFloat(objectSpeedInput.value) || 1) / 5;
  const radius = obj.size * 10;
  obj.x += obj.baseSpeedX * liveFactor;
  obj.y += obj.baseSpeedY * liveFactor;

  if (obj.x < radius) { obj.x = radius; obj.baseSpeedX = Math.abs(obj.baseSpeedX); changeNoteOnCollision(obj); }
  else if (obj.x > canvas.width - radius) { obj.x = canvas.width - radius; obj.baseSpeedX = -Math.abs(obj.baseSpeedX); changeNoteOnCollision(obj); }

  if (obj.y < radius) { obj.y = radius; obj.baseSpeedY = Math.abs(obj.baseSpeedY); changeNoteOnCollision(obj); }
  else if (obj.y > canvas.height - radius) { obj.y = canvas.height - radius; obj.baseSpeedY = -Math.abs(obj.baseSpeedY); changeNoteOnCollision(obj); }
}

function drawObject(obj) {
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, obj.size * 10, 0, 2 * Math.PI);
  ctx.fillStyle = obj.color;
  ctx.fill();
}

// Check for collisions between objects. The collision response (note trigger + swap)
// operates on the objects themselves, but the synth array is kept in lockstep with
// `objects` via sourceIndex, so we look up the synth per-object inside
// changeNoteOnCollision.
function detectCollisions() {
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const dx = objects[i].x - objects[j].x;
      const dy = objects[i].y - objects[j].y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < objects[i].size * 10 + objects[j].size * 10) {
        changeNoteOnCollision(objects[i]);
        changeNoteOnCollision(objects[j]);
        handleCollision(objects[i], objects[j]);
      }
    }
  }
}

// Handle object collisions: swap velocities (with a small damping to bleed energy
// and prevent jitter), then push the two objects apart along the contact normal so
// they cannot re-collide on the very next frame. Without the separation step, two
// equal-mass head-on objects jitter in place because the swap puts them right back
// in contact on the next frame.
function handleCollision(obj1, obj2) {
  const damping = 0.95;
  const tempX = obj1.baseSpeedX * damping;
  const tempY = obj1.baseSpeedY * damping;
  obj1.baseSpeedX = obj2.baseSpeedX * damping;
  obj1.baseSpeedY = obj2.baseSpeedY * damping;
  obj2.baseSpeedX = tempX;
  obj2.baseSpeedY = tempY;

  // Push apart along the line between centers. Use the sign of the delta (not the
  // unit vector) so the push is a fixed-pixel nudge — enough to break contact
  // without amplifying into a launch.
  //
  // Skip the nudge on any axis where either object is already touching a wall —
  // otherwise the nudge would push the wall-side object BACK into the wall, and
  // moveObject would then re-trigger the wall bounce (and the note) on the next
  // frame, causing a per-frame spam loop.
  const radius = obj1.size * 10;
  const dx = obj2.x - obj1.x;
  const dy = obj2.y - obj1.y;
  const signX = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx);
  const signY = dy === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dy);
  const nudge = 0.5;
  const obj1AtWallX = obj1.x <= radius || obj1.x >= canvas.width - radius;
  const obj1AtWallY = obj1.y <= radius || obj1.y >= canvas.height - radius;
  const obj2AtWallX = obj2.x <= radius || obj2.x >= canvas.width - radius;
  const obj2AtWallY = obj2.y <= radius || obj2.y >= canvas.height - radius;
  if (!obj1AtWallX && !obj2AtWallX) {
    obj1.x -= signX * nudge;
    obj2.x += signX * nudge;
  }
  if (!obj1AtWallY && !obj2AtWallY) {
    obj1.y -= signY * nudge;
    obj2.y += signY * nudge;
  }
}

// Change note when collision occurs. Always fires — even if the new random pick
// matches the previous note. The de-dup gate was originally added to silence
// edge-stuck objects, but handleCollision now separates objects on contact so
// they can't jitter in place, so the spam concern no longer applies.
//
// Musicality tweaks:
//  - Random octave (3–5) per note, so a 5-note pentatonic spans 15 actual pitches
//    instead of 5, and the music has register variation.
//  - Velocity is constrained to 0.4–0.85 so the dynamics stay musical — no
//    silence-from-zero or harshness-from-one.
function changeNoteOnCollision(obj) {
  const scale = scales[scaleTypeInput.value];
  if (!scale) return;
  const pitch = scale[Math.floor(Math.random() * scale.length)];
  const octave = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
  const note = pitch + octave;
  const velocity = 0.4 + Math.random() * 0.45;

  obj.currentNote = note;
  // synths[] is parallel to objects[] because we maintain that invariant
  // in addObject/removeObject. So objects.indexOf(obj) is the right index.
  const synth = synths[objects.indexOf(obj)];
  if (!synth) return;

  // NoiseSynth has a different trigger signature than the pitched synths:
  // triggerAttackRelease(duration, time, velocity) — no note argument.
  // Passing a note name as the first arg makes Tone.js try to interpret it
  // as a duration, which throws a "cancelAndHoldAtTime: null" error and
  // produces silence. Dispatch based on the synth's class name.
  if (synth instanceof Tone.NoiseSynth) {
    synth.triggerAttackRelease('8n', undefined, velocity);
  } else {
    synth.triggerAttackRelease(note, '8n', undefined, velocity);
  }
  // Light up the indicator chip for this note.
  addNoteChip(note, false);
}

// Note indicator. Each entry in `activeChips` is a DOM element representing
// a note that is currently ringing, plus a timestamp at which it should be
// faded out. The animate loop walks the list and removes expired entries.
// The drone (a sustained note) uses a separate "drone" style and is not
// subject to expiry — it stays in the panel until the drone is disabled.
const NOTE_LIFETIME_MS = 1000; // matches the audible release tail (~0.65s) plus a small buffer
let activeChips = [];
let chipIdCounter = 0;
let droneChip = null;

function addNoteChip(note, isDrone) {
  if (isDrone) {
    // Drone is a singleton — replace any existing drone chip rather than
    // accumulating duplicates.
    if (droneChip) removeNoteChip(note, true);
    const chip = document.createElement('span');
    chip.className = 'noteChip drone';
    chip.dataset.note = note;
    chip.textContent = note;
    noteIndicator.appendChild(chip);
    droneChip = chip;
    return;
  }
  const chip = document.createElement('span');
  chip.className = 'noteChip';
  chip.dataset.chipId = String(++chipIdCounter);
  chip.textContent = note;
  noteIndicator.appendChild(chip);
  activeChips.push({ element: chip, expireAt: performance.now() + NOTE_LIFETIME_MS });
}

function removeNoteChip(note, isDrone) {
  if (isDrone && droneChip) {
    droneChip.remove();
    droneChip = null;
    return;
  }
  // For percussion notes, just remove the most recent chip with this name
  // (they're all the same note anyway). This is mainly used for the drone
  // — percussion cleanup happens via expireOldChips in the animate loop.
  const chip = noteIndicator.querySelector(`.noteChip:not(.drone)[data-chip-id]:last-of-type`);
  // Fallback: search by text content.
  const fallback = Array.from(noteIndicator.querySelectorAll('.noteChip:not(.drone)'))
    .filter(c => c.textContent === note)
    .pop();
  const target = fallback || chip;
  if (target) target.remove();
}

// Called from the animate loop to fade out and remove expired percussion chips.
function expireOldChips() {
  if (activeChips.length === 0) return;
  const now = performance.now();
  // Walk from the end so splice doesn't shift indices we still need to check.
  for (let i = activeChips.length - 1; i >= 0; i--) {
    const entry = activeChips[i];
    if (now >= entry.expireAt) {
      // Trigger the CSS opacity transition by setting opacity to 0, then
      // remove the element after the transition completes. Using
      // setTimeout matches the 0.4s transition defined in the .noteChip rule.
      entry.element.style.opacity = '0';
      const el = entry.element;
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
      activeChips.splice(i, 1);
    }
  }
}

// Add a new object + synth at runtime when the user checks a new checkbox.
// Position is randomised so it doesn't spawn on top of an existing one and
// immediately trigger a collision.
function addObject(sourceIndex) {
  const obj = createObject(sourceIndex + 1, sourceIndex);
  objects.push(obj);
  const synth = createSynth();
  synths.push(synth);
  connectSynths();
}

// Remove an object + synth at runtime when the user unchecks a checkbox.
function removeObject(sourceIndex) {
  const idx = objects.findIndex(o => o.sourceIndex === sourceIndex);
  if (idx === -1) return;
  const synth = synths[idx];
  if (synth) { try { synth.triggerRelease(); } catch (e) {} synth.dispose(); }
  objects.splice(idx, 1);
  synths.splice(idx, 1);
}

function startSimulation() {
  objects = [];
  synths = [];
  objectCheckboxes.forEach((checkbox, index) => {
    if (checkbox.checked) {
      objects.push(createObject(index + 1, index));
      synths.push(createSynth());
    }
  });

  if (objects.length === 0) {
    showMessage('Select at least one object first.');
    return;
  }

  hideMessage();
  isPlaying = true;
  startButton.textContent = 'Stop';

  if (reverbOn) ensureReverb();
  connectSynths();
  // If the drone was toggled on before the sim started, actually start it now.
  // The button click path also handles this; this branch covers the case
  // where the user toggled the drone while stopped, then clicked Start.
  if (droneOn) {
    ensureDrone();
    // Apply the current slider value to the freshly-created volume node.
    // Otherwise the drone would be silent until the user nudges the slider.
    const sliderVal = parseInt(droneVolumeInput.value, 10);
    droneVolume.volume.value = sliderVal === 0 ? -Infinity : -60 + (sliderVal / 100) * 60;
    drone.triggerAttack('C3');
    addNoteChip('C3', true);
  }

  animate();
}

function stopSimulation() {
  isPlaying = false;
  startButton.textContent = 'Start';
  cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  // Also stop the interval driver in case the tab was hidden when Stop
  // was clicked — otherwise it would keep ticking indefinitely.
  if (intervalDriverId) { clearTimeout(intervalDriverId); intervalDriverId = null; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Release any held notes and dispose synths so we don't leak audio nodes across
  // Start/Stop cycles.
  synths.forEach(synth => { try { synth.triggerRelease(); } catch (e) {} synth.dispose(); });
  synths = [];
  // Release the drone so it fades out cleanly. The drone synth itself is
  // disposed at the end of stopSimulation to keep the lifecycle tidy.
  if (drone) {
    try { drone.triggerRelease(); } catch (e) {}
    drone.dispose();
    drone = null;
  }
  if (droneVolume) { droneVolume.dispose(); droneVolume = null; }
  if (droneChip) { droneChip.remove(); droneChip = null; }
  // Wipe any lingering percussion chips too — the animate loop is stopped
  // so the expiry timer won't run again until the next Start.
  activeChips.forEach(entry => { if (entry.element.parentNode) entry.element.parentNode.removeChild(entry.element); });
  activeChips = [];
  // Note the droneOn flag is intentionally preserved across Stop/Start so
  // the user doesn't have to re-enable it. The volume slider value is
  // preserved too — re-applying it on the next start is the slider's job.
}

// One frame of simulation work. Called by either the rAF driver (when the
// tab is visible) or the setInterval driver (when the tab is hidden and rAF
// is throttled to zero). The driver is responsible for re-scheduling itself
// — tick() just does the work and returns.
// One frame of simulation work. `substeps` is how many 60fps-sized physics
// steps to run inside this call. Visible mode passes 1 (rAF runs at 60fps
// naturally). Hidden mode passes however many 16.67ms substeps fit in the
// time since the last callback — capped at MAX_SUBSTEPS to prevent a long
// hidden period from producing an unmanageable burst of work.
function tick(substeps) {
  const n = substeps || 1;

  // Clear the canvas once before drawing — drawing inside the substep loop
  // would just waste cycles redrawing frames that get immediately overdrawn.
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < n; i++) {
    // moveObject uses the speed slider live, which already assumes a 60fps
    // cadence. With substeps > 1, we're packing multiple 16.67ms steps into
    // a single tick, so each move call should move balls by exactly one
    // 60fps step's worth — same physics as visible mode.
    objects.forEach(obj => moveObject(obj));
    detectCollisions();
  }

  // Draw the current ball positions once per call (not per substep) so the
  // visible canvas matches the final state of the substeps.
  objects.forEach(obj => drawObject(obj));

  // Chip expiry should still happen once per tick, not per substep.
  expireOldChips();
}

// rAF-based driver for visible tabs. Smooth 60fps animation, hardware
// accelerated. Pauses automatically when the tab is hidden because the
// browser throttles rAF to 0 in background tabs.
function animate() {
  // Same try/catch protection as intervalTick — a single bad frame must
  // not kill the animation chain.
  try {
    tick(1);
  } catch (e) {
    // Swallow per-frame errors. The collision / note-trigger path is the
    // most likely thrower and is non-essential to the simulation lifecycle.
  }
  animationFrameId = requestAnimationFrame(animate);
}

// setTimeout-based driver for hidden tabs. rAF is throttled to 0 in
// background tabs and setTimeout is throttled to ~1Hz in some browsers, so
// each callback may represent many seconds of elapsed wall-clock time. We
// pack that time into a burst of substeps inside tick() so the simulation
// catches up: a 30-second hidden period produces 1800 substeps (30s /
// 16.67ms) of physics, so collisions are still detected at the same rate
// they would have been if the tab had been visible the whole time.
//
// We cap the burst at MAX_SUBSTEPS so a tab that was hidden for an hour
// doesn't freeze the page for many seconds when the user comes back.
let intervalDriverId = null;
let lastIntervalTickAt = 0;
const SUBSTEP_MS = 1000 / 60; // 16.67ms — the assumed 60fps cadence
const MAX_SUBSTEPS = 240;     // 4 seconds of catch-up per callback max
const MIN_SUBSTEPS = 1;       // always do at least one step, even on a 0-elapsed call
function intervalTick() {
  // Wrap in try/catch so that any single-frame error (e.g. a Tone.js
  // scheduling conflict from two balls triggering the same note at the
  // exact same timestamp) doesn't kill the entire interval chain. Without
  // this, a single bad frame would silently stop the simulation forever.
  try {
    const now = performance.now();
    const elapsedMs = lastIntervalTickAt > 0 ? now - lastIntervalTickAt : SUBSTEP_MS;
    lastIntervalTickAt = now;
    // Convert elapsed milliseconds to a substep count. We assume the sim
    // runs at 60fps so each substep represents 1/60 second of physics. The
    // MAX_SUBSTEPS cap prevents a long hidden period from blocking the
    // page for too long on resume.
    const substeps = Math.max(MIN_SUBSTEPS, Math.min(MAX_SUBSTEPS, Math.floor(elapsedMs / SUBSTEP_MS)));
    tick(substeps);
  } catch (e) {
    // Swallow per-frame errors. The collision / note-trigger path is the
    // most likely thrower and is non-essential to the simulation lifecycle.
  }
  // 16ms is what we WANT, but browsers may fire later. The catch-up logic
  // in tick() handles that by counting how much time actually passed.
  intervalDriverId = setTimeout(intervalTick, 16);
}

// Visibility-aware driver switcher. When the tab is hidden, cancel rAF
// and start the interval; when visible, cancel the interval and restart
// rAF. Also resume the AudioContext in case the browser suspended it
// during the hidden period — Tone.js + Web Audio suspend in some
// background scenarios (especially on mobile).
function onVisibilityChange() {
  if (document.hidden) {
    // Switch to interval driver so the simulation keeps ticking.
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    if (!intervalDriverId) {
      // Reset the catch-up timer so the first interval callback doesn't try
      // to "catch up" the entire time the page has been open so far.
      lastIntervalTickAt = 0;
      intervalTick();
    }
    // Make sure audio keeps playing. Tone.context.resume() is a no-op if
    // already running, so it's safe to call unconditionally.
    if (typeof Tone !== 'undefined' && Tone.context && Tone.context.state !== 'running') {
      Tone.context.resume();
    }
  } else {
    // Back to rAF for smooth animation.
    if (intervalDriverId) { clearTimeout(intervalDriverId); intervalDriverId = null; }
    if (isPlaying && !animationFrameId) animate();
    if (typeof Tone !== 'undefined' && Tone.context && Tone.context.state !== 'running') {
      Tone.context.resume();
    }
    // If the drone was on but the AudioContext was suspended during the
    // hidden period, the held drone note may have been killed. Re-attack
    // it on resume so the pad comes back immediately. We don't try to
    // detect whether the note is still sounding — if it is, the second
    // triggerAttack just restarts the envelope with a tiny audible blip,
    // which is much better than silence.
    if (isPlaying && droneOn && drone) {
      try {
        drone.triggerAttack('C3');
        // Ensure the indicator chip is visible too.
        if (!droneChip) addNoteChip('C3', true);
      } catch (e) { /* triggerAttack can throw if state is in flux; ignore */ }
    }
  }
}
document.addEventListener('visibilitychange', onVisibilityChange);

// About popup
const aboutButton = document.getElementById('aboutButton');
const aboutPopup = document.getElementById('aboutPopup');
const closePopupButton = document.getElementById('closePopup');
const popupBackdrop = document.getElementById('popupBackdrop');

function openAbout() {
  aboutPopup.style.display = 'block';
  if (popupBackdrop) popupBackdrop.style.display = 'block';
}
function closeAbout() {
  aboutPopup.style.display = 'none';
  if (popupBackdrop) popupBackdrop.style.display = 'none';
}

aboutButton.addEventListener('click', openAbout);
closePopupButton.addEventListener('click', closeAbout);
if (popupBackdrop) popupBackdrop.addEventListener('click', closeAbout);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAbout(); });

// Speed slider — updates the live display; movement uses the live value each frame.
objectSpeedInput.addEventListener('input', event => {
  speedDisplay.textContent = event.target.value;
});

// In-page message (used for non-blocking notifications; better UX than alert()).
const messageEl = document.getElementById('message');
let messageTimer = null;
function showMessage(text) {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.style.display = 'block';
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(hideMessage, 3000);
}
function hideMessage() {
  if (!messageEl) return;
  messageEl.style.display = 'none';
  messageEl.textContent = '';
  if (messageTimer) { clearTimeout(messageTimer); messageTimer = null; }
}
