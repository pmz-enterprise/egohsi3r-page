import { ReconstructionViewer } from './viewer.js';

const $ = (id) => document.getElementById(id);
const datasetNames = { arctic: 'ARCTIC', hot3d: 'HOT3D', dexycb: 'DexYCB', hoi4d: 'HOI4D', h2o: 'H2O', taco: 'TACO' };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let teaserPlaying = !reducedMotion;
const watchVideo = (video) => video.addEventListener('error', () => {
  if (!video.parentElement.querySelector('.video-error')) {
    const note = document.createElement('p');
    note.className = 'video-error';
    note.textContent = 'This video could not load. Please reload the page.';
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
  function createComparison(clip, space) {
    const card = document.createElement('article');
    card.className = 'comparison-card'; card.dataset.space = space; card.dataset.clip = clip.id;
    const heading = document.createElement('h3'); heading.className = 'comparison-clip-title'; heading.textContent = clip.label;
    const video = document.createElement('video');
    Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'auto' });
    video.className = 'comparison-source'; video.src = clip.grid.video;
    video.setAttribute('aria-hidden', 'true'); watchVideo(video);
    const grid = document.createElement('div'); grid.className = `method-grid ${space}-method-grid`;
    const panels = clip.grid.panels.map(panel => {
      const figure = document.createElement('figure'); figure.className = 'method-panel'; figure.dataset.method = panel.method;
      if (panel.method === 'ours') figure.classList.add('ours');
      const caption = document.createElement('figcaption'); caption.textContent = panel.label;
      const canvas = document.createElement('canvas'); canvas.width = clip.grid.cellWidth; canvas.height = clip.grid.cellHeight;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${panel.label}, ${clip.label}, ${space} space`);
      figure.append(caption, canvas); grid.append(figure);
      return { ...panel, canvas, context: canvas.getContext('2d', { alpha: false }) };
    });
    const controls = document.createElement('div'); controls.className = 'playback compare-playback';
    const play = document.createElement('button'); play.type = 'button'; play.className = 'play-button'; play.dataset.action = 'play'; play.textContent = 'Play'; play.disabled = true;
    play.setAttribute('aria-label', `Play all ${space}-space methods for ${clip.label}`);
    const timeline = document.createElement('input'); timeline.type = 'range'; timeline.min = '0'; timeline.max = '1000'; timeline.step = '1'; timeline.value = '0'; timeline.dataset.action = 'time';
    timeline.setAttribute('aria-label', `${clip.label} comparison timeline`);
    const clock = document.createElement('output'); clock.textContent = '0.00 s';
    const speedLabel = document.createElement('label'); speedLabel.textContent = 'Speed ';
    const speed = document.createElement('select'); speed.setAttribute('aria-label', `${clip.label} playback speed`);
    for (const value of ['0.5', '1']) { const option = document.createElement('option'); option.value = value; option.textContent = `${value}×`; option.selected = value === '1'; speed.append(option); }
    speedLabel.append(speed); controls.append(play, timeline, clock, speedLabel);
    card.append(heading, grid, video, controls);
    $(`${space}-comparison-list`).append(card);
    function draw() {
      if (video.readyState < 2) return;
      for (const panel of panels) {
        const x = panel.index % clip.grid.columns * clip.grid.cellWidth;
        const y = Math.floor(panel.index / clip.grid.columns) * clip.grid.cellHeight;
        panel.context.drawImage(video, x, y, clip.grid.cellWidth, clip.grid.cellHeight, 0, 0, panel.canvas.width, panel.canvas.height);
      }
      if (Number.isFinite(video.duration)) {
        if (document.activeElement !== timeline) timeline.value = String(Math.round(video.currentTime / video.duration * 1000));
        clock.textContent = `${video.currentTime.toFixed(2)} s`;
      }
    }
    let frameRequest;
    function cancelFrames() {
      if (frameRequest === undefined) return;
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameRequest); else cancelAnimationFrame(frameRequest);
      frameRequest = undefined;
    }
    function frame() {
      frameRequest = undefined; draw();
      if (!video.paused) frameRequest = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(frame) : requestAnimationFrame(frame);
    }
    function pause() { video.pause(); play.textContent = 'Play'; cancelFrames(); }
    video.addEventListener('loadeddata', draw);
    video.addEventListener('seeked', draw);
    video.addEventListener('canplay', () => { play.disabled = false; draw(); });
    video.addEventListener('play', () => { play.textContent = 'Pause'; cancelFrames(); frame(); });
    video.addEventListener('pause', () => { play.textContent = 'Play'; cancelFrames(); draw(); });
    video.addEventListener('error', () => { play.disabled = true; });
    play.addEventListener('click', () => { if (video.paused) video.play().catch(pause); else pause(); });
    timeline.addEventListener('input', () => {
      if (Number.isFinite(video.duration)) video.currentTime = Number(timeline.value) / 1000 * video.duration;
    });
    speed.addEventListener('change', () => { video.playbackRate = Number(speed.value); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    new IntersectionObserver(entries => { if (!entries[0].isIntersecting) pause(); }).observe(card);
  }
  for (const space of ['camera', 'world']) for (const clip of config[space]) createComparison(clip, space);
} catch (error) {
  console.error(error);
}
