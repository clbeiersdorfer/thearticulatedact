//Articulated ACT_2D
//Pads 36-45: 36-43 --> various shapes 44 --> gradient 45 --> linedot
// knobs 70-77: knobs 70 --> size 71 --> cw rotation 72 --> counterCW 73--> red 74--> green 75--> blue 76-- alpha  77 --> random move along X axis
//microphone controls size and  white line addition

let mic;
let shapes = [];
let currentShapeType = 'sphere';
let midiAccess;
let colorPalette = [];
let gradientPhase = 0;

let knobs = new Array(8).fill(0); 
 let prevKnobs = new Array(8).fill(0); // keep previous knob values

// updated by knobs
let nextShapeDefaults = {
  sizeMult: 1.0,       // knob 1
  cwSpeed: 0.0,        // knob 2
  ccwSpeed: 0.0,       // knob 3
  paletteColor: null,  // knob 4-5
  alpha: 200,          // knob 6
  xShiftRange: 0       // knob 7
};

// Pad state and cooldowns 
const PAD_CC_START = 36;
const PAD_COUNT = 10;
let padLastValue = new Array(PAD_COUNT).fill(0);
let padLastSpawnTime = new Array(PAD_COUNT).fill(0);
const COOL_DOWN_MS = 1000; // 1 second cooldown 

function setup() {
  createCanvas(windowWidth, windowHeight);
  mic = new p5.AudioIn();
  mic.start();

  frameRate(20); // help with flashing

  noStroke();
  colorMode(RGB);
  
    colorPalette = [
    color(42, 59, 117),   // sapphire blue
  color(51, 79, 116),  // slate blue
  color(28, 86, 136),  // ocean blue
  color(6, 142, 177), //teal-blue
  color(98, 8, 114),  // deep violet
  color(150, 95, 165),  // muted purple
  color(149, 96, 162), // lavender 
  color(165,90.142), // rose-mauve
  color(197, 90, 122), // dusty rose 
  color(133, 162, 124), // sage-green
  color(38, 128, 68), // jewel green
  color(46, 82, 64)   // deep emerald-teal
  ];

  background(0);

  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDIInit, onMIDIFail);
  } else {
    console.log("WebMIDI not supported in this browser.");
  }
}

function onMIDIInit(midi) {
  midiAccess = midi;
  for (let input of midiAccess.inputs.values()) {
    input.onmidimessage = handleMIDI;
  }
  console.log("✅ MIDI connected.");
}

function onMIDIFail() {
  console.log("❌ Failed to get MIDI access.");
}

function handleMIDI(message) {
  let [status, data1, data2] = message.data;
  let cc = data1;
  let val = data2;

  // pads (36-45) 
  if (cc >= PAD_CC_START && cc < PAD_CC_START + PAD_COUNT) {
    let padIdx = cc - PAD_CC_START;
    let prev = padLastValue[padIdx];
    padLastValue[padIdx] = val;
    if (prev === 0 && val > 0) {
      let now = millis();
      if (now - padLastSpawnTime[padIdx] >= COOL_DOWN_MS) {
        let shapeIndex = padIdx;
        currentShapeType = getShapeFromIndex(shapeIndex);
        spawnShape(currentShapeType);
        padLastSpawnTime[padIdx] = now;
        console.log(`Pad ${cc} pressed -> spawn ${currentShapeType}`);
      }
    }
  }

  // knobs (70-77)
  if (cc >= 70 && cc <= 77) {
    let idx = cc - 70;
   let newVal= val / 127; // normalize 
  // only proceed if the knob value actually changed 
    if (abs(newVal - prevKnobs[idx]) > 0.001) {
      knobs[idx] = newVal;
      switch (idx) {
        case 0: // CC70 size
          nextShapeDefaults.sizeMult = map(knobs[0], 0, 1, 0.15, 3.2);
          // optionally apply immediately to newest shape
          if (shapes.length > 0) shapes[shapes.length - 1].sizeMult = nextShapeDefaults.sizeMult;
          break;
        case 1: // CC71 clockwise rotate
          nextShapeDefaults.cwSpeed = map(knobs[1], 0, 1, 0, 0.28);
          if (shapes.length > 0) {
            let newest = shapes[shapes.length - 1];
            let net = nextShapeDefaults.cwSpeed - (nextShapeDefaults.ccwSpeed || 0);
            newest.rotSpeed = net + random(-0.005, 0.005);
          }
          break;
           case 2: // CC72 counter-clockwise rotate
          nextShapeDefaults.ccwSpeed = map(knobs[2], 0, 1, 0, 0.28);
          if (shapes.length > 0) {
            let newest = shapes[shapes.length - 1];
            let net = (nextShapeDefaults.cwSpeed || 0) - nextShapeDefaults.ccwSpeed;
            newest.rotSpeed = net + random(-0.005, 0.005);
          }
          break;
        case 3: // CC73 color trigger (random palette pick)
        case 4: // CC74 color trigger
        case 5: // CC75 color trigger
          // only change palette color when a color knob is moved
          nextShapeDefaults.paletteColor = pickPaletteColor();
          // apply to newest shape immediately if present
          if (shapes.length > 0) {
            let newest = shapes[shapes.length - 1];
            newest.colorOverride = newest.colorOverride || {};
            newest.colorOverride.paletteColor = nextShapeDefaults.paletteColor;
            // preserve alpha if present, otherwise set from nextShapeDefaults.alpha
            newest.colorOverride.a = nextShapeDefaults.alpha !== undefined ? nextShapeDefaults.alpha : (newest.colorOverride.a || 200);
          }
          break;
           case 6: // CC76 alpha only
          nextShapeDefaults.alpha = map(knobs[6], 0, 1, 0, 255);
          if (shapes.length > 0) {
            let newest = shapes[shapes.length - 1];
            newest.colorOverride = newest.colorOverride || {};
            newest.colorOverride.a = nextShapeDefaults.alpha;
          }
          break;
        case 7: // CC77 x shift range
          nextShapeDefaults.xShiftRange = map(knobs[7] || 0, 0, 1, 0, width * 0.25);
          // immediate random shift on newest shape, if desired
          if (shapes.length > 0) {
            let newest = shapes[shapes.length - 1];
            let shift = random(-nextShapeDefaults.xShiftRange, nextShapeDefaults.xShiftRange);
            newest.pos.x = constrain(newest.pos.x + shift, 0, width);
          }
          break;
      }
          prevKnobs[idx] = newVal;
    }
  }

}

