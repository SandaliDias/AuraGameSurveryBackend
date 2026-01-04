/**
 * Feature Extraction for Motor Skills Assessment
 * 
 * Implements exact formulas for:
 * - Velocity, acceleration, jerk
 * - jerkRMS (Root Mean Square jerk)
 * - Submovement count (corrections)
 * - Overshoot count (direction reversals)
 * - Fitts' law throughput
 */

// Helper: Distance between two points
function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Helper: Moving average smoothing
function movingAverage(arr, w = 3) {
  if (arr.length < w) return arr.slice();
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    let s = 0, c = 0;
    for (let k = i - Math.floor(w/2); k <= i + Math.floor(w/2); k++) {
      if (k >= 0 && k < arr.length) { 
        s += arr[k]; 
        c++; 
      }
    }
    out.push(s / c);
  }
  return out;
}

/**
 * Extracts kinematic + Fitts features for one attempt.
 * 
 * @param {Object} params
 * @param {Array} params.samples - [{tms, x, y}, ...] normalized 0..1, sorted by tms
 * @param {Number} params.spawnTms - When bubble spawned (ms)
 * @param {Number} params.clickTms - When user clicked (ms)
 * @param {Object} params.target - {x, y, radius} normalized
 * @param {Number} params.prevClickTms - Previous click time for interTap (optional)
 * 
 * @returns {Object} Computed features
 */
