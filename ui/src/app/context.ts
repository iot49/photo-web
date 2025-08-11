import { createContext } from '@lit/context';
import { Albums, SrcsetInfo } from './interfaces';
import { MeImple } from './me';

export const albumsContext = createContext<Albums>(Symbol('albumsContext'));

export const meContext = createContext<MeImple>(Symbol('meContext'));

export const srcsetInfoContext = createContext<SrcsetInfo>(Symbol('srcsetinfoContext'));