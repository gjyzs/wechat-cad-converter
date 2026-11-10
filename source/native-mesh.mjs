import './native-compat.mjs';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { zipSync, strToU8 } from 'fflate';
import { arrayBuffer } from './native-bytes.mjs';
const formats = new Set(['stl', 'obj', 'ply']);
const outputs = new Set(['stl', 'obj', 'ply', 'glb']);
const units = { mm: 1, cm: 10, m: 1000, inch: 25.4 };
const material = () => new THREE.MeshStandardMaterial({ color: 0xbac5d7, roughness: 0.8, metalness: 0 });

function prepareGeometry(root) {
  let triangles = 0;
  root.traverse((item) => {
    if (!item.isMesh || !item.geometry) return;
    const geometry = item.geometry;
    const positions = geometry.getAttribute('position');
    if (!positions || positions.itemSize < 3 || positions.count < 3) return;
    const indices = geometry.getIndex();
    const count = indices ? indices.count : positions.count;
    if (count % 3) throw new Error('模型的三角面数据不完整。');
    for (let index = 0; index < positions.count; index++) {
      if (![positions.getX(index), positions.getY(index), positions.getZ(index)].every(Number.isFinite)) {
        throw new Error('模型包含无效的顶点坐标。');
      }
    }
    if (indices) for (let index = 0; index < indices.count; index++) {
      const vertex = indices.getX(index);
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= positions.count) throw new Error('模型包含无效的面索引。');
    }
    triangles += count / 3;
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('color');
    geometry.deleteAttribute('tangent');
    geometry.clearGroups();
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    item.material = material();
  });
  if (!triangles) throw new Error('没有读到三角面；请检查模型文件。');
  return triangles;
}

async function exportRoot(root, output, unit) {
  if (!outputs.has(output)) throw new Error('原生小程序原型只支持 STL、OBJ、PLY 或 GLB 输出。');
  if (!(unit in units)) throw new Error('请选择有效的输入单位。');
  const triangles = prepareGeometry(root);
  root.scale.setScalar(units[unit] * (output === 'glb' ? 0.001 : 1));
  root.updateMatrixWorld(true);
  let result;
  if (output === 'stl') result = new STLExporter().parse(root, { binary: true });
  if (output === 'obj') result = new OBJExporter().parse(root);
  if (output === 'ply') result = new PLYExporter().parse(root, null, { binary: true, littleEndian: true });
  if (output === 'glb') {
    result = await new Promise((resolve, reject) => new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: true }));
  }
  return { result: arrayBuffer(result), triangles };
}

export async function convertMesh({ data, extension, target, unit = 'mm' }) {
  const input = String(extension || '').toLowerCase();
  const output = String(target || '').toLowerCase();
  if (!formats.has(input)) throw new Error('原生小程序原型暂不支持该格式，请选择 STL、OBJ 或 PLY 网格。');
  const bytes = arrayBuffer(data);
  if (!bytes.byteLength) throw new Error('模型文件为空。');
  const root = new THREE.Group();
  try {
    if (input === 'stl') root.add(new THREE.Mesh(new STLLoader().parse(bytes), material()));
    if (input === 'ply') root.add(new THREE.Mesh(new PLYLoader().parse(bytes), material()));
    if (input === 'obj') root.add(new OBJLoader().parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    throw new Error(`无法读取模型：${error && error.message ? error.message : '格式错误'}`);
  }
  return exportRoot(root, output, unit);
}

export async function convertTriangles({ positions, indices, target, unit = 'mm' }) {
  if (!positions || !indices || positions.length % 3 || indices.length % 3) throw new Error('CAD 三角网格数据不完整。');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, material()));
  return exportRoot(root, String(target || '').toLowerCase(), unit);
}

export function makeZip(entries) {
  const files = Object.create(null);
  for (const entry of entries) {
    files[entry.name] = typeof entry.data === 'string' ? strToU8(entry.data) : new Uint8Array(arrayBuffer(entry.data));
  }
  const archive = zipSync(files, { level: 6 });
  return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength);
}