export function extractAttemptFeatures({
  samples,
  spawnTms,
  clickTms,
  target,
  prevClickTms,
}) {
  // 1) Segment samples in [spawn, click] interval
  const seg = samples.filter(s => s.tms >= spawnTms && s.tms <= clickTms);
  
  if (seg.length < 4) {
    // Not enough samples for meaningful feature extraction
    return {
      timing: {
        reactionTimeMs: clickTms - spawnTms,
        movementTimeMs: null,
        interTapMs: prevClickTms != null ? (clickTms - prevClickTms) : null,
      },
      spatial: {},
      kinematics: {},
      fitts: {}
    };
  }
  
  // 2) Detect movement start
  // First point where displacement from initial position exceeds epsilon
  const p0 = { x: seg[0].x, y: seg[0].y };
  const EPS = 0.003; // Normalized epsilon (~0.3% of min dimension)
  let startIdx = 0;
  
  for (let i = 1; i < seg.length; i++) {
    if (dist({x: seg[i].x, y: seg[i].y}, p0) > EPS) {
      startIdx = i - 1;
      break;
    }
  }
  
  const moveSeg = seg.slice(startIdx);
  const moveStart = { x: moveSeg[0].x, y: moveSeg[0].y };
  const moveEnd = { x: moveSeg[moveSeg.length - 1].x, y: moveSeg[moveSeg.length - 1].y };
  
  const reactionTimeMs = clickTms - spawnTms;
  const movementTimeMs = moveSeg[moveSeg.length - 1].tms - moveSeg[0].tms;
  
  // 3) Spatial metrics
  let pathLength = 0;
  for (let i = 1; i < moveSeg.length; i++) {
    pathLength += dist(moveSeg[i-1], moveSeg[i]);
  }
  
  const directDist = dist(moveStart, target);
  const straightness = pathLength > 0 ? (directDist / pathLength) : null;
  
  const clickPos = moveEnd;
  const errorDist = dist(clickPos, target);
  const errorDistNorm = target.radius > 0 ? (errorDist / target.radius) : null;
  
  // 4) Velocities, accelerations, jerk (use seconds)
  const t = moveSeg.map(s => s.tms / 1000); // Convert to seconds
  const x = moveSeg.map(s => s.x);
  const y = moveSeg.map(s => s.y);
  
  // 4.1 Velocity
  const speed = [];
  const vx = [], vy = [];
  
  for (let i = 1; i < moveSeg.length; i++) {
    const dt = t[i] - t[i-1];
    if (dt <= 0) continue;
    
    const vxi = (x[i] - x[i-1]) / dt;
    const vyi = (y[i] - y[i-1]) / dt;
    vx.push(vxi);
    vy.push(vyi);
    speed.push(Math.hypot(vxi, vyi));
  }
  
  const meanSpeed = speed.length ? speed.reduce((a,b) => a+b, 0) / speed.length : null;
  const peakSpeed = speed.length ? Math.max(...speed) : null;
  const speedVar = speed.length && meanSpeed != null
    ? speed.reduce((a,b) => a + Math.pow(b - meanSpeed, 2), 0) / speed.length
    : null;
  
  // 4.2 Acceleration
  const ax = [], ay = [], acc = [];
  
  for (let i = 1; i < vx.length; i++) {
    const dt = t[i+1] - t[i]; // Align indices
    if (!dt || dt <= 0) continue;
    
    const axi = (vx[i] - vx[i-1]) / dt;
    const ayi = (vy[i] - vy[i-1]) / dt;
    ax.push(axi);
    ay.push(ayi);
    acc.push(Math.hypot(axi, ayi));
  }
  
  const meanAccel = acc.length ? acc.reduce((a,b) => a+b, 0) / acc.length : null;
  const peakAccel = acc.length ? Math.max(...acc) : null;
  
  // 4.3 Jerk (third derivative) and jerkRMS
  const jerk = [];
  
  for (let i = 1; i < ax.length; i++) {
    const dt = t[i+2] - t[i+1];
    if (!dt || dt <= 0) continue;
    
    const jx = (ax[i] - ax[i-1]) / dt;
    const jy = (ay[i] - ay[i-1]) / dt;
    jerk.push(Math.hypot(jx, jy));
  }
  
  const jerkRMS = jerk.length
    ? Math.sqrt(jerk.reduce((a,b) => a + b*b, 0) / jerk.length)
    : null;
  
  // 5) Submovement count (corrections via speed peaks)
  const smoothedSpeed = movingAverage(speed, 5);
  const vThresh = peakSpeed != null ? 0.15 * peakSpeed : null;
  let submovementCount = 0;
  
  if (vThresh != null) {
    for (let i = 1; i < smoothedSpeed.length - 1; i++) {
      if (smoothedSpeed[i-1] < smoothedSpeed[i] && 
          smoothedSpeed[i] > smoothedSpeed[i+1] && 
          smoothedSpeed[i] >= vThresh) {
        submovementCount++;
      }
    }
  }
  
  // 6) Overshoot count (distance-to-target reversals near target)
  // For MOVING targets (like rising bubbles), we need to interpolate
  // the target position at each sample time
  const clickTime = moveSeg[moveSeg.length - 1].tms;
  const spawnTime = moveSeg[0].tms;
  const totalDuration = clickTime - spawnTime;
  
  // Calculate distance to target at each sample
  // For moving targets, interpolate target position based on time
  // The bubble rises (y decreases) from spawn to click
  const d = moveSeg.map(s => {
    // If we have timing info, interpolate target position
    // Bubbles rise linearly, so target.y at time t is:
    // targetY(t) = spawnY + (clickY - spawnY) * (t - spawnTime) / totalDuration
    // Since we only have final target position, use it directly for now
    // (this gives correct results for stationary targets)
    return dist(s, target);
  });
  
  let overshootCount = 0;
  // Increased gate from 2x to 4x radius for more sensitive detection
  const gate = 4 * target.radius;
  
  // Method 1: Distance reversal detection (classic approach)
  for (let i = 2; i < d.length; i++) {
    const ddPrev = d[i-1] - d[i-2];
    const dd = d[i] - d[i-1];
    
    // Reversal: was approaching (distance decreasing), now receding (distance increasing)
    // Must be within gate distance to target
    if (ddPrev < -0.001 && dd > 0.001 && d[i] < gate) {
      overshootCount++;
    }
  }
  
  // Method 2: Detect overshoots in the FINAL approach phase only
  // (last 30% of movement, when pointer is near the click location)
  // This is more reliable for moving targets
  const finalPhaseStart = Math.floor(moveSeg.length * 0.7);
  let finalPhaseOvershoots = 0;
  
  if (moveSeg.length > 5) {
    const finalSeg = moveSeg.slice(finalPhaseStart);
    const finalD = finalSeg.map(s => dist(s, target));
    
    for (let i = 2; i < finalD.length; i++) {
      const ddPrev = finalD[i-1] - finalD[i-2];
      const dd = finalD[i] - finalD[i-1];
      
      if (ddPrev < -0.001 && dd > 0.001) {
        finalPhaseOvershoots++;
      }
    }
  }
  
  // Method 3: Position oscillation detection (catches lateral wobbles)
  // Look for back-and-forth movement in x or y direction when near target
  let oscillationCount = 0;
  if (moveSeg.length > 4) {
    for (let i = 3; i < moveSeg.length; i++) {
      if (d[i] < gate) {
        // Check x-direction oscillation
        const dxPrev = moveSeg[i-1].x - moveSeg[i-2].x;
        const dx = moveSeg[i].x - moveSeg[i-1].x;
        const xReversal = (dxPrev > 0.002 && dx < -0.002) || (dxPrev < -0.002 && dx > 0.002);
        
        // Check y-direction oscillation  
        const dyPrev = moveSeg[i-1].y - moveSeg[i-2].y;
        const dy = moveSeg[i].y - moveSeg[i-1].y;
        const yReversal = (dyPrev > 0.002 && dy < -0.002) || (dyPrev < -0.002 && dy > 0.002);
        
        if (xReversal || yReversal) {
          oscillationCount++;
        }
      }
    }
  }
  
  // Use the maximum of all detection methods
  overshootCount = Math.max(overshootCount, finalPhaseOvershoots, oscillationCount);
  
  // 7) Fitts' law throughput
  const D = directDist;
  const W = 2 * target.radius;
  const ID = (W > 0) ? Math.log2(D / W + 1) : null;
  const mtSec = movementTimeMs != null ? Math.max(movementTimeMs / 1000, 0.05) : null;
  const throughput = (ID != null && mtSec != null) ? (ID / mtSec) : null;
  
  return {
    timing: {
      reactionTimeMs,
      movementTimeMs,
      interTapMs: prevClickTms != null ? (clickTms - prevClickTms) : null,
    },
    spatial: {
      errorDistNorm,
      pathLengthNorm: pathLength,
      directDistNorm: directDist,
      straightness,
    },
    kinematics: {
      meanSpeed,
      peakSpeed,
      speedVar,
      meanAccel,
      peakAccel,
      jerkRMS,
      submovementCount,
      overshootCount,
    },
    fitts: {
      D,
      W,
      ID,
      throughput,
    }
  };
}

