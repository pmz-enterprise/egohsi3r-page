import { ReconstructionViewer } from './viewer.js';

const $ = (id) => document.getElementById(id);
const datasetNames = { arctic: 'ARCTIC', hot3d: 'HOT3D', dexycb: 'DexYCB', hoi4d: 'HOI4D', h2o: 'H2O', taco: 'TACO' };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let teaserPlaying = !reducedMotion;
const watchVideo = (video) => video.addEventListener('error', () => {
  if (!video.parentElement.querySelector('.video-error')) {
    const note = document.createElement('p');
    note.className = 'video-error';
    note.textContent = 'This video could not load. Reload the page or open the media file in the repository.';
    video.parentElement.append(note);
  }
});
const observer = new IntersectionObserver((entries) => {
  for (const {target, isIntersecting} of entries) {
    if (!isIntersecting) target.pause();
    else if (target.dataset.preview === 'true' && !reducedMotion) target.play().catch(() => {});
  }
}, {threshold: 0.2});

try {
  const response = await fetch('assets/examples.json');
  if (!response.ok) throw new Error('Example manifest unavailable');
  const examples = await response.json();
  function mediaStage(video, poster, className = '') {
    const stage = document.createElement('div');
    stage.className = `media-stage ${className}`;
    stage.style.setProperty('--media-poster', `url("${poster}")`);
    stage.append(video);
    return stage;
  }
  for (const [key, name] of Object.entries(datasetNames)) {
    const example = examples.find(e => e.dataset === key);
    const card = document.createElement('article'); card.className = 'teaser-card';
    const title = document.createElement('h2'); title.textContent = name;
    const video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'metadata' });
    video.dataset.preview = String(teaserPlaying);
    video.src = `assets/media/${example.id}/hands.mp4`;
    video.poster = `assets/media/${example.id}/poster.jpg`;
    video.setAttribute('aria-label', `${name} hand reconstruction`);
    watchVideo(video);
    card.append(title, mediaStage(video, video.poster));
    $('teaser-grid').append(card); observer.observe(video);
  }
  function updateTeaserButton() {
    $('teaser-toggle').textContent = teaserPlaying ? 'Pause' : 'Play';
    $('teaser-toggle').setAttribute('aria-label', `${teaserPlaying ? 'Pause' : 'Play'} all overview videos`);
  }
  $('teaser-toggle').addEventListener('click', () => {
    teaserPlaying = !teaserPlaying;
    for (const video of $('teaser-grid').querySelectorAll('video')) {
      video.dataset.preview = String(teaserPlaying);
      if (teaserPlaying) video.play().catch(() => {}); else video.pause();
    }
    updateTeaserButton();
  });
  updateTeaserButton();
  let dataset = 'arctic';
  let mode = 'hands';
  let viewer;
  function drawGallery() {
    for (const old of $('gallery').querySelectorAll('video')) { observer.unobserve(old); old.pause(); }
    $('gallery').replaceChildren();
    for (const e of examples.filter((e) => e.dataset === dataset)) {
      const card = document.createElement('article');
      card.className = `example-card ${mode === 'channels' ? 'channels' : ''}`;
      const video = document.createElement('video');
      Object.assign(video, { muted: true, loop: true, playsInline: true, controls: true, preload: 'metadata' });
      video.dataset.preview = 'true';
      video.src = `assets/media/${e.id}/${mode}.mp4`;
      video.poster = `assets/media/${e.id}/${mode === 'channels' ? 'channels.jpg' : 'poster.jpg'}`;
      video.setAttribute('aria-label', `${datasetNames[e.dataset]} ${mode} prediction, ${e.sequence}`);
      watchVideo(video);
      const caption = document.createElement('div'); caption.className = 'card-caption';
      const copy = document.createElement('div');
      const h = document.createElement('h3'); h.textContent = `${datasetNames[e.dataset]} · ${e.id.split('-').at(-1)}`;
     
      copy.append(h);
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Explore in 3D ↗';
      button.addEventListener('click', async () => {
        $('scene-select').value = e.id;
        $('explore').scrollIntoView({behavior: reducedMotion ? 'instant' : 'smooth'});
        await viewer?.load(e.id);
      });
      caption.append(copy, button); card.append(mediaStage(video, video.poster), caption); $('gallery').append(card); observer.observe(video);
    }
    for (const b of $('dataset-tabs').children) b.setAttribute('aria-selected', String(b.dataset.dataset === dataset));
  }
  for (const [key, name] of Object.entries(datasetNames)) {
    const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.dataset.dataset = key; b.textContent = name;
    b.addEventListener('click', () => { dataset = key; drawGallery(); });
    $('dataset-tabs').append(b);
  }
  $('dataset-tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...$('dataset-tabs').children]; const current = tabs.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length)%tabs.length;
    tabs[index].focus(); tabs[index].click();
  });
  $('gallery-mode').addEventListener('change', () => { mode = $('gallery-mode').value; drawGallery(); });
  drawGallery();
  for (const e of examples) {
    const option = document.createElement('option'); option.value = e.id; option.textContent = `${datasetNames[e.dataset]} · ${e.id.split('-').at(-1)}`; $('scene-select').append(option);
  }
  try {
    viewer = new ReconstructionViewer();
    $('scene-select').addEventListener('change', () => viewer.load($('scene-select').value));
    await viewer.load(examples[0].id);
  } catch (error) {
    $('scene-status').hidden = false;
    $('scene-status').textContent = 'The 3D viewer needs WebGL. You can still explore every reconstruction in the videos above.';
    console.warn('3D viewer unavailable:', error.message);
  }
} catch (error) {
  $('gallery').innerHTML = '<p class="error-message">Examples could not load. Please reload the page.</p>';
  console.error(error);
}

