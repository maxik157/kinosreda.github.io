import * as THREE from './three.module.js';
const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);
export function decorateAvatar(model,style){
  const resources=[];
  if(style!=='bearded')return resources;
  model.traverse(o=>{if(/Wolf3D_Hair/.test(o.name))o.visible=false;});
  const top=model.getObjectByName('Wolf3D_Outfit_Top');
  if(top?.material){top.material=top.material.clone();top.material.color.set(0x52645d);resources.push(top.material);}
  model.updateMatrixWorld(true);model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  const head=model.getObjectByName('Wolf3D_Head'),bone=model.getObjectByName('Head');if(!head||!bone)return resources;
  const source=head.geometry,positions=source.attributes.position,normals=source.attributes.normal;
  const vertices=[];for(let i=0;i<positions.count;i++)vertices.push(head.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(head.matrixWorld));
  const bounds=new THREE.Box3().setFromPoints(vertices),h=bounds.max.y-bounds.min.y,width=bounds.max.x-bounds.min.x;
  // The source skin includes painted buzz-cut hair. Repaint only the scalp
  // UV triangles, leaving the face, eyebrows and body textures untouched.
  const scalp=document.createElement('canvas'),skinMap=head.material.map,sourceImage=skinMap.image;
  scalp.width=sourceImage.width;scalp.height=sourceImage.height;const scalpCtx=scalp.getContext('2d');scalpCtx.drawImage(sourceImage,0,0);
  const skinUV=source.attributes.uv,skinIndex=source.index,skinCount=skinIndex?skinIndex.count:positions.count;
  scalpCtx.fillStyle='#d1a18a';
  for(let k=0;k<skinCount;k+=3){
    const ids=[0,1,2].map(i=>skinIndex?skinIndex.getX(k+i):k+i),mean=ids.reduce((sum,i)=>sum+vertices[i].y,0)/3;
    const side=ids.reduce((sum,i)=>sum+Math.abs(vertices[i].x-(bounds.min.x+bounds.max.x)/2),0)/3/width;
    if((mean-bounds.min.y)/h<(side>.34?.65:.72))continue;
    scalpCtx.beginPath();for(const [n,i]of ids.entries()){const x=skinUV.getX(i)*scalp.width,y=(skinMap.flipY?1-skinUV.getY(i):skinUV.getY(i))*scalp.height;if(n===0)scalpCtx.moveTo(x,y);else scalpCtx.lineTo(x,y);}scalpCtx.closePath();scalpCtx.fill();scalpCtx.strokeStyle='#d1a18a';scalpCtx.lineWidth=1.5;scalpCtx.stroke();
  }
  const scalpMap=new THREE.CanvasTexture(scalp);scalpMap.flipY=skinMap.flipY;scalpMap.colorSpace=THREE.SRGBColorSpace;head.material=head.material.clone();head.material.map=scalpMap;resources.push(scalpMap,head.material);
  const out=[],colors=[],uv=[],index=source.index,count=index?index.count:positions.count;
  const alpha=p=>{
    const y=(p.y-bounds.min.y)/h,x=Math.abs((p.x-(bounds.min.x+bounds.max.x)/2)/width),z=(p.z-bounds.min.z)/(bounds.max.z-bounds.min.z);
    const cheekTop=.48+Math.min(.10,x*.24);
    let a=smooth(.23,.28,y)*(1-smooth(cheekTop-.035,cheekTop,y))*smooth(.40,.54,z)*(1-smooth(.45,.5,x));
    // Leave the mouth opening and both lips visible between beard and moustache.
    const lips=(1-smooth(.145,.20,x))*smooth(.40,.425,y)*(1-smooth(.49,.515,y));
    const nose=(1-smooth(.115,.18,x))*smooth(.50,.54,y);return a*(1-lips)*(1-nose);
  };
  for(let k=0;k<count;k+=3){
    const ids=[0,1,2].map(i=>index?index.getX(k+i):k+i);if(ids.every(i=>alpha(vertices[i])<.01))continue;
    for(const i of ids){
      const p=vertices[i],y=(p.y-bounds.min.y)/h,a=alpha(p),n=new THREE.Vector3().fromBufferAttribute(normals,i).transformDirection(head.matrixWorld);
      const shell=p.clone().addScaledVector(n,.003+(1-smooth(.28,.50,y))*.011),local=bone.worldToLocal(shell);
      out.push(local.x,local.y,local.z);colors.push(1,1,1,a);uv.push((p.x-bounds.min.x)/width,(p.y-bounds.min.y)/h);
    }
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(256,256);let seed=83;
  for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const c=12+seed%15;pixels.data.set([c,c,c,255],i);}ctx.putImageData(pixels,0,0);
  ctx.strokeStyle='rgba(90,86,80,.18)';ctx.lineWidth=.6;for(let i=0;i<900;i++){const x=(i*79)%256,y=(i*47)%256;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(i)*2,y+8+i%8);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(out,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({map:texture,vertexColors:true,transparent:true,alphaTest:.1,roughness:.96,depthWrite:true});
  const beard=new THREE.Mesh(geometry,mat);beard.name='Fitted black beard and moustache';beard.castShadow=true;bone.add(beard);resources.push(geometry,mat,texture);return resources;
}
