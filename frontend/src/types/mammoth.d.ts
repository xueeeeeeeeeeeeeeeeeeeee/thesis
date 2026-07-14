declare module 'mammoth' {
  interface ExtractResult {
    value: string
    messages?: { type: string; message: string }[]
  }
  interface ExtractOptions {
    arrayBuffer: ArrayBuffer
  }
  export function extractRawText(options: ExtractOptions): Promise<ExtractResult>
  const _default: {
    extractRawText: typeof extractRawText
  }
  export default _default
}
