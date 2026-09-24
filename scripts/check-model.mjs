import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { createAvatar } from '../avatar-model.js';

const {root,head}=createAvatar(new THREE.Texture());
let meshes=0,vertices=0;
root.traverse(object=>{
  if(!object.isMesh)return;
  meshes++;
  const position=object.geometry.attributes.position;
  vertices+=position.count;
  for(const value of position.array) assert.ok(Number.isFinite(value),'Non-finite mesh coordinate');
  for(const index of object.geometry.index?.array??[]) assert.ok(index<position.count,'Invalid triangle index');
  if(object.material.map) assert.equal(object.geometry.attributes.projection.count,position.count);
});
const bounds=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
assert.ok(bounds.z>1,'Character must have real front-to-back volume');
const body=root.getObjectByName('Shoulders');
const face=root.getObjectByName('Sculpted face');
root.updateMatrixWorld(true);
const beforeBody=body.matrixWorld.clone();
const beforeFace=face.matrixWorld.clone();
head.rotation.y=.5;
root.updateMatrixWorld(true);
assert.ok(body.matrixWorld.equals(beforeBody),'Head movement must leave shoulders stationary');
assert.ok(!face.matrixWorld.equals(beforeFace),'Head movement must change face orientation');
console.log(`PASS: ${meshes} meshes, ${vertices} vertices; valid geometry, 3D volume, independent head rotation.`);
