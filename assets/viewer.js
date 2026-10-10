import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const baseColors = [[0.20,0.64,0.86],[0.91,0.43,0.26]];
const contactColor = [1,0.08,0.24];
const arrayTypes = { '<f4': Float32Array, '<u2': Uint16Array, '|u1': Uint8Array, '<u4': Uint32Array };

export class ReconstructionViewer {
  constructor({playbackRate=1}={}) {
    this.playbackRate=playbackRate;
    this.canvas = $('scene-canvas');
    this.renderer = new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setClearColor(0x17202b);
    const pointImage=document.createElement('canvas');pointImage.width=64;pointImage.height=64;
    const pointContext=pointImage.getContext('2d');pointContext.fillStyle='#fff';pointContext.beginPath();pointContext.arc(32,32,29,0,Math.PI*2);pointContext.fill();
    this.pointTexture=new THREE.CanvasTexture(pointImage);
    this.colorLUT=Array.from({length:256},(_,i)=>{const c=i/255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);});
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45,1,0.001,1000); this.camera.up.set(0,-1,0);
    this.controls = new OrbitControls(this.camera,this.canvas); this.controls.enableDamping=true; this.controls.dampingFactor=0.09;
    this.scene.add(new THREE.AmbientLight(0xffffff,2.0));
    const light = new THREE.DirectionalLight(0xffffff,2.2); light.position.set(-1,-2,-1); this.scene.add(light);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.frame=0;this.playing=false;this.lastStep=0;this.request=0;
    this.resizeObserver=new ResizeObserver(() => this.resize());this.resizeObserver.observe(this.canvas.parentElement);this.resize();
    $('scene-play').addEventListener('click',() => { this.playing=!this.playing;this.lastStep=performance.now();$('scene-play').textContent=this.playing?'Pause':'Play'; });
    $('scene-time').addEventListener('input',() => { this.frame=Number($('scene-time').value);this.update(); });
    for (const id of ['show-points','show-contact','show-camera','accumulate']) $(id).addEventListener('change',() => this.update());
    $('point-size').addEventListener('input',()=>{if(this.points)this.points.material.size=Number($('point-size').value);});
    $('fit-scene').addEventListener('click',() => this.fit(false));
    $('fit-hands').addEventListener('click',() => this.fit(true));
    $('reset-view').addEventListener('click',() => this.fit('interaction'));
    this.canvas.addEventListener('keydown',(event) => {
      if (event.key === ' '){event.preventDefault();$('scene-play').click();}
      if (['ArrowLeft','ArrowRight'].includes(event.key)&&this.meta){event.preventDefault();this.frame=(this.frame+(event.key==='ArrowRight'?1:-1)+this.meta.frames)%this.meta.frames;this.update();}
    });
    document.addEventListener('visibilitychange',() => { if(document.hidden){this.playing=false;$('scene-play').textContent='Play';} });
    const animate=(now) => {
      this.animation=requestAnimationFrame(animate);
      if(!this.visible)return;
      if(this.meta&&this.playing){
        const frameDuration=1000/(this.meta.fps*this.playbackRate);
        const steps=Math.floor((now-this.lastStep)/frameDuration);
        if(steps>0){this.frame=(this.frame+steps)%this.meta.frames;this.lastStep+=steps*frameDuration;this.update();}
      }
      this.controls.update();this.renderer.render(this.scene,this.camera);
    };
    this.visible=true;this.visibilityObserver=new IntersectionObserver((entries)=>{this.visible=entries[0].isIntersecting;this.lastStep=performance.now();},{threshold:0});this.visibilityObserver.observe(this.canvas);
    this.animation=requestAnimationFrame(animate);
  }
  resize(){const {width,height}=this.canvas.parentElement.getBoundingClientRect();this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  clear(){for(const obj of [...this.group.children]){obj.geometry?.dispose();obj.material?.dispose();this.group.remove(obj);}}
  async load(id){
    const request=++this.request;
    this.abort?.abort();this.abort=new AbortController();
    this.playing=false;$('scene-play').textContent='Play';$('scene-status').hidden=false;$('scene-status').textContent='Loading predicted geometry…';
    try{
      const directory=`assets/media/${id}/`;
      const r=await fetch(directory+'scene.json',{signal:this.abort.signal});if(!r.ok)throw new Error('Scene metadata unavailable');
      const meta=await r.json();
      const b=await fetch(directory+meta.buffer,{signal:this.abort.signal});if(!b.ok)throw new Error('Scene buffer unavailable');
      const buffer=await b.arrayBuffer();if(this.request!==request)return;
      const arrays={};
      for(const [key,info] of Object.entries(meta.arrays)){
        const Type=arrayTypes[info.dtype];if(!Type)throw new Error('Unsupported array type');
        const length=info.shape.reduce((a,b)=>a*b,1);
        if(info.byteOffset+info.bytes>buffer.byteLength||length*Type.BYTES_PER_ELEMENT!==info.bytes)throw new Error('Invalid geometry buffer');
        arrays[key]=new Type(buffer,info.byteOffset,length);
      }
      this.clear();this.meta=meta;this.data=arrays;this.frame=0;
      for(let frame=0;frame<meta.frames;frame++)if(arrays.valid[frame*2]||arrays.valid[frame*2+1]){this.frame=frame;break;}
      const n=arrays.pointCounts[0];let brightness=0;
      for(let i=0;i<n;i++)brightness+=arrays.colors[i*3]*.2126+arrays.colors[i*3+1]*.7152+arrays.colors[i*3+2]*.0722;
      this.darkBackground=brightness/Math.max(n,1)>=150;
      this.renderer.setClearColor(this.darkBackground?0x17202b:0xe9eef3);
      this.hands=[];const faceCount=meta.arrays.faces.shape[1]*3;
      for(let side=0;side<2;side++){
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(778*3),3));
        geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(778*3),3));
        geometry.setIndex(new THREE.BufferAttribute(arrays.faces.slice(side*faceCount,(side+1)*faceCount),1));
        const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));this.group.add(mesh);this.hands.push(mesh);
      }
      const capacity=meta.arrays.points.shape[1]*Math.min(meta.frames,12);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(capacity*3),3));geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(capacity*3),3));
      this.points=new THREE.Points(geometry,new THREE.PointsMaterial({size:Number($('point-size').value),vertexColors:true,sizeAttenuation:false,map:this.pointTexture,alphaTest:0.3}));this.points.frustumCulled=false;this.group.add(this.points);
      this.path=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:this.darkBackground?0x85b9ca:0x316653}));this.group.add(this.path);
      this.frustum=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:this.darkBackground?0xb3d4df:0x183a2c}));this.group.add(this.frustum);
      $('scene-time').max=String(meta.frames-1);$('scene-time').value='0';
      this.update();this.fit('interaction');$('scene-status').hidden=true;
    }catch(error){if(error.name==='AbortError')return;$('scene-status').hidden=false;$('scene-status').textContent='This reconstruction could not load. Please reload or select another sequence.';console.warn(error.message);}
  }
  cameraMatrix(frame){return new THREE.Matrix4().fromArray(this.data.cameras,frame*16).transpose();}
  update(){
    if(!this.meta)return;
    const d=this.data,t=this.frame;
    for(let side=0;side<2;side++){
      const mesh=this.hands[side];mesh.visible=Boolean(d.valid[t*2+side]);
      const vertices=d.vertices.subarray((t*2+side)*778*3,(t*2+side+1)*778*3);mesh.geometry.attributes.position.array.set(vertices);mesh.geometry.attributes.position.needsUpdate=true;
      const colors=mesh.geometry.attributes.color.array;
      for(let i=0;i<778;i++){const p=$('show-contact').checked?Math.max(0,Math.min(1,d.contact[(t*2+side)*778+i])):0;for(let j=0;j<3;j++)colors[i*3+j]=baseColors[side][j]*(1-p)+contactColor[j]*p;}
      mesh.geometry.attributes.color.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
    }
    const cap=this.meta.arrays.points.shape[1];let count=0;
    const samples=$('accumulate').checked?Math.min(t+1,12):1;
    const times=samples===1?[t]:Array.from({length:samples},(_,i)=>Math.round(i*t/(samples-1)));
    for(const k of times){const n=d.pointCounts[k];this.points.geometry.attributes.position.array.set(d.points.subarray(k*cap*3,k*cap*3+n*3),count*3);const c=this.points.geometry.attributes.color.array;for(let j=0;j<n*3;j++)c[count*3+j]=this.colorLUT[d.colors[k*cap*3+j]];count+=n;}
    this.points.geometry.attributes.position.needsUpdate=true;this.points.geometry.attributes.color.needsUpdate=true;this.points.geometry.setDrawRange(0,count);this.points.visible=$('show-points').checked;
    const path=[];for(let k=0;k<=t;k++){path.push(d.cameras[k*16+3],d.cameras[k*16+7],d.cameras[k*16+11]);}
    this.path.geometry.setAttribute('position',new THREE.Float32BufferAttribute(path,3));this.path.geometry.computeBoundingSphere();this.path.visible=$('show-camera').checked;
    const m=this.cameraMatrix(t);const local=[[0,0,0],[-.035,-.025,.055],[.035,-.025,.055],[.035,.025,.055],[-.035,.025,.055]];
    const vertices=local.map((v)=>new THREE.Vector3(...v).applyMatrix4(m));const segments=[];
    for(const [a,b] of [[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1]])segments.push(...vertices[a].toArray(),...vertices[b].toArray());
    this.frustum.geometry.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));this.frustum.geometry.computeBoundingSphere();this.frustum.visible=$('show-camera').checked;
    $('scene-time').value=String(t);$('scene-frame').textContent=`Frame ${this.meta.sourceFrameIds[t]} · ${(this.meta.sourceOffsets[t]/30).toFixed(2)} s`;
  }
  fit(mode){
    const handsOnly=mode===true,interaction=mode==='interaction';
    if(!this.meta)return;
    const coords=[[],[],[]],d=this.data,t=this.frame;
    const add=(array,offset)=>{for(let j=0;j<3;j++){const v=array[offset+j];if(Number.isFinite(v))coords[j].push(v);}};
    // Frame the visible reconstruction; camera motion and distant clip frames do not widen this view.
    for(let side=0;side<2;side++)if(d.valid[t*2+side])for(let i=0;i<778;i+=12)add(d.vertices,((t*2+side)*778+i)*3);
    let focus;
    if(interaction&&coords[0].length){
      const handBounds=coords.map(values=>{const sorted=[...values].sort((a,b)=>a-b);return [sorted[Math.floor(sorted.length*.01)],sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.99))]];});
      const handSpan=Math.hypot(...handBounds.map(bounds=>bounds[1]-bounds[0]));
      const margin=Math.max(.2,handSpan*.65);
      focus=handBounds.map(bounds=>[bounds[0]-margin,bounds[1]+margin]);
    }
    if(!handsOnly){
      const cap=this.meta.arrays.points.shape[1];
      for(let i=0;i<d.pointCounts[t];i+=8){
        const offset=(t*cap+i)*3;
        if(focus&&!focus.every((bounds,j)=>d.points[offset+j]>=bounds[0]&&d.points[offset+j]<=bounds[1]))continue;
        add(d.points,offset);
      }
    }
    if(!coords[0].length)return;
    const low=[],high=[];
    for(let j=0;j<3;j++){
      coords[j].sort((a,b)=>a-b);
      low[j]=coords[j][Math.floor(coords[j].length*.01)];
      high[j]=coords[j][Math.min(coords[j].length-1,Math.ceil(coords[j].length*.99))];
    }
    const center=new THREE.Vector3(...low).add(new THREE.Vector3(...high)).multiplyScalar(.5);
    const size=Math.max(new THREE.Vector3(...high).sub(new THREE.Vector3(...low)).length(),.2);
    const direction=new THREE.Vector3(-.25,-.3,-1).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(direction);this.camera.lookAt(center);
    const inverse=this.camera.quaternion.clone().invert();
    const tangent=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
    let distance=size*.2;
    for(const x of [low[0],high[0]])for(const y of [low[1],high[1]])for(const z of [low[2],high[2]]){
      const corner=new THREE.Vector3(x,y,z).sub(center).applyQuaternion(inverse);
      distance=Math.max(distance,corner.z+Math.abs(corner.x)/(tangent*this.camera.aspect),corner.z+Math.abs(corner.y)/tangent);
    }
    this.camera.position.copy(center).addScaledVector(direction,distance*1.15);
    this.camera.near=Math.max(.001,size/1000);this.camera.far=Math.max(100,size*100);this.camera.updateProjectionMatrix();
    this.controls.minDistance=size*.02;this.controls.maxDistance=size*25;this.controls.update();
  }
}
