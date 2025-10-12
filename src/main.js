import * as THREE from 'three';

import Stats from "three/examples/jsm/libs/stats.module.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";

import { GPUComputationRenderer } from "three/examples/jsm/Addons.js";

import emojiFS from "./emojiFS.frag";
import emojiVS from "./emojiVS.vert";
import fragmentShaderPosition from "./FragmentShaderPosition.frag";
import fragmentShaderVelocity from "./FragmentShaderVelocity.frag";

/* TEXTURE WIDTH FOR SIMULATION */
const WIDTH = 128;

// Custom Geometry - using 3 triangles each. No UVs, no normals currently.
class BirdGeometry extends THREE.BufferGeometry {

  constructor() {

    super();

    const trianglesPerBird = 3;
    const triangles = BIRDS * trianglesPerBird;
    const points = triangles * 3;

    const vertices = new THREE.BufferAttribute( new Float32Array( points * 3 ), 3 );
    const birdColors = new THREE.BufferAttribute( new Float32Array( points * 3 ), 3 );
    const references = new THREE.BufferAttribute( new Float32Array( points * 2 ), 2 );
    const birdVertex = new THREE.BufferAttribute( new Float32Array( points ), 1 );

    this.setAttribute( 'position', vertices );
    this.setAttribute( 'birdColor', birdColors );
    this.setAttribute( 'reference', references );
    this.setAttribute( 'birdVertex', birdVertex );

    // this.setAttribute( 'normal', new Float32Array( points * 3 ), 3 );


    let v = 0;

    function verts_push() {

      for ( let i = 0; i < arguments.length; i++ ) {

        vertices.array[v++] = arguments[i];

      }

    }

    const wingsSpan = 20;

    for ( let f = 0; f < BIRDS; f++ ) {

      // Body

      verts_push(
        0, - 0, - 20,
        0, 4, - 20,
        0, 0, 30
      );

      // Wings

      verts_push(
        0, 0, - 15,
        - wingsSpan, 0, 0,
        0, 0, 15
      );

      verts_push(
        0, 0, 15,
        wingsSpan, 0, 0,
        0, 0, - 15
      );

    }

    for ( let v = 0; v < triangles * 3; v++ ) {

      const triangleIndex = ~ ~( v / 3 );
      const birdIndex = ~ ~( triangleIndex / trianglesPerBird );
      const x = ( birdIndex % WIDTH ) / WIDTH;
      const y = ~ ~( birdIndex / WIDTH ) / WIDTH;

      const c = new THREE.Color(
        0x666666 +
        ~ ~( v / 9 ) / BIRDS * 0x666666
      );

      birdColors.array[v * 3 + 0] = c.r;
      birdColors.array[v * 3 + 1] = c.g;
      birdColors.array[v * 3 + 2] = c.b;

      references.array[v * 2] = x;
      references.array[v * 2 + 1] = y;

      birdVertex.array[v] = v % 9;

    }

    this.scale( 0.2, 0.2, 0.2 );

  }

}

//

let container, stats;
let camera, scene, renderer;
let mouseX = 0, mouseY = 0;

let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;

const BOUNDS = 800, BOUNDS_HALF = BOUNDS / 2;

let last = performance.now();

let gpuCompute;
let velocityVariable;
let positionVariable;
let positionUniforms;
let velocityUniforms;
let birdUniforms;

init();

function init() {

  container = document.createElement( 'div' );
  document.body.appendChild( container );

  camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 3000 );
  camera.position.z = 350;

  scene = new THREE.Scene();
  scene.background = new THREE.Color( 0xffffff );
  scene.fog = new THREE.Fog( 0xffffff, 100, 1000 );

  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.setAnimationLoop( animate );
  container.appendChild( renderer.domElement );

  initComputeRenderer();

  stats = new Stats();
  container.appendChild( stats.dom );

  container.style.touchAction = 'none';
  container.addEventListener( 'pointermove', onPointerMove );

  //

  window.addEventListener( 'resize', onWindowResize );

  const gui = new GUI();


  const effectController = {
    separation: 20.0,
    alignment: 20.0,
    cohesion: 20.0,
    freedom: 0.75
  };

  const valuesChanger = function () {

    velocityUniforms['separationDistance'].value = effectController.separation;
    velocityUniforms['alignmentDistance'].value = effectController.alignment;
    velocityUniforms['cohesionDistance'].value = effectController.cohesion;
    velocityUniforms['freedomFactor'].value = effectController.freedom;

  };

  valuesChanger();

  gui.add( effectController, 'separation', 0.0, 100.0, 1.0 ).onChange( valuesChanger );
  gui.add( effectController, 'alignment', 0.0, 100, 0.001 ).onChange( valuesChanger );
  gui.add( effectController, 'cohesion', 0.0, 100, 0.025 ).onChange( valuesChanger );
  gui.close();

  initBirds();

}

