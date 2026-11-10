// 策略鑑識室：把〈策略思考〉圖解改編成 3D 推理現場
// 所有畫面都由故事時間 T（0~72 秒）決定，影片逐格錄製與網頁播放共用同一條時間軸。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ===== 工具 =====
const REC = /[?&]rec=1/.test(location.search);
const DUR = 72;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const sstep = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const eio = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eout = x => 1 - Math.pow(1 - clamp(x), 3);
const eback = x => { x = clamp(x); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const win = (t, a, b, f = .4) => clamp(Math.min((t - a) / f, (b - t) / f));
const lerp = (a, b, t) => a + (b - a) * t;
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HDR = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
const decay = (T, t0, k) => T < t0 ? 0 : Math.exp(-(T - t0) * k);

// ===== 場景座標（沿用原圖：X=時間與組織，Y=解決方式的品質）=====
const P = {
  O: V(-10, 0, 0),
  NOW: V(-7, 1.7, 0),
  H1: V(-2, 5.2, 0),
  H1b: V(-1.5, 6.3, 0),
  H2: V(3.4, 9.7, 0),
  GOAL: V(8.6, 13.9, 0),
  Q: V(11.6, 4.6, 3),
  LA: V(-44, 8.6, -1.2),
  LB: V(-10.25, 8.6, 0),
};
const KEYCELL = P.Q.clone().add(V(1.45, 1.45, 0));

// ===== 敘事資料 =====
const STEPS = [[0, '全圖導覽'], [7, '現況'], [19, '問題'], [30, '目標'], [39.8, '假設'], [50, '測試迭代']];
const CAPS = [
  [0.6, 3.4, '策略，從哪裡開始？'],
  [3.7, 6.8, '先看清整張圖。'],
  [7.4, 10.6, '先確認：我們在哪？'],
  [10.9, 14.3, '現況，是唯一的起點。'],
  [14.9, 18.9, '理想很亮，但還不是策略。', 'red'],
  [19.4, 22.6, '問題很多，關鍵很少。'],
  [22.9, 26.2, '分群、收斂、不重不漏。'],
  [26.5, 29.7, '先找值得解的問題。', 'gold'],
  [30.4, 33.4, '目標，要能被檢驗。', 'gold'],
  [33.7, 36.8, '明確、可衡量、有時限。'],
  [37.1, 39.8, '落差，就是推理的起點。'],
  [40.2, 43.4, '先提出一個假設。'],
  [43.7, 46.9, '暫時的答案，不是定論。'],
  [47.2, 50.0, '具體，才知道怎麼測。'],
  [50.4, 53.6, '投入資源，開始測試。'],
  [54.0, 57.3, '證據……不支持。', 'red'],
  [58.8, 61.2, '失敗，留下新的線索。'],
  [61.4, 64.2, '修正，再驗證。'],
  [64.8, 69.9, '策略，是一步步推理出來的。', 'gold'],
];

// ===== 渲染器 =====
const stage = document.getElementById('stage');
let W = REC ? 1920 : innerWidth, H = REC ? 1080 : innerHeight;
let PR = REC ? 1 : Math.min(devicePixelRatio, 1.5);
const PR_MAX = PR;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: REC });
renderer.setPixelRatio(PR);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);
const labelR = new CSS2DRenderer();
labelR.setSize(W, H);
labelR.domElement.className = 'labels';
stage.appendChild(labelR.domElement);

const scene = new THREE.Scene();
const BG = new THREE.Color('#03050b');
scene.background = BG;
const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 500);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

scene.add(new THREE.AmbientLight(0x1b2a4a, 0.6));
const key = new THREE.DirectionalLight(0x9cb8ff, 1.6); key.position.set(6, 22, 14); scene.add(key);
const rim = new THREE.DirectionalLight(0xff9a5a, 0.5); rim.position.set(-10, 6, -12); scene.add(rim);
const goalLight = new THREE.PointLight(0xffc27a, 0, 60, 1.6); goalLight.position.copy(P.GOAL); scene.add(goalLight);
const nowLight = new THREE.PointLight(0x58b8ff, 0, 30, 1.8); nowLight.position.copy(P.NOW); scene.add(nowLight);
const mouseLight = new THREE.PointLight(0x7fd0ff, 0, 18, 1.8); scene.add(mouseLight);

// ===== 後製：泛光 + 色差 + 顆粒 + 暗角 =====
const rt = new THREE.WebGLRenderTarget(W * PR, H * PR, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(PR); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.85, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const fin = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 1 }, uFlash: { value: 0 }, uFade: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uCA,uFlash,uFade; uniform vec2 uRes; varying vec2 vUv;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){ vec2 c=vUv-.5; float r=length(c); vec2 off=c*uCA*r*.012;
    vec3 col=vec3(texture2D(tDiffuse,vUv+off).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-off).b);
    col*=mix(1.,smoothstep(1.,.28,r),.85);
    col+=uFlash*vec3(1.,.93,.82)*(1.-r*.8);
    col+=(h(vUv*uRes+fract(uTime*7.31)*91.)-.5)*.04;
    col*=1.-uFade;
    gl_FragColor=vec4(col,1.);}`,
});
composer.addPass(fin);

// ===== GLSL 共用：simplex noise =====
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*snoise(p);p*=2.03;a*=.5;}return s;}
`;
const GRID = `float gridL(vec2 p,float s,float w){vec2 g=abs(fract(p/s-.5)-.5)*s;vec2 fw=fwidth(p)*w;vec2 l=1.-smoothstep(vec2(0.),fw,g);return max(l.x,l.y);}`;

const U = { time: { value: 0 }, beat: { value: 0 } }; // 全域共享 uniform
const tickers = []; // 每格要更新 uTime 的材質

// ===== 地板：反射 + 網格 + 漣漪 =====
const floor = new Reflector(new THREE.PlaneGeometry(400, 400), {
  textureWidth: W * PR * .5, textureHeight: H * PR * .5, clipBias: 0.003,
  shader: {
    name: 'FloorShader',
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: U.time, uBeat: U.beat, uRip: { value: new THREE.Vector4(0, 0, -99, 0) }, uBg: { value: BG } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
      void main(){vUv=textureMatrix*vec4(position,1.);vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime,uBeat; uniform vec4 uRip; uniform vec3 uBg; varying vec4 vUv; varying vec3 vW; ${GRID}
      void main(){ vec4 uv=vUv; float b=.007*uv.w; vec3 r=texture2DProj(tDiffuse,uv).rgb*.36;
        r+=texture2DProj(tDiffuse,uv+vec4(b,0.,0.,0.)).rgb*.16; r+=texture2DProj(tDiffuse,uv-vec4(b,0.,0.,0.)).rgb*.16;
        r+=texture2DProj(tDiffuse,uv+vec4(0.,b,0.,0.)).rgb*.16; r+=texture2DProj(tDiffuse,uv-vec4(0.,b,0.,0.)).rgb*.16;
        float d=length(vW.xz-vec2(0.,2.)); float fade=exp(-d*.02);
        float g1=gridL(vW.xz,1.,1.2), g5=gridL(vW.xz,5.,1.5);
        vec3 gc=vec3(.25,.5,1.)*(g1*.045+g5*.13)*(1.+uBeat*1.2);
        float rt=uTime-uRip.z; float rd=length(vW.xz-uRip.xy);
        float rip=exp(-pow((rd-rt*9.)*1.1,2.))*exp(-rt*.9)*step(0.,rt)*uRip.w;
        vec3 col=r*.62+gc+vec3(.3,.75,1.6)*rip*(g1*1.2+.12);
        gl_FragColor=vec4(mix(uBg,uBg+col,fade),1.);}`,
  },
});
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// ===== 背景直立網格（圖表平面）=====
const wallMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.time, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vP; void main(){vP=(modelMatrix*vec4(position,1.)).xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform float uTime,uA; varying vec2 vP; ${GRID}
    void main(){ float g1=gridL(vP,1.,1.), g5=gridL(vP,5.,1.3);
      float e=smoothstep(-10.5,-9.,vP.x)*smoothstep(17.,10.,vP.x)*smoothstep(18.,11.,vP.y)*smoothstep(0.,.6,vP.y);
      float sc=exp(-pow((vP.y-mod(uTime*2.6,26.)+4.)*1.6,2.));
      vec3 c=vec3(.3,.55,1.)*(g1*.05+g5*.11+sc*g1*.5)*uA*e; gl_FragColor=vec4(c,1.);}`,
});
const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), wallMat);
wall.position.set(3, 10, -0.8);
scene.add(wall);

// ===== 粒子系統（全部在 GPU 用種子算位置，確定性）=====
const PT_FS = `varying float vA; varying vec3 vC; void main(){vec2 p=gl_PointCoord-.5; float a=smoothstep(.5,0.,length(p)); gl_FragColor=vec4(vC,a*a*vA);}`;
const pts = [];
function makePoints(n, body, o = {}) {
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) seed[i] = hash(i * 1.37 + (o.salt || 0) * 91.7);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = {
    uTime: U.time, uBeat: U.beat, uScale: { value: 1000 }, uSize: { value: o.size || .06 }, uAmt: { value: 0 }, uProg: { value: 0 },
    uColor: { value: o.color || HDR(0x9cc8ff, 1.5) }, uA: { value: (o.A || V(0, 0, 0)).clone() }, uB: { value: (o.B || V(0, 0, 0)).clone() }, uMouse: { value: V(0, -99, 0) },
  };
  const vs = `attribute vec4 aSeed; uniform float uTime,uBeat,uScale,uSize,uAmt,uProg; uniform vec3 uColor,uA,uB,uMouse; varying float vA; varying vec3 vC;
    void main(){ vec3 pos=vec3(0.); float a=1.; float sz=1.; vec3 col=uColor; ${body}
      vec4 mv=modelViewMatrix*vec4(pos,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=max(1.,uSize*sz*uScale/max(-mv.z,.1)); vA=a*uAmt; vC=col; }`;
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); pts.push(p); return p;
}