function mapKnobsToNextShape() {
  // knob 70 -> size multiplier (very small to large)
  nextShapeDefaults.sizeMult = map(knobs[0], 0, 1, 0.15, 3.2);

  // knob 71 -> clockwise speed magnitude
  nextShapeDefaults.cwSpeed = map(knobs[1], 0, 1, 0, 0.28);

  // knob 72 -> counter-clockwise speed magnitude
  nextShapeDefaults.ccwSpeed = map(knobs[2], 0, 1, 0, 0.28);

  // knobs 73..75: when user moves any of these, pick a random palette color for next spawn/newest
  // Only pick a new paletteColor if a color knob is actively touched (above small epsilon)
  if (knobs[3] > 0.01 || knobs[4] > 0.01 || knobs[5] > 0.01) {
    nextShapeDefaults.paletteColor = pickPaletteColor();
  }
  // If no color knob is touched, we intentionally do NOT null out paletteColor
  // so existing selection remains in effect unless explicitly changed.

  // knob 76 (index 6) controls alpha
  nextShapeDefaults.alpha = map(knobs[6], 0, 1, 0, 255);

  // knob 77 (index 7) -> X shift range for newest shape and next spawn
  nextShapeDefaults.xShiftRange = map(knobs[7] || 0, 0, 1, 0, width * 0.25);
}

function applyKnobsToShape(shape) {
  
  shape.sizeMult = nextShapeDefaults.sizeMult !== undefined ? nextShapeDefaults.sizeMult : (shape.sizeMult || 1);

  // rotation net from latest mapped 
  let net = (nextShapeDefaults.cwSpeed || 0) - (nextShapeDefaults.ccwSpeed || 0);
  shape.rotSpeed = net + (shape.rotSpeed ? random(-0.005, 0.005) : 0);

  // alpha: only update alpha value 
  shape.colorOverride = shape.colorOverride || {};
  if (nextShapeDefaults.alpha !== undefined) {
    shape.colorOverride.a = nextShapeDefaults.alpha;
  }

  // xShiftRange stored locally 
  shape.xShiftRange = nextShapeDefaults.xShiftRange || shape.xShiftRange || 0;

  // Only set paletteColor if intended
  if (nextShapeDefaults.paletteColor) {
    shape.colorOverride.paletteColor = nextShapeDefaults.paletteColor;
  }
}


function getShapeFromIndex(i) {
  const shapesList = [
    'sphere', 'box', 'cone', 'torus',
    'ellipsoid', 'cylinder', 'plane', 'tetra',
    'gradient', 'linedot'
  ];
  return shapesList[i % shapesList.length];
}

