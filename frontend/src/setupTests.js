import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';
import 'whatwg-fetch';

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
