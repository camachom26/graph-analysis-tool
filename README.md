# Graph Analysis Tool (Kruskal MST Demo)

A hosteddemo that lets users edit a graph in the browser and step through Kruskal’s MST algorithm with an MST overlay.

## Features
- Add nodes, connect edges, edit weights
- Original graph always visible
- MST overlay updated step-by-step
- C++ Kruskal core compiled to WebAssembly (WASM)
- Hosted via Next.js 

## Dev
```bash
npm install
./scripts/build-wasm.sh
npm run dev
