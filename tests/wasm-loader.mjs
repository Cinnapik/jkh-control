import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
export async function resolve(specifier,context,next) {
  if(specifier.endsWith('.wasm?url')) return {url:'data:text/javascript,export default '+JSON.stringify(require.resolve('sql.js/dist/sql-wasm.wasm')),shortCircuit:true}
  return next(specifier,context)
}
