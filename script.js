import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;
document.getElementById('container').appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0x00bcd4, 0.3);
fillLight.position.set(-5, 0, -5);
scene.add(fillLight);

// Variables
let model;
let tumorMarker;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let originalScale = 0.3;
let tumorVisible = true;

// Camera position for non-AR mode
camera.position.set(0, 0, 3);

// Controls for non-AR mode
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1;
controls.maxDistance = 10;

// Create reticle (placement indicator for AR)
const reticleGeometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0x00bcd4 });
reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

// Load GLB brain model
const loader = new GLTFLoader();
const loadingScreen = document.getElementById('loadingScreen');

loader.load('models/brain.glb', (gltf) => {
  model = gltf.scene;
  
  // Center and scale the model
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  
  model.position.sub(center);
  
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = originalScale / maxDim;
  model.scale.multiplyScalar(scale);
  
  scene.add(model);
  
  // Create tumor marker
  createTumorMarker();
  
  // Hide loading screen
  loadingScreen.classList.add('hidden');
  
  // Load tumor data
  loadTumorData();
  
}, (progress) => {
  const percent = (progress.loaded / progress.total * 100).toFixed(0);
  document.querySelector('.loading-text').textContent = `Loading Brain Model... ${percent}%`;
}, (error) => {
  console.error('Error loading model:', error);
  loadingScreen.innerHTML = `
    <div class="loading-text">Error loading model. Using placeholder.</div>
  `;
  
  // Create placeholder brain (sphere)
  const geometry = new THREE.SphereGeometry(0.3, 32, 32);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0xffc0cb,
    roughness: 0.7,
    metalness: 0.3
  });
  model = new THREE.Mesh(geometry, material);
  scene.add(model);
  
  createTumorMarker();
  loadTumorData();
  
  setTimeout(() => loadingScreen.classList.add('hidden'), 2000);
});

// Create tumor marker
function createTumorMarker() {
  const tumorGeometry = new THREE.SphereGeometry(0.05, 32, 32);
  const tumorMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.8
  });
  tumorMarker = new THREE.Mesh(tumorGeometry, tumorMaterial);
  tumorMarker.position.set(0.15, 0.06, 0.09);
  
  // Add pulsing animation
  tumorMarker.userData.pulsePhase = 0;
  
  if (model) {
    model.add(tumorMarker);
  }
}

// Tumor data
let tumorData = [];

function loadTumorData() {
  fetch('data/tumor_data.json')
    .then(res => res.json())
    .then(data => {
      tumorData = data;
      document.getElementById('sliceSlider').max = data.length;
      updateTumorInfo(0);
    })
    .catch(err => {
      console.log('No tumor data file, using generated data');
      // Generate sample data
      tumorData = Array.from({length: 10}, (_, i) => ({
        slice: i + 1,
        tumorPosition: { 
          x: 0.15 + (Math.random() - 0.5) * 0.1, 
          y: 0.06 + (Math.random() - 0.5) * 0.1, 
          z: 0.09 + (Math.random() - 0.5) * 0.1 
        },
        tumorSize: 0.04 + Math.random() * 0.03,
        tumorType: "Glioblastoma",
        severity: "High"
      }));
      updateTumorInfo(0);
    });
}

function updateTumorInfo(index) {
  if (!tumorData.length || !tumorMarker) return;
  
  const data = tumorData[index];
  
  // Update UI
  document.getElementById('currentSlice').textContent = data.slice;
  document.getElementById('tumorSize').textContent = data.tumorSize.toFixed(3);
  document.getElementById('posX').textContent = data.tumorPosition.x.toFixed(2);
  document.getElementById('posY').textContent = data.tumorPosition.y.toFixed(2);
  document.getElementById('posZ').textContent = data.tumorPosition.z.toFixed(2);
  document.getElementById('tumorType').textContent = data.tumorType;
  document.getElementById('sliceValue').textContent = data.slice;
  
  // Update tumor position and size
  tumorMarker.position.set(
    data.tumorPosition.x,
    data.tumorPosition.y,
    data.tumorPosition.z
  );
  
  const scale = data.tumorSize;
  tumorMarker.scale.set(scale, scale, scale);
}

// AR Button Setup
const arButton = document.getElementById('ar-button');

// Check if WebXR AR is supported
if ('xr' in navigator) {
  navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
    if (supported) {
      arButton.style.display = 'block';
      arButton.addEventListener('click', onARButtonClick);
    } else {
      console.log('AR not supported');
      arButton.textContent = 'AR Not Supported';
      arButton.style.display = 'block';
      arButton.disabled = true;
    }
  });
} else {
  console.log('WebXR not available');
  arButton.textContent = 'WebXR Not Available';
  arButton.style.display = 'block';
  arButton.disabled = true;
}

async function onARButtonClick() {
  if (!renderer.xr.isPresenting) {
    // Start AR session
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.body }
    });
    
    renderer.xr.setSession(session);
    
    session.addEventListener('end', () => {
      hitTestSourceRequested = false;
      hitTestSource = null;
      arButton.textContent = 'Start AR Experience';
    });
    
    arButton.textContent = 'Exit AR';
    document.getElementById('arInstructions').classList.remove('hidden');
  } else {
    // Exit AR
    renderer.xr.getSession().end();
  }
}

// UI Controls
const sliceSlider = document.getElementById('sliceSlider');
const scaleSlider = document.getElementById('scaleSlider');
const toggleTumorBtn = document.getElementById('toggleTumorBtn');
const resetViewBtn = document.getElementById('resetViewBtn');

sliceSlider.addEventListener('input', (e) => {
  const index = parseInt(e.target.value) - 1;
  updateTumorInfo(index);
});

scaleSlider.addEventListener('input', (e) => {
  const scaleValue = parseFloat(e.target.value);
  document.getElementById('scaleValue').textContent = scaleValue.toFixed(1) + 'x';
  
  if (model) {
    model.scale.setScalar(originalScale * scaleValue);
  }
});

toggleTumorBtn.addEventListener('click', () => {
  tumorVisible = !tumorVisible;
  if (tumorMarker) {
    tumorMarker.visible = tumorVisible;
  }
  toggleTumorBtn.textContent = tumorVisible ? '👁️ Toggle Tumor' : '🚫 Show Tumor';
});

resetViewBtn.addEventListener('click', () => {
  camera.position.set(0, 0, 3);
  controls.target.set(0, 0, 0);
  controls.update();
  
  if (model) {
    model.rotation.set(0, 0, 0);
    model.position.set(0, 0, 0);
  }
});

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
  // Pulse tumor marker
  if (tumorMarker) {
    tumorMarker.userData.pulsePhase += 0.05;
    const pulse = Math.sin(tumorMarker.userData.pulsePhase) * 0.2 + 1;
    tumorMarker.material.emissiveIntensity = 0.3 + pulse * 0.2;
  }
  
  if (frame) {
    // AR mode
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();
    
    // Set up hit testing
    if (hitTestSourceRequested === false) {
      session.requestReferenceSpace('viewer').then((referenceSpace) => {
        session.requestHitTestSource({ space: referenceSpace }).then((source) => {
          hitTestSource = source;
        });
      });
      
      session.addEventListener('end', () => {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });
      
      hitTestSourceRequested = true;
    }
    
    // Perform hit testing
    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
        
        // Place model on tap
        if (model && !model.visible) {
          model.visible = true;
          model.position.setFromMatrixPosition(reticle.matrix);
        }
      } else {
        reticle.visible = false;
      }
    }
    
  } else {
    // Non-AR mode
    controls.update();
  }
  
  renderer.render(scene, camera);
}

// Start animation
animate();