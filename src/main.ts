// Ensure the web component is registered so <matterport-viewer> works
import '@matterport/webcomponent';

// Import your local component
import { securityCameraType, makeSecurityCamera } from './SecurityCamera';

const viewer = document.getElementById('mp-viewer') as any;

viewer.addEventListener('mpSdkPlaying', async (evt: any) => {
  const mpSdk = evt.detail.mpSdk;
  console.log('✅ SDK connected!', mpSdk);

  // Register & create camera component
  mpSdk.Scene.register(securityCameraType, makeSecurityCamera);
  const node = await mpSdk.Scene.createNode();
  const securityCam = node.addComponent(securityCameraType) as any;

  // ── Lock to your most recent logged position/rotation ─────────────
  securityCam.inputs.localPosition = {
    x:  1.5880179721898975,
    y:  2.5187550074505786,
    z: -2.6467580661514827,
  };
  securityCam.inputs.localRotation = {
    x: -0.488692910958841223,   // pitch (radians)
    y:  0.810241501105996,      // yaw   (radians) — this is your center before pan helpers
    z:  0,
  };

  // You can tweak these live with the toolbar, this is just initial
  securityCam.inputs.horizontalFOV = 55; // narrower to keep sweep inside the room
  securityCam.inputs.nearPlane = 0.12;
  securityCam.inputs.farPlane  = 10;
  securityCam.inputs.panEnabled  = true;
  securityCam.inputs.panAngleDeg = 60;   // the toolbar "Apply" will compute an exact span
  securityCam.inputs.panPeriodSec = 10;
  securityCam.inputs.color = 0x00ff77;

  await node.start();
  (window as any).sec = securityCam;  // expose for dev helpers
  console.log('📡 Security camera registered & started.');

  // ───────────────────────── Toolbar ─────────────────────────
  // Minimal green toolbar with helpers
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    zIndex: '99999',
    display: 'flex',
    gap: '8px',
    padding: '8px',
    borderRadius: '10px',
    background: 'rgba(0, 64, 32, 0.85)',
    boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
    color: '#d9ffe8',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: '14px',
    lineHeight: '1',
  });
  document.body.appendChild(bar);

  const button = (label: string, cb: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      background: '#0bbd74',
      color: '#00351f',
      border: 'none',
      padding: '6px 10px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: 600,
    });
    b.onmouseenter = () => (b.style.filter = 'brightness(1.06)');
    b.onmouseleave = () => (b.style.filter = '');
    b.onclick = cb;
    bar.appendChild(b);
    return b;
  };

  const sec = (window as any).sec;

  // --- Placement & simple transforms --------------------------------
  button('Place', () => {
    // Nudge forward relative to current facing (quick sanity placement)
    const THREE = (mpSdk as any).THREE || (window as any).THREE;
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(sec.inputs.localRotation.x, sec.inputs.localRotation.y, sec.inputs.localRotation.z, 'YXZ')
    );
    sec.inputs.localPosition = {
      x: sec.inputs.localPosition.x + fwd.x * 0.25,
      y: sec.inputs.localPosition.y,
      z: sec.inputs.localPosition.z + fwd.z * 0.25,
    };
  });

  button('Y+', () => {
    sec.inputs.localPosition = {
      ...sec.inputs.localPosition,
      y: sec.inputs.localPosition.y + 0.05,
    };
  });

  button('Y-', () => {
    sec.inputs.localPosition = {
      ...sec.inputs.localPosition,
      y: sec.inputs.localPosition.y - 0.05,
    };
  });

  button('Yaw+', () => {
    sec.inputs.localRotation = {
      ...sec.inputs.localRotation,
      y: sec.inputs.localRotation.y + (Math.PI / 180) * 2,
    };
  });

  button('Yaw-', () => {
    sec.inputs.localRotation = {
      ...sec.inputs.localRotation,
      y: sec.inputs.localRotation.y - (Math.PI / 180) * 2,
    };
  });

  button('Pitch+', () => {
    sec.inputs.localRotation = {
      ...sec.inputs.localRotation,
      x: sec.inputs.localRotation.x + (Math.PI / 180) * 2,
    };
  });

  button('Pitch-', () => {
    sec.inputs.localRotation = {
      ...sec.inputs.localRotation,
      x: sec.inputs.localRotation.x - (Math.PI / 180) * 2,
    };
  });

  button('Pan On/Off', () => {
    sec.inputs.panEnabled = !sec.inputs.panEnabled;
    console.log('panEnabled:', sec.inputs.panEnabled);
  });

  button('Copy', () => {
    console.log('securityCam.inputs =', JSON.parse(JSON.stringify(sec.inputs)));
  });

  // ── Pan bound helpers: Set L / Set R / Apply + FOV± Depth± ─────────
  let leftYaw: number | null = null;
  let rightYaw: number | null = null;

  const THREE = (mpSdk as any).THREE || (window as any).THREE;

  button('Set L', () => {
    leftYaw = sec?.yawGroup?.rotation?.y ?? sec?.inputs?.localRotation?.y ?? 0;
    console.log('[pan] left yaw =', leftYaw);
  });

  button('Set R', () => {
    rightYaw = sec?.yawGroup?.rotation?.y ?? sec?.inputs?.localRotation?.y ?? 0;
    console.log('[pan] right yaw =', rightYaw);
  });

  button('Apply', () => {
    if (leftYaw == null || rightYaw == null) {
      console.warn('[pan] set both L and R first');
      return;
    }
    let L = leftYaw, R = rightYaw;
    if (R < L) [L, R] = [R, L];

    const margin = THREE.MathUtils.degToRad(2); // 2° safety margin each side
    L += margin; R -= margin;

    const center = (L + R) / 2;
    const spanRad = Math.max(0, R - L);
    const spanDeg = THREE.MathUtils.radToDeg(spanRad);

    sec.inputs.localRotation = { ...sec.inputs.localRotation, y: center };
    sec.inputs.panAngleDeg = spanDeg;
    sec.inputs.panEnabled = true;

    console.log('[pan] center =', center, ' spanDeg =', spanDeg);
  });

  button('FOV-', () => {
    sec.inputs.horizontalFOV = Math.max(20, sec.inputs.horizontalFOV - 5);
    console.log('[fov]', sec.inputs.horizontalFOV);
  });

  button('FOV+', () => {
    sec.inputs.horizontalFOV = Math.min(140, sec.inputs.horizontalFOV + 5);
    console.log('[fov]', sec.inputs.horizontalFOV);
  });

  button('Depth-', () => {
    sec.inputs.farPlane = Math.max(sec.inputs.nearPlane + 0.1, sec.inputs.farPlane - 0.5);
    console.log('[depth]', sec.inputs.farPlane);
  });

  button('Depth+', () => {
    sec.inputs.farPlane = sec.inputs.farPlane + 0.5;
    console.log('[depth]', sec.inputs.farPlane);
  });

}); // mpSdkPlaying