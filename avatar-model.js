import * as THREE from './vendor/three.module.min.js';

// Original, fully volumetric character geometry inspired by the supplied avatar.
// The supplied portrait is baked onto closed 3D surfaces as a color texture.
// Head rotation happens in world space; every side has modeled volume.
export function createAvatar(portraitTexture) {
  const root = new THREE.Group();
  root.name = 'Lenish';
  const head = new THREE.Group();
  head.name = 'Head-neck-pivot';
  head.position.y = -0.28;
  root.add(head);
  const skin = new THREE.MeshStandardMaterial({ color: '#b77c55', roughness: 0.62 });
  const innerEar = new THREE.MeshStandardMaterial({ color: '#a36848', roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: '#211914', roughness: 0.87 });
  const hairLight = new THREE.MeshStandardMaterial({ color: '#312219', roughness: 0.89 });
  const hairDetail = new THREE.MeshStandardMaterial({ color: '#30221b', roughness: 0.92 });
  const frame = new THREE.MeshStandardMaterial({ color: '#242227', roughness: 0.29, metalness: 0.22 });
  const shirt = new THREE.MeshStandardMaterial({ color: '#262a2d', roughness: 0.94 });
  const collarMat = new THREE.MeshStandardMaterial({ color: '#1a1f22', roughness: 1 });
  const sphere = new THREE.SphereGeometry(1, 40, 32);
  function ellipsoid(parent, mat, position, scale, name = '') {
    const mesh = new THREE.Mesh(sphere, mat);
    mesh.position.set(...position); mesh.scale.set(...scale);
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function tube(parent, points, radius, mat, closed = false, segments = 48) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'catmullrom', 0.5);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 8, closed), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x-a)/(b-a), 0, 1); return t*t*(3-2*t); };
  const gauss = (x, y, cx, cy, wx, wy) => Math.exp(-(((x-cx)/wx)**2)-(((y-cy)/wy)**2));

  function projectedMaterial(baseColor) {
    const mat = new THREE.MeshStandardMaterial({ map: portraitTexture, roughness: .88 });
    mat.onBeforeCompile = shader => {
      shader.uniforms.baseColor = {value: new THREE.Color(baseColor)};
      shader.vertexShader = 'attribute float projection; varying float vProjection;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvProjection = projection;');
      shader.fragmentShader = 'uniform vec3 baseColor; varying float vProjection;\n' + shader.fragmentShader;
      const background = baseColor === '#241914'
        ? 'float luminance = dot(diffuseColor.rgb, vec3(.2126,.7152,.0722)); float valid = 1.0 - smoothstep(.065,.20,luminance);'
        : 'float brightness = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)); float valid = 1.0 - smoothstep(.30,.55,brightness);';
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + background + '\ndiffuseColor.rgb = mix(baseColor, diffuseColor.rgb, vProjection * valid);');
    };
    mat.customProgramCacheKey = () => 'portrait-projection-' + baseColor;
    return mat;
  }
  const faceMaterial = projectedMaterial('#b77c55');
  const hairMaterial = projectedMaterial('#241914');
  function projectUV(geometry, xScale, yOffset, yScale) {
    const p=geometry.attributes.position; const uv=geometry.attributes.uv;
    const weights=[];
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      uv.setXY(i,.5+x*xScale,1-(yOffset-y*yScale));
      weights.push(smooth(.04,.40,z));
    }
    geometry.setAttribute('projection',new THREE.Float32BufferAttribute(weights,1));
  }
  // Continuous sculpted head. Nose, cheekbones and eye sockets share the mesh.
  const faceGeometry = new THREE.SphereGeometry(1, 128, 104);
  const positions = faceGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const nx = positions.getX(i), ny = positions.getY(i), nz = positions.getZ(i);
    const jaw = 0.77 + 0.23 * smooth(-0.95, -0.15, ny);
    const x = nx * 0.76 * jaw;
    const y = ny * 1.045 + 0.94;
    let z = nz * 0.64;
    if (nz > 0) {
      const front = smooth(0, 0.45, nz);
      z += front * (
        0.16 * gauss(x,y,0,1.03,0.085,0.31) +
        0.245 * gauss(x,y,0,0.79,0.135,0.12) +
        0.075 * gauss(x,y,-0.115,0.75,0.06,0.065) +
        0.075 * gauss(x,y,0.115,0.75,0.06,0.065) +
        0.053 * gauss(x,y,-0.39,0.82,0.22,0.2) +
        0.053 * gauss(x,y,0.39,0.82,0.22,0.2) -
        0.055 * gauss(x,y,-0.29,1.095,0.185,0.12) -
        0.055 * gauss(x,y,0.29,1.095,0.185,0.12) +
        0.035 * gauss(x,y,0,0.43,0.3,0.18)
      );
    }
    positions.setXYZ(i, x, y, z);
  }
  faceGeometry.computeVertexNormals();
  projectUV(faceGeometry,.295,.744,.278);
  const face = new THREE.Mesh(faceGeometry, faceMaterial);
  face.name = 'Sculpted face'; face.castShadow = true; face.receiveShadow = true; head.add(face);

  // Neck and a tailored, closed-bottom bust; the shoulders remain stationary.
  ellipsoid(root, skin, [0,-0.23,-0.01], [0.31,0.53,0.235], 'Neck');
  const bodyPoints = [new THREE.Vector2(0,-1.5),new THREE.Vector2(1.2,-1.5),new THREE.Vector2(1.34,-1.43),new THREE.Vector2(1.38,-1.27),new THREE.Vector2(1.28,-1.05),new THREE.Vector2(1.03,-0.81),new THREE.Vector2(0.61,-0.65),new THREE.Vector2(0.36,-0.47)];
  const body = new THREE.Mesh(new THREE.LatheGeometry(bodyPoints,80),shirt);
  body.scale.z=0.70; body.castShadow=true; body.receiveShadow=true; body.name='Shoulders'; root.add(body);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.362,0.04,12,80),collarMat);
  collar.rotation.x=Math.PI/2; collar.position.y=-0.477; collar.scale.y=0.73; root.add(collar);
  // Very restrained fabric seam across each shoulder.
  for(const side of [-1,1]) tube(root,[[side*.55,-.66,.24],[side*.82,-.8,.32],[side*1.02,-.96,.38],[side*1.17,-1.16,.4]],.008,collarMat);

  for (const side of [-1,1]) {
    const ear=ellipsoid(head,skin,[side*.72,.91,-.015],[.125,.245,.15],'Ear'); ear.rotation.z=-side*.12;
    ellipsoid(head,innerEar,[side*.775,.94,.092],[.054,.14,.025]);
    tube(head,[[side*.76,.82,.11],[side*.73,.96,.13],[side*.78,1.06,.115]],.018,skin,false,18);
    ellipsoid(head,innerEar,[side*.093,.721,.786],[.027,.014,.013],'Nostril');
  }


  // The front lens/frame detail is preserved in the portrait material. Modeled
  // temples extend back over the ears and remain visible at side angles.
  for(const side of [-1,1]) tube(head,[[side*.56,1.10,.52],[side*.69,1.11,.35],[side*.75,1.07,.02],[side*.73,.99,-.14]],.017,frame,false,36);

  // A swept scalp and layered curl locks form a full 360-degree silhouette.
  const hv=[],hu=[],hi=[]; const rows=70,cols=120;
  for(let r=0;r<=rows;r++) for(let c=0;c<=cols;c++) {
    const phi=c/cols*Math.PI*2;
    const front=Math.max(0,Math.sin(phi));
    const boundary=.58+.93*smooth(.05,.8,front);
    const end=Math.acos((boundary-1.08)/1.15);
    const theta=r/rows*end;
    const curl=.018*Math.sin(phi*13+theta*17)+.013*Math.sin(phi*19-theta*11);
    const x=Math.cos(phi)*Math.sin(theta)*(.865+curl);
    const y=1.08+Math.cos(theta)*(1.15+curl);
    const z=Math.sin(phi)*Math.sin(theta)*(.755+curl);
    hv.push(x,y,z);hu.push(.5+x*.375,1-(1.015-y*.42));
    if(r<rows&&c<cols){const a=r*(cols+1)+c,b=a+cols+1;hi.push(a,a+1,b,a+1,b+1,b);}
  }
  const scalpGeometry=new THREE.BufferGeometry();
  scalpGeometry.setAttribute('position',new THREE.Float32BufferAttribute(hv,3));
  scalpGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(hu,2));
  scalpGeometry.setIndex(hi);scalpGeometry.computeVertexNormals();
  projectUV(scalpGeometry,.315,1.015,.42);
  const scalp=new THREE.Mesh(scalpGeometry,hairMaterial);scalp.castShadow=true;scalp.receiveShadow=true;head.add(scalp);
  let seed=31;
  const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  function lock(center, normal, size, spin, length=1.0) {
    const group=new THREE.Group(); group.position.copy(center);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal.normalize());
    group.rotateZ(spin); head.add(group);
    const points=[];
    for(let i=0;i<=36;i++){
      const t=i/36; const angle=t*Math.PI*1.72;
      const radius=size*(1-.49*t);
      points.push([Math.cos(angle)*radius,Math.sin(angle)*radius*length,(Math.sin(t*Math.PI)*.075)]);
    }
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    // Tapered tube makes each lock a sculpted curl with a fine tip.
    const geom=new THREE.TubeGeometry(curve,36,size*.36,9,false);
    const attr=geom.attributes.position;
    for(let i=0;i<=36;i++){
      const t=i/36;const center=curve.getPointAt(t);const taper=.25+.75*Math.sin(Math.PI*(.12+.82*t))**.65;
      for(let j=0;j<=9;j++){
        const k=i*10+j;const p=new THREE.Vector3().fromBufferAttribute(attr,k);
        p.sub(center).multiplyScalar(taper).add(center);attr.setXYZ(k,p.x,p.y,p.z);
      }
    }
    geom.computeVertexNormals();
    const curl=new THREE.Mesh(geom,random()>.7?hairLight:hair);curl.castShadow=true;curl.receiveShadow=true;group.add(curl);
    const detail=points.map(p=>[p[0],p[1],p[2]+size*.25]);
    tube(group,detail,.004,hairDetail,false,36);
  }
  for(const [polar,count] of [[.3,8],[.7,12],[1.15,15],[1.5,12],[1.75,10]]) {
    for(let i=0;i<count;i++){
      const phi=i/count*Math.PI*2+(polar%0.4);
      const normal=new THREE.Vector3(Math.sin(polar)*Math.cos(phi),Math.cos(polar),Math.sin(polar)*Math.sin(phi));
      if(normal.z>.16) continue;
      const center=new THREE.Vector3(normal.x*.85,1.08+normal.y*1.15,normal.z*.76);
      lock(center,normal,.09+random()*.045,random()*Math.PI*2,.85+random()*.3);
    }
  }
  return {root,head};
}
