import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 20);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;
document.getElementById('container').appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// Variables
let model;
let tumorMarker;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let originalScale = 0.3;
let tumorVisible = true;
let controller;
let isARMode = false;
let modelPlaced = false;

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
const reticleMaterial = new THREE.MeshBasicMaterial({ 
  color: 0x00bcd4,
  side: THREE.DoubleSide
});
reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

// Load GLB brain model
const loader = new GLTFLoader();
const loadingScreen = document.getElementById('loadingScreen');

loader.load('models/brain2.glb', (gltf) => {
  model = gltf.scene;
  
  // Center and scale the model2
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  
  model.position.sub(center);
  
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = originalScale / maxDim;
  model.scale.multiplyScalar(scale);
  
  // Initially visible for non-AR mode
  model.visible = true;
  
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
    <div class="loading-text" style="color: #00bcd4;">Using placeholder model</div>
  `;
  
  // Create placeholder brain (sphere)
  const geometry = new THREE.SphereGeometry(0.3, 32, 32);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0xffc0cb,
    roughness: 0.7,
    metalness: 0.3
  });
  model = new THREE.Mesh(geometry, material);
  model.visible = true;
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
let customARButton = null;

// Check if WebXR AR is supported
if ('xr' in navigator) {
  navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
    if (supported) {
      arButton.style.display = 'block';
      
      // Use Three.js ARButton but customize it
      customARButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
      });
      
      // Hide default AR button, use our custom one
      customARButton.style.display = 'none';
      document.body.appendChild(customARButton);
      
      // Our custom button triggers the Three.js AR button
      arButton.addEventListener('click', () => {
        customARButton.click();
      });
      
      // Listen for AR session events
      renderer.xr.addEventListener('sessionstart', () => {
        isARMode = true;
        modelPlaced = false;
        arButton.textContent = 'Exit AR';
        document.getElementById('arInstructions').classList.remove('hidden');
        
        // Hide model until placed
        if (model) {
          model.visible = false;
        }
      });
      
      renderer.xr.addEventListener('sessionend', () => {
        isARMode = false;
        hitTestSourceRequested = false;
        hitTestSource = null;
        arButton.textContent = 'Start AR Experience';
        
        // Show model again in regular mode
        if (model) {
          model.visible = true;
          model.position.set(0, 0, 0);
        }
      });
      
    } else {
      console.log('AR not supported');
      arButton.textContent = 'AR Not Supported on This Device';
      arButton.style.display = 'block';
      arButton.disabled = true;
      arButton.style.opacity = '0.5';
    }
  }).catch(err => {
    console.error('Error checking AR support:', err);
    arButton.textContent = 'Error Checking AR Support';
    arButton.style.display = 'block';
    arButton.disabled = true;
  });
} else {
  console.log('WebXR not available');
  arButton.textContent = 'WebXR Not Available';
  arButton.style.display = 'block';
  arButton.disabled = true;
  arButton.style.opacity = '0.5';
}

// Controller for AR interaction
controller = renderer.xr.getController(0);
controller.addEventListener('select', onSelect);
scene.add(controller);

function onSelect() {
  if (reticle.visible && model && !modelPlaced) {
    // Place model at reticle position
    model.position.setFromMatrixPosition(reticle.matrix);
    model.visible = true;
    modelPlaced = true;
    
    // Hide instructions after placement
    setTimeout(() => {
      document.getElementById('arInstructions').classList.add('hidden');
    }, 2000);
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
    const baseScale = originalScale * scaleValue;
    model.scale.setScalar(baseScale);
  }
});

toggleTumorBtn.addEventListener('click', () => {
  tumorVisible = !tumorVisible;
  if (tumorMarker) {
    tumorMarker.visible = tumorVisible;
  }
  toggleTumorBtn.textContent = tumorVisible ? '👁️ Hide Tumor' : '👁️ Show Tumor';
});

resetViewBtn.addEventListener('click', () => {
  if (isARMode && model) {
    modelPlaced = false;
    model.visible = false;
  } else {
    camera.position.set(0, 0, 3);
    controls.target.set(0, 0, 0);
    controls.update();
    
    if (model) {
      model.rotation.set(0, 0, 0);
      model.position.set(0, 0, 0);
    }
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
  if (tumorMarker && tumorMarker.visible) {
    tumorMarker.userData.pulsePhase += 0.05;
    const pulse = Math.sin(tumorMarker.userData.pulsePhase) * 0.2 + 1;
    tumorMarker.material.emissiveIntensity = 0.3 + pulse * 0.2;
  }
  
  if (frame && isARMode) {
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
      
      hitTestSourceRequested = true;
    }
    
    // Perform hit testing
    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      
      if (hitTestResults.length > 0 && !modelPlaced) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else if (modelPlaced) {
        reticle.visible = false;
      }
    }
    
  } else if (!isARMode) {
    // Non-AR mode
    controls.update();
  }
  
  renderer.render(scene, camera);
}

// Start animation
animate();