const dust = makePoints(3200, `
  pos=vec3(aSeed.x*100.-50.,aSeed.y*32.,aSeed.z*70.-40.);
  pos.y=mod(pos.y+uTime*(.06+.22*aSeed.w),32.);
  pos.x+=sin(uTime*.13+aSeed.w*40.)*1.2; pos.z+=cos(uTime*.11+aSeed.x*30.)*1.2;
  vec3 d=pos-uMouse; float k=exp(-dot(d,d)/9.); pos+=normalize(d+1e-4)*k*2.6;
  a=(.25+.75*pow(clamp(.5+.5*sin(uTime*(.8+aSeed.w*3.)+aSeed.x*60.),0.,1.),3.))*smoothstep(32.,24.,pos.y)*smoothstep(0.,1.5,pos.y)*(1.+uBeat*.8);
  sz=.5+aSeed.w*1.5; col=mix(uColor,vec3(1.6,1.1,.7),step(.94,aSeed.y))*(1.+k*4.);`, { size: .05, color: HDR(0x8fb6ff, 1.1), salt: 1 });

// ===== 發光公告板（光暈／日冕／衝擊波）=====
const BILL_VS = `uniform float uS; varying vec2 vUv; void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.); mv.xy+=position.xy*uS; gl_Position=projectionMatrix*mv;}`;
const BILL_FS = {
  glow: `uniform vec3 uColor; uniform float uI; varying vec2 vUv; void main(){float d=length(vUv-.5)*2.; float g=pow(max(1.-d,0.),2.6); gl_FragColor=vec4(uColor*g*uI,1.);}`,
  corona: `uniform vec3 uColor; uniform float uI,uTime; varying vec2 vUv; ${NOISE}
    void main(){vec2 p=vUv-.5; float d=length(p)*2.; float an=atan(p.y,p.x);
      float r1=pow(clamp(snoise(vec3(cos(an)*2.5,sin(an)*2.5,uTime*.22))*.5+.5,0.,1.),4.);
      float r2=pow(clamp(snoise(vec3(cos(an)*8.,sin(an)*8.,uTime*.4))*.5+.5,0.,1.),6.);
      float g=exp(-d*5.)*1.1+exp(-d*2.)*.28+r1*exp(-d*2.4)*1.3+r2*exp(-d*3.)*.9;
      g*=smoothstep(1.,.55,d); gl_FragColor=vec4(uColor*g*uI,1.);}`,
  ring: `uniform vec3 uColor; uniform float uI,uProg; varying vec2 vUv;
    void main(){float d=length(vUv-.5)*2.; float r=exp(-pow((d-uProg)/(.025+.06*uProg),2.)); float inner=exp(-pow((d-uProg*.82)/.08,2.))*.25;
      gl_FragColor=vec4(uColor*(r+inner)*uI*(1.-uProg),1.);}`,
};
function makeBill(kind, color, s) {
  const u = { uS: { value: s }, uColor: { value: color }, uI: { value: 0 }, uProg: { value: 0 }, uTime: U.time };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: BILL_VS, fragmentShader: BILL_FS[kind], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); mesh.frustumCulled = false; scene.add(mesh); return mesh;
}

// ===== 光束（雷射、測試路徑、落差虛線）=====
const BEAM_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv;}`;
const BEAM_FS = `uniform vec3 uColor; uniform float uI,uProg,uTime,uCore,uLen,uDash,uFlow; uniform vec4 uPulses; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ if(vUv.y>uProg) discard;
    float f=clamp(abs(dot(vN,vV)),0.,1.); float core=pow(f,uCore);
    float flow=1.-uFlow*.18+uFlow*.18*sin(vUv.y*uLen*2.2-uTime*14.);
    float dash=mix(1.,step(.5,fract(vUv.y*uLen*1.4-uTime*.7)),uDash);
    float pulse=0.; for(int i=0;i<4;i++){pulse+=exp(-pow((vUv.y-uPulses[i])*uLen/.55,2.));}
    float tip=exp(-pow((vUv.y-uProg)*uLen/.35,2.))*step(uProg,.999);
    gl_FragColor=vec4(uColor*core*(flow*dash*uI+pulse*5.+tip*4.*uI),1.);}`;
const Yup = V(0, 1, 0);
function makeBeam(A, B, r, color, o = {}) {
  const len = A.distanceTo(B);
  const grp = new THREE.Group(); grp.position.copy(A); grp.quaternion.setFromUnitVectors(Yup, B.clone().sub(A).normalize()); scene.add(grp);
  const layers = [[r, 0.6, 1], [r * 5, 3.0, .22]].map(([rr, core, k]) => {
    const g = new THREE.CylinderGeometry(rr, rr, len, 18, 1, true); g.translate(0, len / 2, 0);
    const u = { uColor: { value: color.clone().multiplyScalar(k) }, uI: { value: 0 }, uProg: { value: 0 }, uTime: U.time, uCore: { value: core }, uLen: { value: len }, uDash: { value: o.dash ? 1 : 0 }, uFlow: { value: o.flow ?? 1 }, uPulses: { value: new THREE.Vector4(-9, -9, -9, -9) } };
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); grp.add(mesh); return u;
  });
  return {
    grp, len, A: A.clone(), B: B.clone(),
    set(prog, I, pulses) { grp.visible = I > .002 && prog > .001; for (const u of layers) { u.uProg.value = prog; u.uI.value = I; if (pulses) u.uPulses.value.set(...pulses); } },
  };
}
function pulsesAt(T, launches, dur = .6) {
  const out = [-9, -9, -9, -9];
  launches.forEach((L, i) => { const p = (T - L) / dur; if (p >= 0 && p <= 1.05 && i < 4) out[i] = p; });
  return out;
}

// ===== 標籤（CSS2D）=====
function label(html, cls, pos, parent = scene) {
  const d = document.createElement('div'); d.className = 'lab ' + (cls || ''); d.innerHTML = html;
  const o = new CSS2DObject(d); o.position.copy(pos); parent.add(o); setO(o, 0); return o;
}
function setO(o, a) { a = clamp(a); o.visible = a > .01; if (o._a !== a) { o.element.style.opacity = a.toFixed(3); o._a = a; } }

// ===== 座標軸 =====
const axisMat = new THREE.MeshBasicMaterial({ color: HDR(0x8fb8ff, 2.2), transparent: true });
function axis(dir, len) {
  const g = new THREE.Group(); g.position.copy(P.O); scene.add(g);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1, 10), axisMat); bar.position.y = .5; g.add(bar);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.16, .5, 16), axisMat); g.add(cone);
  const ticks = [];
  for (let i = 2; i < len - .5; i += 2) { const t = new THREE.Mesh(new THREE.BoxGeometry(.32, .025, .025), axisMat); t.position.y = i; g.add(t); ticks.push(t); }
  g.quaternion.setFromUnitVectors(Yup, dir);
  return { set(p) { g.visible = p > 0; const L = Math.max(.001, len * p); bar.scale.y = L; bar.position.y = L / 2; cone.position.y = L + .2; ticks.forEach((t, i) => t.visible = (i + 1) * 2 < L); } };
}
const axX = axis(V(1, 0, 0), 27), axY = axis(V(0, 1, 0), 18.5);
const labX = label('時間與組織 →', 'sm', V(14.5, .65, 1.2));
const labY = label('↑ 解決方式的品質', 'sm', V(-9.9, 19.4, 0));

// ===== 現況：會呼吸的冷光能量球 =====
const SPHERE_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){vP=position; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv;}`;
const nowMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.time, uBeat: U.beat, uI: { value: 0 }, uG: { value: 0 } }, transparent: true,
  vertexShader: SPHERE_VS,
  fragmentShader: `uniform float uTime,uBeat,uI,uG; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
    void main(){ float f=clamp(dot(vN,vV),0.,1.); float fr=pow(1.-f,2.4);
      float n=fbm(vP*1.1+vec3(0.,uTime*.22,0.)); float bands=smoothstep(.55,1.,sin(vP.y*7.+n*4.+uTime*1.3)*.5+.5);
      vec3 lit=mix(vec3(.02,.09,.3),vec3(.25,.75,1.6),n*.5+.5)*(.55+bands*.7)+fr*vec3(.6,1.5,3.)*(1.+uBeat*.8);
      vec3 ghost=vec3(.4,.8,1.6)*fr*uG;
      float L=clamp(uI,0.,1.); gl_FragColor=vec4(mix(ghost,lit*uI,L),max(fr*uG*(1.-L),L));}`,
});
const nowCore = new THREE.Mesh(new THREE.SphereGeometry(1.25, 64, 48), nowMat); nowCore.position.copy(P.NOW); scene.add(nowCore);
const nowGlow = makeBill('glow', HDR(0x4aa8ff, 1.2), 9); nowGlow.position.copy(P.NOW);
const nowRings = ['市場', '顧客', '企業'].map((t, i) => {
  const g = new THREE.Group(); g.position.copy(P.NOW); g.rotation.set(1.15 + i * .35, i * .9, i * .5); scene.add(g);
  const spin = new THREE.Group(); g.add(spin);
  const r = 2.0 + i * .42;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .012, 6, 160), new THREE.MeshBasicMaterial({ color: HDR(0x6cc4ff, 2), transparent: true })); spin.add(ring);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshBasicMaterial({ color: HDR(0xbfe6ff, 5) })); bead.position.x = r; spin.add(bead);
  const lab = label(t, 'tag', V(r, 0, 0), spin);
  return { g, spin, ring, bead, lab };
});
const spiral = makePoints(500, `
  float p=fract(uTime*(.16+.2*aSeed.w)+aSeed.x); float r=mix(6.5,.25,pow(p,1.3)); float an=aSeed.y*6.283+p*9.;
  pos=uA+vec3(cos(an)*r,(aSeed.z-.5)*r*.9,sin(an)*r); a=smoothstep(0.,.15,p)*smoothstep(1.,.8,p); sz=.6+aSeed.w;`, { A: P.NOW, size: .07, color: HDR(0x8fd2ff, 2), salt: 2 });
