struct Params {
    sharpen: f32,
    denoise: f32,
    gamma: f32,
    sat: f32,
    scale: f32,
    luma_mean: f32,
    contrast: f32,
    _pad: f32,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> p: Params;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let out = vec2<i32>(gid.xy);
    let in_f = vec2<f32>(out) / p.scale;
    let in_c = vec2<i32>(in_f);
    let dims = textureDimensions(src);
    if (any(in_c < vec2<i32>(0, 0)) || any(in_c >= dims)) { return; }

    let c = textureLoad(src, in_c, 0).rgb;
    let luma = dot(c, vec3<f32>(0.299, 0.587, 0.114));
    
    // Edge detection for adaptive sharpen
    let e = abs(textureLoad(src, in_c + vec2<i32>(1,0), 0).r - luma) + abs(textureLoad(src, in_c + vec2<i32>(0,1), 0).r - luma);
    let adapt_sharp = p.sharpen * (1.0 - smoothstep(0.0, 0.25, e));
    
    // 3x3 blur approx
    let blur = (textureLoad(src, in_c + vec2<i32>(-1,-1), 0).rgb + textureLoad(src, in_c + vec2<i32>(1,1), 0).rgb +
                textureLoad(src, in_c + vec2<i32>(-1,1), 0).rgb + textureLoad(src, in_c + vec2<i32>(1,-1), 0).rgb) * 0.25;
    let sharp = c + (c - blur) * adapt_sharp;
    
    // Denoise + Gamma + Sat
    let den = mix(sharp, c, p.denoise * (1.0 - e));
    let gam = pow(den, vec3<f32>(1.0 / p.gamma));
    let gray = dot(gam, vec3<f32>(0.299, 0.587, 0.114));
    let final = mix(vec3<f32>(gray), gam, p.sat);
    
    textureStore(dst, out, vec4<f32>(final, 1.0));
}
