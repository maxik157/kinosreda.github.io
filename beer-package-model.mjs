import * as THREE from './three.module.js';
import { analysePackagePixels, surfaceRows } from './beer-package-analysis.mjs';

function canvasFromImage(image) {
  const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
  const scale = Math.min(1, 1024 / Math.max(iw, ih));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(iw * scale)); canvas.height = Math.max(1, Math.round(ih * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function packageAtlas(profile,pixels){
  const width=1024,height=profile.height,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),out=ctx.createImageData(width,height);
  const sample=(x,y)=>{x=Math.max(0,Math.min(profile.width-1,Math.round(x)));y=Math.max(0,Math.min(height-1,Math.round(y)));const i=(y*profile.width+x)*4;return [pixels[i],pixels[i+1],pixels[i+2]];};
  const projected=new Float32Array(width),blending=new Float32Array(width);
  for(let x=0;x<width;x++){
    const theta=(x+.5)/width*Math.PI*2-Math.PI,local=((theta+Math.PI*2.5)%Math.PI)-Math.PI/2;
    projected[x]=Math.sin(local);
    // Keep the measured label artwork almost all the way to the tangent and
    // blend only the final pixels. This removes the broad foggy band that was
    // visible while rotating from the front print to the rear print.
    blending[x]=smooth((Math.abs(local)-1.46)/(Math.PI/2-1.46));
  }
  let rowIndex=0;
  for(let y=0;y<height;y++){
    while(rowIndex<profile.rows.length-1&&profile.rows[rowIndex+1].sourceY<y)rowIndex++;
    const a=profile.rows[rowIndex],b=profile.rows[Math.min(profile.rows.length-1,rowIndex+1)],t=b.sourceY===a.sourceY?0:Math.max(0,Math.min(1,(y-a.sourceY)/(b.sourceY-a.sourceY)));
    const left=a.sourceLeft*(1-t)+b.sourceLeft*t,right=a.sourceRight*(1-t)+b.sourceRight*t,middle=(left+right)/2,half=(right-left)/2;
    const edge=[];for(const f of [.12,.16,.20,.80,.84,.88])for(let dy=-3;dy<=3;dy+=3)edge.push(sample(left+(right-left)*f,y+dy));
    const join=[0,1,2].map(c=>edge.map(p=>p[c]).sort((a,b)=>a-b)[Math.floor(edge.length/2)]);
    for(let x=0;x<width;x++){
      const sx=Math.max(0,Math.min(profile.width-1,Math.round(middle+projected[x]*half))),src=(y*profile.width+sx)*4,dst=(y*width+x)*4,blend=blending[x];
      for(let c=0;c<3;c++)out.data[dst+c]=Math.round(pixels[src+c]*(1-blend)+join[c]*blend);
      out.data[dst+3]=255;
    }
  }
  ctx.putImageData(out,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;return texture;
}
function surfaceGeometry(profile){
  const segments=96,rows=surfaceRows(profile),positions=[],uvs=[],indices=[],normals=[];
  for(let j=0;j<rows.length;j++){
    const row=rows[j],near=profile.rows.filter(p=>Math.abs(p.sourceY-row.sourceY)<9);
    const meanY=near.reduce((s,p)=>s+p.y,0)/near.length,meanR=near.reduce((s,p)=>s+p.radius,0)/near.length;
    let numerator=0,denominator=0;for(const p of near){numerator+=(p.y-meanY)*(p.radius-meanR);denominator+=(p.y-meanY)**2;}const slope=denominator>1e-12?numerator/denominator:0;
    for(let i=0;i<=segments;i++){
      const angle=-Math.PI+Math.PI*2*i/segments,sin=i===segments?0:Math.sin(angle),cos=i===segments?-1:Math.cos(angle);
      positions.push(row.centerX+sin*row.radius,row.y,cos*row.radius);uvs.push(i/segments,1-(row.sourceY+.5)/profile.height);
      const n=new THREE.Vector3(sin,-slope,cos).normalize();normals.push(n.x,n.y,n.z);
      if(j<rows.length-1&&i<segments){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
export function preparePackage(image,anisotropy=4){
  const{canvas,pixels}=canvasFromImage(image),profile=analysePackagePixels(pixels,canvas.width,canvas.height);
  const texture=packageAtlas(profile,pixels);texture.anisotropy=anisotropy;
  const capY=Math.min(profile.bounds.bottom,profile.bounds.top+Math.max(1,Math.round((profile.bounds.bottom-profile.bounds.top)*.012))),capX=Math.round((profile.rows[0].sourceLeft+profile.rows[0].sourceRight)/2),capPixel=(capY*profile.width+capX)*4;
  const capColor=(pixels[capPixel]<<16)|(pixels[capPixel+1]<<8)|pixels[capPixel+2];
  return{profile,sourceCanvas:canvas,texture,capColor,geometry:surfaceGeometry(profile)};
}

export function createPackageModel(asset) {
  const { profile } = asset, bottle = profile.kind.includes('bottle'), group = new THREE.Group();
  // The complete silhouette is the surface. No independent decal or generic
  // cylinder remains behind the print, and no additional neck changes its size.
  const materialOptions = { color: 0xffffff, roughness: bottle ? .5 : .58, metalness: bottle ? .02 : .16 };
  const surface=new THREE.Mesh(asset.geometry,new THREE.MeshStandardMaterial({...materialOptions,map:asset.texture}));
  surface.name='Continuous package surface';group.add(surface);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const top = profile.rows[0], bottom = profile.rows.at(-1);
  const metal = new THREE.MeshStandardMaterial({ color: 0xb5b8bc, metalness: .8, roughness: .3 });
  const lid = bottle ? new THREE.MeshStandardMaterial({ ...materialOptions, color: asset.capColor }) : metal;
  for (const [row, topSide] of [[top, true], [bottom, false]]) {
    const disk = new THREE.Mesh(new THREE.CircleGeometry(row.radius, 64), topSide ? lid : new THREE.MeshStandardMaterial({ ...materialOptions, color: bottle ? 0x37291d : 0x919598 }));
    disk.userData.packageDisk=true;
    disk.rotation.x = topSide ? -Math.PI / 2 : Math.PI / 2;
    disk.position.set(row.centerX, topSide ? profile.modelHeight - (bottle ? 0 : top.radius * .07) : 0, 0);
    group.add(disk);
  }
  // Inset detail stays inside the measured silhouette.
  if (!bottle) {
    const tab = new THREE.Mesh(new THREE.TorusGeometry(top.radius * .22, top.radius * .045, 8, 24), metal.clone());
    tab.rotation.x = Math.PI / 2; tab.scale.z = 1.5;
    tab.position.set(top.centerX, profile.modelHeight - top.radius * .04, top.radius * .13);
    group.add(tab);
  }
  // Reconstruct swing-top clips as actual thin metal tubes measured from
  // the extra alpha intervals, with the same height and horizontal offsets.
  if (profile.accessories.length) {
    for (const side of [-1, 1]) {
      let points = [];
      const finish = () => {
        if (points.length > 2) {
          const curve = new THREE.CatmullRomCurve3(points);
          const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(160, points.length * 2), profile.unitsPerPixel * 1.1, 8, false), metal.clone());
          tube.castShadow = true; group.add(tube);
        }
        points = [];
      };
      let lastY = -10;
      for (let sy = profile.bounds.top; sy <= profile.bounds.bottom; sy++) {
        const spans = profile.accessories.filter(s => s.sourceY === sy && Math.sign((s.left + s.right - profile.bounds.left - profile.bounds.right) / 2) === side);
        if (!spans.length) { if (sy - lastY > 2) finish(); continue; }
        const span = spans[0], x = ((span.left + span.right - profile.bounds.left - profile.bounds.right) / 2) * profile.unitsPerPixel;
        const y = profile.modelHeight * (profile.bounds.bottom - sy) / (profile.bounds.bottom - profile.bounds.top);
        points.push(new THREE.Vector3(x, y, 0)); lastY = sy;
      }
      finish();
    }
  }
  group.traverse(o=>{if(o.isMesh){o.updateMatrix();o.matrixAutoUpdate=false;}});
  group.userData.packageProfile = profile;
  group.userData.packageAsset = asset;
  return group;
}

// GPU resources belong to the image asset and can be shared by room/inspection.
export function disposePackageAsset(asset) {
  asset.geometry.dispose();asset.texture.dispose();for(const geometry of asset.shelfGeometries||[])geometry.dispose();asset.shelfGeometries?.clear();
}
export function disposePackageInstance(group) {
  const asset = group.userData.packageAsset;
  group.traverse(o => {
    if (!o.isMesh) return;
    if (o.geometry !== asset?.geometry && !o.userData.sharedShelfGeometry) o.geometry.dispose();
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.dispose();
  });
}
