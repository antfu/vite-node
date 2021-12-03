import { InlineConfig } from 'vite'

export interface Options {
  files: string[]
  root?: string
  silent?: boolean
  config?: string
  defaultConfig?: InlineConfig
  shouldExternalize?: (id: string) => boolean
}

export function run(options: Options): Promise<void>
