import { createRoot } from 'react-dom/client';
import App from './App';
import Wallpaper from './Wallpaper';
import './styles.css';
import './desktop-layout.css';
import './subscriptions.css';
import './collections.css';
createRoot(document.getElementById('root')!).render(
  new URLSearchParams(location.search).has('wallpaper') ? <Wallpaper /> : <App />,
);
