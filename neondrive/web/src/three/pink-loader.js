/**
 * pink-loader.js — Three.js GLB car loader with procedural fallback + upgrade sockets.
 *
 * Sockets — named attach points on each car model:
 *   ENGINE_SOCKET  bonnet/hood      stat: speed (0)
 *   TIRES_SOCKET   wheel wells      stat: handling (1)
 *   NOS_SOCKET     rear bumper      stat: acceleration (2)
 *   ARMOR_SOCKET   side panels      stat: durability (3)
 *   TURBO_SOCKET   roof scoop       stat: boost (4)
 */

import * as THREE         from "three";
import { GLTFLoader }     from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader }    from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls }  from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass }     from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass }from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass }     from "three/addons/postprocessing/OutputPass.js";

const _gltf  = new GLTFLoader();
const _draco = new DRACOLoader();
_draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/");
_gltf.setDRACOLoader(_draco);

export const SOCKET_NAMES = [
  "ENGINE_SOCKET",
  "TIRES_SOCKET",
  "NOS_SOCKET",
  "ARMOR_SOCKET",
  "TURBO_SOCKET",
];

const SOCKET_OFFSETS = {
  ENGINE_SOCKET: new THREE.Vector3( 1.3,  0.9,  0.0),
  TIRES_SOCKET:  new THREE.Vector3( 0.0,  0.3,  1.1),
  NOS_SOCKET:    new THREE.Vector3(-1.7,  0.4,  0.0),
  ARMOR_SOCKET:  new THREE.Vector3( 0.0,  0.6,  0.9),
  TURBO_SOCKET:  new THREE.Vector3( 0.5,  1.2,  0.0),
};

const SOCKET_COLORS = {
  ENGINE_SOCKET: 0xff006e,
  TIRES_SOCKET:  0x00d4ff,
  NOS_SOCKET:    0x00ff9d,
  ARMOR_SOCKET:  0x7b2fff,
  TURBO_SOCKET:  0xffdd00,
};

export function loadCar(nft) {
  return new Promise(resolve => {
    const path = nft.glb || `models/cars/${nft.slug || nft.tokenId}.glb`;
    _gltf.load(
      path,
      gltf => {
        const mesh = _normalise(gltf.scene);
        _ensureSockets(mesh);
        resolve({ mesh, isReal: true });
      },
      undefined,
      () => resolve({ mesh: buildProceduralCar(nft), isReal: false })
    );
  });
}

export function loadPart(upgradeType) {
  return new Promise(resolve => {
    const slug = upgradeType.name.toLowerCase().replace(/\s+/g, "-");
    _gltf.load(
      `models/parts/${slug}.glb`,
      gltf => resolve({ mesh: _normalise(gltf.scene, 0.35), isReal: true }),
      undefined,
      () => resolve({ mesh: buildProceduralPart(upgradeType), isReal: false })
    );
  });
}

export async function attachPart(carMesh, upgradeType) {
  const socketName = SOCKET_NAMES[upgradeType.statIndex] ?? SOCKET_NAMES[0];
  const { mesh }   = await loadPart(upgradeType);
  mesh.userData.isUpgradePart = true;
  mesh.userData.socketName    = socketName;

  const node = carMesh.getObjectByName(socketName);
  if (node) {
    node.add(mesh);
  } else {
    mesh.position.copy(SOCKET_OFFSETS[socketName] ?? new THREE.Vector3(0, 0.5, 0));
    carMesh.add(mesh);
  }
  return mesh;
}

export function clearParts(carMesh) {
  const toRemove = [];
  carMesh.traverse(o => { if (o.userData.isUpgradePart) toRemove.push(o); });
  toRemove.forEach(o => o.parent?.remove(o));
}

