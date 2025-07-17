import { createContext } from '@lit/context';
import { Albums, Me, SrcsetInfo } from './interfaces';

export const albumsContext = createContext<Albums>(Symbol('albumsContext'));

export const meContext = createContext<Me>(Symbol('meContext'));

export const srcsetInfoContext = createContext<SrcsetInfo>(Symbol('srcsetinfoContext'));

