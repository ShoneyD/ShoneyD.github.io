/* Monkey rig: a skinned GLB posed by AIMING bones at target directions, so
   poses are written as "this bone points that way" in the monkey's own frame
   (x = his right, y = up, -z = the way he faces). Rest orientation agnostic. */
import * as THREE from 'three';

const CHAINS = {
  spine: ['b_Hip','b_Spine01','b_Spine02','b_Spine03','b_Neck','b_Head'],
  armR: ['b_Right_Shoulder','b_Right_UpperArm','b_Right_ForeArm','b_Right_Hand','b_Right_Hand2'],
  armL: ['b_Left_Shoulder','b_Left_UpperArm','b_Left_ForeArm','b_Left_Hand','b_Left_Hand2'],
  legR: ['b_Right_Leg01','b_Right_Leg02','b_Right_Foot01','b_Right_Foot02'],
  legL: ['b_Left_Leg01','b_Left_Leg02','b_Left_Foot01','b_Left_Foot02'],
  tail: ['b_Tail01','b_Tail02','b_Tail03','b_Tail04','b_Tail05','b_Tail06','b_Tail07']
};
const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

/* Each pose: chain -> array of directions, one per bone that has a child. */
export const POSES = {
  hang: {
    spine: [V(0,1,.05), V(0,1,.05), V(0,1,0), V(0,1,-.15), V(0,1,-.35)],
    armR: [V(.4,.9,0), V(.15,1,0), V(.05,1,0), V(0,1,0)],
    armL: [V(-.6,.2,0), V(-.55,-.5,-.45), V(-.25,-.55,-.8), V(-.1,-.4,-1)],
    legR: [V(.12,-1,-.35), V(.05,-.8,.6), V(0,-.35,-1)],
    legL: [V(-.12,-1,-.15), V(-.05,-.9,.45), V(0,-.35,-1)],
    tail: [V(0,-.7,.8), V(0,-.4,1), V(0,.1,1), V(0,.6,.8), V(0,1,.1), V(0,.7,-.7)]
  },
  fly: {
    spine: [V(0,.6,-.8), V(0,.55,-.85), V(0,.5,-.85), V(0,.6,-.8), V(0,.3,-1)],
    armR: [V(.5,.4,-.4), V(.25,.55,-.8), V(.1,.5,-.86), V(0,.4,-1)],
    armL: [V(-.5,.4,-.4), V(-.25,.55,-.8), V(-.1,.5,-.86), V(0,.4,-1)],
    legR: [V(.2,-.6,.8), V(.1,-.2,1), V(0,-.8,.6)],
    legL: [V(-.2,-.6,.8), V(-.1,-.2,1), V(0,-.8,.6)],
    tail: [V(0,-.3,1), V(0,-.1,1), V(0,.1,1), V(0,.3,1), V(0,.5,.9), V(0,.8,.5)]
  },
  fall: {
    spine: [V(0,1,.3), V(0,1,.35), V(0,1,.3), V(0,1,.2), V(0,1,0)],
    armR: [V(.8,.6,0), V(.6,.8,.1), V(.3,1,0), V(.1,1,0)],
    armL: [V(-.8,.6,0), V(-.6,.8,.1), V(-.3,1,0), V(-.1,1,0)],
    legR: [V(.4,-.9,-.3), V(.2,-.4,-.9), V(0,-.3,-1)],
    legL: [V(-.4,-.9,.2), V(-.2,-.9,.4), V(0,-.3,-1)],
    tail: [V(0,.2,1), V(0,.6,.8), V(0,1,.2), V(0,.9,-.4), V(0,.4,-.9), V(0,-.2,-1)]
  },
  stand: {
    spine: [V(0,1,0), V(0,1,0), V(0,1,0), V(0,1,-.1), V(0,1,-.2)],
    armR: [V(1,-.1,0), V(.45,-1,-.1), V(.2,-1,-.3), V(0,-1,-.3)],
    armL: [V(-1,-.1,0), V(-.45,-1,-.1), V(-.2,-1,-.3), V(0,-1,-.3)],
    legR: [V(.1,-1,0), V(0,-1,.05), V(0,-.2,-1)],
    legL: [V(-.1,-1,0), V(0,-1,.05), V(0,-.2,-1)],
    tail: [V(0,-.6,.8), V(0,-.2,1), V(0,.3,1), V(0,.8,.6), V(0,1,0), V(0,.6,-.8)]
  }
};

