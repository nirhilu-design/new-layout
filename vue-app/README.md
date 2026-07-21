# דוח פנסיוני משפחתי — גרסת Vue

המרה מלאה של האפליקציה מ־React ל־**Vue 3**, ללא שינוי בלוגיקה ובעיצוב.
כל ה־markup וה־inline styles נשמרו זהים; ההמרה נעשתה ב־Vue JSX
(`@vitejs/plugin-vue-jsx`) כדי לשמור התאמה מלאה מול הגרסה המקורית.

## מה הומר

| קובץ | תיאור |
|------|-------|
| `src/App.jsx` | ניתוב בין המסכים |
| `src/UploadPage.jsx` | מסך העלאת קבצי XML / Excel / PDF |
| `src/ReportPage.jsx` | מסך הדוח + תצוגת הדפסה A4 |
| `src/ClientDashboardPage.jsx` | מסך לקוח (WEB) |
| `src/ClientFamilyView.jsx` | **הדוח הפנסיוני המשפחתי** |
| `src/ClientMemberView.jsx` | תצוגת בן משפחה בודד |
| `src/pensionXmlParser.js`, `src/clientDataModel.js`, `src/shareStorage.js` | קבצי לוגיקה — הועברו כמו שהם |

## עקרונות ההמרה (React → Vue)

- `useState` → `ref` · `useMemo` → `computed` · `useEffect` → `onMounted` / `watch`
- קומפוננטות → `defineComponent` (props מוצהרים, כולל callbacks `on*`)
- `className` → `class` · `children` → slots
- מאפייני SVG בפורמט kebab (`stroke-width`, `stroke-linecap`, …)
- `paths` יחסיים (`base: './'`) כדי שה־build יעבוד גם מתת־תיקייה

## הרצה

```bash
npm install
npm run dev        # פיתוח
npm run build      # בנייה ל-production (תיקיית dist)
npm run preview    # תצוגה של ה-build
```

צריך Node 18+.
