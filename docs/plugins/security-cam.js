// docs/plugins/security-cam.js
// Runs INSIDE Showcase. Registers a Scene Component: "ark.securityCam".
(function () {
  function registerPlugin(sdk) {
    sdk.Scene.register("ark.securityCam", () => {
      return class SecurityCam extends sdk.Scene.Component {
        inputs = {
          near: 0.30,
          far: 12.0,
          hfovDeg: 90,              // horizontal FOV (degrees)
          aspect: 16 / 9,           // width/height
          color: 0x00aaff,
          opacity: 0.18,
          wireOpacity: 0.60,
          worldPosition: { x: 0, y: 2.6, z: 0 },
          worldRotationQuat: null,  // {x,y,z,w}
          worldEulerDeg: { x: 0, y: 0, z: 0 }, // used if no quaternion
          panEnabled: false,
          panAngleDeg: 60,
          panPeriodSec: 8
        };

        onInit() {
          const T = this.context.three;
          this.root  = new T.Group();
          this.yaw   = new T.Group();
          this.pitch = new T.Group();
          this.root.add(this.yaw);
          this.yaw.add(this.pitch);

          this.material = new T.MeshBasicMaterial({
            color: this.inputs.color,
            transparent: true,
            opacity: this.inputs.opacity,
            depthWrite: false,
            side: T.DoubleSide
          });

          this.lineMat = new T.LineBasicMaterial({
            color: this.inputs.color,
            transparent: true,
            opacity: this.inputs.wireOpacity
          });

          this._buildFrustum();
          this._applyTransform();

          this.outputs.objectRoot = this.root;
          this._t = 0;
          console.debug("[ark] security-cam component init");
        }

        _buildFrustum() {
          const T = this.context.three;
          const n  = this.inputs.near;
          const f  = this.inputs.far;
          const hf = T.MathUtils.degToRad(this.inputs.hfovDeg);
          const a  = this.inputs.aspect;
          const vf = 2 * Math.atan(Math.tan(hf / 2) / a);

          const nw = Math.tan(hf / 2) * n, nh = Math.tan(vf / 2) * n;
          const fw = Math.tan(hf / 2) * f, fh = Math.tan(vf / 2) * f;

          // camera looks down -Z in local space
          const V = [
            // near
            [-nw,  nh, -n], [ nw,  nh, -n], [ nw, -nh, -n], [-nw, -nh, -n],
            // far
            [-fw,  fh, -f], [ fw,  fh, -f], [ fw, -fh, -f], [-fw, -fh, -f],
          ];

          const idx = [
            0,1,2, 0,2,3,   // near
            4,6,5, 4,7,6,   // far
            0,4,5, 0,5,1,
            1,5,6, 1,6,2,
            2,6,7, 2,7,3,
            3,7,4, 3,4,0,
          ];

          const pos = new Float32Array(idx.length * 3);
          for (let i = 0; i < idx.length; i++) {
            const p = V[idx[i]];
            pos[i*3+0] = p[0]; pos[i*3+1] = p[1]; pos[i*3+2] = p[2];
          }
          const g = new T.BufferGeometry();
          g.setAttribute("position", new T.BufferAttribute(pos, 3));

          // edges
          const edges = [0,1,1,2,2,3,3,0, 4,5,5,6,6,7,7,4, 0,4,1,5,2,6,3,7];
          const epos = new Float32Array(edges.length * 3);
          for (let i = 0; i < edges.length; i++) {
            const p = V[edges[i]];
            epos[i*3+0] = p[0]; epos[i*3+1] = p[1]; epos[i*3+2] = p[2];
          }
          const eg = new T.BufferGeometry();
          eg.setAttribute("position", new T.BufferAttribute(epos, 3));

          if (!this.mesh) {
            this.mesh = new T.Mesh(g, this.material);
            this.wire = new T.LineSegments(eg, this.lineMat);
            this.pitch.add(this.mesh, this.wire);
          } else {
            this.mesh.geometry?.dispose();
            this.wire.geometry?.dispose();
            this.mesh.geometry = g;
            this.wire.geometry = eg;
          }
        }

        _applyTransform() {
          const T = this.context.three;

          this.root.position.set(
            this.inputs.worldPosition.x,
            this.inputs.worldPosition.y,
            this.inputs.worldPosition.z
          );

          if (this.inputs.worldRotationQuat && "x" in this.inputs.worldRotationQuat) {
            this.root.quaternion.set(
              this.inputs.worldRotationQuat.x,
              this.inputs.worldRotationQuat.y,
              this.inputs.worldRotationQuat.z,
              this.inputs.worldRotationQuat.w
            );
          } else {
            const e = this.inputs.worldEulerDeg;
            this.root.rotation.set(
              T.MathUtils.degToRad(e.x || 0),
              T.MathUtils.degToRad(e.y || 0),
              T.MathUtils.degToRad(e.z || 0),
              "YXZ"
            );
          }

          this.yaw.rotation.set(0, 0, 0);
          this.pitch.rotation.set(0, 0, 0);
        }

        onInputsChanged(changes) {
          if (["near", "far", "hfovDeg", "aspect"].some(k => k in changes)) {
            this._buildFrustum();
          }
          if (["worldPosition", "worldRotationQuat", "worldEulerDeg"].some(k => k in changes)) {
            this._applyTransform();
          }
        }

        onTick(dt) {
          if (!this.inputs.panEnabled) return;
          const T = this.context.three;
          this._t = (this._t || 0) + dt;
          const amp   = T.MathUtils.degToRad(this.inputs.panAngleDeg || 60);
          const omega = (2 * Math.PI) / (this.inputs.panPeriodSec || 8);
          this.yaw.rotation.y = Math.sin(this._t * omega) * amp;
        }
      };
    });

    console.log("[ark] plugin: registered 'ark.securityCam'");
  }

  // Official plugin hook
  if (window.MP_SDK && typeof window.MP_SDK.register === "function") {
    window.MP_SDK.register(registerPlugin);
  } else {
    // Fallback (older Showcase loaders)
    window.__ark_register_plugin__ = registerPlugin;
  }
})();