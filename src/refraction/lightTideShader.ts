// Deep oceanic caustics and tide fragment shader.
// Simulates multi-octave refractive wave interference with chromatic dispersion,
// deep oceanic swells, floating marine snow / plankton, and a central lyric safe zone.
export const lightTideShader = `
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_ripple_presence;
uniform vec3 u_deep_blue;
uniform vec3 u_orange;
uniform vec3 u_warm_yellow;
uniform vec3 u_cyan_rim;
uniform float u_audio_bass;
uniform float u_audio_vocal;
uniform float u_audio_treble;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float oceanFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.05 + vec2(11.3, 7.7);
    a *= 0.5;
  }
  return v;
}

// Multi-octave traveling wave interference creating caustic focal ridges
float causticOctave(vec2 p, float t) {
  mat2 r1 = mat2(0.866, 0.500, -0.500, 0.866);
  vec2 pos = p * 3.4;
  vec2 v = pos;
  float sum = 0.0;

  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float speed = 0.16 + fi * 0.05;
    pos = r1 * pos * 1.25 + vec2(t * speed * 0.35, -t * speed * 0.30);
    vec2 w = sin(pos.yx + vec2(t * speed, -t * speed * 0.65) + sin(pos.xy * 1.25));
    v += w * 0.38;
    sum += abs(sin(v.x + v.y));
  }
  return pow(1.0 - abs(sin(sum * 1.5707963)), 2.8);
}

float causticField(vec2 p, float t, vec2 offset) {
  float primary = causticOctave(p + offset, t);
  float micro = causticOctave((p + offset) * 2.18, t * 1.28 + 5.7);
  return primary * 0.72 + micro * 0.28;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // Slower, elegant media-clock pacing
  float t = u_time * 0.20;
  float bassSurge = u_audio_bass;
  float vocalBoost = 0.88 + u_audio_vocal * 0.40;
  float trebleTwinkle = 0.30 + u_audio_treble * 0.80;

  // Layer 1: Deep oceanic swell and current domain-warping (steady fluid motion, zero camera translation)
  float swellTime = t * 0.28;
  vec2 currentFlow = vec2(
    sin(p.y * 1.6 + swellTime * 1.1) * 0.18 + cos(p.x * 1.3 - swellTime * 0.9) * 0.12,
    cos(p.x * 1.5 + swellTime * 0.8) * 0.18 + sin(p.y * 1.2 + swellTime * 1.2) * 0.12
  );
  // Steady coordinate space: decoupled from audio impulses so camera stays serene
  vec2 warpedP = p + currentFlow * 0.85;

  // Pointer ripple reaction
  if (u_ripple_presence > 0.01) {
    vec2 mouseCoord = (u_mouse / u_resolution.xy - 0.5) * aspect;
    float mouseDist = length(p - mouseCoord);
    float mouseRipple = sin(mouseDist * 26.0 - u_time * 4.5) * exp(-mouseDist * 3.8) * u_ripple_presence * 0.22;
    warpedP += mouseRipple;
  }

  // Oceanic swell volume
  float swell = oceanFbm(warpedP * 1.8 + vec2(swellTime * 0.3, -swellTime * 0.25));
  float depthGrad = uv.y * 0.55 + (warpedP.y + 0.5) * 0.25;

  // Layer 2: Concentric Harmonic Tide Wave Rings & Optical Wave Propagation (舒展宏大的大洋深涌光浪)
  // Tide swell origin center (slight natural offset below center for oceanic perspective)
  vec2 tideOrigin = vec2(sin(t * 0.18) * 0.08, -0.22 + cos(t * 0.14) * 0.06);
  vec2 pTide = (warpedP - tideOrigin) * vec2(1.0, 1.35);
  float rawDist = length(pTide);
  float angle = atan(pTide.y, pTide.x);

  // Organic wave contour perturbation (fluid current warping so rings undulate naturally)
  float wavePerturb = sin(angle * 3.0 + t * 0.5) * 0.028
                    + sin(angle * 5.0 - t * 0.4) * 0.014
                    + oceanFbm(warpedP * 1.4 + vec2(t * 0.06, -t * 0.05)) * 0.07;
  float tideDist = rawDist + wavePerturb;

  // Audio-driven dynamic wave surge: gentle breathing wave fronts
  float waveSurge = bassSurge * 0.95 + u_audio_vocal * 0.35;
  // Broad, majestic ocean swells (frequency reduced from 14.5 to 6.8)
  float ringFreq = 6.8;
  float waveSpeed = 1.35;

  // Layer 2A: Major Concentric Tide Rings (宽大舒展的主潮浪光圈)
  float ringPhase1 = tideDist * ringFreq - t * waveSpeed - waveSurge * 1.6;
  float ringSin1 = sin(ringPhase1);
  float ringCrest1 = pow(clamp(ringSin1 * 0.5 + 0.5, 0.0, 1.0), 2.6);
  float ringEdge1 = pow(1.0 - abs(ringSin1), 3.4);
  float majorWaveRing = mix(ringCrest1, ringEdge1, 0.35) * (0.45 + bassSurge * 0.85);

  // Layer 2B: Harmonic Resonance Wave Rings (次级谐波潮浪)
  float ringPhase2 = tideDist * (ringFreq * 1.82) - t * (waveSpeed * 1.22) - u_audio_vocal * 1.3;
  float ringSin2 = sin(ringPhase2 + angle * 2.0);
  float harmonicRing = pow(clamp(ringSin2 * 0.5 + 0.5, 0.0, 1.0), 3.2) * (0.24 + u_audio_vocal * 0.65);

  // Layer 2C: Cross-Tidal Interference Swell (对冲干涉浪潮)
  vec2 crossDir = vec2(0.819, 0.574);
  float crossPhase = dot(warpedP, crossDir) * 5.4 - t * 1.15 - bassSurge * 0.85;
  float crossWave = pow(clamp(sin(crossPhase) * 0.5 + 0.5, 0.0, 1.0), 2.8) * (0.25 + bassSurge * 0.45);

  // Layer 2D: High-Frequency Capillary Ripples (高频毛细水纹涟漪)
  float capillaryPhase = tideDist * 18.0 - t * 2.8;
  float microRipple = sin(capillaryPhase) * sin(dot(warpedP, vec2(-12.0, 9.0)) - t * 2.2);
  float trebleLight = pow(clamp(microRipple * 0.5 + 0.5, 0.0, 1.0), 3.0) * (0.18 + u_audio_treble * 0.75);

  // Composite tide wave envelope
  float combinedTideWaves = majorWaveRing * 0.55 + harmonicRing * 0.38 + crossWave * 0.30;
  float audioLightWave = pow(combinedTideWaves, 1.5) * (0.65 + bassSurge * 0.95 + u_audio_vocal * 0.45);

  // Refractive normal displacement of caustics along the wave rings
  vec2 waveNormal = normalize(pTide + vec2(0.001));
  vec2 causticWaveDisplace = waveNormal * (ringSin1 * 0.026 * (1.0 + bassSurge * 0.65));
  vec2 causticCoords = warpedP + causticWaveDisplace;

  // Dynamic chromatic dispersion driven by vocal brilliance
  float disp = 0.0030 + u_audio_vocal * 0.0045 + bassSurge * 0.0018;
  vec2 dispDir = vec2(disp, disp * 0.62);

  float causticR = causticField(causticCoords, t, -dispDir);
  float causticG = causticField(causticCoords, t, vec2(0.0));
  float causticB = causticField(causticCoords, t, dispDir);
  vec3 causticDisp = vec3(causticR, causticG, causticB);

  // Soft Central Lyric Safe Zone (vignette)
  // Keeps the reading area calm and high-contrast, while surrounding tide rings surge with rhythm
  vec2 centerOffset = (uv - vec2(0.5, 0.48)) * vec2(1.10, 1.35);
  float centerDist = length(centerOffset);
  float lyricSafeZone = smoothstep(0.18, 0.85, centerDist);
  float causticVignette = mix(0.12, 1.0, lyricSafeZone);

  // Composite audio light wave pulse: colors the wave rings with cyan rim and warm golden crest highlights
  vec3 ringColor = mix(u_cyan_rim, u_warm_yellow, clamp(ringCrest1 * 1.2, 0.0, 1.0));
  vec3 lightWavePulse = ringColor * audioLightWave * causticVignette;
  lightWavePulse += u_warm_yellow * trebleLight * causticVignette * 0.35;

  // Layer 3: Suspended Bioluminescent Plankton / Marine Snow
  vec2 planktonUV = (p + vec2(t * 0.03, -t * 0.04)) * vec2(42.0, 26.0);
  vec2 planktonCell = floor(planktonUV);
  vec2 planktonF = fract(planktonUV) - 0.5;
  float cellHash = hash(planktonCell);
  float planktonMask = step(0.975, cellHash);
  float planktonCore = exp(-dot(planktonF, planktonF) * 38.0);
  float twinkle = 0.45 + 0.55 * sin(t * 2.8 + cellHash * 35.0);
  float planktonIntensity = planktonMask * planktonCore * twinkle * trebleTwinkle;
  vec3 planktonColor = mix(u_cyan_rim, vec3(1.0), 0.40);

  // Outer vignette
  float outerVignette = smoothstep(1.35, 0.45, length((uv - 0.5) * vec2(1.1, 0.95)));

  // Palette adaptation: Light/Daylight vs Dark/Oceanic
  float isDaylight = step(0.38, dot(u_deep_blue, vec3(0.299, 0.587, 0.114)));

  if (isDaylight > 0.5) {
    // Sunlit Caribbean / Paper Daylight Mode (柔和浅色底色与水纹阴影折射，彻底杜绝过曝泛白)
    // Firmly grounded base from theme background color
    vec3 paperBase = mix(u_deep_blue, u_deep_blue * 0.97 + u_orange * 0.03, clamp(depthGrad * 0.20 + swell * 0.06, 0.0, 1.0));

    // 1. Subtractive Wave Shading (波谷柔和水影):
    float waveTrough1 = pow(clamp((1.0 - ringSin1) * 0.5, 0.0, 1.0), 1.8);
    float waveTrough2 = pow(clamp((1.0 - ringSin2) * 0.5, 0.0, 1.0), 2.2);
    float waveTroughs = waveTrough1 * 0.65 + waveTrough2 * 0.35;
    float waveShadowAmount = waveTroughs * (0.045 + bassSurge * 0.045) * causticVignette;

    // 2. Caustic Network Shading (水底柔和焦散暗纹与微光):
    float caustSum = (causticDisp.r + causticDisp.g + causticDisp.b) * 0.3333;
    float caustDarkFringe = smoothstep(0.40, 0.15, caustSum) * 0.035 * causticVignette;
    float caustLightRidge = smoothstep(0.60, 0.90, caustSum) * 0.045 * causticVignette;

    // 3. Delicate Crest Highlights (极度克制的高光微澜):
    vec3 waveHighlightTint = mix(u_cyan_rim, u_warm_yellow, clamp(ringCrest1, 0.0, 1.0));
    float waveHighlightAmount = (ringCrest1 * 0.030 + harmonicRing * 0.016 + crossWave * 0.014)
                              * (0.5 + bassSurge * 0.4) * causticVignette;

    // 4. Subtle Capillary Treble Shimmer
    float trebleShimmer = trebleLight * 0.020 * causticVignette;

    // Composite: Subtractive paper ink wave shading + gentle mineral tint (prevent additive blown-out white glare)
    vec3 col = paperBase;
    col *= (1.0 - waveShadowAmount - caustDarkFringe);
    vec3 crestTint = mix(col, waveHighlightTint, 0.08);
    float highlightMask = clamp((waveHighlightAmount + caustLightRidge * 0.7 + trebleShimmer) * 2.2, 0.0, 1.0);
    col = mix(col, crestTint, highlightMask);

    // Keep outer vignette very gentle in light mode
    col *= mix(0.97, 1.0, outerVignette);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  } else {
    // Deep Oceanic Abyss
    vec3 oceanBase = mix(u_deep_blue * 0.88, u_deep_blue * 1.25 + u_orange * 0.25, clamp(depthGrad, 0.0, 1.0));
    oceanBase += u_orange * (swell * 0.08);

    vec3 causticFinal = vec3(
      causticDisp.r * mix(u_cyan_rim.r, u_warm_yellow.r, 0.72),
      causticDisp.g * mix(u_cyan_rim.g, u_warm_yellow.g, 0.48),
      causticDisp.b * mix(u_cyan_rim.b, u_warm_yellow.b, 0.20)
    );
    causticFinal += lightWavePulse * 0.55;

    vec3 finalColor = oceanBase + causticFinal * causticVignette * vocalBoost * 0.68;
    finalColor += planktonColor * planktonIntensity * mix(0.15, 0.45, lyricSafeZone);
    finalColor *= mix(0.78, 1.0, outerVignette);

    vec3 mapped = 1.0 - exp(-finalColor * 1.45);
    gl_FragColor = vec4(mapped, 1.0);
  }
}
`;