const labNow = label('現況', 'big', P.NOW.clone().add(V(0, -2.1, 0)));

// ===== 上層理想：孤立的紅色雷射 =====
const laser = makeBeam(P.LA, P.LB, .05, HDR(0xff2a40, 3.2), { flow: 1 });
const laserHead = new THREE.Mesh(new THREE.ConeGeometry(.28, .8, 20), new THREE.MeshBasicMaterial({ color: HDR(0xff3048, 4), transparent: true }));
laserHead.rotation.z = -Math.PI / 2; scene.add(laserHead);
const laserHit = makeBill('glow', HDR(0xff3048, 1.6), 3.2);
const laserWall = makeBill('ring', HDR(0xff4058, 2), 4);
laserHit.position.copy(P.LB); laserWall.position.copy(P.LB);
const sparks = makePoints(260, `
  float p=fract(uTime*(.9+aSeed.w)+aSeed.x); vec3 v=vec3(-1.4-aSeed.y*3.,(aSeed.z-.3)*4.,(aSeed.w-.5)*4.);
  pos=uA+v*p*.55+vec3(0.,-2.6*p*p,0.); a=(1.-p); sz=.4+aSeed.w*.9; col=mix(uColor,vec3(3.,2.2,1.6),aSeed.y*.5);`, { A: P.LB.clone().add(V(-.35, 0, 0)), size: .06, color: HDR(0xff4a5a, 3), salt: 3 });
const labIdeal = label('上層理想<span class="lab sm" style="margin-left:.6em">（不帶現況）</span>', 'tag red', V(-17.5, 9.6, 0));

// ===== 問題：證據碎片 → 親和分群 → MECE 2×2 → 關鍵格 =====
const NS = 420, NK = 84;
const chipGeo = new THREE.CylinderGeometry(.16, .16, .028, 3); chipGeo.rotateX(Math.PI / 2);
const chipMat = new THREE.MeshStandardMaterial({ color: 0xa8c0e8, metalness: .85, roughness: .26, envMapIntensity: 1.3, transparent: true, emissive: 0x0a1a3a, emissiveIntensity: 1 });
const keyMat = new THREE.MeshStandardMaterial({ color: 0xffc070, metalness: .7, roughness: .3, emissive: 0xff8a10, emissiveIntensity: 0, transparent: true });
const chips = new THREE.InstancedMesh(chipGeo, chipMat, NS - NK);
const keys = new THREE.InstancedMesh(chipGeo, keyMat, NK);
chips.frustumCulled = keys.frustumCulled = false;
scene.add(chips, keys);
const CELL = { 0: [-1, 1], 1: [-1, -1], 2: [1, -1], 3: [1, 1] };
const shard = [];
{
  const cnt = [0, 0, 0, 0];
  for (let i = 0; i < NS; i++) {
    const isKey = i < NK, g = isKey ? 3 : i % 3, j = cnt[g]++;
    const C = isKey ? 10 : 11, R = isKey ? 9 : 11, sp = isKey ? .24 : .22;
    const cx = CELL[g][0] * 1.45, cy = CELL[g][1] * 1.45;
    const gx = cx + ((j % C) - (C - 1) / 2) * sp, gy = cy + (Math.floor(j / C) - (R - 1) / 2) * sp;
    const blob = V(CELL[g][0] * 2.3, CELL[g][1] * 1.7, (hash(g * 7.7) - .5) * 2.4);
    const jit = V(hash(i * 3.1) - .5, hash(i * 5.3) - .5, hash(i * 7.9) - .5).normalize().multiplyScalar(Math.cbrt(hash(i * 2.2)) * 1.05);
    shard.push({
      isKey, idx: isKey ? i : i - NK, h: hash(i * 1.91),
      R: 3 + hash(i * 4.4) * 4.2, th: hash(i * 6.6) * 6.283, w: (.25 + hash(i * 8.8) * .5) * (hash(i * 9.9) > .5 ? 1 : -1), yy: (hash(i * 1.2) - .5) * 6,
      far: V(hash(i * 2.9) - .5, hash(i * 3.7) * .8, hash(i * 4.1) - .5).normalize().multiplyScalar(26 + hash(i) * 14),
      clu: blob.add(jit), grid: V(gx, gy, 0), gq: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (j % 2) * Math.PI + (hash(i * 5.5) - .5) * .1)),
      spin: V(hash(i * 1.1) - .5, hash(i * 2.3) - .5, hash(i * 3.3) - .5).normalize(), sp: 1 + hash(i * 4.7) * 2.5,
      sc: .8 + hash(i * 6.1) * .5,
    });
  }
}
const mtxFrame = (() => { // 矩陣外框與十字線
  const segs = [[-2.9, -2.9, 2.9, -2.9], [2.9, -2.9, 2.9, 2.9], [2.9, 2.9, -2.9, 2.9], [-2.9, 2.9, -2.9, -2.9], [0, -2.9, 0, 2.9], [-2.9, 0, 2.9, 0]];
  const geos = segs.map(([x1, y1, x2, y2]) => { const a = V(x1, y1, 0), b = V(x2, y2, 0), L = a.distanceTo(b); const g = new THREE.CylinderGeometry(.014, .014, L, 6); g.translate(0, L / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Yup, b.clone().sub(a).normalize())); g.translate(a.x, a.y, a.z); return g; });
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: HDR(0x7fb4ff, 2.2), transparent: true }));
  m.position.copy(P.Q).add(V(0, 0, -.05)); scene.add(m); return m;
})();
const keyGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 }, uTime: U.time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform float uI,uTime; varying vec2 vUv; void main(){vec2 p=abs(vUv-.5)*2.; float d=max(p.x,p.y);
    float g=smoothstep(1.,.9,d)*.12+exp(-pow((d-.96)*14.,2.))*.9; g*=.85+.15*sin(uTime*6.); gl_FragColor=vec4(vec3(1.4,.85,.3)*g*uI,1.);}`,
}));
keyGlow.position.copy(KEYCELL).add(V(0, 0, -.08)); scene.add(keyGlow);
const labDepth = label('問題深度 →', 'sm', P.Q.clone().add(V(0, -3.35, 0)));
const labQual = label('解方品質 ↑', 'sm', P.Q.clone().add(V(-3.6, 0, 0)));
const labKey = label('★ 關鍵', 'tag gold', KEYCELL.clone().add(V(0, 1.75, 0)));
const labSweet = label('影響力 × 可解品質＝切入點', 'gold', P.Q.clone().add(V(0, 3.75, 0)));
const labQ = label('問題', 'big', P.Q.clone().add(V(-4.6, 3.3, 0)));
const keyBeam = makeBeam(KEYCELL.clone().add(V(0, 0, -.1)), P.GOAL, .03, HDR(0xffb850, 3));

// ===== 目標：會點燃的恆星 + 七道檢驗環 =====
const sunMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.time, uIgn: { value: 0 }, uG: { value: 0 } }, transparent: true,
  vertexShader: SPHERE_VS,
  fragmentShader: `uniform float uTime,uIgn,uG; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
    void main(){ float f=clamp(dot(vN,vV),0.,1.); float fr=pow(1.-f,2.);
      float n=fbm(vP*1.5+vec3(0.,uTime*.16,uTime*.1)); float n2=snoise(vP*5.-uTime*.5);
      vec3 lit=mix(vec3(1.,.45,.14),vec3(2.,1.5,1.),smoothstep(-.35,.6,n+n2*.22))*(.55+.45*f)+fr*vec3(1.2,.75,.3);
      vec3 ghost=vec3(1.,.72,.38)*fr*1.3*uG; float L=clamp(uIgn,0.,1.);
      gl_FragColor=vec4(mix(ghost,lit*uIgn,L),max(fr*uG*(1.-L),L));}`,
});
const sun = new THREE.Mesh(new THREE.SphereGeometry(1.7, 64, 48), sunMat); sun.position.copy(P.GOAL); scene.add(sun);
const corona = makeBill('corona', HDR(0xffc070, .6), 15); corona.position.copy(P.GOAL);
const shock1 = makeBill('ring', HDR(0xffd090, 1.5), 30); shock1.position.copy(P.GOAL);
const shock2 = makeBill('ring', HDR(0xffe0a0, 1.5), 36); shock2.position.copy(P.GOAL);
const coronaPts = makePoints(800, `
  vec3 dir=normalize(vec3(aSeed.x-.5,aSeed.y-.5,aSeed.z-.5)+1e-3); float an=uTime*(.12+.35*aSeed.w); float c=cos(an),s=sin(an);
  dir=vec3(c*dir.x-s*dir.z,dir.y,s*dir.x+c*dir.z); float r=uProg*(1.1+1.1*pow(aSeed.w,2.)+.25*sin(uTime*1.7+aSeed.x*40.));
  pos=uA+dir*r; a=.45+.55*sin(uTime*3.+aSeed.z*50.); sz=.5+aSeed.w*1.3; col=mix(uColor,vec3(3.,2.8,2.5),aSeed.x*.6);`, { A: P.GOAL, size: .06, color: HDR(0xffb860, 1.6), salt: 4 });
const CRIT = ['明確', '可衡量', '可達成', '相關', '有時限', '具挑戰', '道德'];
const goalRings = CRIT.map((t, i) => {
  const g = new THREE.Group(); g.position.copy(P.GOAL);
  g.rotation.set(hash(i * 3.3) * Math.PI, hash(i * 5.1) * Math.PI, hash(i * 7.7) * Math.PI); scene.add(g);
  const spin = new THREE.Group(); g.add(spin);
  const r = 2.45 + i * .27;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .014, 6, 200), new THREE.MeshBasicMaterial({ color: HDR(0xffd9a0, 2.4), transparent: true })); spin.add(ring);
  const node = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 8), new THREE.MeshBasicMaterial({ color: HDR(0xfff0d0, 6) })); node.position.x = r; spin.add(node);
  const lab = label(t, 'tag gold', V(r, 0, 0), spin);
  return { g, spin, ring, lab, w: (hash(i * 9.1) - .5) * .8 };
});
const labGoal = label('目標', 'big gold', P.GOAL.clone().add(V(0, 2.9, 0)));
const gapLine = makeBeam(P.NOW, P.GOAL, .03, HDR(0xb8d4ff, 1.6), { dash: true, flow: 0 });
const labGap = label('落差 Δ', 'big', P.NOW.clone().lerp(P.GOAL, .5).add(V(1.6, -.8, 0)));

// ===== 假設：玻璃晶體 =====
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xd6ebff, metalness: 0, roughness: .07, transmission: 1, thickness: 1.4, ior: 1.45,
  iridescence: .55, iridescenceIOR: 1.3, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.7,
  attenuationColor: new THREE.Color(0x3a8cff), attenuationDistance: 3.2, specularIntensity: 1,
});
function edgeFrame(s, r) {
  const h = s / 2, geos = [];
  for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) for (const u of [-h, h]) for (const v of [-h, h]) {
    const p1 = [0, 0, 0], p2 = [0, 0, 0]; p1[a] = -h; p2[a] = h; p1[b] = u; p2[b] = u; const c = 3 - a - b; p1[c] = v; p2[c] = v;
    const A = V(...p1), B = V(...p2), L = A.distanceTo(B); const g = new THREE.CylinderGeometry(r, r, L, 6); g.translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Yup, B.clone().sub(A).normalize())); g.translate(A.x, A.y, A.z); geos.push(g);
  }
  return mergeGeometries(geos);
}
function crackGeo(size, seed) {
  const h = size / 2 + .012, geos = [];
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const to3 = (ax, sg, u, v) => ax === 0 ? V(sg * h, u, v) : ax === 1 ? V(u, sg * h, v) : V(u, v, sg * h);
  for (let c = 0; c < 22; c++) {
    const face = Math.floor(rnd() * 6), ax = face >> 1, sg = face & 1 ? 1 : -1;
    let u = (rnd() - .5) * size * .7, v = (rnd() - .5) * size * .7, an = rnd() * 6.283;
    const batch = c % 4;
    for (let k = 0; k < 7; k++) {
      const L = .1 + rnd() * .22; an += (rnd() - .5) * 1.5;
      const u2 = clamp(u + Math.cos(an) * L, -h, h), v2 = clamp(v + Math.sin(an) * L, -h, h);
      const A = to3(ax, sg, u, v), B = to3(ax, sg, u2, v2), len = A.distanceTo(B);
      if (len > .01) {
        const g = new THREE.CylinderGeometry(.011, .011, len, 4, 1, true); g.translate(0, len / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Yup, B.clone().sub(A).normalize())); g.translate(A.x, A.y, A.z);
        const o = batch / 4 + k * .03 + .001; g.setAttribute('aO', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(o), 1));
        geos.push(g);
      }
      u = u2; v = v2;
    }
  }
  return mergeGeometries(geos);
}
const crackMat = new THREE.ShaderMaterial({
  uniforms: { uCrack: { value: 0 }, uTime: U.time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute float aO; varying float vO; void main(){vO=aO; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform float uCrack,uTime; varying float vO; void main(){ if(vO>uCrack) discard; float fl=.7+.3*sin(uTime*40.+vO*90.); gl_FragColor=vec4(vec3(4.,.5,.7)*fl,1.);}`,
});
class Crystal {
  constructor(pos, seed) {
    this.pos = pos; this.g = new THREE.Group(); this.g.position.copy(pos); scene.add(this.g);
    this.glass = new THREE.Mesh(new RoundedBoxGeometry(1.9, 1.9, 1.9, 5, .17), glassMat); this.g.add(this.glass);
    this.frameMat = new THREE.MeshBasicMaterial({ color: HDR(0x7fc4ff, 2.6), transparent: true });
    this.frame = new THREE.Mesh(edgeFrame(1.97, .02), this.frameMat); this.g.add(this.frame);
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x223355) });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(.42, 0), this.coreMat); this.g.add(this.core);
    this.cmat = crackMat.clone(); this.cmat.uniforms.uTime = U.time;
    this.cracks = new THREE.Mesh(crackGeo(1.9, seed), this.cmat); this.g.add(this.cracks);
    this.glow = makeBill('glow', HDR(0x5ab4ff, 1), 6); this.glow.position.copy(pos);
  }
  set(form, A, core, coreI, crack, edge) {
    const s = eback(form); this.g.visible = form > .002; this.g.scale.setScalar(Math.max(.001, s));
    this.g.rotation.set(.35 + Math.sin(A * .3) * .08, A * .32, .2);
    this.g.position.copy(this.pos).add(V(0, Math.sin(A * 1.1) * .08, 0));
    this.coreMat.color.copy(core).multiplyScalar(coreI); this.core.rotation.set(A * .9, A * 1.3, 0);
    this.cmat.uniforms.uCrack.value = crack; this.cracks.visible = crack > .001;
    this.frameMat.color.copy(edge); this.frameMat.opacity = clamp(form * 1.4);
    this.glow.material.uniforms.uI.value = form * (.15 + coreI * .18); this.glow.material.uniforms.uColor.value.copy(core).multiplyScalar(.35);
  }
}
const H1 = new Crystal(P.H1, 1234), H1b = new Crystal(P.H1b, 777), H2c = new Crystal(P.H2, 4321);
const rise = makePoints(420, `
  float p=fract(uTime*(.32+.3*aSeed.w)+aSeed.x); vec3 st=vec3(uA.x+(aSeed.y-.5)*3.4,.05,uA.z+(aSeed.z-.5)*3.4); vec3 en=uA-vec3(0.,.95,0.);
  pos=mix(st,en,smoothstep(0.,1.,p)); float sw=(1.-p)*.7; pos.x+=sin(p*12.+aSeed.w*30.)*sw; pos.z+=cos(p*12.+aSeed.w*30.)*sw;
  a=smoothstep(0.,.1,p)*smoothstep(1.,.85,p); sz=.5+aSeed.w*1.1;`, { A: P.H1, size: .07, color: HDR(0xff6a3a, 2.4), salt: 5 });