/**
 * Batch process multiple attempts
 * 
 * @param {Array} attempts - Array of attempt objects
 * @param {Array} allSamples - All pointer samples for the session
 * @returns {Array} Attempts with computed features
 */
export function extractBatchFeatures(attempts, allSamples) {
  const enrichedAttempts = [];
  
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const prevClickTms = i > 0 ? attempts[i-1].click.tms : null;
    
    const features = extractAttemptFeatures({
      samples: allSamples,
      spawnTms: attempt.spawnTms,
      clickTms: attempt.click.tms,
      target: attempt.target,
      prevClickTms,
    });
    
    // Merge features into attempt
    enrichedAttempts.push({
      ...attempt,
      ...features,
    });
  }
  
  return enrichedAttempts;
}

/**
 * Normalize coordinates based on screen dimensions
 * 
 * @param {Number} value - Pixel value
 * @param {Number} dimension - Screen dimension (width or height)
 * @returns {Number} Normalized value (0..1)
 */
export function normalize(value, dimension) {
  return dimension > 0 ? value / dimension : 0;
}

/**
 * Normalize radius based on minimum screen dimension
 * 
 * @param {Number} radiusPx - Radius in pixels
 * @param {Number} screenWidth - Screen width
 * @param {Number} screenHeight - Screen height
 * @returns {Number} Normalized radius
 */
export function normalizeRadius(radiusPx, screenWidth, screenHeight) {
  const minDim = Math.min(screenWidth, screenHeight);
  return minDim > 0 ? radiusPx / minDim : 0;
}

/**
 * Normalize speed
 * 
 * @param {Number} speedPxPerSec - Speed in pixels per second
 * @param {Number} screenWidth - Screen width
 * @param {Number} screenHeight - Screen height
 * @returns {Number} Normalized speed
 */
export function normalizeSpeed(speedPxPerSec, screenWidth, screenHeight) {
  const minDim = Math.min(screenWidth, screenHeight);
  return minDim > 0 ? speedPxPerSec / minDim : 0;
}

export default {
  extractAttemptFeatures,
  extractBatchFeatures,
  normalize,
  normalizeRadius,
  normalizeSpeed,
  dist,
};


