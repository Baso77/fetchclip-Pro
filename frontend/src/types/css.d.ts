// This file tells TypeScript that importing CSS files is valid.
// Required for: import './globals.css' in layout.tsx
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}