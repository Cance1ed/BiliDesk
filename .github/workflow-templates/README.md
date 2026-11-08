# Desktop build template / 桌面构建模板

The adjacent `desktop-builds.yml` is an inactive template. The publishing credential could push source and create releases but could not create files under `.github/workflows` without GitHub's `workflow` OAuth scope.

To activate it, use a credential authorized to manage workflows, place this file at `.github/workflows/build.yml`, and commit/push it. It supports manual dispatch and `v*` tags, builds Windows x64 and both Mac architectures, and uploads artifacts. It does not publish a release automatically. Signing/notarization still need configuration.

旁边的 `desktop-builds.yml` 是尚未启用的模板。发布凭据允许推送源码和创建 Release，但缺少写入 `.github/workflows` 所需的 `workflow` OAuth 权限。

取得工作流管理权限后，将模板放到 `.github/workflows/build.yml` 并提交推送即可启用。支持手动运行和 `v*` 标签，分别构建 Windows x64、macOS arm64 / x64 并上传产物，不自动发布 Release；签名与公证仍需配置。
