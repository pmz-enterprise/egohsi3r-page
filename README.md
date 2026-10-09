# EgoHSI3R project page

[Visit the project page](https://pmz-enterprise.github.io/egohsi3r-page/)

**Online 4D Hand–Scene Interaction Reconstruction from Egocentric Video.**

This site contains twelve dynamic examples from six datasets, a browser-based 3D viewer of predicted hands, scene points, contact probabilities and camera motion, and synchronized camera-space and world-space comparisons. All EgoHSI3R results use the final **job321** checkpoint.

## View locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. No build step, server-side inference, CDN access, or model download is required. Three.js 0.180.0 and OrbitControls are vendored with their MIT license. An HTTP server is required for loading the scene buffers.

## Examples and inputs

Two clips are provided per dataset. Clips were chosen after visually reviewing job321 predictions; ARCTIC and HOT3D metrics were used for shortlisting. These are favorable qualitative examples, not an unbiased evaluation sample. ARCTIC, HOT3D, DexYCB, H2O and TACO use test sequences from the frozen Hand3R-v2 split. HOI4D has no held-out evaluation split in this configuration; its clips are training replays, recorded in the example metadata. Sequences and source frame ranges are recorded in [assets/examples.json](assets/examples.json); each clip has a `provenance.json`.

EgoHSI3R uses ground-truth bounding boxes, hand visibility masks and dataset camera calibration as inputs. These annotation-conditioned examples are not an automatic hand-detection demonstration. MANO pose, shape, translation, camera trajectory, dense scene geometry and per-vertex contact probabilities are model predictions. Settings: 512-pixel long edge, reset every 20 frames, test-time updates enabled, seed 42. No ground-truth hand pose is substituted.

Checkpoint SHA256: `c0a5d9a5b94d24e154cf1f19492b43f41731626de7871b501ec9dd77f956efc5`.

Videos preserve every frame at 30 FPS. The 3D viewer samples every third frame at 10 FPS. Scene pointmaps use spatial stride 5, confidence >= 1.5, positive predicted depth, and up to 1,800 points per sampled frame. Accumulation displays up to twelve sampled pointmaps together without fusion. Viewer framing uses pooled 1st/99th percentiles only to position the virtual camera; geometry is unchanged. Contact colors encode continuous predicted probabilities from 0 to 1. Depth colors have a fixed 2nd/98th-percentile range over each clip; display colors saturate outside this range without modifying stored predictions.

## Comparisons

Camera-space: two HOT3D clips, with HaMeR, WiLoR, HaWoR and HandFlow. The same RGB frames, calibration, lighting, opacity and hand colors are used. No ground-truth pose, translation or scale alignment is applied.

World-space: one 150-frame ARCTIC clip, with HandFlow + ViPE and HaWoR. Both use their own estimated camera motion. Each method is rebased once by its own first-camera pose. Native metric scale is retained, with one common fixed virtual camera, lighting and reference grid. The grid is a visualization reference, not reconstructed scene geometry. No temporal smoothing, per-frame recentering, Sim(3), or hand-pose alignment is applied.

Baselines retain their detector-based hand inputs. EgoHSI3R uses annotation boxes and visibility, so these examples compare pipelines with different hand localization inputs. They illustrate behavior and do not establish an aggregate benchmark ranking. The method selector includes ground truth as a reference. All baseline predictions were rerun on the same newly chosen source clips. Each input/baseline/EgoHSI3R triplet is encoded into a single video so the panels remain exactly synchronized during playback and seeking.

## Assets

- `assets/examples.json`: example selection, model identity and input settings.
- `assets/comparisons.json`: synchronized comparison media and display conventions.
- `assets/media/<example>/`: RGB, hand, contact, depth and combined MP4 videos, posters, scene arrays and provenance.
- `scene.json` describes the typed arrays, byte offsets and shapes in `scene.bin`. Coordinates are meters in the first predicted camera frame (OpenCV convention). Hands use right/left slots, with vertex order preserved for contact visualization.

This repository contains webpage code and selected visualization outputs. Model weights, licensed MANO model files, full datasets and private evaluation/source snapshots are stored separately.

## Credits

Datasets: [ARCTIC](https://arctic.is.tue.mpg.de/), [HOT3D](https://hot3d.github.io/), [DexYCB](https://dex-ycb.github.io/), [HOI4D](https://hoi4d.github.io/), [H2O](https://h2odataset.ethz.ch/), [TACO](https://taco2024.github.io/).

Baseline code: [HaMeR](https://github.com/geopavlakos/hamer), [WiLoR](https://github.com/rolpotamias/WiLoR), [HaWoR](https://github.com/ThunderVVV/HaWoR), [HandFlow](https://github.com/mxxu00/HandFlow), and [ViPE](https://github.com/nv-tlabs/vipe). Dataset and baseline materials retain their original attribution and applicable terms. The vendored Three.js license is in `assets/vendor/THREE-LICENSE.txt`.

## Website template

The publication layout and base CSS adapt [Academic Project Page Template](https://github.com/eliahuhorwitz/Academic-project-page-template), based on [Nerfies](https://nerfies.github.io/). See [TEMPLATE_ATTRIBUTION.md](TEMPLATE_ATTRIBUTION.md) for the pinned source version and CC BY-SA 4.0 attribution. Bulma uses the MIT license; locally hosted Inter uses the SIL Open Font License in `assets/vendor/fonts/INTER-OFL.txt`.
