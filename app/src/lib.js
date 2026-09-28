// Single import point for the UI runtime: Preact + hooks + htm (vendored, ~13 kB),
// so the app runs with no build step and no network.
export {
  h, html, render, Component, createContext,
  useState, useReducer, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext,
} from '../vendor/preact-htm.module.js';
