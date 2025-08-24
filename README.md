# Typst Playground

This is `typst-playground`, a project that attempts to recreate the online editing experience of [typst.app]("https://typst.app/") based on [tinymist]("https://github.com/myriad-dreamin/tinymist") and [typst.ts]("https://github.com/Myriad-Dreamin/typst.ts").

Try it now: https://paran3xus.github.io/typst-playground/

> [!NOTE]
> It takes time to load fonts on your first visit.

## Current Status:
- [x] Monaco Editor basic editing functionality
- [x] tinymist LSP language service
- [x] typst-preview preview functionality
- [x] typst-preview componentization
- [ ] Load fonts from workspace
- [ ] Optimize startup speed
- [ ] Clean up redundant logs
- [ ] Eliminate tinymist compilation warnings
- [ ] Merge changes into tinymist mainline
- [ ] Automated build
- [x] Save workspace to pastebin and load workspace from pastebin
- [ ] Multi-user editing

## Build
### Build Tinymist WASM
```sh
git clone -b tinymist-wasm https://github.com/ParaN3xus/tinymist.git
cd tinymist-wasm/crates/tinymist
yarn
yarn build
yarn link
```

### Build typst-playground
```sh
git clone https://github.com/ParaN3xus/typst-playground/
cd typst-playground
yarn
yarn link tinymist
yarn build
```
## License

This project is licensed under GPLv3.
