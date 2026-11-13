import {ShaderChunk} from './three.module.js';

// Three otherwise evaluates the full BRDF even when attenuation is exactly 0.
// Skip it outside the light's real cutoff; the resulting light is unchanged.
export function optimizeLocalLights(){
 const chunk=ShaderChunk.lights_fragment_begin;if(chunk.includes('localLightDelta'))return;
 const start='pointLight = pointLights[ i ];',end='\n\t}\n\t#pragma unroll_loop_end';
 const a=chunk.indexOf(start),b=chunk.indexOf(end,a);if(a<0||b<0)throw new Error('Unsupported point-light shader chunk');
 ShaderChunk.lights_fragment_begin=chunk.slice(0,a)+start+`
        { vec3 localLightDelta=pointLight.position-geometryPosition;
        if(any(notEqual(pointLight.color,vec3(0.0))) &&
           (pointLight.distance<=0.0 || dot(localLightDelta,localLightDelta)<pointLight.distance*pointLight.distance)) {
 `+chunk.slice(a+start.length,b)+'\n        }}'+chunk.slice(b);
}
