import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import occtImport from 'occt-import-js';

let cadEngine = null;
const material = () => new THREE.MeshStandardMaterial({ color: 0xbac5d7, roughness: 0.8, metalness: 0.0 });
const unitToMm = { mm: 1, cm: 10, m: 1000, inch: 25.4 };

async function getCadEngine(wasmBuffer) {
  if (!cadEngine) {
    if (!wasmBuffer) throw new Error('转换组件未能初始化，请刷新网页后重试。');
    cadEngine = occtImport({
      wasmBinary: new Uint8Array(wasmBuffer),
      print: () => {},
      printErr: () => {}
    });
  }
  return cadEngine;
}

function geometryFromCad(source) {
  const geometry = new THREE.BufferGeometry();
  if (!source.attributes || !source.attributes.position || !source.index) {
    throw new Error('模型中没有可转换的三角面。');
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.attributes.position.array, 3));
  geometry.setIndex(source.index.array);
  if (source.attributes.normal && source.attributes.normal.array) {
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(source.attributes.normal.array, 3));
  }
  return geometry;
}

function validateAndClean(root) {
  let triangles = 0;
  root.traverse((item) => {
    if (!item.isMesh) return;
    const geometry = item.geometry;
    if (!geometry) return;
    const positions = geometry.getAttribute('position');
    if (!positions || positions.itemSize < 3 || positions.count < 3) return;
    const indices = geometry.getIndex();
    const count = indices ? indices.count : positions.count;
    if (count % 3 !== 0) throw new Error('模型的三角面数据不完整。');
    for (let n = 0; n < positions.count; n++) {
      if (!Number.isFinite(positions.getX(n)) || !Number.isFinite(positions.getY(n)) || !Number.isFinite(positions.getZ(n))) {
        throw new Error('模型中包含无效的顶点坐标。');
      }
    }
    if (indices) {
      for (let n = 0; n < indices.count; n++) {
        const index = indices.getX(n);
        if (!Number.isInteger(index) || index < 0 || index >= positions.count) throw new Error('模型中包含无效的面索引。');
      }
    }
    triangles += count / 3;
    // Deliver a geometry-only file; avoid broken external material or texture references.
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('color');
    geometry.deleteAttribute('tangent');
    geometry.clearGroups();
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    item.material = material();
  });
  if (!triangles) throw new Error('没有读到三角面；此文件可能只有线、点或不受支持的实体。');
  return triangles;
}

async function readGeometry(data, extension, wasmBuffer) {
  const root = new THREE.Group();
  if (['step', 'stp', 'iges', 'igs', 'brep'].includes(extension)) {
    const engine = await getCadEngine(wasmBuffer);
    const params = {
      linearUnit: 'millimeter',
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: 0.001,
      angularDeflection: 0.2
    };
    const reader = extension === 'step' || extension === 'stp'
      ? engine.ReadStepFile : extension === 'iges' || extension === 'igs'
      ? engine.ReadIgesFile : engine.ReadBrepFile;
    const result = reader(new Uint8Array(data), params);
    if (!result || !result.success || !Array.isArray(result.meshes) || result.meshes.length === 0) {
      throw new Error('无法读取模型，文件可能已损坏或包含不支持的几何。');
    }
    for (const meshData of result.meshes) {
      const mesh = new THREE.Mesh(geometryFromCad(meshData), material());
      mesh.name = meshData.name || 'mesh';
      root.add(mesh);
    }
  } else if (extension === 'stl') {
    root.add(new THREE.Mesh(new STLLoader().parse(data), material()));
  } else if (extension === 'ply') {
    root.add(new THREE.Mesh(new PLYLoader().parse(data), material()));
  } else if (extension === 'obj') {
    const obj = new OBJLoader().parse(new TextDecoder().decode(data));
    obj.traverse((object) => {
      if (object.isLine || object.isPoints) object.visible = false;
    });
    root.add(obj);
  } else {
    throw new Error('不支持此文件格式。');
  }
  const triangles = validateAndClean(root);
  return { root, triangles };
}

function toArrayBuffer(value) {
  if (typeof value === 'string') return new TextEncoder().encode(value).buffer;
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  throw new Error('生成文件失败。');
}

async function writeGeometry(root, target) {
  root.updateMatrixWorld(true);
  if (target === 'stl') return toArrayBuffer(new STLExporter().parse(root, { binary: true }));
  if (target === 'obj') return toArrayBuffer(new OBJExporter().parse(root));
  if (target === 'ply') return toArrayBuffer(new PLYExporter().parse(root, null, { binary: true, littleEndian: true }));
  if (target === 'glb') {
    const result = await new Promise((resolve, reject) => {
      new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: true });
    });
    return toArrayBuffer(result);
  }
  throw new Error('不支持此输出格式。');
}

self.onmessage = async (event) => {
  const { id, extension, target, unit, data, wasmBuffer } = event.data;
  try {
    self.postMessage({ id, stage: '读取模型' });
    const { root, triangles } = await readGeometry(data, extension, wasmBuffer);
    // STEP/IGES are read as millimeters. BREP has no standard unit metadata.
    const inputMm = ['step', 'stp', 'igs', 'iges'].includes(extension) ? 1 : (unitToMm[unit] || 1);
    root.scale.setScalar(inputMm * (target === 'glb' ? 0.001 : 1));
    self.postMessage({ id, stage: '生成文件' });
    const result = await writeGeometry(root, target);
    self.postMessage({ id, result, triangles }, [result]);
  } catch (error) {
    self.postMessage({ id, error: error && error.message ? error.message : '读取或转换失败。' });
  }
};