function spawnShape(type) {
  let edgeBias = random() < 0.28;
  let x, y;
  if (edgeBias) {
    let side = floor(random(4));
    if (side === 0) { x = random(width); y = random(0, height * 0.12); }
    else if (side === 1) { x = random(width); y = random(height * 0.88, height); }
    else if (side === 2) { x = random(0, width * 0.12); y = random(height); }
    else { x = random(width * 0.88, width); y = random(height); }
  } else {
    x = random(0, width);
    y = random(0, height);
  }


  x += map(knobs[0] || 0, 0, 1, -width * 0.08, width * 0.08) * random(-0.4, 0.4);
  y += map(knobs[1] || 0, 0, 1, -height * 0.08, height * 0.08) * random(-0.4, 0.4);


  if (nextShapeDefaults.xShiftRange && nextShapeDefaults.xShiftRange > 0) {
    let spawnShift = random(-nextShapeDefaults.xShiftRange, nextShapeDefaults.xShiftRange);
    x += spawnShift;
  }

  x = constrain(x, 0, width);
  y = constrain(y, 0, height);

  let pos = createVector(x, y);

  let lifespan = random(4000, 10000);
  let createdAt = millis();
  let baseCol = nextShapeDefaults.paletteColor ? nextShapeDefaults.paletteColor : pickPaletteColor();


  let jitterAmp = random(6, 28);
  let jitterPhase = random(TWO_PI);
  let jitterFreq = TWO_PI / 80; 

  let shape = {
    type,
    pos,
    createdAt,
    lifespan,
    baseCol,
    rot: random(-PI, PI),
    rotSpeed: (nextShapeDefaults.cwSpeed - nextShapeDefaults.ccwSpeed) + random(-0.005, 0.005),
    sizeMult: nextShapeDefaults.sizeMult || 1,
    jitterAmp,
    jitterPhase,
    jitterFreq,
    colorOverride: {
      paletteColor: nextShapeDefaults.paletteColor || null,
      a: nextShapeDefaults.alpha
    },
    xShiftRange: nextShapeDefaults.xShiftRange || 0
  };

  shapes.push(shape);
}

function draw() {
  // background fade
  push();
  noStroke();
  fill(24, 6);
  rect(0, 0, width, height);
blendMode(ADD);
let residue =  pickPaletteColor();
  fill( residue, 8);
  //rect(0,0, width, height);
  blendMode(BLEND);
  pop();
  
  let micLevel = mic.getLevel();
  micLevel = constrain(micLevel, 0, 0.25);
  // mic influences global scale factor
  let scaleFactorFromMic = map(micLevel, 0, 0.25, 0.8, 2.2);

  gradientPhase += 0.006 + (micLevel * 0.02);

  for (let i = shapes.length - 1; i >= 0; i--) {
    let s = shapes[i];
    let age = millis() - s.createdAt;
    let lifeFrac = constrain(age / s.lifespan, 0, 1);
    let fadeAmt = 1 - lifeFrac;

    push();
  
    let phaseJ = s.jitterPhase + s.jitterFreq * frameCount;
   
    let ampJ = s.jitterAmp * (1 - 0.25 * lifeFrac);
    let jitterX = sin(phaseJ) * ampJ * (1 - lifeFrac);
    let jitterY = cos(phaseJ * 1.23) * ampJ * (1 - lifeFrac);

    translate(s.pos.x + jitterX, s.pos.y + jitterY);

    // rotation step
    s.rot += s.rotSpeed * (1 + lifeFrac * 0.4);
    rotate(s.rot);

    // size combines base, per-shape multiplier, and mic
    let baseSize = 48 + 120 * (1 - lifeFrac);
    let finalSize = baseSize * (s.sizeMult || 1) * scaleFactorFromMic;

   
    let fillCol;
    if (s.colorOverride && s.colorOverride.paletteColor) {
      let overrideColor = s.colorOverride.paletteColor;
      let a = constrain(s.colorOverride.a !== null ? s.colorOverride.a : 200, 0, 255);
      a = a * fadeAmt;
      fillCol = color(red(overrideColor), green(overrideColor), blue(overrideColor), a);
    } else {
      fillCol = color(red(s.baseCol), green(s.baseCol), blue(s.baseCol), 200 * fadeAmt);
    }

    fill(fillCol);
    noStroke();
    draw2DShape(s.type, finalSize, s);
    pop();

    if (fadeAmt <= 0) shapes.splice(i, 1);
  }

  // mic overlay
  if (micLevel < 0.01) drawLowPassNoise2D();
  else if (micLevel > 0.06) drawHighPassLines2D();
}

