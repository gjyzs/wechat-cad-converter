# CAD 引擎拆分试验

本目录用于研究如何在设备本地运行 CAD 引擎。CAD 分包与加载器已接入原生小程序试验版，但还没有经过微信环境验证，不能视为可发布功能。

两套上游 WASM 可经 Binaryen 132 的 `wasm-split` 拆分，并以 Brotli 压缩到 `packages/`；每个文件小于 2 MB。生成文件不提交源码仓库。测试使用 Node 模拟 `WXWebAssembly.instantiate` 和分包加载，检查 STEP/IGES 读取、STEP→IGES、IGES→STEP 及几何读回。**这不能证明微信的分包访问、异常处理、可变全局量、iOS/Android 兼容性或内存表现。**

`split-loader.cjs` 先加载主模块和所有副模块，再初始化引擎；加载失败会返回错误。项目把 CAD 部分配置为实际分包，但必须在开发者工具及真实设备上验证，尤其要验证 `WXWebAssembly` 对模块间共享内存、表和全局量的支持。网格读取引擎拆分仅作为研究材料，小程序中的 CAD 转网格使用 CAD 引擎的三角化能力。

构建来源：`occt-import-js@0.0.23` 的 `occt-import-js.wasm`（SHA-256 `33391fc9d94ea5c869a6718488bf0a9a464222bac9bdc764dfe1690cef281952`）；`occt.ts@2.0.0` 的 `occtjs.wasm`（SHA-256 `407caf5b458eac0d7bb9b947d4a0ade6056bf43b8474062c5fbff94a4404a8a5`）。切分范围与压缩步骤见 `scripts/build-split-experiment.cjs`。原始组件及其许可证见项目根目录的 `THIRD_PARTY_NOTICES.md`。
