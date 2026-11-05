// 선형 RGB 벽 색, 미터 단위 조명 위치(x/z는 작품 중심 기준), 라디안 단위 조사각.
const SAYU_LOOK = {
  renderer: { exposure: 1.0, toneMapping: 'ACESFilmicToneMapping' },
  wall: { low: [0.010,0.0045,0.003], middle: [0.37,0.19,0.12], top: [1.18,0.80,0.53],
    halo: [0.30,0.19,0.12], strength: 1, width: 0.15, spread: 0.96, haloWidth: 0.26 },
  ceiling: { color: 0x020101, pointColor: [1,0.95,0.86], loopBrightness: 0.90, loopSize: 0.037, backgroundBrightness: 0.30 },
  room: { background: 0x080402, sky: 0xd4dce3, ground: 0x171009, hemisphere: 0.17,
    ambientColor: 0xffefe0, ambient: 0.085, bounceColor: 0xffc596, bounce: 0.19 },
  // 금속 반사용 sRGB 환경 계수. 벽의 따뜻한 색과 별도로 과한 주황 반사를 낮춘다.
  reflectionEnvironment: { base: [8,9,10], band: [84,80,74], softbox: [170,182,196] },
  lights: {
    key: { kelvin: 6200, tint: [.96,1,1.04], intensity: 10.6, position: [-1.05,3.70,1.90], angle: 0.50, penumbra: 0.56, targetHeight: 0.66 },
    rim: { kelvin: 6500, tint: [.96,1,1.04], intensity: 2.20, position: [0.50,3.45,-1.65], angle: 0.44, penumbra: 0.55, targetHeight: 0.55 },
    fill: { kelvin: 6500, tint: [.94,1,1.05], intensity: 1.75, position: [0.95,2.60,1.30], angle: 0.50, penumbra: 0.62, targetHeight: 0.72 }
  },
  // ORM의 거칠기 기준 구간. 작은 값일수록 광택이 좁고 선명하다.
  statue: { reflection: 1.05, ao: 0.84, goldRoughness: [0.28,0.48], patinaRoughness: [0.68,0.94],
    // 왼쪽은 원래 금박의 차이를 유지하고, 오른쪽은 원본 명암·결을 살려 회녹색 청동으로 보정한다.
    colorProfiles: [
      { saturation: .85, tint: [.98,1,1.02], gain: 1, metalness: 1, neutralHighlights: 0 },
      { saturation: .14, tint: [.72,.98,.98], gain: .96, metalness: .86, neutralHighlights: .42 }
    ]
  },
  floor: { color: 0x626461, roughness: 0.80, reflection: 0.23 },
  platform: { color: 0x8c7d70, roughness: 0.94, reflection: 0.16 },
  pedestal: { color: 0x030405, roughness: 0.96, reflection: 0.035, metalness: 0, reflectivity: 0.08, clearcoat: 0 },
  pedestalTop: { color: 0x3e322d, roughness: 0.91, reflection: 0.06, metalness: 0, reflectivity: 0.10, clearcoat: 0 }
};
