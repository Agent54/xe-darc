import { Sandbox } from '@e2b/code-interpreter'

const sbx = await Sandbox.create({ apiKey: 'e2b_61a6228695009f494d790479a73b297a4ccd2d8a' })
const execution = await sbx.runCode('print("hello world")')
console.log(execution.logs)

const files = await sbx.files.list('/')
console.log(files)


export { sbx as sandbox }