const resBeam = makeBeam(V(P.H1.x, 0, 0), P.H1.clone().add(V(0, -1.05, 0)), .03, HDR(0xff4a3a, 2.6));
const labH1 = label('假設 01', 'big', P.H1.clone().add(V(0, 1.75, 0)));
const labTemp = label('暫時答案／階段一策略 ▸', 'tag red', P.H1.clone().add(V(-3.1, .3, 0)));
const labRes = label('▲ 資源配置', 'red', V(P.H1.x + 1.5, .7, .4));
const labFail = label('✕ 證據不支持', 'tag red', P.H1.clone().add(V(2.4, 1.2, 0)));
const labH1b = label('假設 01′ ✓ 修正版', 'tag', P.H1b.clone().add(V(-.2, 1.85, 0)));
const labH2 = label('假設 02 ✓', 'tag', P.H2.clone().add(V(0, 1.85, 0)));
const scanMat = new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform float uI; varying vec2 vUv; void main(){vec2 p=abs(vUv-.5)*2.; float d=max(p.x,p.y);
    float e=exp(-pow((d-.97)*30.,2.)); float g=step(.92,fract(vUv.x*14.))*.25*(1.-d); gl_FragColor=vec4(vec3(.5,1.4,3.)*(e+g+.05)*uI,1.);}`,
});
const scan = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), scanMat); scan.rotation.x = -Math.PI / 2; scene.add(scan);
const labSpec = label('具體 · 可驗證', 'tag', P.H1.clone().add(V(2.5, -1.1, .3)));

// 測試路徑
const B1 = makeBeam(P.NOW, P.H1, .035, HDR(0x5ab8ff, 2.6));
const B1b = makeBeam(P.NOW, P.H1b, .035, HDR(0x5ab8ff, 2.6));
const B2 = makeBeam(P.H1b, P.H2, .035, HDR(0x5ab8ff, 2.6));
const B3 = makeBeam(P.H2, P.GOAL, .035, HDR(0x7cc8ff, 2.6));
const flow1 = makePoints(160, `float p=fract(uTime*(.45+.4*aSeed.w)+aSeed.x); vec3 d=uB-uA; vec3 sd=normalize(cross(d,vec3(0.,0.,1.)));
  pos=uA+d*p+sd*(aSeed.y-.5)*.3+vec3(0.,0.,(aSeed.z-.5)*.3); a=step(p,uProg)*smoothstep(0.,.05,p); sz=.5+aSeed.w*.8;`, { A: P.NOW, B: P.H1b, size: .05, color: HDR(0x8fd2ff, 2.5), salt: 6 });
const flow2 = makePoints(160, `float p=fract(uTime*(.45+.4*aSeed.w)+aSeed.x); vec3 d=uB-uA; vec3 sd=normalize(cross(d,vec3(0.,0.,1.)));
  pos=uA+d*p+sd*(aSeed.y-.5)*.3+vec3(0.,0.,(aSeed.z-.5)*.3); a=step(p,uProg)*smoothstep(0.,.05,p); sz=.5+aSeed.w*.8;`, { A: P.H1b, B: P.GOAL, size: .05, color: HDR(0x8fd2ff, 2.5), salt: 7 });
const labTest1 = label('測試', 'sm', P.NOW.clone().lerp(P.H1, .5).add(V(.7, -.5, 0)));
const labTest2 = label('測試', 'sm', P.H1b.clone().lerp(P.H2, .5).add(V(.7, -.5, 0)));
const labTest3 = label('測試', 'sm', P.H2.clone().lerp(P.GOAL, .5).add(V(.7, -.5, 0)));
const labArrive = label('✓ 抵達目標', 'tag gold', P.GOAL.clone().add(V(3.6, -1.2, 0)));

// 碎裂（殺手鏡頭）：玻璃碎片定格，再重組成修正後的假設
const NF = 170;
const fragMat = new THREE.MeshPhysicalMaterial({ color: 0xdcefff, roughness: .05, transmission: .9, thickness: .35, ior: 1.4, iridescence: .7, envMapIntensity: 2.2, emissive: 0xff2040, emissiveIntensity: 0, clearcoat: 1 });
const frags = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.3, 0), fragMat, NF); frags.frustumCulled = false; scene.add(frags);
const frag = [];
for (let i = 0; i < NF; i++) {
  const o = V(hash(i * 1.3) - .5, hash(i * 2.7) - .5, hash(i * 3.9) - .5).multiplyScalar(1.8);
  const ax = Math.floor(hash(i * 5.1) * 3), sg = hash(i * 6.3) > .5 ? 1 : -1, rest = V(hash(i * 7.1) - .5, hash(i * 8.3) - .5, hash(i * 9.7) - .5).multiplyScalar(1.85);
  rest.setComponent(ax, sg * .93);
  frag.push({ o, dir: o.clone().add(V(hash(i * 4.4) - .5, hash(i * 4.9) - .5, hash(i * 5.6) - .5)).normalize(), sp: 1.3 + hash(i * 6.6) * 2.6, rest, h: hash(i * 7.7),
    ax: V(hash(i * 1.7) - .5, hash(i * 2.1) - .5, hash(i * 2.9) - .5).normalize(), w: 2 + hash(i * 3.3) * 6, sc: .5 + hash(i * 8.8) * .9 });
}
const burst = makePoints(500, `vec3 dir=normalize(vec3(aSeed.x-.5,aSeed.y-.5,aSeed.z-.5)+1e-3); float u=uProg; float d=(1.-exp(-u*3.))*(1.5+aSeed.w*5.);
  pos=uA+dir*d+vec3(0.,-.4*u*u,0.); a=step(0.,u)*exp(-u*.7)*(.55+.45*sin(aSeed.x*90.+uTime*18.)); sz=.4+aSeed.w*1.4; col=mix(uColor,vec3(3.,2.6,2.6),aSeed.y*.6);`,
  { A: P.H1, size: .06, color: HDR(0xff3a50, 3), salt: 8 });
const fixShock = makeBill('ring', HDR(0x7cc8ff, 3), 9); fixShock.position.copy(P.H1b);
const h2Shock = makeBill('ring', HDR(0x7cc8ff, 3), 8); h2Shock.position.copy(P.H2);
// 碎裂的時間定格：前 0.18 秒正常速度，之後放慢到 12%，1.1 秒後恢復
const slow = u => u < .18 ? u : u < 1.1 ? .18 + (u - .18) * .12 : .18 + .92 * .12 + (u - 1.1);

// ===== 資訊卡（重點操作）=====
const CARDS = {
  now: { at: P.NOW.clone().add(V(3.2, 2.7, 0)), c: '#6cc4ff', t: '現況', s: 'STEP 02', b: '市場、顧客、企業<br>分析並歸納目標', w: [[9.4, 14.4]] },
  ideal: { at: V(-19, 12.2, 0), c: '#ff5a6a', t: '上層理想', s: 'STEP 02', b: '不帶現況的理想<br>策略思考，找機會點', w: [[15.8, 18.9]] },
  q: { at: P.Q.clone().add(V(-5.8, .3, 0)), c: '#ffc870', t: '問題', s: 'STEP 03', b: '集結問題、親和圖<br>原因核心 80/20、MECE 架構化<br>找「影響力 × 可解品質」的甜蜜點', w: [[26.4, 29.8]] },
  goal: { at: P.GOAL.clone().add(V(-6.2, -.8, 0)), c: '#ffc870', t: '目標', s: 'STEP 04', b: '帶著現況去設定目標<br>明確・可衡量・可達成・相關<br>有時限・具挑戰・道德', w: [[34.2, 37]] },
  hyp: { at: P.H1.clone().add(V(2.5, 1.7, .3)), c: '#6cc4ff', t: '假設', s: 'STEP 05', b: '先給暫時答案（階段一策略）<br>配置資源去驗證<br>好的假設要具體、可驗證', w: [[44.2, 49.8]] },
  test: { at: P.NOW.clone().add(V(.6, 3.7, 1)), c: '#ff5a6a', t: '測試迭代', s: 'STEP 06', b: 'A/B 測試機制<br>急迫性、關鍵性 80/20<br>DevOps・Agile・Lean', w: [[51.2, 56.8]] },
};
for (const k in CARDS) {
  const c = CARDS[k], d = document.createElement('div'); d.className = 'card'; d.style.setProperty('--c', c.c);
  d.innerHTML = `<h4>${c.t}<small>${c.s} · 重點操作</small></h4><p>${c.b}</p>`;
  c.o = new CSS2DObject(d); c.o.position.copy(c.at); scene.add(c.o); setO(c.o, 0); c.hv = 0;
}
// 可點擊的節點（看不見的命中球）
const HITS = [['now', P.NOW, 2, 7], ['ideal', V(-20, 8.6, 0), 3, 14.6], ['q', P.Q, 3.4, 19], ['goal', P.GOAL, 2.6, 30], ['hyp', P.H1b, 1.6, 39.8], ['test', P.H2, 1.6, 50]].map(([k, p, r, t]) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ visible: false })); m.position.copy(p); m.userData = { k, t }; scene.add(m); return m;
});

// ===== 導演鏡頭：分鏡（每個 shot 內用 Catmull-Rom 平滑，shot 之間硬切）=====
const SHOTS = [
  [[0, 13, .6, 7, -10, .9, 0, 40], [3.3, 6, 2.6, 15, -5, 3, 0, 42], [7, 3, 10, 33, 1.5, 7.5, 0, 44]],
  [[7, -1.5, 3.6, 14, -7, 1.9, 0, 42], [10.6, -10.8, 3.4, 8.6, -7, 2.1, 0, 42], [14.7, -12.8, 4.8, 9.2, -7.6, 2.6, 0, 42]],
  [[14.7, -15.5, 7.2, 9.5, -25, 8.6, -.6, 46], [16.6, -14.5, 8.8, 9, -18, 9.2, 0, 44], [19.2, -13.6, 10.2, 7.4, -11.5, 9, 0, 42]],
  [[19.2, 4.5, 6, 19, 11.6, 5, 3, 44], [23, 15.2, 7.6, 14, 11.6, 4.6, 3, 42], [26.6, 12.2, 5.4, 12.6, 11.4, 4.8, 3, 42], [30, 10.6, 3.6, 10.6, 10, 9.5, 2, 46]],
  [[30, 5.2, 7.2, 15.5, 8.6, 13.6, 0, 48], [33.6, 15.5, 16, 11.5, 8.6, 13.9, 0, 44], [37.1, 14.5, 18.5, 6.5, 8.6, 13.9, 0, 42]],
  [[37.1, 1.5, 9, 27, 1, 8, 0, 42], [39.8, -1, 8.4, 22, .2, 7.4, 0, 42]],
  [[39.8, 2.8, 7.2, 9.6, -2, 5.2, 0, 42], [44, -6.4, 7.4, 8, -2, 5.2, 0, 42], [47.3, -.4, 6.4, 6.4, -2, 5.3, 0, 40], [50.2, -.1, 5.2, 5.2, -2, 5.4, 0, 40]],
  [[50.2, -10.4, 2.8, 7.8, -4.6, 3.7, 0, 42], [53.8, -5.6, 3.9, 7.6, -2.6, 5, 0, 42], [57.45, -2.5, 5.5, 4.2, -2, 5.25, 0, 44]],
  [[57.45, -2.5, 5.5, 4.2, -2, 5.25, 0, 44], [58.95, -2.1, 5.35, 1.05, -2, 5.25, 0, 70]],
  [[58.95, -8.2, 8.6, 10.5, -1.5, 6.3, 0, 42], [61.2, -3.4, 9.8, 14, 1.2, 8.2, 0, 44], [64.4, 3.4, 12.6, 18.5, 5.4, 11.2, 0, 46]],
  [[64.4, 2, 8.5, 25, 1, 7.6, 0, 44], [72, 2.2, 11.5, 41, 1.5, 7.9, 0, 42]],
];
function cr(p0, p1, p2, p3, u) { const u2 = u * u, u3 = u2 * u; return .5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); }
function storyCam(T) {
  let shot = SHOTS[0];
  for (const s of SHOTS) if (T >= s[0][0]) shot = s;
  const k = shot; let i = 0;
  while (i < k.length - 2 && T >= k[i + 1][0]) i++;
  if (k.length === 1) return { p: V(k[0][1], k[0][2], k[0][3]), t: V(k[0][4], k[0][5], k[0][6]), fov: k[0][7] };
  const a = k[Math.max(0, i - 1)], b = k[i], c = k[i + 1], d = k[Math.min(k.length - 1, i + 2)];
  let u = clamp((T - b[0]) / (c[0] - b[0])); u = lerp(u, sstep(u), .4);
  const v = j => cr(a[j], b[j], c[j], d[j], u);
  return { p: V(v(1), v(2), v(3)), t: V(v(4), v(5), v(6)), fov: v(7) };
}

// ===== 每格更新：所有狀態都只由 T（故事時間）與 A（環境時間）決定 =====
const dummy = new THREE.Object3D();
const capEl = document.getElementById('cap');
let capIdx = -2;
const $ = id => document.getElementById(id);
const UI = { stepNo: $('stepNo'), stepName: $('stepName'), bar: $('bar'), tcv: $('tcv'), end: $('endcard'), credit: $('credit'), fade: $('fade') };
const S = { T: REC ? 0 : 66, A: 0, playing: false, cam: 'story', blend: 1, from: null, hover: null, sound: true, xp: -99, rip: -99, mouse: V(0, -99, 0), started: REC };
const camCur = { p: V(), t: V(), fov: 42 };

function update(T, A, beat, onset, dt) {
  U.time.value = A; U.beat.value = beat;
  // 衝擊、閃光、震動
  const flash = .45 * decay(T, 30, 7) + .3 * decay(T, 57.5, 9) + .2 * decay(T, 60.5, 7) + .3 * decay(T, 62.5, 6) + .25 * decay(A, S.xp + 2.1, 5);
  const tension = seg(T, 51, 57.4) * (T < 57.5 ? 1 : 0);
  const shake = .32 * decay(T, 30, 3) + .22 * decay(T, 57.5, 4) + .26 * decay(T, 62.5, 3) + tension * .035 + onset * .015;

  // 座標軸與網格
  axX.set(eout(seg(T, .3, 3.2))); axY.set(eout(seg(T, 1.2, 3.8)));
  axisMat.opacity = 1;
  wallMat.uniforms.uA.value = sstep(seg(T, 2.2, 5)) * (1 + beat * .5);
  setO(labX, seg(T, 2.6, 3.4)); setO(labY, seg(T, 3.2, 4));

  // 現況
  const nowI = sstep(seg(T, 7.2, 8.2)) * (1 + .5 * decay(T, 7.4, 3)), nowG = seg(T, 3.4, 4.4);
  nowMat.uniforms.uI.value = nowI; nowMat.uniforms.uG.value = nowG;
  nowCore.scale.setScalar(1 + .04 * Math.sin(A * 2) + beat * .05 * nowI);
  nowGlow.material.uniforms.uI.value = nowG * .12 + nowI * (.5 + beat * .3);
  nowLight.intensity = nowI * 40;
  nowRings.forEach((r, i) => {
    const a = eout(seg(T, 7.8 + i * .45, 8.6 + i * .45));
    r.g.visible = a > 0; r.g.scale.setScalar(lerp(1.5, 1, a)); r.ring.material.opacity = a * .8;
    r.spin.rotation.z = A * (.35 + i * .12) + i * 2;
    setO(r.lab, a * (win(T, 8, 14.6, .5) + (S.hover === 'now' ? 1 : 0)));
  });
  spiral.material.uniforms.uAmt.value = win(T, 8, 13.6, 1) * 1.2 + (T > 13.6 ? .25 : 0) * seg(T, 13.6, 15);
  setO(labNow, nowG * .5 + seg(T, 7.4, 8.2) * .5);

  // 上層理想雷射
  const lp = eio(seg(T, 14.8, 15.6)), lI = T < 19 ? 1 : lerp(1, .35, seg(T, 19, 20.5));
  laser.set(lp, lI * (1 + beat * .3));
  laserHead.visible = lp > .98; laserHead.position.copy(P.LB).add(V(-.45, 0, 0)); laserHead.material.opacity = lI;
  laserHit.material.uniforms.uI.value = (lp > .98 ? 1 : 0) * lI * (.8 + .2 * Math.sin(A * 30));
  laserWall.material.uniforms.uProg.value = ((A * .9) % 1); laserWall.material.uniforms.uI.value = (lp > .98 ? .8 : 0) * lI;
  sparks.material.uniforms.uAmt.value = (lp > .98 ? 1 : 0) * lI;
  setO(labIdeal, seg(T, 15.4, 16) * lI + (S.hover === 'ideal' ? .5 : 0));

  // 問題碎片
  const qOn = T > 18.4;
  chips.visible = keys.visible = qOn;
  if (qOn) {
    const qq = new THREE.Quaternion(), tq = new THREE.Quaternion();
    for (const s of shard) {
      const h = s.h;
      const fly = eout(seg(T, 18.6 + h * .9, 20.6 + h * .8));
      const th = s.th + A * s.w;
      const chaos = V(Math.cos(th) * s.R, s.yy + Math.sin(A * .7 + h * 20) * .6, Math.sin(th) * s.R).add(P.Q);
      const p1 = eio(seg(T, 22 + h * .7, 23.7 + h * .6)), p2 = eio(seg(T, 24.6 + h * .9, 26.5 + h * .5));
      const pos = s.far.clone().add(P.Q).lerp(chaos, fly);
      pos.lerp(s.clu.clone().add(P.Q).add(V(Math.sin(A * .8 + h * 30) * .12, Math.cos(A * .7 + h * 20) * .12, 0)), p1);
      const gp = s.grid.clone().add(P.Q); gp.z += Math.sin(A * 1.6 + s.grid.x * 2 + s.grid.y) * .04 + (s.isKey ? .12 * seg(T, 28, 29) : 0);
      pos.lerp(gp, p2);
      dummy.position.copy(pos);
      tq.setFromAxisAngle(s.spin, A * s.sp + h * 10); qq.copy(tq).slerp(s.gq, p2); dummy.quaternion.copy(qq);
      dummy.scale.setScalar(s.sc * lerp(1, .95, p2) * (fly > 0 ? 1 : 0));
      dummy.updateMatrix();
      (s.isKey ? keys : chips).setMatrixAt(s.idx, dummy.matrix);
    }
    chips.instanceMatrix.needsUpdate = keys.instanceMatrix.needsUpdate = true;
  }
  const keyLit = sstep(seg(T, 27.8, 28.8));
  keyMat.emissiveIntensity = keyLit * (.4 + .4 * decay(T, 28.3, 2) + beat * .15) * (T > 31 ? lerp(1, .6, seg(T, 31, 33)) : 1);
  chipMat.opacity = lerp(1, .38, keyLit);
  mtxFrame.visible = T > 25.2; mtxFrame.scale.setScalar(eout(seg(T, 25.2, 26.4))); mtxFrame.material.opacity = .6;
  keyGlow.material.uniforms.uI.value = keyLit;
  setO(labDepth, seg(T, 25.8, 26.4)); setO(labQual, seg(T, 25.8, 26.4)); setO(labKey, seg(T, 28.2, 28.7));
  setO(labSweet, win(T, 28.6, 37, .5) + (T > 64.5 ? 0 : 0)); setO(labQ, seg(T, 19.6, 20.4));
  keyBeam.set(eio(seg(T, 29.15, 29.95)), lerp(1.2, .3, seg(T, 31, 33)) * (T > 29.15 ? 1 : 0));

  // 目標
  const ign = T < 30 ? 0 : eout(seg(T, 30, 30.5)) * (1 + .6 * decay(T, 30.3, 2) + .3 * decay(T, 62.5, 2.5) + .12 * beat) + (T >= 62.5 ? .15 * seg(T, 62.5, 64) : 0);
  sunMat.uniforms.uIgn.value = ign + .35 * decay(A, S.xp + 2.1, 3) * (T > 30 ? 1 : 0); sunMat.uniforms.uG.value = seg(T, 4.2, 5.2) * .9;
  sun.scale.setScalar(1 + .03 * Math.sin(A * 1.7) + .25 * decay(T, 30, 4) + .12 * decay(T, 62.5, 3));
  corona.material.uniforms.uI.value = ign * (.9 + beat * .4); corona.material.uniforms.uS.value = 15 * eback(seg(T, 30, 30.9)) * (1 + .15 * decay(T, 62.5, 2));
  shock1.material.uniforms.uProg.value = seg(T, 30, 31.6); shock1.material.uniforms.uI.value = T >= 30 && T < 31.6 ? 1 : 0;
  shock2.material.uniforms.uProg.value = seg(T, 62.5, 64.2); shock2.material.uniforms.uI.value = T >= 62.5 && T < 64.2 ? 1 : 0;
  coronaPts.material.uniforms.uAmt.value = ign > 0 ? 1 : 0; coronaPts.material.uniforms.uProg.value = 1.7 * eout(seg(T, 30, 31.2));
  goalLight.intensity = ign * 900;
  goalRings.forEach((r, i) => {
    const t0 = 31.1 + i * .42, a = eout(seg(T, t0, t0 + .35));
    r.g.visible = a > 0; r.g.scale.setScalar(lerp(1.7, 1, a) * (1 + .05 * decay(T, t0 + .35, 6)));
    r.ring.material.opacity = a * (.55 + .45 * decay(T, t0 + .3, 3));
    r.spin.rotation.z = A * r.w + i;
    setO(r.lab, a * (win(T, t0, 37.6, .4) + (S.hover === 'goal' ? 1 : 0)));
  });
  setO(labGoal, seg(T, 4.4, 5.2) * (T < 30 ? .55 : 1));
  // 落差虛線
  const gapA = sstep(seg(T, 4.6, 6.6));
  gapLine.set(eio(seg(T, 4.6, 6.6)), gapA * (T < 37 ? .45 : 1.4) * (1 - seg(T, 50, 52)) * (T > 7 && T < 37 ? .6 : 1));
  setO(labGap, win(T, 37.2, 39.8, .4));

  // 假設 01：成形 → 測試 → 裂開
  const f1 = T < 57.5 ? seg(T, 40.2, 41.4) : 0;
  const impacts = [51.0, 52.6, 54.2, 55.8];
  let crack = 0; impacts.forEach((t, i) => { crack += .25 * eout(seg(T, t, t + .25)); });
  const fail = seg(T, 51, 57.4);
  const hit = impacts.reduce((m, t) => m + decay(T, t, 6), 0);
  const c1 = new THREE.Color().setRGB(lerp(.35, 3.2, fail), lerp(.55, .3, fail), lerp(1, .4, fail));
  H1.set(f1, A, c1, (T < 41.4 ? .6 : 1) * (1 + hit * 2 + fail * Math.abs(Math.sin(A * 23)) * .8), crack, HDR(fail > 0 ? 0xff4a5a : 0x7fc4ff, 2.4 + hit * 3));
  rise.material.uniforms.uAmt.value = win(T, 40.6, 57.4, .8) * 1.1 + win(T, 60.2, 61.8, .4);
  rise.material.uniforms.uA.value.copy(T < 59 ? P.H1 : P.H2);
  resBeam.set(eio(seg(T, 41, 42)), win(T, 41, 57.4, .4) * 1);
  setO(labH1, win(T, 40.6, 57.4, .4)); setO(labTemp, win(T, 41.6, 50, .5)); setO(labRes, win(T, 42, 50.2, .5));
  setO(labFail, win(T, 54.5, 57.45, .3));
  scan.visible = T > 47.3 && T < 49.2; scan.position.copy(P.H1).add(V(0, lerp(-1.25, 1.25, eio(seg(T, 47.4, 48.8))), 0));
  scanMat.uniforms.uI.value = win(T, 47.3, 49.2, .25);
  glassMat.roughness = lerp(.22, .05, seg(T, 47.5, 48.8));
  setO(labSpec, win(T, 48, 50.2, .3));

  // 測試路徑
  B1.set(eio(seg(T, 50.3, 50.9)), win(T, 50.3, 57.5, .15) * (1 + tension), pulsesAt(T, impacts.map(t => t - .6)));
  setO(labTest1, win(T, 50.6, 57.4, .3) + (T > 60.6 ? seg(T, 60.6, 61.2) * (T < 66 ? 1 : .8) : 0));

  // 碎裂與重組
  const fu = T - 57.5;
  frags.visible = fu >= 0 && T < 60.75;
  if (frags.visible) {
    const su = slow(fu); const q = new THREE.Quaternion();
    for (let i = 0; i < NF; i++) {
      const f = frag[i];
      const d = f.sp * .9 * (1 - Math.exp(-su * 7)) + su * .25 * f.sp;
      const ex = P.H1.clone().add(f.o.clone().multiplyScalar(.5)).add(f.dir.clone().multiplyScalar(d));
      const r = eio(seg(T, 59.1 + f.h * .5, 60.3 + f.h * .15));
      dummy.position.copy(ex.lerp(P.H1b.clone().add(f.rest), r));
      q.setFromAxisAngle(f.ax, su * f.w + f.h * 9); dummy.quaternion.copy(q).slerp(new THREE.Quaternion(), r);
      dummy.scale.setScalar(f.sc * (1 - seg(T, 60.35, 60.7)));
      dummy.updateMatrix(); frags.setMatrixAt(i, dummy.matrix);
    }
    frags.instanceMatrix.needsUpdate = true;
    fragMat.emissiveIntensity = .7 * Math.exp(-su * 2.5) + .25 * seg(T, 59.2, 60.3);
    fragMat.emissive.set(T < 59 ? 0xff2040 : 0x3a9cff);
  }
  burst.material.uniforms.uAmt.value = fu >= 0 && fu < 4 ? 1 : 0; burst.material.uniforms.uProg.value = slow(Math.max(0, fu));

  // 修正版假設 01′ → 假設 02 → 目標
  const fb = seg(T, 60.35, 60.75);
  H1b.set(fb, A, new THREE.Color(.35, 1, 2.6), (1 + 1.2 * decay(T, 60.6, 3)) * fb * (1 + .6 * decay(A, S.xp + .6, 5)), 0, HDR(0x8fd0ff, 2.6 + 3 * decay(T, 60.6, 4)));
  fixShock.material.uniforms.uProg.value = seg(T, 60.5, 61.5); fixShock.material.uniforms.uI.value = T > 60.5 && T < 61.5 ? 1 : 0;
  const f2 = seg(T, 60.9, 61.6), lit2 = sstep(seg(T, 61.75, 62));
  H2c.set(f2, A + 2, new THREE.Color().setRGB(lerp(.35, .35, lit2), lerp(.55, 1, lit2), lerp(1, 2.6, lit2)), (.6 + lit2 * (1 + 1.5 * decay(T, 61.8, 3))) * (1 + .6 * decay(A, S.xp + 1.3, 5)), 0, HDR(0x8fd0ff, 2.4 + 3 * decay(T, 61.8, 4)));
  h2Shock.material.uniforms.uProg.value = seg(T, 61.8, 62.7); h2Shock.material.uniforms.uI.value = T > 61.8 && T < 62.7 ? 1 : 0;
  const xp = S.xp, xpA = A - xp;
  const xpP = (L, dd) => { const p = (xpA - L) / dd; return p >= 0 && p <= 1.05 ? p : -9; };
  B1b.set(eio(seg(T, 60.4, 60.9)), (T > 60.4 ? 1 : 0) * (.8 + beat * .4), [xpP(0, .6), -9, -9, -9]);
  B2.set(eio(seg(T, 61.1, 61.75)), (T > 61.1 ? 1 : 0) * (.8 + beat * .4), [xpP(.7, .6), -9, -9, -9]);
  B3.set(eio(seg(T, 61.9, 62.5)), (T > 61.9 ? 1 : 0) * (.8 + beat * .4), [xpP(1.4, .7), -9, -9, -9]);
  flow1.material.uniforms.uAmt.value = seg(T, 60.6, 61.4); flow1.material.uniforms.uProg.value = 1;
  flow2.material.uniforms.uAmt.value = seg(T, 62.2, 63); flow2.material.uniforms.uProg.value = 1;
  setO(labH1b, win(T, 60.7, 99, .4) * (T > 66 && !S.hover ? .75 : 1)); setO(labH2, win(T, 61.9, 99, .4) * (T > 66 ? .75 : 1));
  setO(labTest2, seg(T, 61.4, 62)); setO(labTest3, seg(T, 62.1, 62.6));
  setO(labArrive, win(T, 62.8, 66.5, .4));

  // 資訊卡：故事時間窗 + 滑鼠 hover
  for (const k in CARDS) {
    const c = CARDS[k]; const story = c.w.reduce((m, [a, b]) => Math.max(m, win(T, a, b, .35)), 0);
    c.hv = lerp(c.hv, S.hover === k ? 1 : 0, REC ? 1 : clamp(dt * 8));
    setO(c.o, Math.max(story, c.hv));
  }

  // 地板漣漪、滑鼠光
  floor.material.uniforms.uRip.value.set(S.ripX || 0, S.ripZ || 0, S.rip, 1);
  dust.material.uniforms.uAmt.value = .55 + seg(T, 0, 2) * .45;
  for (const p of pts) p.material.uniforms.uMouse.value.copy(S.mouse);
  mouseLight.position.copy(S.mouse).add(V(0, 0, 2)); mouseLight.intensity = REC ? 0 : 30;

  // 後製
  bloom.strength = .75 + beat * .2 + flash * .5;
  fin.uniforms.uTime.value = A; fin.uniforms.uFlash.value = flash; fin.uniforms.uCA.value = 1 + flash * 7 + tension * 2.5 + onset * .8;
  const fadeOut = (REC || S.playing) ? seg(T, 70.6, 72) : 0;
  fin.uniforms.uFade.value = Math.max(1 - seg(T, 0, .7), fadeOut);

  // 鏡頭
  const sc = storyCam(T);
  const sh = V(Math.sin(A * 37.1) + Math.sin(A * 23.3), Math.sin(A * 29.7 + 1) + Math.sin(A * 17.9), Math.sin(A * 31.3 + 2)).multiplyScalar(shake * .5);
  const hand = V(Math.sin(A * .7) * .06, Math.sin(A * .53 + 1) * .05, 0);
  if (S.cam === 'story') {
    if (S.blend < 1 && S.from) {
      S.blend = Math.min(1, S.blend + dt / 1.4); const e = eio(S.blend);
      camCur.p.copy(S.from.p).lerp(sc.p, e); camCur.t.copy(S.from.t).lerp(sc.t, e); camCur.fov = lerp(S.from.fov, sc.fov, e);
    } else { camCur.p.copy(sc.p); camCur.t.copy(sc.t); camCur.fov = sc.fov; }
    camera.position.copy(camCur.p).add(sh).add(hand);
    camera.up.set(0, 1, 0);
    if (T > 57.45 && T < 58.95) { const r = seg(T, 57.45, 58.95); camera.up.set(Math.sin(r * .5) * .9, 1, 0).normalize(); }
    camera.lookAt(camCur.t.clone().add(sh.clone().multiplyScalar(.5)));
    if (camera.fov !== camCur.fov) { camera.fov = camCur.fov; camera.updateProjectionMatrix(); }
    controls.target.copy(camCur.t);
  } else {
    controls.update();
    camera.position.add(sh);
  }
  const scale = H * PR / (2 * Math.tan(camera.fov * Math.PI / 360));
  for (const p of pts) p.material.uniforms.uScale.value = scale;

  // HUD、字幕、片尾
  let si = 0; STEPS.forEach((s, i) => { if (T >= s[0]) si = i; });
  UI.stepNo.textContent = '0' + (si + 1); UI.stepName.textContent = STEPS[si][1];
  UI.bar.style.width = (clamp(T / 66) * 100).toFixed(2) + '%';
  const tt = Math.max(0, T); UI.tcv.textContent = `CASE 0417 · T+${String(Math.floor(tt / 60)).padStart(2, '0')}:${(tt % 60).toFixed(1).padStart(4, '0')}`;
  const showCap = REC || S.playing;
  const ci = showCap ? CAPS.findIndex(c => T >= c[0] && T < c[1]) : -1;
  if (ci !== capIdx) {
    capIdx = ci;
    if (ci >= 0) { capEl.className = CAPS[ci][3] || ''; capEl.innerHTML = [...CAPS[ci][2]].map(ch => `<span>${ch === ' ' ? '&nbsp;' : ch}</span>`).join(''); }
    else capEl.innerHTML = '';
  }
  if (ci >= 0) {
    const c = CAPS[ci], out = clamp((c[1] - T) / .3);
    [...capEl.children].forEach((sp, i) => {
      const a = clamp((T - c[0] - i * .04) / .28);
      sp.style.opacity = (a * out).toFixed(3);
      sp.style.filter = `blur(${((1 - a) * 10 + (1 - out) * 6).toFixed(1)}px)`;
      sp.style.transform = `translateY(${((1 - a) * 14).toFixed(1)}px)`;
    });
  }
  const endA = (REC || S.playing) ? win(T, 66.2, 75, .9) : 0;
  UI.end.style.opacity = endA; UI.credit.style.opacity = (REC || S.playing) ? win(T, 66.8, 75, .8) * .9 : 0;
  UI.fade.style.opacity = 0;
  labelR.domElement.style.opacity = (1 - endA * .8).toFixed(3);
  for (const m of [corona, shock1, shock2, laserHit, laserWall, nowGlow, fixShock, h2Shock]) m.visible = m.material.uniforms.uI.value > .001;
  for (const p of pts) p.visible = p.material.uniforms.uAmt.value > .001;
}

function draw() { composer.render(); labelR.render(scene, camera); }

// ===== 互動 =====
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .07; controls.minDistance = 3; controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI * .495; controls.target.set(1.5, 7.8, 0);
const audio = new Audio('music/soundtrack.mp3'); audio.preload = 'auto';   // 配樂＋ElevenLabs 音效已混好
// 互動音效：每次播放複製一個 <audio>，file:// 也能用
const SFX = {}; for (const n of ['chime', 'energy_pulse', 'lock_on']) { SFX[n] = new Audio(`music/sfx/${n}.mp3`); SFX[n].preload = 'auto'; }
function sfx(n, vol = .5, rate = 1, delay = 0) {
  if (!S.sound || REC) return;
  setTimeout(() => { const a = SFX[n].cloneNode(); a.volume = vol; a.preservesPitch = false; a.playbackRate = rate; a.play().catch(() => { }); }, delay * 1000);
}
const envAt = t => { const E = window.AUDIO_ENV; if (!E) return [0, 0]; const i = Math.floor(t * E.fps); return [E.rms[i] || 0, E.on[i] || 0]; };

if (REC) {
  window.render = t => { S.T = t; update(t, t, ...envAt(t), 1 / 30); draw(); };
  window.DURATION = DUR;
  update(66, 66, 0, 0, 1); draw(); update(58, 58, 0, 0, 1); draw();
  window.__ready = true;
} else {
  const stepsEl = $('steps');
  STEPS.forEach(([t, n], i) => { const b = document.createElement('button'); b.innerHTML = `${i + 1}<span> ${n}</span>`; b.onclick = () => jump(t); stepsEl.appendChild(b); });
  const playBtn = $('play'), scrub = $('scrub'), dirBtn = $('director'), intro = $('intro');
  function toDirector() { if (S.cam !== 'story') { S.from = { p: camera.position.clone(), t: controls.target.clone(), fov: camera.fov }; S.blend = 0; S.cam = 'story'; } dirBtn.style.display = 'none'; }
  function play(from) {
    if (from !== undefined) S.T = from; if (S.T >= DUR - .1) S.T = 0;
    S.playing = true; audio.currentTime = S.T; if (S.sound) audio.play().catch(() => { }); toDirector();
  }
  function pause() { S.playing = false; audio.pause(); }
  function jump(t) { play(t); }
  function hideIntro() { intro.style.opacity = 0; setTimeout(() => intro.style.display = 'none', 800); S.started = true; }
  $('go').onclick = () => { hideIntro(); play(0); };
  $('explore').onclick = () => { hideIntro(); };
  playBtn.onclick = () => S.playing ? pause() : play();
  $('prev').onclick = () => { let si = 0; STEPS.forEach((s, i) => { if (S.T >= s[0] + .5) si = i; }); jump(STEPS[Math.max(0, si - 1)][0]); };
  $('next').onclick = () => { let si = 0; STEPS.forEach((s, i) => { if (S.T >= s[0]) si = i; }); jump(STEPS[Math.min(5, si + 1)][0]); };
  $('snd').onclick = e => { S.sound = !S.sound; e.target.textContent = S.sound ? '🔊' : '🔇'; if (!S.sound) audio.pause(); else if (S.playing) { audio.currentTime = S.T; audio.play().catch(() => { }); } };
  scrub.oninput = () => { S.T = +scrub.value; if (S.playing) audio.currentTime = S.T; };
  dirBtn.onclick = toDirector;
  controls.addEventListener('start', () => { if (S.cam === 'story') { S.cam = 'free'; controls.target.copy(camCur.t); dirBtn.style.display = 'block'; } });
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); S.playing ? pause() : play(); } if (e.code === 'ArrowRight') $('next').click(); if (e.code === 'ArrowLeft') $('prev').click(); });

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), zPlane = new THREE.Plane(V(0, 0, 1), 0), yPlane = new THREE.Plane(V(0, 1, 0), 0);
  let downAt = null;
  const el = renderer.domElement;
  el.addEventListener('pointermove', e => {
    ndc.set(e.clientX / W * 2 - 1, -(e.clientY / H) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(HITS)[0]; S.hover = hit ? hit.object.userData.k : null; el.style.cursor = hit ? 'pointer' : 'grab';
    ray.ray.intersectPlane(zPlane, S.mouse) || S.mouse.set(0, -99, 0);
  });
  el.addEventListener('pointerleave', () => { S.hover = null; S.mouse.set(0, -99, 0); });
  el.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
  el.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    ndc.set(e.clientX / W * 2 - 1, -(e.clientY / H) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(HITS)[0];
    if (hit) { if (!S.started) hideIntro(); sfx('lock_on', .45); jump(hit.object.userData.t); return; }
    const p = V(); if (ray.ray.intersectPlane(yPlane, p)) { S.ripX = p.x; S.ripZ = p.z; S.rip = S.A; sfx('chime', .22, .7 + Math.random() * .5); }
  });
  el.addEventListener('dblclick', () => { S.xp = S.A; sfx('energy_pulse', .5, 1); sfx('energy_pulse', .4, 1.2, .7); sfx('energy_pulse', .4, 1.35, 1.4); sfx('chime', .4, 1.26, 2.1); });

  addEventListener('resize', () => {
    W = innerWidth; H = innerHeight; camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H); composer.setSize(W, H); labelR.setSize(W, H); bloom.setSize(W, H); fin.uniforms.uRes.value.set(W, H);
  });

  // 一開始：顯示推理完成後的全貌，鏡頭自由
  S.cam = 'free'; camera.position.set(2, 10.5, 37); camera.fov = 42; camera.updateProjectionMatrix();
  let last = performance.now(); const perf = { n: 0, t: 0 };
  function loop(now) {
    const dt = Math.min(.25, (now - last) / 1000); last = now; S.A += dt;
    // 自動調整解析度：太慢就降渲染倍率，有餘裕再升回去
    perf.n++; perf.t += dt;
    if (perf.t > 2) { const fps = perf.n / perf.t; perf.n = 0; perf.t = 0;
      const want = fps < 42 ? Math.max(.75, PR - .25) : fps > 58 ? Math.min(PR_MAX, PR + .25) : PR;
      if (want !== PR) { PR = want; renderer.setPixelRatio(PR); composer.setPixelRatio(PR); composer.setSize(W, H); } }
    if (S.playing) {
      // 以畫面時鐘為主；音樂可跳轉時慢慢對齊，不能跳轉（例如伺服器不支援 Range）就不硬拉
      S.T += dt;
      if (S.sound && !audio.paused && audio.readyState >= 2) {
        const d = audio.currentTime - S.T;
        if (Math.abs(d) < .3) S.T += d * .1;
        else if (now - (S.seekAt || 0) > 1500) { S.seekAt = now; try { audio.currentTime = S.T; } catch (e) { } }
      }
      if (S.T >= DUR) { pause(); S.T = 66; }
    }
    playBtn.textContent = S.playing ? '❚❚ 暫停' : (S.T > 0 && S.T < 66 ? '▶ 繼續推理' : '▶ 開始推理');
    if (document.activeElement !== scrub) scrub.value = S.T;
    let si = 0; STEPS.forEach((s, i) => { if (S.T >= s[0]) si = i; });
    [...stepsEl.children].forEach((b, i) => b.classList.toggle('on', i === si));
    const [r, o] = S.playing ? envAt(S.T) : [.25 + .1 * Math.sin(S.A * 2), 0];
    update(S.T, S.A, r, o, dt); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
