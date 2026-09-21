// cameraRig.js — third-person cinematic camera (from the web-slinger reference):
// orbit, speed-reactive FOV/distance, velocity look-ahead, swing auto-yaw + banking,
// AABB occlusion pull-in.
import * as THREE from 'three';
import { segmentAABB } from './cityBoxes.js?v=3';

const _look = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _lat = new THREE.Vector3();

// When a wall leaves no room behind the player, slide the camera around them
// but stay in the rear quarter. An offset near PI parks the lens in front of
// the character: W then walks toward the camera while the corridor on screen
// runs the other way, so the keys feel backwards. Pull in close instead.
const CAMERA_YAW_OFFSETS = [0, 0.4, -0.4, 0.85, -0.85];

export class CameraRig {
  constructor(camera, boxWorld) {
    this.camera = camera;
    this.bw = boxWorld;
    this.smoothLook = new THREE.Vector3();
    this.dist = 5;
    this.collT = 1;
    this.fov = camera.fov;
    this.roll = 0;
    this.occlusionAngle = 0;
    this.prevYaw = null;
    this.initialized = false;

    // cinematic hand-off: blend from an external camera pose (the aerial menu
    // shot) into the rig's own framing over a short window
    this.fromPos = new THREE.Vector3();
    this.fromQuat = new THREE.Quaternion();
    this.blendT = 0;
    this.blendDur = 1;
  }

  blendFrom(camera, dur = 1.5) {
    this.fromPos.copy(camera.position);
    this.fromQuat.copy(camera.quaternion);
    this.blendT = this.blendDur = dur;
  }

  forward(out, input) {
    const cp = Math.cos(input.pitch), sp = Math.sin(input.pitch);
    const cy = Math.cos(input.yaw), sy = Math.sin(input.yaw);
    return out.set(-sy * cp, sp, -cy * cp);
  }

