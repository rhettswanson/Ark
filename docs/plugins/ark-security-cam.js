// docs/plugins/ark-security-cam.js
export default function registerArkSecurityCam(sdk) {
  sdk.Scene.register('ark.securityCam', class extends sdk.Scene.Component {
    onInit() {
      this.inputs = {
        color: 0x66ff99,
        opacity: 0.6,
        position: { x: 0, y: 1.6, z: 0 },
        lookAt:   { x: 1, y: 1.6, z: 0 }
      };
      const THREE = this.context.three;

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 12),
        new THREE.MeshBasicMaterial({ color: this.inputs.color, transparent:true, opacity:0.9 })
      );
      const wedge = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 0.45, 20, 1, true),
        new THREE.MeshBasicMaterial({
          color: this.inputs.color, wireframe:true,
          transparent:true, opacity:this.inputs.opacity, depthWrite:false
        })
      );
      wedge.rotation.x = -Math.PI / 2;

      this._group = new THREE.Group();
      this._group.add(marker, wedge);
      this.context.scene.add(this._group);
    }
    onInputsUpdated() {
      if (!this._group) return;
      const p = this.inputs.position, l = this.inputs.lookAt;
      if (p) this._group.position.set(p.x, p.y, p.z);
      if (l) this._group.lookAt(l.x, l.y, l.z);
    }
    onDestroy() {
      this._group?.parent?.remove(this._group);
      this._group = null;
    }
  });

  let node = null;
  return {
    id: 'ark.securityCam',
    async onEnable() {
      const pose = await sdk.Camera.getPose();
      node = await sdk.Scene.createNode();
      const comp = node.addComponent('ark.securityCam', {});
      comp.inputs.position = { ...pose.position };
      const f = pose.forward;
      comp.inputs.lookAt = { x: pose.position.x + f.x, y: pose.position.y + f.y, z: pose.position.z + f.z };
      node.start();
    },
    onDisable() {
      try { node?.stop?.(); } catch {}
      node = null;
    }
  };
}