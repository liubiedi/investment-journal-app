# 快速上手指南 · Quick Start

## 你现在有什么

这个压缩包解压后是一个完整的 Expo React Native 项目，包含：

```
investment-journal-app/
├── App.js                    ← 根组件，导航 + 全局状态
├── app.json                  ← Expo 配置（app 名、图标、权限）
├── eas.json                  ← 云构建配置
├── package.json              ← 依赖声明
├── babel.config.js
├── README.md                 ← 英文版完整说明
├── QUICKSTART.md             ← 你正在看的这份
├── assets/
│   ├── icon.png              ← app 图标（占位，可替换）
│   └── splash.png            ← 启动画面（占位）
└── src/
    ├── theme.js              ← 颜色、字体
    ├── constants.js          ← 动作、情绪、7 位大师
    ├── utils.js              ← 日期、货币工具
    ├── db.js                 ← SQLite 数据层
    ├── api.js                ← DeepSeek + Yahoo Finance
    ├── voice.js              ← 语音输入 hook
    ├── components.js         ← 共享 UI 组件
    └── screens/
        ├── Home.js           ← 主页
        ├── Weekly.js         ← 周记
        ├── Monthly.js        ← 月评
        ├── Log.js            ← 交易 + 心念
        ├── Holdings.js       ← 持仓
        ├── Mentor.js         ← AI 导师对话
        └── Settings.js       ← 设置
```

## 下一步：三条路，按难度从易到难

### 🟢 路线 1：在 Expo Go 里先跑起来（推荐先做这步）

**需要：** 电脑（Windows/Mac）+ 手机
**时间：** 20 分钟
**效果：** 能用大部分功能，但**不支持语音输入**

```bash
# 1. 在电脑上装 Node.js 20 LTS → https://nodejs.org
# 2. 打开终端，进入项目目录：
cd investment-journal-app

# 3. 装依赖（第一次约 5 分钟）
npm install

# 4. 启动开发服务器
npx expo start
```

终端会显示二维码。手机上装 "Expo Go" app（Play Store 免费），打开后扫码就能用。

### 🟡 路线 2：打包成 APK（云构建，不需 Android Studio）

**需要：** 路线 1 跑通 + Expo 账号（免费，https://expo.dev）
**时间：** 一次约 20 分钟
**效果：** 真正的 app，**支持所有功能包括语音**

```bash
# 1. 装 EAS CLI
npm install -g eas-cli

# 2. 登录（用 Expo 账号）
eas login

# 3. 初始化（仅第一次，一路回车默认）
eas build:configure

# 4. 开始构建（云端，等 10-15 分钟）
eas build -p android --profile preview
```

构建完成后，终端会给一个下载链接。在手机浏览器里打开链接下载 APK，允许"安装未知来源应用"后点击安装。

### 🔴 路线 3：Google Play 上架

只有你想给别人用才需要。要 $25 一次性注册费，还要做图标和描述。个人使用用路线 2 就够了。

## 使用前必做：配置 DeepSeek API Key

1. 去 https://platform.deepseek.com/api_keys 创建 key（建议先充 $5 试用金）
2. 打开 app，进"设置"tab
3. 粘贴 key，保存
4. 回主页，开始用

## 常见问题

**Q: 为什么 Expo Go 里语音输入不工作？**
A: Expo Go 是通用宿主，没有包含 `@react-native-voice/voice` 的原生模块。打包成 APK 后就能用。

**Q: 语音识别不准怎么办？**
A: 手机装讯飞输入法或搜狗输入法。在任何输入框里点键盘自带的麦克风图标 → 由输入法处理语音 → 识别率 95%+。

**Q: 我的数据怎么导出来用 Obsidian 看？**
A: 设置 → 导出 → "导出 Vault" 按钮 → 选择保存到 Google Drive、邮件、本地下载文件夹等。在电脑上解压，用 Obsidian "打开文件夹作为 Vault"，每笔交易/心念/月评都是独立的 Markdown 文件，带 YAML 元数据，互相可链接。适合年度复盘、AI 总结你的投资风格。

**Q: 导出会清空 App 里的数据吗？**
A: 不会。导出是只读复制，App 内的 SQLite 数据原封不动。可以多次导出，每次都是当时数据的全量快照。

**Q: 数据存在哪？**
A: 手机本地 SQLite 数据库。除非你求教导师或查行情，否则不离开手机。
可在"设置"→"导出 JSON"备份所有数据。

**Q: 忘记 API key 会收费吗？**
A: 不会。没配 key 时 AI 功能全部失效但 app 不会崩。非 AI 功能（记录、持仓、日记）完全本地，零成本。

**Q: 构建 APK 失败 / 报错？**
A: 把报错信息扔给 Claude Code / Cursor / ChatGPT 问。最常见的是依赖版本冲突，跑 `npx expo install --fix` 通常能解决。

**Q: 我不是开发者，真的能搞定吗？**
A: 路线 1 是的。路线 2 第一次要折腾一两次是常事，有问题就问 AI 工具。如果彻底卡住，可以先停在路线 1。

## 如果你想修改 App

推荐工具：**Cursor**（https://cursor.com）或 **Claude Code**。
把整个文件夹拖进去，让 AI 帮你改。

参考规范：随项目一起的 `PRD-investment-journal.md` 是完整产品需求文档。
