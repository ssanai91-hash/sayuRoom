// 선형 RGB 벽 색, 미터 단위 조명 위치(x/z는 작품 중심 기준), 라디안 단위 조사각.
const SAYU_LOOK = {
  renderer: { exposure: 1.0, toneMapping: 'ACESFilmicToneMapping' },
  wall: { low: [0.010,0.0045,0.003], middle: [0.37,0.19,0.12], top: [1.18,0.80,0.53],
    halo: [0.30,0.19,0.12], strength: 1, width: 0.15, spread: 0.96, haloWidth: 0.26 },
  ceiling: { color: 0x020101, pointColor: [1,0.95,0.86], loopBrightness: 0.90, loopSize: 0.037, backgroundBrightness: 0.30 },
  room: { background: 0x080402, sky: 0xd4dce3, ground: 0x171009, hemisphere: 0.17,
    ambientColor: 0xffefe0, ambient: 0.085, bounceColor: 0xffc596, bounce: 0.19 },
  lights: {
    key: { kelvin: 3950, intensity: 13.8, position: [-0.48,3.47,2.32], angle: 0.46, penumbra: 0.38, targetHeight: 0.62 },
    rim: { kelvin: 3350, intensity: 2.75, position: [0.50,3.45,-1.65], angle: 0.44, penumbra: 0.55, targetHeight: 0.55 },
    fill: { kelvin: 5000, intensity: 3.25, position: [0.64,2.22,1.55], angle: 0.50, penumbra: 0.55, targetHeight: 0.72 }
  },
  // ORM의 거칠기 기준 구간. 작은 값일수록 광택이 좁고 선명하다.
  statue: { reflection: 1.48, ao: 0.76, goldRoughness: [0.28,0.48], patinaRoughness: [0.68,0.94] },
  floor: { color: 0x626461, roughness: 0.80, reflection: 0.23 },
  platform: { color: 0x8c7d70, roughness: 0.94, reflection: 0.16 },
  pedestal: { color: 0x141516, roughness: 0.55, reflection: 0.22 },
  pedestalTop: { color: 0x252321, roughness: 0.57, reflection: 0.43 }
};
