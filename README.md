# vite-node

[![NPM version](https://img.shields.io/npm/v/vite-node?color=a1b858&label=)](https://www.npmjs.com/package/vite-node)

Vite as Node runtime.

> **EXPERIMENTAL**

## Why?

It runs Vite's id resolving, module transforming, and most importantly, the powerful plugins system!

## Usage

```bash
npx vite-node index.ts
```

## Features

- Out-of-box ESM & TypeScript support (possible for more with plugins)
- Top-level await
- Shims for `__dirname` and `__filename`
- Respect `vite.config.ts`
- Access to node modules like `fs`, `path` etc.

## When NOT to Use

- Production, yet - in very early stage, check it later
- Most of the time when other tools can do that job
  - We will need to start a Vite server upon each execution, which will have certain overhead. Only use it when you want the exactly same behavior as Vite or the powerful plugins system (for example, testing components that have Vite-specific setup).

## How?

It fires up a Vite dev server, transforms the requests, and runs them in Node.

## Credits

Based on [@pi0](https://github.com/pi0)'s brilliant idea of having a Vite server as the on-demand transforming service for [Nuxt's Vite SSR](https://github.com/nuxt/vite/pull/201).

Thanks [@brillout](https://github.com/brillout) for kindly sharing this package name.

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg'/>
  </a>
</p>

## License

[MIT](./LICENSE) License © 2021 [Anthony Fu](https://github.com/antfu)
