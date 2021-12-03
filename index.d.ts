export interface Options {
  files: string[]
  root?: string
  silent?: boolean
  config?: string
}

export function startAndRun(options: Options): Promise<void>
