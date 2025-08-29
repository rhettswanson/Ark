import type { Group, PerspectiveCamera, Object3D, LineSegments, Mesh } from 'three';
import { SceneComponent } from './SceneComponent';

type Vec3 = { x: number; y: number; z: number };

interface Inputs {
  nearPlane: number;
  farPlane: number;
  horizontalFOV: number; // degrees (horizontal)
  aspect: number;

  localPosition: Vec3;   // world
  localRotation: Vec3;   // radians (x=pitch, y=yaw, z=roll)

  color: number;

  panEnabled: boolean;
  panAngleDeg: number;   // total sweep width, degrees
  panPeriodSec: number;  // seconds per full cycle
}

export const securityCameraType = 'mp.securityCamera';
export const makeSecurityCamera = () => new SecurityCamera();

class SecurityCamera extends SceneComponent {
  // expose to main.ts helpers
  public yawGroup!: Group;
  public pitchGroup!: Group;

  private root!: Group;
  public  projector!: PerspectiveCamera;

  private frustumLines?: LineSegments;
  private frustumFill?: Mesh;
  private cameraViz?: Object3D;

  private elapsed = 0;

  inputs: Inputs = {
    nearPlane: 0.12,
    farPlane: 10,
    horizontalFOV: 55,
    aspect: 16 / 9,

    localPosition: { x: 0, y: 1.7, z: 0 },
    localRotation: { x: 0, y: 0, z: 0 },

    color: 0x00ff77,

    panEnabled: true,
    panAngleDeg: 60,
    panPeriodSec: 10,
  };

  onInit() {
    const THREE = this.context.three;

    this.root = new THREE.Group();
    (this.context.root as any)?.obj3D?.add?.(this.root);

    this.yawGroup = new THREE.Group();
    this.pitchGroup = new THREE.Group();
    this.root.add(this.yawGroup);
    this.yawGroup.add(this.pitchGroup);

    this.projector = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 8);
    this.pitchGroup.add(this.projector);

    this.rebuildCameraViz();
    this.rebuildFrustum();

