// 선형 RGB 벽 색, 미터 단위 조명 위치(x/z는 작품 중심 기준), 라디안 단위 조사각.
const SAYU_LOOK = {
  renderer: { exposure: 0.98, toneMapping: 'ACESFilmicToneMapping' },
  wall: { low: [0.011,0.0052,0.0026], middle: [0.4,0.185,0.068], top: [1.48,0.86,0.36],
    halo: [0.24,0.12,0.045], strength: 1, width: 0.0442, spread: 1.5, haloWidth: 0.125 },
  ceiling: { color: 0x010101, pointColor: [0.95,0.96,1], loopBrightness: 1.35, loopSize: 0.046, backgroundBrightness: 0.685 },
  room: { background: 0x080402, sky: 0xd4dce3, ground: 0x171009, hemisphere: 0.18,
    ambientColor: 0xffefe0, ambient: 0.08, bounceColor: 0xffc596, bounce: 0.38 },
  lights: {
    key: { kelvin: 4800, intensity: 10, position: [-0.42,4.05,2.8], angle: 0.27 },
    rim: { kelvin: 3600, intensity: 1.9, position: [0.5,3.75,-1.7], angle: 0.36 },
    fill: { kelvin: 5300, intensity: 1.15, position: [0.65,2.4,1.5], angle: 0.4 }
  },
  // ORM의 거칠기 기준 구간. 작은 값일수록 광택이 좁고 선명하다.
  statue: { reflection: 1.8, ao: 0.8, goldRoughness: [0.22,0.45], patinaRoughness: [0.66,0.94] },
  floor: { color: 0x777d7f, roughness: 0.58, reflection: 0.65 },
  platform: { color: 0x8c7d70, roughness: 0.94, reflection: 0.16 },
  pedestal: { color: 0x141516, roughness: 0.48, reflection: 0.26 },
  pedestalTop: { color: 0x4a4035, roughness: 0.48, reflection: 0.75 }
};