export function createMonkey(gltf, height){
  const model = gltf.scene;
  const root = new THREE.Group();          /* placed and rotated by the game */
  const rig = new THREE.Group();           /* turns the model to face -z */
  root.add(rig); rig.add(model);
  model.rotation.y = Math.PI;
  /* scale to height */
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const s = height / (box.max.y - box.min.y);
  model.scale.multiplyScalar(s);
  model.traverse(n => { if (n.isMesh){ n.castShadow = true; n.frustumCulled = false; } });
  const bones = {};
  model.traverse(n => { if (n.isBone) bones[n.name] = n; });
  const rest = {};
  for (const k in bones) rest[k] = bones[k].quaternion.clone();
  const mixer = new THREE.AnimationMixer(model);
  const cheer = gltf.animations[0] ? mixer.clipAction(gltf.animations[0]) : null;

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), cur = new THREE.Vector3(), tgt = new THREE.Vector3();
  const qW = new THREE.Quaternion(), qP = new THREE.Quaternion(), qR = new THREE.Quaternion(), qRig = new THREE.Quaternion();
  function aim(bone, child, dirRig){
    bone.updateMatrixWorld(true);
    bone.getWorldPosition(tmpA); child.getWorldPosition(tmpB);
    cur.subVectors(tmpB, tmpA).normalize();
    tgt.copy(dirRig).applyQuaternion(qRig).normalize();
    qR.setFromUnitVectors(cur, tgt);
    bone.getWorldQuaternion(qW);
    qW.premultiply(qR);
    bone.parent.getWorldQuaternion(qP);
    bone.quaternion.copy(qP.invert().multiply(qW));
  }
  const mixDir = new THREE.Vector3();
  /* pose = blend of a and b by t; jitter(chain, i) may return an extra vector */
  function pose(a, b, t, wobble){
    if (playingClip) return;
    for (const k in rest) bones[k].quaternion.copy(rest[k]);
    root.updateMatrixWorld(true);
    rig.getWorldQuaternion(qRig);
    const A = POSES[a], B = POSES[b || a];
    for (const c in CHAINS){
      const names = CHAINS[c];
      for (let i = 0; i < names.length - 1; i++){
        const da = A[c][i], db = B[c][i]; if (!da) continue;
        mixDir.copy(da).lerp(db, t || 0);
        if (wobble) { const w = wobble(c, i); if (w) mixDir.add(w); }
        mixDir.normalize();
        aim(bones[names[i]], bones[names[i + 1]], mixDir);
      }
    }
  }
  let playingClip = false;
  function playCheer(on){
    if (!cheer) return;
    playingClip = on;
    if (on){ for (const k in rest) bones[k].quaternion.copy(rest[k]); cheer.reset().play(); }
    else cheer.stop();
  }
  const hand = new THREE.Vector3();
  function handWorld(out){ (out || hand); bones['b_Right_Hand'].getWorldPosition(out || hand); return out || hand; }
  /* move root so the right hand sits on point p */
  function gripAt(p){
    root.updateMatrixWorld(true);
    const h = handWorld(new THREE.Vector3());
    root.position.add(tmpA.subVectors(p, h));
  }
  function footWorld(out){ return bones['b_Left_Foot01'].getWorldPosition(out || new THREE.Vector3()); }
  return { root, rig, bones, pose, gripAt, handWorld, footWorld, mixer, playCheer, scale:s };
}