    this.updateCameraParams();
    this.updateTransform();
  }

  onInputsUpdated() {
    this.updateCameraParams();
    this.updateTransform();
    this.rebuildFrustum();
  }

  onTick(deltaMs: number) {
    if (this.inputs.panEnabled) {
      this.elapsed += (deltaMs || 0) * 0.001;
      const amp   = (this.inputs.panAngleDeg * Math.PI / 180) * 0.5;
      const phase = (this.elapsed / Math.max(0.001, this.inputs.panPeriodSec)) * Math.PI * 2;
      const baseY = this.inputs.localRotation.y;
      this.yawGroup.rotation.y = baseY + amp * Math.sin(phase);
    }
  }

  onDestroy() {
    const dispose = (o: any) => {
      if (!o) return;
      o.traverse?.((c: any) => {
        c.geometry?.dispose?.();
        c.material?.dispose?.();
        c.map?.dispose?.();
      });
      o.parent?.remove?.(o);
    };
    dispose(this.frustumLines);
    dispose(this.frustumFill);
    dispose(this.cameraViz);
    this.root?.parent?.remove?.(this.root);
  }

  private updateTransform() {
    const p = this.inputs.localPosition;
    const r = this.inputs.localRotation;

    this.yawGroup.position.set(p.x, p.y, p.z);
    if (!this.inputs.panEnabled) this.yawGroup.rotation.set(0, r.y, 0);
    this.pitchGroup.rotation.set(r.x, 0, r.z || 0);

    (this as any).needsUpdate = true;
  }

  private updateCameraParams() {
    const hfov = this.inputs.horizontalFOV * Math.PI / 180;
    const vFov = 2 * Math.atan(Math.tan(hfov / 2) / this.inputs.aspect);

    this.projector.fov = vFov * 180 / Math.PI;
    this.projector.aspect = this.inputs.aspect;
    this.projector.near = Math.max(0.001, this.inputs.nearPlane);
    this.projector.far  = Math.max(this.projector.near + 0.001, this.inputs.farPlane);
    this.projector.updateProjectionMatrix();
  }

  // Camera face+halo (softened so the green glow reads without a hard edge)
  private rebuildCameraViz() {
    const THREE = this.context.three;
    if (this.cameraViz?.parent) this.cameraViz.parent.remove(this.cameraViz);

    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.12),
      new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.35,
        depthTest: false,
        depthWrite: false,
      })
    );
    body.renderOrder = 99998;
    body.rotation.y = Math.PI;
    group.add(body);

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 32),
      new THREE.MeshBasicMaterial({
        color: this.inputs.color,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
      })
    );
    dot.position.z = 0.003;
    dot.renderOrder = 100000;
    group.add(dot);

    // Softer halo
    const size = 128;
    const cvs = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const g = cvs.getContext('2d')!;
    const grd = g.createRadialGradient(size/2, size/2, 2, size/2, size/2, size/2);
    grd.addColorStop(0.00, 'rgba(0,255,120,0.70)');
    grd.addColorStop(0.42, 'rgba(0,255,120,0.32)');
    grd.addColorStop(1.00, 'rgba(0,255,120,0.00)');
    g.fillStyle = grd;
    g.fillRect(0,0,size,size);

    const tex = new THREE.CanvasTexture(cvs);
    tex.minFilter = THREE.LinearFilter;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    halo.scale.set(0.38, 0.38, 0.38);
    halo.position.z = 0.004;
    halo.renderOrder = 100001;
    group.add(halo);

    this.cameraViz = group;
    this.pitchGroup.add(this.cameraViz);
  }

  // Frustum visualization: lines + filled translucent volume
  private rebuildFrustum() {
    const THREE = this.context.three;

    const kill = (o: any) => {
      if (o?.parent) {
        o.parent.remove(o);
        (o.material as any)?.dispose?.();
        (o.geometry as any)?.dispose?.();
      }
    };
    kill(this.frustumLines);
    kill(this.frustumFill);

    const n = this.projector.near;
    const f = this.projector.far;
    const hfov = this.inputs.horizontalFOV * Math.PI / 180;

    const nw = Math.tan(hfov / 2) * n;
    const fw = Math.tan(hfov / 2) * f;
    const nh = nw / this.inputs.aspect;
    const fh = fw / this.inputs.aspect;

    const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const nc = [ V3(-nw,-nh,-n), V3(nw,-nh,-n), V3(nw,nh,-n), V3(-nw,nh,-n) ];
    const fc = [ V3(-fw,-fh,-f), V3(fw,-fh,-f), V3(fw,fh,-f), V3(-fw,fh,-f) ];

    // Lines (slightly stronger)
    {
      const pts: number[] = [];
      const push = (a: any, b: any) => pts.push(a.x,a.y,a.z, b.x,b.y,b.z);
      push(nc[0], nc[1]); push(nc[1], nc[2]); push(nc[2], nc[3]); push(nc[3], nc[0]);
      push(fc[0], fc[1]); push(fc[1], fc[2]); push(fc[2], fc[3]); push(fc[3], fc[0]);
      for (let i = 0; i < 4; i++) push(nc[i], fc[i]);

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const mat = new THREE.LineBasicMaterial({
        color: this.inputs.color,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      this.frustumLines = new THREE.LineSegments(geom, mat);
      this.frustumLines.renderOrder = 9996;
      this.pitchGroup.add(this.frustumLines);
    }

    // Filled translucent volume
    {
      const verts = [...nc, ...fc].flatMap(v => [v.x,v.y,v.z]);
      const idx = [
        0,1,2, 0,2,3,        // near
        4,6,5, 4,7,6,        // far
        0,4,5, 0,5,1,        // sides
        1,5,6, 1,6,2,
        2,6,7, 2,7,3,
        3,7,4, 3,4,0,
      ];
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geom.setIndex(idx);

      const mat = new THREE.MeshBasicMaterial({
        color: this.inputs.color,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      this.frustumFill = new THREE.Mesh(geom, mat);
      this.frustumFill.renderOrder = 9995;
      this.pitchGroup.add(this.frustumFill);
    }
  }
}