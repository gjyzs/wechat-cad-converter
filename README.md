# 三维格式转换：免费开源试验版

这是从已有浏览器转换器整理出的免费版本和微信原生小程序原型。**目前尚未发布为微信小程序，也未完成微信真机验证。**

## 目前能做什么

- `miniprogram-native/`：原生小程序试验版，已接入 STEP、IGES、BREP、STL、OBJ、PLY 输入，以及 STEP、IGES、BREP、STL、OBJ、PLY、GLB 输出。CAD 引擎使用分包方式加载；已在微信开发者工具模拟器中用立方体样例完成 STEP → STL，**能否在微信真实设备运行尚未确认**。
- `dist/web/index.html`：免授权码的完整浏览器版，支持 STEP、IGES、BREP、STL、OBJ、PLY 输入；支持 STEP、IGES、BREP、STL、OBJ、PLY、GLB 输出。只有 CAD 输入才能导出 CAD，网格不能还原成精确 CAD 实体。
- `miniprogram/`：仅供研究的网页嵌入壳，未配置网址。个人主体通常不支持网页嵌入，不是本项目默认发布方案。

原生原型在本机处理文件，不上传到开发者服务器。选取文件和转发结果使用微信接口；将文件发到微信聊天或文件传输助手时，微信会按其服务方式处理文件。文件来自微信聊天，单个最多 20 MB，每批最多 20 个、总计不超过 60 MB。

CAD 交换可能改变实体结构，尤其 STEP 转 IGES 可能成为曲面；名称、颜色、装配层级和建模历史不保证保留。关键模型请在目标 CAD 软件中检查。浏览器版输出会附带基本几何核对报告。

## 构建与检查

本地试验包已包含构建产物。若从源码仓库重新构建，需要 Node.js、npm 和 [Binaryen 132 的 wasm-split](https://github.com/WebAssembly/binaryen/releases/tag/version_132)：

```powershell
npm ci
$env:WASM_SPLIT = '你的 wasm-split 可执行文件路径'
npm run build:split-experiment
npm run rebundle:web
npm run build
npm test
```

源码仓库不提交生成的 WASM 分包、打包后的 JavaScript 或浏览器 HTML；上述步骤会生成这些文件。修改浏览器转换源代码后需要重新运行 `npm run rebundle:web`。

在微信开发者工具中打开本目录，`project.config.json` 已指向 `miniprogram-native/`；其中 `touristappid` 仅为开发占位。微信开发者工具模拟器已完成立方体 STEP → STL 的一次测试；**尚未完成手机真机验证**，CAD 分包加载、模块间共享内存和全局量、文件选取、ZIP 转发、内存占用和不同设备兼容性均需在真实设备上实测；尤其不能假设 iOS 与 Android 表现一致。CAD 引擎在首次使用时需要下载小程序分包，模型转换仍在设备上进行。

## 公开发布还缺什么

需要小程序账号及真实 AppID，确认个人主体可使用的服务类目和备案要求，完成微信开发者工具与真机测试、问题修复、审核与发布。当前环境的站点安全策略阻止自动访问微信公众平台后台，账号注册需要用户自行在官方平台完成；不要向任何人提供 AppSecret、验证码或密钥。

## 许可证

本项目原创代码采用 [MIT](LICENSE)；所用第三方组件各自保留许可证。组件和许可原文见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
