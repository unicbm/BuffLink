# BuffLink

BUFF 网站便捷扩展，目前提供 **CS2 检视链接一键复制**。基于「BUFF 检视链接复制」2.0.0 整理。

## 安装

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击 **[安装 BuffLink](https://raw.githubusercontent.com/unicbm/BuffLink/main/BuffLink.user.js)**，在脚本管理器中确认安装。
3. 如果装过「BUFF 检视链接复制」，请先停用或删除旧脚本，避免重复加载。
4. 刷新 [BUFF](https://buff.163.com/)，打开饰品的检视大图，点击底部工具栏新增的复制图标。

按钮显示绿色对勾表示复制成功；失败时会显示原因，可再次点击重试。复制不会启动 CS2。

如果安装链接只显示源码，可以新建 Tampermonkey 脚本，粘贴文件的全部内容并保存。后续更新由脚本管理器根据 GitHub 上的版本号检查。

## 功能与权限

- 市场模式：点击后调用 BUFF 自身的检视接口，获取当前饰品的 Steam 检视链接。
- 库存模式：直接复制原按钮已有的检视链接，无需额外请求。
- 切换饰品或关闭检视弹窗时取消旧请求，避免旧请求继续写入剪贴板。
- 提供请求超时、登录失效和请求频繁等错误提示。
- 仅在 `https://buff.163.com/*` 运行，使用 `GM.setClipboard` 写入剪贴板。
- 不读取剪贴板、不保存账号数据，也不向第三方上传数据；检视请求携带当前 BUFF 会话。

脚本依赖 BUFF 当前的页面结构和接口；网站改版后可能需要适配。它是独立的用户脚本，与 BUFF 官方无关联。

## 开发

直接编辑 `BuffLink.user.js`，无需构建或安装项目依赖。发布更新时递增文件顶部的 `@version`。

JavaScript 语法检查：

```sh
node --check BuffLink.user.js
```