try {
  const response = await fetch('assets/comparisons.json');
  if (!response.ok) throw new Error('Comparison manifest unavailable');
  const config = await response.json();
  let space = 'camera', clip;
  const video = $('compare-video');
  watchVideo(video);
  video.preload = 'auto';
  function pause() { video.pause(); $('compare-play').textContent = 'Play'; }
  function sources() {
    pause();
    const method = $('compare-method').value;
    $('baseline-label').textContent = config.labels[method];
    $('compare-play').disabled = true;
    $('compare-time').value = '0';
    $('compare-clock').textContent = '0.00 s';
    video.src = clip.composites[method];
    video.load();
  }
  function chooseClip() {
    clip = config[space].find(c => c.id === $('compare-clip').value);
    const previous = $('compare-method').value;
    $('compare-method').replaceChildren();
    for (const method of Object.keys(clip.composites)) {
      const option = document.createElement('option');
      option.value = method; option.textContent = config.labels[method];
      $('compare-method').append(option);
    }
    if (clip.composites[previous]) $('compare-method').value = previous;
    sources();
  }
  function chooseSpace(value) {
    space = value;
    $('camera-tab').setAttribute('aria-selected', String(space === 'camera'));
    $('world-tab').setAttribute('aria-selected', String(space === 'world'));
    $('compare-clip').replaceChildren();
    for (const c of config[space]) {
      const option = document.createElement('option');
      option.value = c.id; option.textContent = c.label; $('compare-clip').append(option);
    }
    chooseClip();
  }
  video.addEventListener('canplay', () => { $('compare-play').disabled = false; });
  video.addEventListener('play', () => { $('compare-play').textContent = 'Pause'; });
  video.addEventListener('pause', () => { $('compare-play').textContent = 'Play'; });
  video.addEventListener('error', () => { $('compare-play').disabled = true; });
  $('camera-tab').addEventListener('click', () => chooseSpace('camera'));
  $('world-tab').addEventListener('click', () => chooseSpace('world'));
  $('compare-clip').addEventListener('change', chooseClip);
  $('compare-method').addEventListener('change', sources);
  $('compare-play').addEventListener('click', () => {
    if (video.paused) { video.playbackRate = Number($('compare-speed').value); video.play().catch(pause); }
    else pause();
  });
  $('compare-time').addEventListener('input', () => {
    if (Number.isFinite(video.duration)) video.currentTime = Number($('compare-time').value) / 1000 * video.duration;
  });
  $('compare-speed').addEventListener('change', () => { video.playbackRate = Number($('compare-speed').value); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  new IntersectionObserver(entries => { if (!entries[0].isIntersecting) pause(); }).observe(video);
  function tick() {
    if (Number.isFinite(video.duration)) {
      if (document.activeElement !== $('compare-time')) $('compare-time').value = String(Math.round(video.currentTime / video.duration * 1000));
      $('compare-clock').textContent = `${video.currentTime.toFixed(2)} s`;
    }
    requestAnimationFrame(tick);
  }
  chooseSpace('camera'); tick();
} catch (error) {
  console.error(error);
}
