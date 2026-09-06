// @ts-nocheck
// Adapted from nebula-canvas skill runtime. ES module and externally clocked rendering for MV playback.

  "use strict";

  const DEFAULT_SCHEMES = [
    {
      deepBlue: [0.05, 0.1, 0.5],
      orange: [0.9, 0.35, 0.1],
      warmYellow: [1.0, 0.8, 0.3],
      cyanRim: [0.4, 0.9, 0.8]
    },
    {
      deepBlue: [0.05, 0.1, 0.2],
      orange: [0.4, 0.7, 0.2],
      warmYellow: [0.7, 0.9, 0.2],
      cyanRim: [0.85, 1.0, 0.7]
    },
    {
      deepBlue: [0.2, 0.0, 0.1],
      orange: [1.0, 0.3, 0.0],
      warmYellow: [1.0, 0.8, 0.4],
      cyanRim: [0.1, 0.9, 1.0]
    }
  ];

  const DEFAULT_OPTIONS = {
    schemes: DEFAULT_SCHEMES,
    container: null,
    autoResize: true,
    trackPointer: true,
    renderScale: "auto",
    quality: { desktop: 0.65, mobile: 0.5 },
    autoStart: true
  };

  const VERTEX_SOURCE = `
    attribute vec2 a_position;

    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAGMENT_SOURCE = `
    precision highp float;

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform float u_ripple_presence;
    uniform vec3 u_deep_blue;
    uniform vec3 u_orange;
    uniform vec3 u_warm_yellow;
    uniform vec3 u_cyan_rim;

    float random2d(vec2 point, float time) {
      vec3 point3 = fract(vec3(point.xy, time) * 0.1031);
      point3 += dot(point3, point3.yzx + 19.19);
      return fract((point3.x + point3.y) * point3.x);
    }

    mat2 rotate2d(float angle) {
      float cosine = cos(angle);
      float sine = sin(angle);
      return mat2(cosine, -sine, sine, cosine);
    }

    float nebulaPattern(vec3 point) {
      // Advect the internal field along the aurora ribbon instead of rotating
      // the whole shape. The silhouette stays stable while light races through it.
      point.xz *= rotate2d(sin(u_time * 0.28) * 0.12);
      point.xy *= rotate2d(cos(u_time * 0.21) * 0.08);

      vec3 layeredPoint = point * 3.0 + vec3(u_time * 1.25, -u_time * 0.48, u_time * 0.82);
      float primaryFlow = sin(layeredPoint.x + sin(layeredPoint.z + sin(layeredPoint.y)));
      float softWake = sin(layeredPoint.y * 1.7 - layeredPoint.z * 0.65 + u_time * 0.75);

      return length(point + vec3(sin(u_time * 0.62)) * 0.07)
          * log(length(point) + 1.0)
          + primaryFlow * 0.25
          + softWake * 0.055
          - 1.0;
    }

    float sceneDistance(vec3 point, vec2 fragmentCoordinate) {
      float ringRadius = 2.0;
      vec2 ringPoint = vec2(length(point.xz) - ringRadius, point.y);
      float ringAngle = atan(point.z, point.x);
      // Keep the ring coordinates bounded. Flow belongs in the periodic noise
      // phase above; translating this distance-field axis makes the whole
      // nebula leave the viewport as playback time grows.
      float baseShape = nebulaPattern(vec3(ringPoint.y, ringPoint.x, ringAngle * 1.8));

      float pointerDistance = length(fragmentCoordinate - u_mouse);
      float rippleWave = sin(pointerDistance * 0.05 - u_time * 3.0);
      float rippleFalloff = smoothstep(300.0, 0.0, pointerDistance);
      float ripple = rippleWave * rippleFalloff * 0.3 * u_ripple_presence;

      return baseShape + ripple;
    }

    vec3 toneMap(vec3 color) {
      vec3 exponent = exp(2.0 * color);
      return (exponent - 1.0) / (exponent + 1.0);
    }

    void main() {
      vec2 fragmentCoordinate = gl_FragCoord.xy;
      vec2 screenPoint = fragmentCoordinate / u_resolution.y
          - vec2(u_resolution.x / u_resolution.y * 0.5, 0.5);

      // Preserve the nebula field; rotate and lift its luminous fold into an aurora canopy.
      screenPoint = rotate2d(-1.57) * (screenPoint + vec2(0.02, -0.32));
      vec3 accumulatedColor = vec3(0.0);
      float rayDistance = 2.5;

      for (int stepIndex = 0; stepIndex <= 4; stepIndex++) {
        vec3 samplePoint = vec3(0.0, -0.3, 2.5)
            + normalize(vec3(screenPoint, -0.8)) * rayDistance;

        float distanceToSurface = sceneDistance(samplePoint, fragmentCoordinate);
        float lightGradient = clamp(
          (distanceToSurface - sceneDistance(samplePoint + 0.1, fragmentCoordinate)) * 0.5,
          -0.1,
          1.0
        );

        float blueToOrange = smoothstep(0.0, 0.3, lightGradient);
        vec3 intermediateColor = mix(u_deep_blue, u_orange, blueToOrange);
        float orangeToYellow = smoothstep(0.3, 0.7, lightGradient);
        vec3 baseColor = mix(intermediateColor, u_warm_yellow, orangeToYellow);
        float cyanHighlight = smoothstep(0.6, 0.75, lightGradient);
        baseColor = mix(baseColor, u_cyan_rim, cyanHighlight);

        vec2 epsilon = vec2(0.01, 0.0);
        vec3 normal = normalize(vec3(
          sceneDistance(samplePoint + epsilon.xyy, fragmentCoordinate) - distanceToSurface,
          sceneDistance(samplePoint + epsilon.yxy, fragmentCoordinate) - distanceToSurface,
          sceneDistance(samplePoint + epsilon.yyx, fragmentCoordinate) - distanceToSurface
        ));
        vec3 viewDirection = normalize(-samplePoint);
        float rimLight = pow(1.0 - dot(normal, viewDirection), 3.0);
        vec3 litColor = baseColor + rimLight * u_cyan_rim * 0.15;

        vec3 emission = litColor * max(lightGradient, 0.0) * 23.0;
        // A wider density shoulder gives the moving ribbon a soft optical bloom.
        float density = smoothstep(1.9, -0.08, distanceToSurface) * 0.9;
        accumulatedColor += emission * density;

        rayDistance += min(distanceToSurface, 1.0);
      }

      vec3 finalColor = toneMap(accumulatedColor / 2.8);
      vec2 noiseCoordinate = floor(fragmentCoordinate / 0.5);
      float filmGrain = random2d(noiseCoordinate, 0.0);
      finalColor += (filmGrain - 0.5) * 0.008;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const mixColor = (from, to, amount) => from.map((channel, index) => (channel + (to[index] - channel) * amount));
  const detectMobile = () => /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

  const compileShader = (gl, type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Nebula canvas shader compile error: ${message}`);
    }
    return shader;
  };

  const createProgram = (gl, vertexSource, fragmentSource) => {
    const program = gl.createProgram();
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Nebula canvas link error: ${message}`);
    }
    return program;
  };

  class NebulaCanvas {
    constructor(options = {}) {
      this.options = {
        ...DEFAULT_OPTIONS,
        ...options,
        schemes: Array.isArray(options.schemes) && options.schemes.length
          ? options.schemes
          : DEFAULT_OPTIONS.schemes
      };

      this.canvas = this.options.canvas || null;
      this.container = this.options.container || this.canvas?.parentElement || null;
      this.isSupported = false;
      this.gl = null;
      this.program = null;
      this._raf = 0;
      this._running = false;
      this._destroyed = false;
      this._frameCount = 0;
      this._startTime = performance.now();
      this._renderScale = this.options.renderScale === "auto" ? null : Number(this.options.renderScale);
      this._targetSchemeIndex = 0;
      this._schemeProgress = 0;
      this._pixelBuffer = new Uint8Array(4);
      this._pointer = { x: 0, y: 0 };
      this._smoothedPointer = { x: 0, y: 0 };
      this._targetPointer = { x: 0, y: 0 };
      this._pointerInside = false;
      this._probePointerPixel = false;
      this._targetRipple = 0;
      this._smoothedRipple = 0;
      this._pageVisible = document.visibilityState !== "hidden";
      this._containerVisible = true;
      this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

      if (!this.canvas || !this.container) {
        return;
      }

      const gl = this.canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true
      });
      if (!gl) {
        this.canvas.hidden = true;
        return;
      }
      this.gl = gl;

      try {
        this.program = createProgram(gl, VERTEX_SOURCE, this.options.fragmentSource || FRAGMENT_SOURCE);
      } catch (error) {
        console.error(error);
        this.canvas.hidden = true;
        return;
      }

      this.positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1, -1,
          1, -1,
          -1, 1,
          -1, 1,
          1, -1,
          1, 1
        ]),
        gl.STATIC_DRAW
      );

      this.positionLocation = gl.getAttribLocation(this.program, "a_position");
      this.uniforms = {
        time: gl.getUniformLocation(this.program, "u_time"),
        resolution: gl.getUniformLocation(this.program, "u_resolution"),
        mouse: gl.getUniformLocation(this.program, "u_mouse"),
        ripplePresence: gl.getUniformLocation(this.program, "u_ripple_presence"),
        deepBlue: gl.getUniformLocation(this.program, "u_deep_blue"),
        orange: gl.getUniformLocation(this.program, "u_orange"),
        warmYellow: gl.getUniformLocation(this.program, "u_warm_yellow"),
        cyanRim: gl.getUniformLocation(this.program, "u_cyan_rim")
      };

      this.isSupported = true;
      this._bindEvents();
      this.resize();
      this.setScheme(this._targetSchemeIndex);

      if (this._reducedMotion.matches) {
        this._renderStatic();
      } else if (this.options.autoStart) {
        this._running = !!this.options.autoStart;
        this._schedule();
      }
    }

    _getTargetScale() {
      if (this._renderScale !== null && Number.isFinite(this._renderScale)) {
        return clamp01(this._renderScale);
      }
      const desktopScale = this.options.quality?.desktop ?? 0.65;
      const mobileScale = this.options.quality?.mobile ?? 0.5;
      const renderer = this.gl && (() => {
        const debug = this.gl.getExtension("WEBGL_debug_renderer_info");
        return debug ? this.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "";
      })();
      const lowPower = /Intel.*HD Graphics [4-5]\d{2}|Mali-[4-6]\d{2}|Adreno [3-5]\d{2}/i.test(renderer || "");
      const compactViewport = window.innerWidth * window.innerHeight < 921600;
      return lowPower || detectMobile() || compactViewport ? clamp01(mobileScale) : clamp01(desktopScale);
    }

    _bindEvents() {
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerLeave = this._onPointerLeave.bind(this);
      this._onVisibilityChange = this._onVisibilityChange.bind(this);
      this._onMotionPreference = this._onMotionPreference.bind(this);
      this._onResize = this._onResize.bind(this);
      this._onIntersection = this._onIntersection.bind(this);

      if (this.options.trackPointer) {
        this.container.addEventListener("pointermove", this._onPointerMove, { passive: true });
        this.container.addEventListener("pointerleave", this._onPointerLeave, { passive: true });
      }
      document.addEventListener("visibilitychange", this._onVisibilityChange, { passive: true });
      this._reducedMotion.addEventListener?.("change", this._onMotionPreference);

      if (this.options.autoResize && "ResizeObserver" in window) {
        this._resizeObserver = new ResizeObserver(this._onResize);
        this._resizeObserver.observe(this.container);
      } else {
        window.addEventListener("resize", this._onResize);
      }

      if ("IntersectionObserver" in window) {
        this._intersectionObserver = new IntersectionObserver(this._onIntersection);
        this._intersectionObserver.observe(this.container);
      }
    }

    _onResize() {
      this.resize();
    }

    _onPointerMove(event) {
      const bounds = this.canvas.getBoundingClientRect();
      this._pointerInside = true;
      this._pointer.x = event.clientX - bounds.left;
      this._pointer.y = event.clientY - bounds.top;
      this._probePointerPixel = true;
    }

    _onPointerLeave() {
      this._pointerInside = false;
      this._targetRipple = 0;
      this._probePointerPixel = false;
    }

    _onVisibilityChange() {
      this._pageVisible = document.visibilityState !== "hidden";
      if (this._pageVisible) {
        this._running = !!this.options.autoStart;
        this._schedule();
      } else {
        this._stop();
      }
    }

    _onMotionPreference() {
      this._startTime = performance.now();
      if (this._reducedMotion.matches) {
        this._running = false;
        this._stop();
        this._renderStatic();
      } else if (this.options.autoStart) {
        this._running = !!this.options.autoStart;
        this._schedule();
      }
    }

    _onIntersection(entries) {
      const entry = entries[0];
      if (!entry) return;
      this._containerVisible = entry.isIntersecting || entry.intersectionRatio > 0;
      if (this._containerVisible && !this._reducedMotion.matches) {
        this._running = !!this.options.autoStart;
        this._schedule();
      } else {
        this._stop();
      }
    }

    _isRunningAllowed() {
      return this._pageVisible && this._containerVisible && !this._destroyed && !this._reducedMotion.matches;
    }

    _stop() {
      if (this._raf) {
        window.cancelAnimationFrame(this._raf);
        this._raf = 0;
      }
    }

    _schedule() {
      if (this._raf || !this._running || !this._isRunningAllowed()) return;
      this._raf = window.requestAnimationFrame((timestamp) => this._render(timestamp));
    }

    _mixPalette(progressValue) {
      const maxIndex = this.options.schemes.length - 1;
      const bounded = Math.max(0, Math.min(maxIndex, progressValue));
      const fromIndex = Math.max(0, Math.min(maxIndex - 1, Math.floor(bounded)));
      const toIndex = Math.max(0, Math.min(maxIndex, fromIndex + 1));
      const amount = bounded - fromIndex;

      const from = this.options.schemes[fromIndex];
      const to = this.options.schemes[toIndex];

      return {
        deepBlue: mixColor(from.deepBlue, to.deepBlue, amount),
        orange: mixColor(from.orange, to.orange, amount),
        warmYellow: mixColor(from.warmYellow, to.warmYellow, amount),
        cyanRim: mixColor(from.cyanRim, to.cyanRim, amount)
      };
    }

    _drawFrame(elapsedSeconds) {
      const gl = this.gl;
      const palette = this._mixPalette(this._schemeProgress);
      const bounds = this.canvas.getBoundingClientRect();

      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1f(this.uniforms.time, elapsedSeconds);
      gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.uniforms.mouse, this._smoothedPointer.x, this._smoothedPointer.y);
      gl.uniform1f(this.uniforms.ripplePresence, this._smoothedRipple);
      gl.uniform3fv(this.uniforms.deepBlue, palette.deepBlue);
      gl.uniform3fv(this.uniforms.orange, palette.orange);
      gl.uniform3fv(this.uniforms.warmYellow, palette.warmYellow);
      gl.uniform3fv(this.uniforms.cyanRim, palette.cyanRim);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (
        this._pointerInside &&
        (this._probePointerPixel || this._frameCount % 20 === 0) &&
        this.options.trackPointer
      ) {
        const pixelX = Math.floor(this._pointer.x * this._renderScale);
        const pixelY = Math.floor((bounds.height - this._pointer.y) * this._renderScale);
        if (pixelX >= 0 && pixelX < this.canvas.width && pixelY >= 0 && pixelY < this.canvas.height) {
          gl.readPixels(pixelX, pixelY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this._pixelBuffer);
          this._targetRipple = (this._pixelBuffer[0] + this._pixelBuffer[1] + this._pixelBuffer[2]) > 25 ? 1 : 0;
        }
        this._probePointerPixel = false;
      }
    }

    _render(timestamp) {
      this._raf = 0;
      if (!this._isRunningAllowed()) return;

      this._frameCount += 1;
      const elapsedSeconds = (timestamp - this._startTime) / 1000;
      this._drawFrame(elapsedSeconds);

      const bounds = this.canvas.getBoundingClientRect();
      const targetX = this._pointer.x * this._renderScale;
      const targetY = (bounds.height - this._pointer.y) * this._renderScale;
      this._targetPointer.x = targetX;
      this._targetPointer.y = targetY;
      this._smoothedPointer.x += (this._targetPointer.x - this._smoothedPointer.x) * 0.05;
      this._smoothedPointer.y += (this._targetPointer.y - this._smoothedPointer.y) * 0.05;
      this._smoothedRipple += (this._targetRipple - this._smoothedRipple) * 0.05;
      this._schemeProgress += (this._targetSchemeIndex - this._schemeProgress) * 0.05;
      this._schedule();
    }

    _renderStatic() {
      this._stop();
      this._drawFrame(0);
    }

    setScheme(index) {
      const maxIndex = Math.max(0, this.options.schemes.length - 1);
      const nextIndex = Number.isFinite(index) ? Math.max(0, Math.min(maxIndex, Math.floor(index))) : 0;
      this._targetSchemeIndex = nextIndex;

      if (this._reducedMotion.matches) {
        this._schemeProgress = nextIndex;
        this._renderStatic();
      } else {
        this._running = !!this.options.autoStart;
        this._schedule();
      }
    }

    setOptions(partialOptions = {}) {
      if (!partialOptions || typeof partialOptions !== "object") return;
      this.options = { ...this.options, ...partialOptions };
      if (partialOptions.schemes && Array.isArray(partialOptions.schemes) && partialOptions.schemes.length) {
        const maxIndex = this.options.schemes.length - 1;
        this._targetSchemeIndex = Math.min(this._targetSchemeIndex, maxIndex);
        this._schemeProgress = Math.max(0, Math.min(maxIndex, this._schemeProgress));
        if (this._reducedMotion.matches) {
          this._renderStatic();
        }
      }
      if (partialOptions.renderScale !== undefined) {
        this._renderScale = partialOptions.renderScale === "auto" ? null : Number(partialOptions.renderScale);
        this.resize();
      }
    }

    resize() {
      if (!this.gl) return;
      const bounds = this.container.getBoundingClientRect();
      this._renderScale = this.options.renderScale === "auto" ? this._getTargetScale() : clamp01(this.options.renderScale);
      this.canvas.width = Math.max(1, Math.round(bounds.width * this._renderScale));
      this.canvas.height = Math.max(1, Math.round(bounds.height * this._renderScale));
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      if (this._reducedMotion.matches) {
        this._renderStatic();
      } else {
        this._schedule();
      }
    }

    renderFrame(seconds = 0) {
      if (!this.gl || this._destroyed) return;
      this._drawFrame(this._reducedMotion.matches ? 0 : seconds);
    }

    dispose() {
      this._destroyed = true;
      this._running = false;
      this._stop();

      if (this._intersectionObserver) {
        this._intersectionObserver.disconnect();
        this._intersectionObserver = null;
      }
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
      window.removeEventListener("resize", this._onResize);
      document.removeEventListener("visibilitychange", this._onVisibilityChange);
      this._reducedMotion.removeEventListener?.("change", this._onMotionPreference);

      if (this.container) {
        this.container.removeEventListener("pointermove", this._onPointerMove);
        this.container.removeEventListener("pointerleave", this._onPointerLeave);
      }

      if (this.gl) {
        if (this.positionBuffer) {
          this.gl.deleteBuffer(this.positionBuffer);
        }
        if (this.program) {
          this.gl.deleteProgram(this.program);
        }
        this.positionBuffer = null;
        this.program = null;
      }
    }
  }

export const createNebulaCanvas = (options) => new NebulaCanvas(options);