export function createGarageScene(canvas, nft) {
  const W = canvas.clientWidth  || 320;
  const H = canvas.clientHeight || 200;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene  = new THREE.Scene();
  scene.fog    = new THREE.FogExp2(0x04000a, 0.04);

  const camera = new THREE.PerspectiveCamera(48, W / H, 0.1, 100);
  camera.position.set(0, 2.2, 7);

  const ctrl = new OrbitControls(camera, renderer.domElement);
  ctrl.target.set(0, 0.8, 0);
  ctrl.enableDamping = true;
  ctrl.dampingFactor = 0.06;
  ctrl.autoRotate    = true;
  ctrl.autoRotateSpeed = 0.6;
  ctrl.maxPolarAngle = Math.PI / 2.1;
  ctrl.enableZoom    = false;

  scene.add(new THREE.AmbientLight(0x110028, 0.9));
  const key = new THREE.SpotLight(0xffffff, 60, 25, Math.PI / 4.5, 0.5, 2);
  key.position.set(0, 12, 5); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xff006e, 0.8);
  rim.position.set(5, 3, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x3322cc, 0.5);
  fill.position.set(-5, 6, -4); scene.add(fill);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x0d0016, roughness: 0.18, metalness: 0.55 })
  );
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  scene.add(new THREE.GridHelper(30, 30, 0x200030, 0x100020));

  const plat = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.06, 64),
    new THREE.MeshStandardMaterial({ color: 0x18082e, roughness: 0.22, metalness: 0.82 })
  );
  plat.position.y = 0.03; scene.add(plat);

  const hexColor = nft?.color ? parseInt(nft.color.replace("#",""), 16) : 0xff006e;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.04, 8, 80),
    new THREE.MeshStandardMaterial({ color: hexColor, emissive: hexColor, emissiveIntensity: 2.2, roughness: 0.3 })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
  ring.name = "platformRing"; scene.add(ring);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.4, 0.2));
  composer.addPass(new OutputPass());

  let carMesh = null;
  loadCar(nft || {}).then(({ mesh }) => {
    carMesh = mesh; scene.add(mesh);
  });

  const clock = new THREE.Clock();
  let raf;
  function animate() {
    raf = requestAnimationFrame(animate);
    ctrl.update();
    if (carMesh) carMesh.rotation.y += clock.getDelta() * 0.35;
    const t = clock.getElapsedTime();
    const r = scene.getObjectByName("platformRing");
    if (r) r.material.emissiveIntensity = 1.8 + Math.sin(t * 2.4) * 0.5;
    composer.render();
  }
  animate();

  function resize(w, h) {
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    cancelAnimationFrame(raf);
    renderer.dispose();
  }

  return { scene, camera, renderer, composer, ctrl, resize, dispose,
           setNFT: async (newNft) => {
             if (carMesh) scene.remove(carMesh);
             const { mesh } = await loadCar(newNft);
             carMesh = mesh; scene.add(mesh);
             const r2 = scene.getObjectByName("platformRing");
             const c2 = parseInt((newNft.color || "#ff006e").replace("#",""), 16);
             if (r2) { r2.material.color.setHex(c2); r2.material.emissive.setHex(c2); }
           },
           attachParts: async (equippedIds, upgradeTypes) => {
             clearParts(carMesh);
             for (const id of equippedIds) {
               if (id && upgradeTypes[id]) await attachPart(carMesh, upgradeTypes[id]);
             }
           }
  };
}