function initComputeRenderer() {

  gpuCompute = new GPUComputationRenderer( WIDTH, WIDTH, renderer );

  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  fillPositionTexture( dtPosition );
  fillVelocityTexture( dtVelocity );

  velocityVariable = gpuCompute.addVariable( 'textureVelocity', fragmentShaderVelocity, dtVelocity );
  positionVariable = gpuCompute.addVariable( 'texturePosition', fragmentShaderPosition, dtPosition );

  gpuCompute.setVariableDependencies( velocityVariable, [positionVariable, velocityVariable] );
  gpuCompute.setVariableDependencies( positionVariable, [positionVariable, velocityVariable] );

  positionUniforms = positionVariable.material.uniforms;
  velocityUniforms = velocityVariable.material.uniforms;

  positionUniforms['time'] = { value: 0.0 };
  positionUniforms['delta'] = { value: 0.0 };
  velocityUniforms['time'] = { value: 1.0 };
  velocityUniforms['delta'] = { value: 0.0 };
  velocityUniforms['testing'] = { value: 1.0 };
  velocityUniforms['separationDistance'] = { value: 1.0 };
  velocityUniforms['alignmentDistance'] = { value: 1.0 };
  velocityUniforms['cohesionDistance'] = { value: 1.0 };
  velocityUniforms['freedomFactor'] = { value: 1.0 };
  velocityUniforms['predator'] = { value: new THREE.Vector3() };
  velocityVariable.material.defines.BOUNDS = BOUNDS.toFixed( 2 );

  velocityVariable.wrapS = THREE.RepeatWrapping;
  velocityVariable.wrapT = THREE.RepeatWrapping;
  positionVariable.wrapS = THREE.RepeatWrapping;
  positionVariable.wrapT = THREE.RepeatWrapping;

  const error = gpuCompute.init();

  if ( error !== null ) {

    console.error( error );

  }

}

