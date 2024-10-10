const canvas = document.getElementById('musicCanvas');
const ctx = canvas.getContext('2d');

let objects = [];
let isPlaying = false;
let animationFrameId;
let reverbOn = false;

// Audio effects
const reverb = new Tone.Reverb(2).toDestination();
const synths = [];

// Define musical scales
let scales = {
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
  arabic: ['C', 'Db', 'E', 'F', 'G', 'Ab', 'B'],  
  hungarianMinor: ['C', 'D', 'Eb', 'F#', 'G', 'Ab', 'B'],  
  japanese: ['C', 'Db', 'F', 'G', 'Ab'],  
  hirajoshi: ['C', 'D', 'Eb', 'G', 'Ab']
};

// Control elements
const numObjectsInput = document.getElementById('numObjects');
const objectSpeedInput = document.getElementById('objectSpeed');
const speedDisplay = document.getElementById('speedDisplay');
const scaleTypeInput = document.getElementById('scaleType');
const synthTypeInput = document.getElementById('synthType');
const reverbButton = document.getElementById('reverbButton');
const startButton = document.getElementById('startButton');
const objectCheckboxes = [
  document.getElementById('object1'),
  document.getElementById('object2'),
  document.getElementById('object3'),
  document.getElementById('object4'),
  document.getElementById('object5')
];

// Reverb toggle functions
reverbButton.addEventListener('click', () => {
  reverbOn = !reverbOn;
  reverbButton.textContent = reverbOn ? 'Disable Reverb' : 'Enable Reverb';
});



// Synth initialization with more presets
function createSynths() {
  let selectedSynth = synthTypeInput.value;
  switch (selectedSynth) {
    case 'amsynth':
      return new Tone.AMSynth().toDestination();
    case 'fmsynth':
      return new Tone.FMSynth().toDestination();
    case 'duosynth':
      return new Tone.DuoSynth().toDestination();
    case 'polysynth':
      return new Tone.PolySynth().toDestination();
    default:
      return new Tone.Synth().toDestination();
  }
}

// Start/Stop button functionality
startButton.addEventListener('click', () => {
  if (isPlaying) {
    stopSimulation();
  } else {
    startSimulation();
  }
});

// Create object with movement
function createObject(size) {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size,
    speedX: (Math.random() - 0.5) * objectSpeedInput.value,
    speedY: (Math.random() - 0.5) * objectSpeedInput.value,
    color: `hsl(${Math.random() * 360}, 100%, 70%)`,
    currentNote: null,
  };
}

// Move and bounce objects, detect collisions with walls
function moveObject(obj) {
  obj.x += obj.speedX;
  obj.y += obj.speedY;

  if (obj.x < 0 || obj.x > canvas.width) {
    obj.speedX *= -1;
    changeNoteOnCollision(obj);
  }
  if (obj.y < 0 || obj.y > canvas.height) {
    obj.speedY *= -1;
    changeNoteOnCollision(obj);
  }
}

// Draw objects
function drawObject(obj) {
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, obj.size * 10, 0, 2 * Math.PI);
  ctx.fillStyle = obj.color;
  ctx.fill();
}

// Check for collisions between objects
function detectCollisions() {
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      let dx = objects[i].x - objects[j].x;
      let dy = objects[i].y - objects[j].y;
      let distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < objects[i].size * 10 + objects[j].size * 10) {
        changeNoteOnCollision(objects[i]);
        changeNoteOnCollision(objects[j]);
        handleCollision(objects[i], objects[j]);
      }
    }
  }
}

// Handle object collisions by swapping velocities
function handleCollision(obj1, obj2) {
  let tempX = obj1.speedX;
  let tempY = obj1.speedY;
  obj1.speedX = obj2.speedX;
  obj1.speedY = obj2.speedY;
  obj2.speedX = tempX;
  obj2.speedY = tempY;
}

// Change note when collision occurs
function changeNoteOnCollision(obj) {
  let scale = scales[scaleTypeInput.value];
  let randomNote = scale[Math.floor(Math.random() * scale.length)] + '4';
  
  if (randomNote !== obj.currentNote) {
    obj.currentNote = randomNote;
    synths[objects.indexOf(obj)].triggerAttackRelease(obj.currentNote, '8n');
  }
}

// Start the simulation
function startSimulation() {
  isPlaying = true;
  startButton.textContent = 'Stop';

  objects = objectCheckboxes
    .map((checkbox, index) => checkbox.checked ? createObject(index + 1) : null)
    .filter(obj => obj !== null);

  synths.length = 0;
  objects.forEach(() => synths.push(createSynths()));

  if (reverbOn) synths.forEach(synth => synth.connect(reverb));

  animate();
}

// Stop the simulation
function stopSimulation() {
  isPlaying = false;
  startButton.textContent = 'Start';
  cancelAnimationFrame(animationFrameId);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  synths.forEach(synth => synth.triggerRelease());
}

// Animation loop
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  objects.forEach((obj) => {
    moveObject(obj);
    drawObject(obj);
  });

  detectCollisions();

  animationFrameId = requestAnimationFrame(animate);
}

// Popup logic for the About button
const aboutButton = document.getElementById('aboutButton');
const aboutPopup = document.getElementById('aboutPopup');
const closePopupButton = document.getElementById('closePopup');

aboutButton.addEventListener('click', () => {
  aboutPopup.style.display = 'block'; // Show the popup
});

closePopupButton.addEventListener('click', () => {
  aboutPopup.style.display = 'none'; // Close the popup
});

// Dynamic control updates in real time
objectSpeedInput.addEventListener('input', (event) => {
  speedDisplay.textContent = event.target.value;
});
