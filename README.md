# Majom Notes

Dedicated notes frontend for the Majom platform.

## Local development

Run the Django backend at `http://127.0.0.1:8000`, then:

```powershell
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`.

Authentication uses Majom ID through the Django backend. The browser receives
a short-lived one-time code, exchanges it for application JWTs, and uses Bearer
authentication for the Notes API.

## Production

The production frontend is configured for `https://notes.gomajom.com/` and the
API at `https://mxll.pythonanywhere.com`.

1. Deploy the accompanying `platform-django` changes and run:

   ```powershell
   python manage.py migrate
   ```

2. Set this backend environment value exactly (the redirect allowlist does not
   use wildcard matching):

   ```dotenv
   SSO_ALLOWED_FRONTEND_URLS=https://gomajom.com/,https://notes.gomajom.com/
   ```

3. Push this repository to GitHub with `main` as the default branch and enable
   GitHub Pages with **GitHub Actions** as its source. The included workflow
   builds, tests, and deploys the `dist` directory.

4. Add a DNS `CNAME` record for `notes.gomajom.com` that points to the GitHub
   Pages hostname for the repository owner. The tracked `public/CNAME` file
   preserves the custom domain on every deployment.