  update(dt, input, ctrl) {
    const cam = this.camera;
    const speed = ctrl.vel.length();
    const speedN = Math.min(1, speed / 52);

    // gentle auto-yaw toward travel direction while swinging/zipping
    if (ctrl.mode === 'swing' || ctrl.mode === 'zip') {
      const hsp = Math.hypot(ctrl.vel.x, ctrl.vel.z);
      if (hsp > 6) {
        const travelYaw = Math.atan2(-ctrl.vel.x, -ctrl.vel.z);
        let dy = travelYaw - input.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        input.yaw += dy * Math.min(1, 1.1 * dt);
      }
    }

    _look.copy(ctrl.pos);
    _look.y += ctrl.mode === 'lie' ? 0.35
      : ctrl.mode === 'sit' ? (ctrl.furnitureCamera?.lookHeight ?? 1.05)
      : ctrl.mode === 'kneel' ? 1.05
      : ctrl.mode === 'ride' ? 1.18
      : 1.35;
    _lat.copy(ctrl.vel).multiplyScalar(0.16);
    if (_lat.length() > 4.5) _lat.setLength(4.5);
    _look.add(_lat);
    if (!this.initialized) {
      this.smoothLook.copy(_look);
      this.initialized = true;
    }
    this.smoothLook.lerp(_look, 1 - Math.exp(-11 * dt));

    this.forward(_dir, input);

    let targetDist = 4.2 + speedN * 3.6 + (ctrl.mode === 'swing' ? 1.1 : 0);
    if (ctrl.mode === 'sit') targetDist = ctrl.furnitureCamera?.distance ?? 1.72;
    else if (ctrl.mode === 'ride') targetDist = 5.2;
    else if (ctrl.mode === 'kneel') targetDist = 2.4;
    else if (ctrl.mode === 'lie') targetDist = 2.35;
    this.dist += (targetDist - this.dist) * (1 - Math.exp(-4 * dt));

    // occlusion: snap in, ease back out. The Ferris ride looks at the bay
    // through the wheel; pulling in against the terrace would bury the
    // camera in the cabin.
    const collisionT = direction => {
      if (ctrl.mode === 'ride') return 1;
      _desired.copy(this.smoothLook).addScaledVector(direction, -this.dist);
      let result = 1;
      const ids = this.bw.queryNearby(this.smoothLook.x, this.smoothLook.z, this.dist + 12);
      for (const idx of ids) {
        const b = this.bw.aabbs[idx];
        if (!b.collide || b.camBlock === false) continue;
        // Some imported building materials have one coarse box around a
        // hollow interior. If the player is already inside that box it cannot
        // describe a wall between the player and camera; exact interior boxes
        // added by the apartment still stop the boom normally.
        const startsInside = this.smoothLook.x > b.x0 && this.smoothLook.x < b.x1 &&
          this.smoothLook.y > b.y0 && this.smoothLook.y < b.y1 &&
          this.smoothLook.z > b.z0 && this.smoothLook.z < b.z1;
        if (startsInside && !b.prop) continue;
        const hit = segmentAABB(this.smoothLook, _desired, b, 0.28);
        if (hit < result) result = hit;
      }
      return result;
    };
    const rotatedDirection = (angle, out) => {
      const c = Math.cos(angle), s = Math.sin(angle);
      return out.set(_dir.x * c + _dir.z * s, _dir.y, -_dir.x * s + _dir.z * c).normalize();
    };

    // How fast the player is turning the view this frame. Manual rotation has
    // to move the camera, so the wall-dodge below is never allowed to run
    // against it.
    let yawRate = 0;
    if (this.prevYaw !== null && dt > 1e-5) {
      let dy = input.yaw - this.prevYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      yawRate = Math.abs(dy) / dt;
    }
    this.prevYaw = input.yaw;
    const turning = yawRate > 0.2;

    const previousAngle = this.occlusionAngle;
    const readableBoom = Math.min(1.75, this.dist * 0.72);
    rotatedDirection(this.occlusionAngle, _camDir);
    const currentBoom = this.dist * collisionT(_camDir) * 0.97;

    if (ctrl.mode === 'ride') {
      this.occlusionAngle = 0;
    } else if (turning) {
      // While the player turns, the dodge is a fixed offset carried along with
      // them. Re-picking the roomiest side here cancelled their input out: in
      // a corridor every degree of yaw was answered by an equal and opposite
      // dodge, so the view only moved once the offsets ran out — the arrow key
      // felt like it needed several presses. Ease the offset back to centre
      // instead, capped well under their own turn rate so the camera always
      // follows the key.
      const ease = Math.min(Math.abs(this.occlusionAngle), yawRate * 0.3 * dt);
      this.occlusionAngle -= Math.sign(this.occlusionAngle) * ease;
    } else if (currentBoom < readableBoom) {
      // Standing still against a wall: slide around the player. Angles are only
      // searched here, and the current one is kept while it stays readable, so
      // the camera cannot swap sides on every small step.
      let bestAngle = 0;
      let bestBoom = -1;
      for (const angle of CAMERA_YAW_OFFSETS) {
        rotatedDirection(angle, _camDir);
        const available = this.dist * collisionT(_camDir) * 0.97;
        if (available > bestBoom) { bestBoom = available; bestAngle = angle; }
        if (available >= readableBoom) { bestAngle = angle; break; }
      }
      // Except when the current direction puts the lens inside the avatar:
      // escape that invalid pose immediately.
      if (currentBoom < 0.9) this.occlusionAngle = bestAngle;
      else {
        let da = bestAngle - this.occlusionAngle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        this.occlusionAngle += da * (1 - Math.exp(-7 * dt));
      }
    }

    rotatedDirection(this.occlusionAngle, _camDir);
    const t = collisionT(_camDir);
    if (ctrl.mode === 'ride') { this.collT = 1; this.occlusionAngle = 0; }
    // A collision fraction belongs to one ray only. Carrying the old fraction
    // onto a newly clear side angle would keep the lens trapped in the avatar.
    else if (Math.abs(this.occlusionAngle - previousAngle) > 0.001) this.collT = t;
    else if (t < this.collT) this.collT = t;
    else this.collT += (t - this.collT) * (1 - Math.exp(-3.5 * dt));

    // Respect the exact space available. The angle search above normally keeps
    // enough distance to see the full player instead of entering their mesh.
    const boom = Math.max(0.05, this.dist * this.collT * 0.97);
    _desired.copy(this.smoothLook).addScaledVector(_camDir, -boom);
    if (_desired.y < 0.6) _desired.y = 0.6;
    cam.position.copy(_desired);

    cam.lookAt(this.smoothLook);

    let targetRoll = 0;
    if (ctrl.mode === 'swing' || ctrl.mode === 'air' || ctrl.mode === 'zip') {
      const rightX = Math.cos(input.yaw), rightZ = -Math.sin(input.yaw);
      const lat = ctrl.vel.x * rightX + ctrl.vel.z * rightZ;
      targetRoll = THREE.MathUtils.clamp(-lat * 0.0035, -0.10, 0.10);
    }
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-5 * dt));
    cam.rotateZ(this.roll);

    const targetFov = 62 + speedN * 17 + (ctrl.diving ? 6 : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-4.5 * dt));
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }

    // menu → dive hand-off: ease from the stored pose into the rig's framing
    if (this.blendT > 0) {
      this.blendT = Math.max(0, this.blendT - dt);
      const k = this.blendT / this.blendDur;       // 1 → 0
      const e = k * k * (3 - 2 * k);               // smooth both ends
      cam.position.lerp(this.fromPos, e);
      cam.quaternion.slerp(this.fromQuat, e);
    }
  }
}
