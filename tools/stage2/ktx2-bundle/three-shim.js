// esbuild가 'three'를 페이지의 전역 THREE(r128 UMD)로 연결하도록 하는 얇은 다리
const T = window.THREE;
export const CompressedTexture = T.CompressedTexture, CompressedTextureLoader = T.CompressedTextureLoader,
  FileLoader = T.FileLoader, LinearEncoding = T.LinearEncoding, sRGBEncoding = T.sRGBEncoding,
  Loader = T.Loader, LinearFilter = T.LinearFilter, LinearMipmapLinearFilter = T.LinearMipmapLinearFilter,
  RGBAFormat = T.RGBAFormat, RGBA_ASTC_4x4_Format = T.RGBA_ASTC_4x4_Format, RGBA_BPTC_Format = T.RGBA_BPTC_Format,
  RGBA_ETC2_EAC_Format = T.RGBA_ETC2_EAC_Format, RGBA_PVRTC_4BPPV1_Format = T.RGBA_PVRTC_4BPPV1_Format,
  RGBA_S3TC_DXT5_Format = T.RGBA_S3TC_DXT5_Format, RGB_ETC1_Format = T.RGB_ETC1_Format,
  RGB_ETC2_Format = T.RGB_ETC2_Format, RGB_PVRTC_4BPPV1_Format = T.RGB_PVRTC_4BPPV1_Format,
  RGB_S3TC_DXT1_Format = T.RGB_S3TC_DXT1_Format, UnsignedByteType = T.UnsignedByteType;
