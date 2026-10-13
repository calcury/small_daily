/**
 * 生成一份示例数据 JSON（开发用，输出到 stdout）
 */
import { createEmptyData } from '../src/store/storage.ts'
import { withDemoData } from '../src/lib/demo.ts'

const { data } = withDemoData(createEmptyData(), 14)
process.stdout.write(JSON.stringify(data))
