# Family Pension Dashboard — Vue 3 port

A faithful **1:1 port** of the React (`serene-franklin-5vw5yb`) app to **Vue 3 + Vite**,
with **no design changes** — only the framework code was converted.

## Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build
```

Open the dev URL; the app starts on the **Upload** screen. After generating a
report it goes to the **WEB** (client dashboard) screen; **ייצוא PDF** prints the
report (`PrintReportA4`).

## Structure

| File | Role |
|------|------|
| `src/main.js` | Entry — mounts `App` |
| `src/App.jsx` | Screen flow: Upload → Client → Report |
| `src/components/UploadPage.vue` | Upload screen (SFC) |
| `src/components/ReportPage.jsx` | Report screen + `PrintReportA4` (PDF) |
| `src/components/ClientDashboardPage.jsx` | WEB client dashboard |
| `src/components/ClientFamilyView.jsx` | Family view |
| `src/components/ClientMemberView.jsx` | Member view |
| `src/px.js` | Helper replicating React's numeric inline-style → px |
| `src/pensionXmlParser.js`, `src/clientDataModel.js`, `src/shareStorage.js`, `src/coverHero.js`, `src/analyze-pension-pdf.js` | Framework-agnostic logic, copied verbatim from the React source |

## How the conversion works

- React function components → Vue functional components / `defineComponent`.
- `useState` → `ref`, `useMemo` → `computed`, `useEffect` → `watch` / `onMounted`.
- `className` → `class`; React camelCase SVG attrs (`stopColor` …) → kebab (`stop-color`).
- Every inline `style={…}` object is wrapped with `px()` so React's automatic
  numeric-to-`px` behaviour is preserved and the style objects stay identical to
  the original source.
