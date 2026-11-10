# 第三方开源组件

本项目原创的界面和转换协调代码使用根目录的 MIT 许可证。项目中包含的第三方组件继续使用各自的许可证，不能以本项目的 MIT 许可证替代：

| 组件 | 版本 | 用途 | 许可证 |
| --- | --- | --- | --- |
| [three.js](https://github.com/mrdoob/three.js) | 0.180.0 | 网格读写 | MIT |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.2 | 原生小程序原型中的 ZIP 打包 | MIT |
| [JSZip](https://github.com/Stuk/jszip) | 3.10.1 | 浏览器版 ZIP 打包 | MIT 或 GPL-3.0-or-later，本项目选择 MIT |
| [occt-import-js](https://github.com/kovacsv/occt-import-js) | 0.0.23 | 浏览器版 CAD 网格读取 | LGPL-2.1 |
| [occt.ts](https://github.com/LAU-MARS/opencascade-ts) | 2.0.0 | 浏览器版 CAD 实体读写 | LGPL-2.1 |
| [Open CASCADE Technology](https://github.com/Open-Cascade-SAS/OCCT) | 由上述组件提供 | CAD 几何引擎 | 参见随组件分发的 LGPL 文本及上游说明 |

许可原文放在 `licenses/`；小程序原型内也附带其使用的 three.js 和 fflate 许可。构建生成的浏览器 HTML 内同样包含第三方许可文本。依赖版本在 `package-lock.json` 中固定；项目内 `source/` 包含本项目的转换和页面源代码，浏览器打包文件可由构建脚本生成。

对应上游源码：[`occt-import-js@0.0.23` 源码版本](https://github.com/kovacsv/occt-import-js/tree/c2148e54b456b571238d35cac037d304053d64b2)、[`occt.ts@2.0.0` 源码版本](https://github.com/LAU-MARS/opencascade-ts/tree/22da0ceb731f171f791813159072dc26552c3e61)。原生试验版的 WASM 分包由这些组件的二进制通过 [Binaryen 132](https://github.com/WebAssembly/binaryen/tree/version_132) 处理，复现步骤见 `experiments/native-cad-split/README.md`。重新分发时应继续保留相关许可、版权和源码获取信息，并遵守各组件的要求。