function draw2DShape(type, sSize, sObj) {
  switch (type) {
    case 'sphere':
      ellipse(0, 0, sSize, sSize);
      break;
    case 'box':
      rectMode(CENTER);
      rect(0, 0, sSize, sSize * 0.88, 8);
      break;
    case 'cone':
      push();
      rotate(-PI / 2);
      triangle(-sSize * 0.45, sSize * 0.55, sSize * 0.45, sSize * 0.55, 0, -sSize * 0.6);
      pop();
      break;
    case 'torus':
      ellipse(0, 0, sSize * 1.0, sSize * 1.0);
      fill(24, 18);
      ellipse(0, 0, sSize * 0.46, sSize * 0.46);
      break;
    case 'ellipsoid':
      ellipse(0, 0, sSize * 1.3, sSize * 0.78);
      break;
    case 'cylinder':
      rectMode(CENTER);
      rect(0, 0, sSize * 0.62, sSize * 1.18, sSize * 0.18);
      break;
    case 'plane':
      rectMode(CENTER);
      rect(0, 0, sSize * 1.12, sSize * 0.78, 14);
      break;
    case 'tetra':
      push();
      rotate(sObj.rot * 0.45);
      triangle(-sSize * 0.6, sSize * 0.45, 0, -sSize * 0.78, sSize * 0.6, sSize * 0.45);
      pop();
      break;
    case 'gradient':
      push();
      let h = sSize * 1.8;
      for (let y = -h / 2; y <= h / 2; y += 6) {
        let t = map(y, -h / 2, h / 2, 0, 1);
        let c1 = jitterColor(pickPaletteColor(), 12);
        let c2 = jitterColor(pickPaletteColor(), 12);
        let c = lerpColor(c1, c2, (sin(gradientPhase + t * PI) + 1) / 2);
        stroke(red(c), green(c), blue(c), 160);
        strokeWeight(1.2);
        line(-sSize * 1.1, y, sSize * 1.1, y);
      }
      noStroke();
      pop();
      break;
    case 'linedot':
      push();
      let base = max(6, sSize * 0.14);
      for (let i = 0; i < floor(random(5, 12)); i++) {
        let pcol = jitterColor(pickPaletteColor(), 18);
        fill(red(pcol), green(pcol), blue(pcol), random(70, 190));
        let sx = random(-base * 2.0, base * 2.0);
        let sy = random(-base * 2.0, base * 2.0);
        ellipse(sx, sy, random(base * 0.2, base * 1.1), random(base * 0.2, base * 1.1));
      }
      strokeWeight(random(0.6, 2.2));
      for (let i = 0; i < floor(random(5, 12)); i++) {
        let scol = jitterColor(pickPaletteColor(), 28);
        stroke(red(scol), green(scol), blue(scol), random(70, 180));
        let mode = random(['rect', 'line', 'arc']);
        let x1 = random(-base * 2.2, base * 2.2);
        let y1 = random(-base * 2.2, base * 2.2);
        let w = random(base * 0.2, base * 1.6);
        let h = random(base * 0.2, base * 1.6);
        noFill();
        if (mode === 'rect') {
          rectMode(CENTER);
          rect(x1, y1, w, h, random(2, 12));
        } else if (mode === 'arc') {
          arc(x1, y1, w, h, random(TWO_PI), random(TWO_PI));
        } else {
          let x2 = x1 + random(-base * 1.6, base * 1.6);
          let y2 = y1 + random(-base * 1.6, base * 1.6);
          line(x1, y1, x2, y2);
        }
      }
      noStroke();
      for (let i = 0; i < floor(random(20, 60)); i++) {
        let p = jitterColor(pickPaletteColor(), 36);
        fill(red(p), green(p), blue(p), random(60, 200));
        ellipse(random(-base * 2.2, base * 2.2), random(-base * 2.2, base * 2.2), random(1, 5));
      }
      pop();
      break;
  }
}

function drawLowPassNoise2D() {
  push();
  for (let i = 0; i < 40; i++) {
    fill(255, 8);
    noStroke();
    ellipse(random(width), random(height), random(1, 6));
  }
  pop();
}

function drawHighPassLines2D() {
  push();
  stroke(240, random(18, 120));
  strokeWeight(random(0.6, 1.6));
  for (let i = 0; i < 18; i++) {
    line(random(width), random(height), random(width), random(height));
  }
  pop();
}

function pickPaletteColor() {
  return random(colorPalette);
}

function jitterColor(col, amt = 15) {
  let r = constrain(red(col) + random(-amt, amt), 0, 255);
  let g = constrain(green(col) + random(-amt, amt), 0, 255);
  let b = constrain(blue(col) + random(-amt, amt), 0, 255);
  return color(r, g, b);
}



// Optional testing helper (uncomment to test without MIDI)
 function mousePressed() { spawnShape(getShapeFromIndex(floor(random(0,10))));
                         userStartAudio();}
