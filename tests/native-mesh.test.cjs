const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const entry = path.resolve(__dirname, '../source/native-mesh.mjs');
const tetrahedron = `solid tetra
 facet normal 0 0 -1
  outer loop
   vertex 0 0 0
   vertex 0 1 0
   vertex 1 0 0
  endloop
 endfacet
 facet normal 0 -1 0
  outer loop
   vertex 0 0 0
   vertex 1 0 0
   vertex 0 0 1
  endloop
 endfacet
 facet normal -1 0 0
  outer loop
   vertex 0 0 0
   vertex 0 0 1
   vertex 0 1 0
  endloop
 endfacet
 facet normal 0.577350269 0.577350269 0.577350269
  outer loop
   vertex 1 0 0
   vertex 0 1 0
   vertex 0 0 1
  endloop
 endfacet
endsolid tetra`;

const bufferOf = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const asBuffer = (value) => Buffer.from(value instanceof ArrayBuffer ? value : value.buffer, value.byteOffset || 0, value.byteLength);

test('native local mesh conversion preserves geometry through independent readers', async () => {
  assert.ok(fs.existsSync(entry), 'native local mesh converter has not been implemented');
  const { convertMesh } = await import(pathToFileURL(entry).href);
  const THREE = await import('three');
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const source = bufferOf(Buffer.from(tetrahedron));

  const obj = await convertMesh({ data: source, extension: 'stl', target: 'obj', unit: 'mm' });
  assert.equal(obj.triangles, 4);
  const objBytes = asBuffer(obj.result);
  const objGeometry = new OBJLoader().parse(objBytes.toString('utf8'));
  const objSize = new THREE.Box3().setFromObject(objGeometry).getSize(new THREE.Vector3());
  assert.deepEqual(objSize.toArray(), [1, 1, 1]);

  const ply = await convertMesh({ data: bufferOf(objBytes), extension: 'obj', target: 'ply', unit: 'mm' });
  const plyBytes = asBuffer(ply.result);
  const plyGeometry = new PLYLoader().parse(bufferOf(plyBytes));
  plyGeometry.computeBoundingBox();
  assert.deepEqual(plyGeometry.boundingBox.getSize(new THREE.Vector3()).toArray(), [1, 1, 1]);

  const glb = await convertMesh({ data: source, extension: 'stl', target: 'glb', unit: 'mm' });
  const glbBytes = asBuffer(glb.result);
  assert.equal(glbBytes.toString('ascii', 0, 4), 'glTF');
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bufferOf(glbBytes), '', resolve, reject));
  const glbSize = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
  for (const size of glbSize.toArray()) assert.ok(Math.abs(size - 0.001) < 1e-8);
});

test('mesh parser rejects CAD input and invalid geometry clearly', async () => {
  assert.ok(fs.existsSync(entry), 'native local mesh converter has not been implemented');
  const { convertMesh } = await import(pathToFileURL(entry).href);
  await assert.rejects(() => convertMesh({ data: new ArrayBuffer(0), extension: 'step', target: 'stl' }), /暂不支持|网格/);
  await assert.rejects(() => convertMesh({ data: bufferOf(Buffer.from('# no mesh')), extension: 'obj', target: 'stl' }), /三角面|无法|失败/);
});

test('triangulated CAD output can be exported as an OBJ mesh with millimetre dimensions', async () => {
  const { convertTriangles } = await import(pathToFileURL(entry).href);
  assert.equal(typeof convertTriangles, 'function', 'triangulated CAD bridge has not been implemented');
  const result = await convertTriangles({
    positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
    indices: new Uint32Array([0, 1, 2]),
    target: 'obj'
  });
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
  const THREE = await import('three');
  const object = new OBJLoader().parse(asBuffer(result.result).toString('utf8'));
  assert.deepEqual(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).toArray(), [10, 10, 0]);
});
