const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_sharpen;
uniform float u_denoise;
uniform float u_contrast;
uniform float u_sat;
uniform float u_gamma;
uniform float u_clarity;
uniform float u_ai;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 px = 1.0 / u_res;
  vec3 c = texture2D(u_tex, v_uv).rgb;
  vec3 n = texture2D(u_tex, v_uv + vec2(0.0, px.y)).rgb;
  vec3 s = texture2D(u_tex, v_uv - vec2(0.0, px.y)).rgb;
  vec3 e = texture2D(u_tex, v_uv + vec2(px.x, 0.0)).rgb;
  vec3 w = texture2D(u_tex, v_uv - vec2(px.x, 0.0)).rgb;
  vec3 blur = (c + n + s + e + w) * 0.2;
  float edge = abs(luma(c) - luma(blur));
  float adapt = mix(0.35, 1.0, clamp(u_ai, 0.0, 1.0));
  vec3 sharp = c + (c - blur) * (u_sharpen * (0.4 + edge * 4.0) * adapt);
  vec3 den = mix(sharp, blur, u_denoise * (1.0 - clamp(edge * 6.0, 0.0, 1.0)));
  float mid = luma(den);
  den = mix(vec3(mid), den, u_sat);
  den = (den - 0.5) * u_contrast + 0.5;
  den += (c - blur) * u_clarity * adapt;
  den = pow(max(den, 0.0), vec3(1.0 / max(u_gamma, 0.1)));
  gl_FragColor = vec4(clamp(den, 0.0, 1.0), 1.0);
}
`

export function createEnhancer(canvas) {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: false })
  if (!gl) throw new Error('WebGL unavailable')

  function compile(type, src) {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s))
    }
    return s
  }

  const prog = gl.createProgram()
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]),
    gl.STATIC_DRAW
  )
  const aPos = gl.getAttribLocation(prog, 'a_pos')
  const aUv = gl.getAttribLocation(prog, 'a_uv')
  gl.enableVertexAttribArray(aPos)
  gl.enableVertexAttribArray(aUv)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8)

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const loc = {
    tex: gl.getUniformLocation(prog, 'u_tex'),
    res: gl.getUniformLocation(prog, 'u_res'),
    sharpen: gl.getUniformLocation(prog, 'u_sharpen'),
    denoise: gl.getUniformLocation(prog, 'u_denoise'),
    contrast: gl.getUniformLocation(prog, 'u_contrast'),
    sat: gl.getUniformLocation(prog, 'u_sat'),
    gamma: gl.getUniformLocation(prog, 'u_gamma'),
    clarity: gl.getUniformLocation(prog, 'u_clarity'),
    ai: gl.getUniformLocation(prog, 'u_ai'),
  }

  const analyze = document.createElement('canvas')
  analyze.width = 64
  analyze.height = 36
  const a2d = analyze.getContext('2d', { willReadFrequently: true })

  return {
    draw(video, params) {
      if (!video.videoWidth) return { mean: 0, contrast: 0 }
      a2d.drawImage(video, 0, 0, 64, 36)
      const data = a2d.getImageData(0, 0, 64, 36).data
      let sum = 0
      let min = 1
      let max = 0
      for (let i = 0; i < data.length; i += 16) {
        const y = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255
        sum += y
        min = Math.min(min, y)
        max = Math.max(max, y)
      }
      const mean = sum / (data.length / 16)
      const sceneContrast = Math.max(0.05, max - min)
      const adaptive = {
        sharpen: params.sharpen * (0.7 + (1 - sceneContrast) * 0.6),
        denoise: params.denoise * (mean < 0.25 ? 1.25 : 0.85),
        contrast: params.contrast * (sceneContrast < 0.35 ? 1.12 : 0.95),
        sat: params.sat,
        gamma: mean < 0.3 ? params.gamma * 1.08 : params.gamma,
        clarity: params.clarity,
        ai: params.ai,
      }

      const w = Math.min(video.videoWidth * (params.upscale || 1), 2560)
      const h = Math.min(video.videoHeight * (params.upscale || 1), 1440)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video)
      gl.uniform1i(loc.tex, 0)
      gl.uniform2f(loc.res, w, h)
      gl.uniform1f(loc.sharpen, adaptive.sharpen)
      gl.uniform1f(loc.denoise, adaptive.denoise)
      gl.uniform1f(loc.contrast, adaptive.contrast)
      gl.uniform1f(loc.sat, adaptive.sat)
      gl.uniform1f(loc.gamma, adaptive.gamma)
      gl.uniform1f(loc.clarity, adaptive.clarity)
      gl.uniform1f(loc.ai, adaptive.ai)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      return { mean, contrast: sceneContrast, adaptive }
    },
  }
}