export function buildProceduralCar(nft) {
  const g  = new THREE.Group();
  const c  = _hexInt(nft?.color,  0xff006e);
  const ac = _hexInt(nft?.accent, 0xff69b4);

  const bm  = _mat(c,        0.18, 0.88);
  const am  = _mat(ac,       0.14, 0.92);
  const dm  = _mat(0x06060a, 0.75, 0.20);
  const wm  = _mat(0x111114, 0.88, 0.10);
  const rm  = _mat(ac,       0.18, 0.92);
  const em  = col => new THREE.MeshStandardMaterial({ color:col, emissive:col, emissiveIntensity:3.2, roughness:0.25 });
  const gls = new THREE.MeshPhysicalMaterial({ color:0xaac8ff, roughness:0, metalness:0,
                transmission:0.88, thickness:0.25, ior:1.52, transparent:true, opacity:0.32 });

  _box(g,[3.7,0.52,1.85],bm,[0,0.56,0]);
  _box(g,[2.15,0.72,1.7],bm,[-0.18,1.12,0]);
  _box(g,[1.38,0.11,1.78],am,[1.22,0.88,0]);
  _box(g,[0.85,0.36,1.78],bm,[-1.72,0.78,0]);

  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.84,0.7), gls);
  ws.position.set(0.93,1.11,0); ws.rotation.y=Math.PI/2; ws.rotation.z=-0.28; g.add(ws);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(0.75,0.62), gls);
  rw.position.set(-1.28,1.11,0); rw.rotation.y=Math.PI/2; rw.rotation.z=0.32; g.add(rw);
  [-1,1].forEach(s => {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.55,0.54), gls);
    sw.position.set(-0.12,1.12,s*0.86); sw.rotation.y = s>0 ? 0 : Math.PI; g.add(sw);
  });

  [-1,1].forEach(s => _box(g,[3.5,0.07,0.06],em(ac),[-0.1,0.34,s*0.96]));
  _box(g,[0.07,0.42,1.65],am,[-1.73,0.97,0]);
  _box(g,[0.54,0.07,1.85],bm,[-1.73,1.19,0]);
  _box(g,[0.11,0.32,1.82],am,[1.87,0.42,0]);
  _box(g,[0.11,0.32,1.82],dm,[-1.87,0.42,0]);

  [-1,1].forEach(s => {
    _box(g,[0.04,0.13,0.36],em(0xffffff),[1.88,0.63,s*0.60]);
    _box(g,[0.04,0.04,0.62],em(ac),      [1.88,0.50,s*0.50]);
    _box(g,[0.04,0.13,0.36],em(0xff1111),[-1.88,0.63,s*0.60]);
  });
  _box(g,[0.04,0.04,1.35],em(ac),[-1.88,0.50,0]);

  [[1.18,0.31,1.03],[1.18,0.31,-1.03],[-1.18,0.31,1.03],[-1.18,0.31,-1.03]].forEach(([x,y,z])=>{
    const wg = new THREE.Group(); wg.position.set(x,y,z);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.31,0.135,12,36), wm);
    t.rotation.y=Math.PI/2; wg.add(t);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.19,0.19,0.07,22), rm);
    d.rotation.z=Math.PI/2; wg.add(d);
    for(let i=0;i<5;i++){
      const a=(i/5)*Math.PI*2;
      const sp=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.055,0.22),rm);
      sp.position.set(0,Math.sin(a)*0.11,Math.cos(a)*0.11); sp.rotation.x=-a; wg.add(sp);
    }
    g.add(wg);
  });

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.1,1.55),
    new THREE.MeshStandardMaterial({color:ac,emissive:ac,emissiveIntensity:0.9,transparent:true,opacity:0.22,side:THREE.DoubleSide}));
  glow.rotation.x=-Math.PI/2; glow.position.y=0.13; g.add(glow);
  const pt = new THREE.PointLight(ac,4,5,2); pt.position.set(0,0.15,0); g.add(pt);

  g.position.y=0.07;
  g.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
  _ensureSockets(g);
  return g;
}

export function buildProceduralPart(upgradeType) {
  const col  = SOCKET_COLORS[SOCKET_NAMES[upgradeType.statIndex ?? 0]] ?? 0xffffff;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.18, 0.28),
    new THREE.MeshStandardMaterial({ color:col, emissive:col, emissiveIntensity:2, roughness:0.2 })
  );
  const pt = new THREE.PointLight(col, 2, 1, 2);
  mesh.add(pt);
  mesh.userData.isUpgradePart = true;
  return mesh;
}

function _normalise(model, targetSize = 3.6) {
  const box   = new THREE.Box3().setFromObject(model);
  const size  = box.getSize(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  model.scale.setScalar(scale);
  const ctr = box.getCenter(new THREE.Vector3());
  model.position.sub(ctr.multiplyScalar(scale));
  model.position.y = 0.07;
  model.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return model;
}

function _ensureSockets(model) {
  SOCKET_NAMES.forEach(name => {
    if (model.getObjectByName(name)) return;
    const node = new THREE.Object3D();
    node.name  = name;
    node.position.copy(SOCKET_OFFSETS[name]);
    model.add(node);
  });
}

function _hexInt(str, fallback) {
  if (!str) return fallback;
  return parseInt(str.replace("#",""), 16);
}
function _mat(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function _box(parent, size, mat, pos) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos); m.castShadow=true; parent.add(m); return m;
}
