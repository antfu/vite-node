import { InlineConfig } from 'vite'

export interface Options {
  files: string[]
  root?: string
  silent?: boolean
  config?: string
  defaultConfig?: InlineConfig
}

export function run(options: Options): Promise<void>
