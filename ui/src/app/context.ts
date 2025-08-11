import { createContext } from '@lit/context';
import { Albums, SrcsetInfo } from './interfaces';
import { Me } from './me';

export const albumsContext = createContext<Albums>(Symbol('albumsContext'));

export const meContext = createContext<Me>(Symbol('meContext'));

export const srcsetInfoContext = createContext<SrcsetInfo>(Symbol('srcsetinfoContext'));