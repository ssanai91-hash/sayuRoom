// 선형 RGB 벽 색, 미터 단위 조명 위치(x/z는 작품 중심 기준), 라디안 단위 조사각.
const SAYU_LOOK = {
  renderer: { exposure: 1.0, toneMapping: 'ACESFilmicToneMapping' },
  wall: { low: [0.019,0.009,0.006], middle: [0.50,0.28,0.185], top: [1.18,0.80,0.53],
    halo: [0.30,0.19,0.12], strength: 1, width: 0.18, spread: 1.35, haloWidth: 0.34 },
  ceiling: { color: 0x020101, pointColor: [1,0.95,0.86], loopBrightness: 1.02, loopSize: 0.037, backgroundBrightness: 0.49 },
  room: { background: 0x080402, sky: 0xd4dce3, ground: 0x171009, hemisphere: 0.22,
    ambientColor: 0xffefe0, ambient: 0.105, bounceColor: 0xffc596, bounce: 0.30 },
  lights: {
    key: { kelvin: 3950, intensity: 9.2, position: [-0.46,3.75,2.65], angle: 0.30 },
    rim: { kelvin: 3350, intensity: 2.15, position: [0.50,3.45,-1.65], angle: 0.36 },
    fill: { kelvin: 5000, intensity: 2.0, position: [0.60,2.18,1.55], angle: 0.4 }
  },
  // ORM의 거칠기 기준 구간. 작은 값일수록 광택이 좁고 선명하다.
  statue: { reflection: 1.48, ao: 0.76, goldRoughness: [0.28,0.48], patinaRoughness: [0.68,0.94] },
  floor: { color: 0x777d7f, roughness: 0.76, reflection: 0.32 },
  platform: { color: 0x8c7d70, roughness: 0.94, reflection: 0.16 },
  pedestal: { color: 0x141516, roughness: 0.55, reflection: 0.22 },
  pedestalTop: { color: 0x252321, roughness: 0.57, reflection: 0.43 }
};
