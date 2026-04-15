// Augment the ImageCapture interface with grabFrame(), which is defined in the
// Media Capture API spec but not yet present in TypeScript's bundled lib.dom.d.ts.
// https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/grabFrame
interface ImageCapture {
  grabFrame(): Promise<ImageBitmap>;
}
