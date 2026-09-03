# Majom Notes

Dedicated notes frontend for the Majom platform.

## Local development

Run the Django backend at `http://127.0.0.1:8000`, then:

```powershell
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`.

Authentication uses the same Majom ID session flow as Majom Canvas. The Django
backend completes OIDC, stores the authenticated user in an HttpOnly session
cookie, and exposes the session state through `/auth/sso/session/`. Mutating API
requests include the CSRF token returned by that endpoint.

## Production

The production frontend is configured for `https://notes.gomajom.com/` and the
API at `https://mxll.pythonanywhere.com`.

1. Deploy the accompanying `platform-django` changes.

2. Set this backend environment value exactly (the redirect allowlist does not
   use wildcard matching):

   ```dotenv
   SSO_ALLOWED_FRONTEND_URLS=https://gomajom.com/,https://notes.gomajom.com/
   ```

   Cross-site sessions also require secure `SameSite=None` session and CSRF
   cookies, plus `https://notes.gomajom.com` in the CORS and CSRF trusted-origin
   settings.

3. Push this repository to GitHub with `main` as the default branch and enable
   GitHub Pages with **GitHub Actions** as its source. The included workflow
   builds, tests, and deploys the `dist` directory.

4. Add a DNS `CNAME` record for `notes.gomajom.com` that points to the GitHub
   Pages hostname for the repository owner. The tracked `public/CNAME` file
   preserves the custom domain on every deployment.
