import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const baseColors = [[0.20,0.64,0.86],[0.91,0.43,0.26]];
const contactColor = [1,0.08,0.24];
const arrayTypes = { '<f4': Float32Array, '<u2': Uint16Array, '|u1': Uint8Array, '<u4': Uint32Array };

export class ReconstructionViewer {
  constructor() {
    this.canvas = $('scene-canvas');
    this.renderer = new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setClearColor(0xf0f3ee);
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
    $('fit-scene').addEventListener('click',() => this.fit(false));
    $('fit-hands').addEventListener('click',() => this.fit(true));
    $('reset-view').addEventListener('click',() => this.fit(false));
    this.canvas.addEventListener('keydown',(event) => {
      if (event.key === ' '){event.preventDefault();$('scene-play').click();}
      if (['ArrowLeft','ArrowRight'].includes(event.key)&&this.meta){event.preventDefault();this.frame=(this.frame+(event.key==='ArrowRight'?1:-1)+this.meta.frames)%this.meta.frames;this.update();}
    });
    document.addEventListener('visibilitychange',() => { if(document.hidden){this.playing=false;$('scene-play').textContent='Play';} });
    const animate=(now) => {
      this.animation=requestAnimationFrame(animate);
      if(!this.visible)return;
      if(this.meta&&this.playing&&now-this.lastStep>=1000/this.meta.fps){this.frame=(this.frame+Math.floor((now-this.lastStep)*this.meta.fps/1000))%this.meta.frames;this.lastStep=now;this.update();}
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
      this.hands=[];const faceCount=meta.arrays.faces.shape[1]*3;
      for(let side=0;side<2;side++){
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(778*3),3));
        geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(778*3),3));
        geometry.setIndex(new THREE.BufferAttribute(arrays.faces.slice(side*faceCount,(side+1)*faceCount),1));
        const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));this.group.add(mesh);this.hands.push(mesh);
      }
      const capacity=meta.arrays.points.shape[1]*meta.frames;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(capacity*3),3));geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(capacity*3),3));
      this.points=new THREE.Points(geometry,new THREE.PointsMaterial({size:0.004,vertexColors:true,sizeAttenuation:true}));this.group.add(this.points);
      this.path=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x316653}));this.group.add(this.path);
      this.frustum=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x183a2c}));this.group.add(this.frustum);
      $('scene-time').max=String(meta.frames-1);$('scene-time').value='0';
      this.update();this.fit(false);$('scene-status').hidden=true;
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
    const start=$('accumulate').checked?0:t;
    // Accumulation samples up to twelve time steps to keep mobile rendering responsive.
    const stride=$('accumulate').checked?Math.max(1,Math.ceil((t+1)/12)):1;
    const times=[];for(let k=start;k<=t;k+=stride)times.push(k);if(times.at(-1)!==t)times.push(t);
    for(const k of times){const n=d.pointCounts[k];this.points.geometry.attributes.position.array.set(d.points.subarray(k*cap*3,k*cap*3+n*3),count*3);const c=this.points.geometry.attributes.color.array;for(let j=0;j<n*3;j++)c[count*3+j]=d.colors[k*cap*3+j]/255;count+=n;}
    this.points.geometry.attributes.position.needsUpdate=true;this.points.geometry.attributes.color.needsUpdate=true;this.points.geometry.setDrawRange(0,count);this.points.geometry.computeBoundingSphere();this.points.visible=$('show-points').checked;
    const path=[];for(let k=0;k<=t;k++){path.push(d.cameras[k*16+3],d.cameras[k*16+7],d.cameras[k*16+11]);}
    this.path.geometry.setAttribute('position',new THREE.Float32BufferAttribute(path,3));this.path.geometry.computeBoundingSphere();this.path.visible=$('show-camera').checked;
    const m=this.cameraMatrix(t);const local=[[0,0,0],[-.035,-.025,.055],[.035,-.025,.055],[.035,.025,.055],[-.035,.025,.055]];
    const vertices=local.map((v)=>new THREE.Vector3(...v).applyMatrix4(m));const segments=[];
    for(const [a,b] of [[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1]])segments.push(...vertices[a].toArray(),...vertices[b].toArray());
    this.frustum.geometry.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));this.frustum.geometry.computeBoundingSphere();this.frustum.visible=$('show-camera').checked;
    $('scene-time').value=String(t);$('scene-frame').textContent=`Frame ${this.meta.sourceFrameIds[t]} · ${(this.meta.sourceOffsets[t]/30).toFixed(2)} s`;
  }
  fit(handsOnly){
    if(!this.meta)return;
    const coords=[[],[],[]],d=this.data;
    const add=(array,offset)=>{for(let j=0;j<3;j++){const v=array[offset+j];if(Number.isFinite(v))coords[j].push(v);}};
    for(let t=0;t<this.meta.frames;t++){
      for(let s=0;s<2;s++)if(d.valid[t*2+s])for(let i=0;i<778;i+=24)add(d.vertices,((t*2+s)*778+i)*3);
      if(!handsOnly){const cap=this.meta.arrays.points.shape[1];for(let i=0;i<d.pointCounts[t];i+=16)add(d.points,(t*cap+i)*3);}
    }
    if(!coords[0].length)return;
    const low=[],high=[];
    for(let j=0;j<3;j++){coords[j].sort((a,b)=>a-b);low[j]=coords[j][Math.floor(coords[j].length*.01)];high[j]=coords[j][Math.min(coords[j].length-1,Math.ceil(coords[j].length*.99))];}
    const center=new THREE.Vector3(...low).add(new THREE.Vector3(...high)).multiplyScalar(.5);
    const size=Math.max(new THREE.Vector3(...high).sub(new THREE.Vector3(...low)).length(),.2);
    this.controls.target.copy(center);this.camera.position.copy(center).add(new THREE.Vector3(-.68,-.45,-1).normalize().multiplyScalar(size*1.65));this.camera.near=Math.max(.001,size/1000);this.camera.far=Math.max(100,size*100);this.camera.updateProjectionMatrix();this.controls.minDistance=size*.02;this.controls.maxDistance=size*25;this.controls.update();
  }
}
