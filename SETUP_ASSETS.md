# Asset Intake (Sparse Only)

Do not clone full repositories.

## 1) generative_agents assets

PowerShell example:

```powershell
git init temp-generative-assets
cd temp-generative-assets
git remote add origin https://github.com/joonspk-research/generative_agents.git
git sparse-checkout init --cone
git sparse-checkout set environment/frontend_server/static
git pull origin main
```

Copy only needed files into this project:

- `environment/frontend_server/static/*tiles*` -> `public/assets/tiles/`
- `environment/frontend_server/static/*sprite*` -> `public/assets/sprites/`
- map JSON -> `public/assets/maps/`

## 2) amica files

PowerShell example:

```powershell
git init temp-amica
cd temp-amica
git remote add origin https://github.com/semperai/amica.git
git sparse-checkout init --cone
git sparse-checkout set src/lib src/components
git pull origin main
```

Copy only:

- `src/components/vrmViewer.tsx` -> `src/components/VRMViewer.tsx`
- `src/lib/VRMAnimation.ts` -> `src/lib/VRMAnimation.ts`
- `src/lib/EmoteController.ts` -> `src/lib/EmoteController.ts`

## 3) VRM models

Place six `.vrm` models in:

- `public/vrm/kabir.vrm`
- `public/vrm/priya.vrm`
- `public/vrm/dev.vrm`
- `public/vrm/meera.vrm`
- `public/vrm/sanjana.vrm`
- `public/vrm/rohan.vrm`
