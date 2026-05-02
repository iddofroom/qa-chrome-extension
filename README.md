# QA Chrome Extension

תוסף Chrome (MV3) שמאפשר לשלוח דיווח מהיר לכל אתר/endpoint שמקבל את הפורמט הזה — בצירוף URL, צילום מסך, ו-console log של הדף הפעיל.

## הקשר

- שימוש אישי / הוטעאן unpacked. לא נפרס ל-Chrome Web Store.
- כל ההגדרות חיות ב-`chrome.storage.local` של המשתמש; הקוד עצמו לא מקודד דומיינים.
- ה-endpoint עצמו (לדוגמה `/api/qa-assistant`) הוא חלק מהאתר היעד, **לא חלק מהתוסף**.
- ה-workflow הוא dev → main.

## דרישות

- Node 18+
- npm
- Chromium-based browser (Chrome/Edge/Brave)

## פיתוח

```bash
npm install
npm run build      # יוצר dist/
npm run gen:icons  # מחדש אייקונים מתוך logo.png (אופציונלי)
```

## התקנה ב-Chrome (unpacked)

1. `npm run build`
2. `chrome://extensions` → הפעל **Developer mode**
3. **Load unpacked** → בחר את התיקייה `dist/`
4. צמוד את התוסף לסרגל (אייקון פאזל → סיכה ליד QA Assistant)
5. לחץ "הגדרות" וקנפג (ראה הסעיף הבא)

## הגדרות ראשוניות

בעמוד ההגדרות יש שני חלקים:

### API Secret
נשלח כ-`Authorization: Bearer <secret>` לכל הבקשות. הסיקרט נשמר רק ב-`chrome.storage.local` של הדפדפן שלך.

### פרוייקטים (טבלה)
לכל אתר שאתה רוצה לדווח עליו ממנו:

| שדה | דוגמה | למה זה משמש |
|---|---|---|
| תווית | `iddofroom` | רק לתצוגה ב-popup |
| Origin pattern | `https://iddofroom.co.il/*` | Chrome match pattern. לפיו מזוהה הטאב הפעיל אוטומטית, ועליו מותקן content script שלוכד `console.*` |
| Endpoint URL | `https://iddofroom.co.il/api/qa-assistant` | חייב להיות `https://`, חוץ מ-`http://localhost`/`127.0.0.1` (לפיתוח) |

לאחר "שמור" הדפדפן יבקש הרשאה לכל origin חדש בטבלה. הרשאות שכבר לא נדרשות (מחקת שורה) מוסרות אוטומטית.

## שימוש שוטף

1. גלוש לאתר שמוגדר אצלך כפרוייקט
2. לחץ על אייקון התוסף
3. הבאדג' למעלה יראה את הפרוייקט שזוהה לפי הדומיין; אם הטאב לא תואם לאף Origin pattern, יופיע dropdown לבחירה ידנית
4. כתוב פרומט, סמן מה לצרף, **שלח**

## פורמט הבקשה

```
POST <project endpoint>
Authorization: Bearer <secret>
Content-Type: application/json

{
  "prompt":     "string",
  "url":        "string | null",
  "screenshot": "base64 PNG (data: URL) | null",
  "consoleLog": "string | null"
}
```

תשובה צפויה (מה ש-popup יראה למשתמש): `{ "response": "string" }`.

## ארכיטקטורת אבטחה

- **`optional_host_permissions: ["<all_urls>"]`** — אין הרשאות host סטטיות בהתקנה. לכל פרוייקט המשתמש מאשר את ה-origin בנפרד דרך `chrome.permissions.request` בעת השמירה.
- **content scripts דינמיים** — `chrome.scripting.registerContentScripts` רושם את `console-capture` רק על origins שאושרו. בהתקנה אין content script שרץ על אף דף.
- **HTTPS-only** — שדה Endpoint URL מקבל רק `https://` (חוץ מ-`http://localhost`). הולידציה רצה גם ב-options וגם ב-background לפני ה-fetch.
- **sender validation** — `chrome.runtime.onMessage` בבקגראונד דוחה כל הודעה שלא מגיעה מ-popup או options של התוסף עצמו (חוסם משתלט-בדף שמנסה לזרוק את הסיקרט החוצה).
- **secret storage** — `chrome.storage.local` בלבד. רק התוסף שלך יכול לקרוא אותו; לא נשלח לאף URL חוץ מה-endpoint שהוגדר.
- **buffer scope** — buffer ה-console חי על `window.__qaConsoleBuffer` בעולם MAIN; הוא חשוף לדף עצמו (כמו ש-console.log שלו חשוף לעצמו), אבל לא חוצה origins.

## מגבלות ידועות

- **Console log תופס רק logs מהרגע שה-content script נרשם על ה-origin.** אם הדף היה פתוח לפני שאישרת הרשאה — רענן.
- **צילום מסך = חלק נראה בלבד** (`chrome.tabs.captureVisibleTab`).
- אין rendering של Markdown.
- אין היסטוריה — single-shot בכל לחיצה.

## Branch workflow

`dev` ל-WIP, `main` רק כשמבקשים מפורשות "תפרוס" / "deploy". פרטים ב-[CLAUDE.md הגלובלי](../CLAUDE.md).
