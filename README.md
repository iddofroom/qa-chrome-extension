# QA Chrome Extension

תוסף Chrome אישי — שולח פרומט + הקשר של הדף (URL, צילום מסך, console log) ל-endpoint של הפרוייקט הרלוונטי.

## הקשר

- **שימוש אישי בלבד.** לא נפרס ל-Chrome Web Store. נטען unpacked.
- ניתוב לפי דומיין: כל אחד מהאתרים שלי מנותב ל-`/api/qa-assistant` שלו.
- ה-endpoint עצמו (`/api/qa-assistant`) **לא חלק מהפרוייקט הזה** — מתווסף בנפרד בכל פרוייקט.
- ה-workflow הוא dev → main: כל push שגרתי ל-`dev`, main רק לפי בקשה מפורשת.

## דרישות

- Node 18+
- npm
- Chromium-based browser (Chrome/Edge/Brave)

## פיתוח

```bash
npm install
npm run build      # יוצר dist/
```

## טעינה ב-Chrome (unpacked)

1. הרץ `npm run build`
2. פתח `chrome://extensions`
3. הפעל **Developer mode** (פינה ימנית עליונה)
4. **Load unpacked** → בחר את התיקייה `dist/`
5. צמוד את התוסף לסרגל (אייקון פאזל → סיכה ליד QA Assistant)
6. **חשוב**: לחץ על "הגדרות" בפופאפ והגדר:
   - **Endpoint URL** — ה-`POST` יישלח לכתובת הזו. ריק = להשתמש ברשימה ההטמעה ב-`src/config/projects.ts`.
   - **API Secret** — נשלח כ-`Authorization: Bearer <secret>`.

## שימוש

1. גלוש לאתר הרלוונטי
2. לחץ על האייקון של התוסף
3. הבאדג' למעלה יראה את הפרוייקט שזוהה (אם לא — יופיע dropdown לבחירה)
4. כתוב פרומט, סמן מה לצרף (URL / צילום / console), לחץ **שלח**

## Localhost

אם ה-URL הנוכחי הוא `localhost`/`127.0.0.1`, יופיע dropdown ידני לבחירת פרוייקט. הבחירה האחרונה נשמרת.

## מגבלות ידועות

- **Console log תופס רק logs מהרגע שהדף נטען עם התוסף פעיל.** אם הדף היה פתוח לפני התקנה/רענון של התוסף — צריך לרענן את הדף לפני שלחיצה על "Console log" תיתן משהו.
- **צילום מסך = החלק הנראה בלבד** (`chrome.tabs.captureVisibleTab`), לא דף שלם.
- אין rendering של Markdown — תשובה כטקסט פשוט בלבד.
- אין היסטוריה — single-shot בכל לחיצה.

## פורמט בקשה

```
POST <project-endpoint>
Authorization: Bearer <secret>
Content-Type: application/json

{
  "prompt": "string",
  "url": "string | null",
  "screenshot": "base64 PNG (data: URL) | null",
  "consoleLog": "string | null"
}
```

תשובה צפויה: `{ "response": "string" }`

## הוספת פרוייקט חדש

יש שתי דרכים:

**א. דרך הגדרות (פשוט, מומלץ למשתמש יחיד):** פתח את עמוד ההגדרות, מלא את ה-Endpoint URL וה-API Secret. כל בקשה תישלח לכתובת הזו, בלי קשר לדומיין של הטאב הפעיל.

**ב. בקוד (Iddo, multi-project):**
1. ערוך [src/config/projects.ts](src/config/projects.ts) — הוסף ערך עם `hostname` ו-`endpoint`
2. ערוך [src/manifest.json](src/manifest.json) — הוסף את ה-host ל-`content_scripts.matches` ו-`host_permissions`
3. `npm run build`, ולחץ על "Reload" באייקון של התוסף ב-`chrome://extensions`

> בכל מקרה, אם ה-Endpoint URL מהגדרות לא־ריק — הוא גובר על הזיהוי האוטומטי לפי דומיין.

## Branch workflow

`dev` ל-WIP, `main` רק כשמבקשים מפורשות "תפרוס" / "deploy". פרטים ב-[CLAUDE.md הגלובלי](../CLAUDE.md).