function initBirds() {

  const BIRD_COUNT = WIDTH * WIDTH;
  const emojis = ['😄', '😃', '😀', '😊', '☺', '😉', '😍', '😘', '😚', '😗', '😙', '😜', '😝', '😛', '😳', '😁', '😔', '😌', '😒', '😞', '😣', '😢', '😂', '😭', '😪', '😥', '😰', '😅', '😓', '😩', '😫', '😨', '😱', '😠', '😡', '😤', '😖', '😆', '😋', '😷', '😎', '😴', '😵', '😲', '😟', '😦', '😧', '😈', '👿', '😮', '😬', '😐', '😕', '😯', '😶', '😇', '😏', '😑', '👲', '👳', '👮', '👷', '💂', '👶', '👦', '👧', '👨', '👩', '👴', '👵', '👱', '👼', '👸', '😺', '😸', '😻', '😽', '😼', '🙀', '😿', '😹', '😾', '👹', '👺', '🙈', '🙉', '🙊', '💀', '👽', '🐶', '🐺', '🐱', '🐭', '🐹', '🐰', '🐸', '🐯', '🐨', '🐻', '🐷', '🐽', '🐮', '🐗', '🐵', '🐒', '🐴', '🐑', '🐘', '🐼', '🐧', '🐦', '🐤', '🐥', '🐣', '🐔', '🐍', '🐢', '🐛', '🐝', '🐜', '🐞', '🐌', '🐙', '🐚', '🐠', '🐟', '🐬', '🐳', '🐋', '🐄', '🐏', '🐀', '🐃', '🐅', '🐇', '🐉', '🐎', '🐐', '🐓', '🐕', '🐖', '🐁', '🐂', '🐲', '🐡', '🐊', '🐫', '🐪', '🐆', '🐈', '🐩'];
  const ATLAS_GRID_WIDTH = Math.ceil( Math.sqrt( emojis.length ) );
  const CELL_SIZE = 128;
  const canvas = document.createElement( 'canvas' );
  canvas.width = canvas.height = ATLAS_GRID_WIDTH * CELL_SIZE;
  const ctx = canvas.getContext( '2d' );
  ctx.font = `${CELL_SIZE * 0.9}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  for ( let i = 0; i < emojis.length; i++ ) {
    const x = ( i % ATLAS_GRID_WIDTH ) * CELL_SIZE + CELL_SIZE / 2;
    const y = Math.floor( i / ATLAS_GRID_WIDTH ) * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillText( emojis[i], x, y );
  }

  const atlasTexture = new THREE.CanvasTexture( canvas );
  atlasTexture.needsUpdate = true;

  atlasTexture.flipY = false;

  const geometry = new THREE.InstancedBufferGeometry();

  const baseVertices = new Float32Array( [0, 0, 0] );
  geometry.setAttribute( 'position', new THREE.BufferAttribute( baseVertices, 3 ) );

  const birdIndices = new Float32Array( BIRD_COUNT );
  for ( let i = 0; i < BIRD_COUNT; i++ ) {
    birdIndices[i] = i % emojis.length;
  }
  geometry.setAttribute( 'aBirdIndex', new THREE.InstancedBufferAttribute( birdIndices, 1 ) );

  geometry.instanceCount = BIRD_COUNT;

  const material = new THREE.ShaderMaterial( {
    uniforms: {
      'tBirdAtlas': { value: atlasTexture },
      'texturePosition': { value: null },
      'textureVelocity': { value: null },
      'uWidth': { value: WIDTH },
      'uAtlasWidth': { value: ATLAS_GRID_WIDTH }
    },
    vertexShader: emojiVS,
    fragmentShader: emojiFS,
    transparent: true
  } );

  birdUniforms = material.uniforms;

  const birds = new THREE.Points( geometry, material );
  birds.frustumCulled = false;
  scene.add( birds );
}

function fillPositionTexture( texture ) {

  const theArray = texture.image.data;

  for ( let k = 0, kl = theArray.length; k < kl; k += 4 ) {

    const x = Math.random() * BOUNDS - BOUNDS_HALF;
    const y = Math.random() * BOUNDS - BOUNDS_HALF;
    const z = Math.random() * BOUNDS - BOUNDS_HALF;

    theArray[k + 0] = x;
    theArray[k + 1] = y;
    theArray[k + 2] = z;
    theArray[k + 3] = 1;

  }

}

function fillVelocityTexture( texture ) {

  const theArray = texture.image.data;

  for ( let k = 0, kl = theArray.length; k < kl; k += 4 ) {

    const x = Math.random() - 0.5;
    const y = Math.random() - 0.5;
    const z = Math.random() - 0.5;

    theArray[k + 0] = x * 10;
    theArray[k + 1] = y * 10;
    theArray[k + 2] = z * 10;
    theArray[k + 3] = 1;

  }

}

function onWindowResize() {

  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( window.innerWidth, window.innerHeight );

}

function onPointerMove( event ) {

  if ( event.isPrimary === false ) return;

  mouseX = event.clientX - windowHalfX;
  mouseY = event.clientY - windowHalfY;

}

//

function animate() {

  render();
  stats.update();

}

function render() {

  const now = performance.now();
  let delta = ( now - last ) / 1000;

  if ( delta > 1 ) delta = 1; // safety cap on large deltas
  last = now;

  positionUniforms['time'].value = now;
  positionUniforms['delta'].value = delta;
  velocityUniforms['time'].value = now;
  velocityUniforms['delta'].value = delta;

  velocityUniforms['predator'].value.set( 0.5 * mouseX / windowHalfX, - 0.5 * mouseY / windowHalfY, 0 );

  mouseX = 10000;
  mouseY = 10000;

  gpuCompute.compute();

  birdUniforms['texturePosition'].value = gpuCompute.getCurrentRenderTarget( positionVariable ).texture;
  birdUniforms['textureVelocity'].value = gpuCompute.getCurrentRenderTarget( velocityVariable ).texture;

  renderer.render( scene, camera );

}