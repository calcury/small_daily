/**
 * 运行区段逻辑自检：
 *   npm run check
 * 用 esbuild 把测试打包到内存里直接执行，不落地临时文件。
 */
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['scripts/check-segments.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const code = result.outputFiles[0].text
const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
await import(dataUrl)
