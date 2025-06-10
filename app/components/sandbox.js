import { Sandbox } from '@e2b/code-interpreter'

const sbx = await Sandbox.create({ apiKey: '' })
const execution = await sbx.runCode('print("hello world")')
console.log(execution.logs)

const files = await sbx.files.list('/')
console.log(files)


export { sbx as sandbox }