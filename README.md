# tyraria

This is `tyraria`, a project that attempts to recreate the online editing experience of [typst.app]("https://typst.app/") based on [tinymist]("https://github.com/myriad-dreamin/tinymist") and [typst.ts]("https://github.com/Myriad-Dreamin/typst.ts").

Try it now: https://tyraria.typs.town/

> [!NOTE]
> It takes time to load fonts on your first visit.

## TODO

- [x] Monaco Editor basic editing functionality
- [x] tinymist LSP language service
- [x] typst-preview preview functionality
- [x] typst-preview componentization
- [ ] Load fonts from workspace
- [ ] Optimize startup speed
- [x] Clean up redundant logs
- [x] Eliminate tinymist compilation warnings
- [ ] Merge changes into tinymist mainline
- [ ] Automated build
- [x] Save workspace to pastebin and load workspace from pastebin
- [ ] Multi-user editing

## Build

### Build Tinymist WASM

```sh
git clone -b tinymist-wasm https://github.com/ParaN3xus/tinymist.git
cd tinymist/crates/tinymist
yarn && yarn build
cd pkg && yarn link
cd ../../../tools/typst-dom && yarn link
```

### Build tyraria

```sh
git clone https://github.com/ParaN3xus/tyraria/
cd tyraria
yarn
yarn link tinymist typst-dom
yarn build
```

## Acknowledgements
- [Tinymist](https://github.com/Myriad-Dreamin/tinymist): Tinymist provides typst language services
- [typst.ts](https://github.com/Myriad-Dreamin/typst.ts): typst.ts provides incremental SVG rendering
- [typst-preview](https://github.com/Enter-tainer/typst-preview): The live preview feature of tinymist originally derived from typst-preview

## License

This project is licensed under GPLv3.

## Legal

This project is not affiliated with, created by, or endorsed by Typst the brand.