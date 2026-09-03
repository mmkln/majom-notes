import './styles.css';

import { App } from './app/App.ts';
import { AuthClient } from './auth/AuthClient.ts';
import { appConfig } from './config.ts';
import { NotesApiClient } from './notes/NotesApiClient.ts';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');

const auth = new AuthClient(appConfig.apiUrl, appConfig.appUrl);
const notesApi = new NotesApiClient(auth);
const app = new App(root, auth, notesApi);

void app.start();
