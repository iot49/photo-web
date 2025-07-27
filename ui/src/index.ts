// css
import '../index.css';

// URLPattern polyfill for Safari compatibility
import 'urlpattern-polyfill';

// Set document title from environment variable
document.title = import.meta.env.VITE_TITLE || 'Photo Web';

// Shoelace configuration - import before components that use it
import './shoelace-config';

import './pw-main'
import './pw-nav-page'
import './pw-users'
import './pw-album-browser'
import './pw-doc-browser'
import './pw-slideshow'
import './pw-ken-burns'
import './pw-carousel'
import './pw-tests'

