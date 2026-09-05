# Majom Notes

Dedicated notes frontend for the Majom platform.

## Local development

Run the Django backend at `http://127.0.0.1:8000`, then:

```powershell
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`.

Authentication uses the same Majom ID token flow as Majom Canvas. The Django
backend completes OIDC and returns a short-lived `#sso_code`; the frontend
exchanges it for application access and refresh tokens. Protected API requests
use `Authorization: Bearer <access>`, so the flow does not depend on cross-site
cookies.

## Markdown editor

The note body uses the local `@majom/inkstone` package. Markdown remains the
source of truth while a synchronized mirror renders inactive blocks. The editor
provides a formatting toolbar, keyboard shortcuts, interactive task markers,
and local recovery drafts that are cleared after a successful API save.

Supported formatting includes headings, bold, emphasis, inline and fenced code,
links, blockquotes, bullet and ordered lists, and task lists.

## Production

The production frontend is configured for `https://notes.gomajom.com/` and the
API at `https://mxll.pythonanywhere.com`.

1. Deploy the accompanying `platform-django` changes.

2. Set this backend environment value exactly (the redirect allowlist does not
   use wildcard matching):

   ```dotenv
   SSO_ALLOWED_FRONTEND_URLS=https://gomajom.com/,https://notes.gomajom.com/
   ```

   Include `https://notes.gomajom.com` in `CORS_ALLOWED_ORIGINS`. JWT-authenticated
   API mutations do not depend on cross-site session cookies or CSRF.

3. Push this repository to GitHub with `main` as the default branch and enable
   GitHub Pages with **GitHub Actions** as its source. The included workflow
   builds, tests, and deploys the `dist` directory.

4. Add a DNS `CNAME` record for `notes.gomajom.com` that points to the GitHub
   Pages hostname for the repository owner. The tracked `public/CNAME` file
   preserves the custom domain on every deployment.
