import {
  WebGLRenderer, Scene, PerspectiveCamera, ShaderMaterial, InstancedBufferGeometry, BufferGeometry,
  BufferAttribute, Mesh, LineSegments, Points, DataTexture, Matrix4, Vector2, Vector3, Color,
  WebGLRenderTarget, DoubleSide, FrontSide, BackSide, AdditiveBlending, NormalBlending, CustomBlending,
  OneFactor, OneMinusSrcAlphaFactor, AddEquation, RepeatWrapping, ClampToEdgeWrapping, LinearFilter,
  RGBAFormat, UnsignedByteType, SRGBColorSpace, LinearSRGBColorSpace, HalfFloatType, NoToneMapping
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

window.CYV = {
  WebGLRenderer, Scene, PerspectiveCamera, ShaderMaterial, InstancedBufferGeometry, BufferGeometry,
  BufferAttribute, Mesh, LineSegments, Points, DataTexture, Matrix4, Vector2, Vector3, Color,
  WebGLRenderTarget, DoubleSide, FrontSide, BackSide, AdditiveBlending, NormalBlending, CustomBlending,
  OneFactor, OneMinusSrcAlphaFactor, AddEquation, RepeatWrapping, ClampToEdgeWrapping, LinearFilter,
  RGBAFormat, UnsignedByteType, SRGBColorSpace, LinearSRGBColorSpace, HalfFloatType, NoToneMapping,
  OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, ShaderPass
};
