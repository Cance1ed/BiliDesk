import { createRoot } from 'react-dom/client';
import App from './App';
import Wallpaper from './Wallpaper';
import { api } from './api';
import './styles.css';
import './desktop-layout.css';
import './subscriptions.css';
import './collections.css';
import './theme.css';
document.documentElement.dataset.platform = api.platform;
createRoot(document.getElementById('root')!).render(
  new URLSearchParams(location.search).has('wallpaper') ? <Wallpaper /> : <App />,
);
