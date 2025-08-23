#import "welcome.typ": welcome

#import "template.typ": template
#show: template

= Welcome

This is `typst-playground`, a project that attempts to recreate the online editing experience of #link("https://typst.app/")[typst.app] based on #link("https://github.com/myriad-dreamin/tinymist")[tinymist] and #link("https://github.com/Myriad-Dreamin/typst.ts")[typst.ts].

Source code is available on #link("https://github.com/ParaN3xus/typst-playground")[GitHub].

Current Status:
- [x] Monaco Editor basic editing functionality
- [x] tinymist LSP language service
- [x] typst-preview preview functionality
- [/] typst-preview componentization
- [ ] Load fonts from workspace
- [ ] Optimize startup speed
- [ ] Clean up redundant logs
- [ ] Eliminate tinymist compilation warnings
- [ ] Merge changes into tinymist mainline
- [ ] Automated build
- [ ] Save workspace to pastebin and load workspace from pastebin
- [ ] Multi-user editing

= 欢迎

这是 `typst-playground`, 是一个尝试基于 #link("https://github.com/myriad-dreamin/tinymist")[tinymist] 和 #link("https://github.com/Myriad-Dreamin/typst.ts")[typst.ts] 还原 #link("https://typst.app/")[typst.app] 在线编辑体验的项目.

源代码现已在 #link("https://github.com/ParaN3xus/typst-playground")[GitHub] 上发布.

目前状态:
- [x] Monaco Editor 基础编辑功能
- [x] tinymist LSP 语言服务
- [x] typst-preview 预览功能
- [/] typst-preview 组件化
- [ ] 从 workspace 加载字体
- [ ] 优化启动速度
- [ ] 多余日志清理
- [ ] tinymist 编译警告消除
- [ ] 将更改合入 tinymist 主线
- [ ] 自动化构建
- [ ] 将 workspace 保存至 pastebin 及从 pastebin 加载 workspace
- [ ] 多人编辑

#pagebreak()

#welcome()
